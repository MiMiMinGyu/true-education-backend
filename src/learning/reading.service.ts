import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  READING_MAX_MS,
  READING_MIN_MS,
} from '../common/constants/learning.constants';
import { todayKst } from '../common/utils/kst-date.util';
import { ReadingLineDurationDto } from './dto/learning-requests.dto';
import {
  ReadingResponseDto,
  SaveReadingPageResponseDto,
} from './dto/responses/learning-responses.dto';
import {
  LEARNING_REPOSITORY,
  type ILearningRepository,
} from './interfaces/learning-repository.interface';
import { ProgressService } from './progress.service';
import { loadAssignment } from './utils/assignment.util';
import { toPages } from './utils/reading.util';

@Injectable()
export class ReadingService {
  constructor(
    @Inject(LEARNING_REPOSITORY)
    private readonly repository: ILearningRepository,
    private readonly progress: ProgressService,
  ) {}

  async getReading(assignmentId: number): Promise<ReadingResponseDto> {
    const assignment = await loadAssignment(this.repository, assignmentId);
    const pages = toPages(assignment.book.content);
    return {
      totalPages: pages.length,
      savedPages:
        assignment.stage === 'READING' ? assignment.step : pages.length,
      pages: pages.map((page) => ({
        page: page.page,
        lines: page.lines.map(({ id, text, speaker }) => ({
          id,
          text,
          speaker,
        })),
      })),
      glossary: assignment.book.content.glossary ?? {},
    };
  }

  /**
   * 페이지 저장. 이 페이지의 학생 차례 줄만, 이상치(READING_MIN_MS~READING_MAX_MS 밖)를 뺀 시간과 음절 수를
   * 오늘 학습 세션에 더합니다. 이미 저장한 페이지를 다시 보내면 아무것도 바꾸지 않고 현재 상태를 돌려줍니다.
   */
  savePage(
    assignmentId: number,
    page: number,
    lines: ReadingLineDurationDto[],
  ): Promise<SaveReadingPageResponseDto> {
    return this.repository.runInTransaction(async (repo) => {
      // 같은 배정의 요청을 직렬화해 같은 페이지가 두 번 집계되지 않게 합니다.
      await repo.lockProgress(assignmentId);
      const assignment = await loadAssignment(repo, assignmentId);
      const pages = toPages(assignment.book.content);
      const totalPages = pages.length;

      if (assignment.stage !== 'READING') {
        throw new ConflictException('번갈아 읽기 단계가 아닙니다.');
      }
      if (page < 1 || page > totalPages) {
        throw new NotFoundException(
          `페이지는 1~${totalPages} 사이여야 합니다.`,
        );
      }
      const savedPages = assignment.step;
      if (page <= savedPages) {
        return { savedPages, totalPages, stage: assignment.stage };
      }
      if (page > savedPages + 1) {
        throw new ConflictException(
          `${savedPages + 1}페이지부터 순서대로 저장해야 합니다.`,
        );
      }

      const studentLines = new Map(
        pages[page - 1].lines
          .filter((line) => line.speaker === 'STUDENT')
          .map((line) => [line.id, line.syllableCount]),
      );
      const counted = new Set<string>();
      let syllables = 0;
      let durationMs = 0;
      for (const line of lines) {
        const lineSyllables = studentLines.get(line.lineId);
        if (lineSyllables === undefined || counted.has(line.lineId)) continue;
        counted.add(line.lineId);
        if (
          line.durationMs < READING_MIN_MS ||
          line.durationMs > READING_MAX_MS
        )
          continue;
        syllables += lineSyllables;
        durationMs += line.durationMs;
      }

      const sessionId = await repo.touchSession(assignmentId, todayKst());
      if (syllables > 0)
        await repo.addReadingStats(sessionId, syllables, durationMs);

      if (page < totalPages) {
        await repo.updateProgress(assignmentId, 'READING', page);
        return { savedPages: page, totalPages, stage: 'READING' };
      }
      const { stage } = await this.progress.advance(
        repo,
        assignment,
        'READING',
      );
      return { savedPages: page, totalPages, stage };
    });
  }
}
