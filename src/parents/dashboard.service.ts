import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  COLLECTING_MESSAGE,
  DASHBOARD_COMMENTS,
  DASHBOARD_STAGE_LABELS,
  NEEDS_HELP_WINDOW,
  READING_SPEED_DAYS,
  RECENT_REFLECTIONS,
} from '../common/constants/dashboard';
import { DashboardDto } from './dto/parents.dto';
import {
  PARENT_REPOSITORY,
  type IParentRepository,
} from './interfaces/parent-repository.interface';
import { analyzeStages, readingSpeeds } from './utils/dashboard.util';

/** 보호자 대시보드: DB 집계 + 규칙 + 사전 정의 문구로 구성합니다(AI 미사용) */
@Injectable()
export class DashboardService {
  constructor(
    @Inject(PARENT_REPOSITORY)
    private readonly repository: IParentRepository,
  ) {}

  async dashboard(studentId: number): Promise<DashboardDto> {
    const source = await this.repository.getDashboardSource(
      studentId,
      READING_SPEED_DAYS,
    );
    if (!source) throw new NotFoundException('학생을 찾을 수 없습니다.');

    const analyses = analyzeStages(source.completedBooks);
    const collecting = source.completedBooks.length < NEEDS_HELP_WINDOW;

    return {
      student: { studentId: source.student.id, name: source.student.name },
      summary: {
        completedBooks: source.completedBooks.length,
        stampTotal: source.stampTotal,
        inProgress: source.inProgress,
      },
      readingSpeed: readingSpeeds(source.dailyReading),
      collecting,
      ...(collecting && { collectingMessage: COLLECTING_MESSAGE }),
      byStage: analyses.map((analysis) => ({
        ...analysis,
        label: DASHBOARD_STAGE_LABELS[analysis.stage],
      })),
      needsHelp: analyses
        .filter((a) => a.status === 'NEEDS_HELP')
        .map((a) => a.stage),
      comfortable: analyses
        .filter((a) => a.status === 'COMFORTABLE')
        .map((a) => a.stage),
      comments: analyses.flatMap(({ stage, status }) =>
        status === 'COLLECTING'
          ? []
          : [{ stage, status, text: DASHBOARD_COMMENTS[stage][status] }],
      ),
      reflections: source.completedBooks
        .filter((book) => book.reflection)
        .slice(0, RECENT_REFLECTIONS)
        .map((book) => ({
          assignmentId: book.assignmentId,
          title: book.title,
          transcript: book.reflection!.transcript,
          durationMs: book.reflection!.durationMs,
          completedAt: book.completedAt,
        })),
    };
  }
}
