import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  UnprocessableEntityException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { ActivityStage } from '../common/constants/learning.constants';
import { todayKst } from '../common/utils/kst-date.util';
import {
  STORAGE_SERVICE,
  type StorageService,
} from '../storage/storage.interface';
import {
  SaveDrawingResponseDto,
  SaveReflectionResponseDto,
  SaveTitleResponseDto,
  StageResultDto,
  TitleActivityDto,
} from './dto/responses/learning-responses.dto';
import {
  LEARNING_REPOSITORY,
  type AssignmentDetail,
  type ILearningRepository,
} from './interfaces/learning-repository.interface';
import { AdvanceResult, ProgressService } from './progress.service';
import { loadAssignment } from './utils/assignment.util';
import { hasReached } from './utils/stage-flow.util';
import { detectImageType, IMAGE_CONTENT_TYPES } from './utils/image.util';

const STAGE_MESSAGES: Partial<Record<ActivityStage, string>> = {
  TITLE: '제목 짓기 단계가 아닙니다.',
  DRAWING: '그림 그리기 단계가 아닙니다.',
  REFLECTION: '설명 말하기 단계가 아닙니다.',
};

function requireStage(assignment: AssignmentDetail, stage: ActivityStage) {
  if (assignment.stage !== stage) {
    throw new ConflictException(STAGE_MESSAGES[stage]);
  }
}

function toStageResult({ stage, completion }: AdvanceResult): StageResultDto {
  return completion ? { stage, completed: true, ...completion } : { stage };
}

/** 나만의 책 만들기: 제목 짓기 → 표지 그림 → 설명 말하기(마지막 단계를 마치면 완료·스탬프) */
@Injectable()
export class BookMakingService {
  constructor(
    @Inject(LEARNING_REPOSITORY)
    private readonly repository: ILearningRepository,
    private readonly progress: ProgressService,
    @Inject(STORAGE_SERVICE) private readonly storage: StorageService,
  ) {}

  /** 제목 짓기 화면용: 원래 제목과 책마다의 힌트 질문(정답·평가 없음) */
  async getTitleActivity(assignmentId: number): Promise<TitleActivityDto> {
    const assignment = await loadAssignment(this.repository, assignmentId);
    if (!hasReached(assignment.stage, 'TITLE')) {
      throw new ConflictException('아직 제목 짓기 단계가 아닙니다.');
    }
    return {
      originalTitle: assignment.book.title,
      hintQuestions: assignment.book.titleHints,
    };
  }

  saveTitle(
    assignmentId: number,
    title: string,
  ): Promise<SaveTitleResponseDto> {
    return this.repository.runInTransaction(async (repo) => {
      await repo.lockProgress(assignmentId);
      const assignment = await loadAssignment(repo, assignmentId);
      requireStage(assignment, 'TITLE');

      await repo.saveTitle(assignmentId, title);
      await repo.touchSession(assignmentId, todayKst());
      const result = await this.progress.advance(repo, assignment, 'TITLE');
      return { title, ...toStageResult(result) };
    });
  }

  async saveDrawing(
    assignmentId: number,
    image: Buffer,
  ): Promise<SaveDrawingResponseDto> {
    const type = detectImageType(image);
    if (!type) {
      throw new BadRequestException('PNG 또는 WebP 이미지만 올릴 수 있습니다.');
    }
    // 파일은 트랜잭션 밖에서 먼저 올려 잠금 시간을 줄입니다(S3 전환 시 네트워크 업로드가 됨).
    // 단계가 맞지 않으면 올리기 전에 거절하고, 올린 뒤 트랜잭션에서 다시 확인합니다.
    requireStage(
      await loadAssignment(this.repository, assignmentId),
      'DRAWING',
    );
    const key = `drawings/${assignmentId}/${randomUUID()}.${type}`;
    await this.storage.put(key, image, IMAGE_CONTENT_TYPES[type]);

    return this.repository.runInTransaction(async (repo) => {
      await repo.lockProgress(assignmentId);
      const assignment = await loadAssignment(repo, assignmentId);
      // TODO: 동시 업로드로 여기서 거절되면 방금 올린 파일이 남습니다(운영 S3는 수명 주기 규칙으로 정리 검토).
      requireStage(assignment, 'DRAWING');

      await repo.upsertDrawing(assignmentId, key);
      await repo.touchSession(assignmentId, todayKst());
      const result = await this.progress.advance(repo, assignment, 'DRAWING');
      return { imageUrl: this.storage.urlFor(key), ...toStageResult(result) };
    });
  }

  saveReflection(
    assignmentId: number,
    transcript: string,
    durationMs: number,
  ): Promise<SaveReflectionResponseDto> {
    const text = transcript.trim();
    return this.repository.runInTransaction(async (repo) => {
      await repo.lockProgress(assignmentId);
      const assignment = await loadAssignment(repo, assignmentId);
      requireStage(assignment, 'REFLECTION');
      if (!text) {
        throw new UnprocessableEntityException(
          '말한 내용이 없어요. 다시 말해 볼까요?',
        );
      }
      const drawingId = await repo.findDrawingId(assignmentId);
      if (drawingId === null) {
        throw new ConflictException('표지 그림이 없습니다.');
      }

      await repo.createReflection(drawingId, text, durationMs);
      await repo.touchSession(assignmentId, todayKst());
      const result = await this.progress.advance(
        repo,
        assignment,
        'REFLECTION',
      );
      return { transcript: text, ...toStageResult(result) };
    });
  }
}
