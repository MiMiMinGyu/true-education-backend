import { ConflictException, Inject, Injectable } from '@nestjs/common';
import {
  LEARNING_STAGES,
  STAGE_LABELS,
} from '../common/constants/learning.constants';
import { todayKst } from '../common/utils/kst-date.util';
import { ContentStockService } from '../content-inbox/content-stock.service';
import { BookSelector } from './book-selector';
import { TodayResponseDto } from './dto/responses/learning-responses.dto';
import {
  LEARNING_REPOSITORY,
  type AssignmentDetail,
  type ILearningRepository,
} from './interfaces/learning-repository.interface';
import { featuresOf, loadAssignment } from './utils/assignment.util';
import { toPages } from './utils/reading.util';
import { stepStatuses } from './utils/stage-flow.util';

// 동시 요청으로 배정 생성이 충돌하면 다시 조회합니다. 이 횟수를 넘으면 비정상으로 봅니다.
const MAX_ASSIGN_ATTEMPTS = 3;

@Injectable()
export class SessionsService {
  constructor(
    @Inject(LEARNING_REPOSITORY)
    private readonly repository: ILearningRepository,
    private readonly bookSelector: BookSelector,
    private readonly stock: ContentStockService,
  ) {}

  /**
   * 오늘의 학습(오솔길). 배정은 조회 시점에 만들고 별도 스케줄러는 없습니다.
   * 진행 중인 책 → 이어서 / 없고 오늘 이미 1권 완료 → DONE / 없으면 새 책 배정(없으면 NO_BOOK)
   */
  async today(studentId: number): Promise<TodayResponseDto> {
    const today = todayKst();

    for (let attempt = 0; attempt < MAX_ASSIGN_ATTEMPTS; attempt++) {
      let assignmentId =
        await this.repository.findInProgressAssignmentId(studentId);

      if (assignmentId === null) {
        const completed = await this.repository.findCompletedAssignmentOn(
          studentId,
          today,
        );
        if (completed) {
          return {
            type: 'DONE',
            completedBook: {
              assignmentId: completed.assignmentId,
              title: completed.title,
            },
            stampsEarned: completed.stampsEarned,
          };
        }
        const bookId = await this.bookSelector.pick(studentId);
        if (bookId === null) {
          this.stock.observe(studentId);
          return { type: 'NO_BOOK' };
        }

        assignmentId = await this.repository.createAssignment(
          studentId,
          bookId,
          today,
          LEARNING_STAGES[0],
        );
        // 같은 학생의 다른 요청이 먼저 배정했다 → 처음부터 다시 조회
        if (assignmentId === null) continue;
        // 새 책을 배정할 때마다 남은 책을 확인해 부족하면 AI 파트에 알립니다(응답은 기다리지 않음).
        this.stock.observe(studentId);
      }

      await this.repository.touchSession(assignmentId, today);
      return toLearning(await loadAssignment(this.repository, assignmentId));
    }
    throw new ConflictException(
      '오늘의 학습을 준비하지 못했습니다. 다시 시도해 주세요.',
    );
  }
}

function toLearning(assignment: AssignmentDetail): TodayResponseDto {
  const totalPages = toPages(assignment.book.content).length;
  return {
    type: 'LEARNING',
    assignmentId: assignment.id,
    book: {
      id: assignment.book.id,
      title: assignment.book.title,
      author: assignment.book.author,
    },
    stage: assignment.stage,
    savedPages: assignment.stage === 'READING' ? assignment.step : totalPages,
    totalPages,
    steps: stepStatuses(assignment.stage, featuresOf(assignment)).map(
      (step) => ({
        ...step,
        label: STAGE_LABELS[step.key],
      }),
    ),
  };
}
