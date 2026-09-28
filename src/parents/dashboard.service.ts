import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  COLLECTING_MESSAGE,
  READING_SPEED_DAYS,
  RECENT_REFLECTIONS,
} from '../common/constants/dashboard';
import type { QuestionStage } from '../content/interfaces/content-repository.interface';
import {
  STORAGE_SERVICE,
  type StorageService,
} from '../storage/storage.interface';
import {
  DashboardDto,
  DashboardQueryDto,
  StageAnalysisDto,
  StageStatus,
} from './dto/parents.dto';
import { AREA_COPY, AreaId, AreaState } from './guardian-copy';
import {
  PARENT_REPOSITORY,
  type IParentRepository,
} from './interfaces/parent-repository.interface';
import { resolvePeriod } from './observation.service';
import { judgeStages } from './utils/dashboard.util';

const STAGES: readonly QuestionStage[] = [
  'WHO',
  'WHAT',
  'WHY',
  'EMOTION',
  'ORDER',
];

const STAGE_LABELS: Record<QuestionStage, string> = {
  WHO: '누가',
  WHAT: '무슨 일',
  WHY: '왜',
  EMOTION: '마음',
  ORDER: '순서 맞추기',
};

/** 문구(AI 파트 카탈로그)를 가져올 영역 */
const STAGE_AREA: Record<QuestionStage, Exclude<AreaId, 'gist'>> = {
  WHO: 'facts',
  WHAT: 'facts',
  WHY: 'cause',
  EMOTION: 'emotion',
  ORDER: 'sequence',
};

/** AI 파트 판정 상태 → 프론트 화면 상태 */
const STATUS_OF: Record<AreaState, StageStatus> = {
  needsSupport: 'NEEDS_HELP',
  practicing: 'NORMAL',
  supported: 'COMFORTABLE',
  insufficientData: 'COLLECTING',
  notAssessable: 'COLLECTING',
  notObserved: 'COLLECTING',
};

const round2 = (value: number) => Math.round(value * 100) / 100;
const rate = (count: number, total: number) =>
  total === 0 ? null : round2(count / total);

/** 프론트 보호자 화면이 쓰는 문구: 함께 연습·관찰 중이면 연습 제안, 스스로 해결이면 칭찬형 제안 */
function commentOf(stage: QuestionStage, status: StageStatus): string {
  const { suggestions } = AREA_COPY[STAGE_AREA[stage]];
  return status === 'COMFORTABLE'
    ? suggestions.supported
    : suggestions.needsSupport;
}

/**
 * 보호자 대시보드(프론트 보호자 화면 형태, AI 미사용).
 * 화면 형태는 프론트 기준이고, 유형별 판정은 AI 파트 기준(observation.service와 같은 규칙)을 유형마다 적용합니다.
 */
@Injectable()
export class DashboardService {
  constructor(
    @Inject(PARENT_REPOSITORY)
    private readonly repository: IParentRepository,
    @Inject(STORAGE_SERVICE) private readonly storage: StorageService,
  ) {}

  async dashboard(
    studentId: number,
    query: DashboardQueryDto,
  ): Promise<DashboardDto> {
    const period = resolvePeriod(query);
    const source = await this.repository.getDashboardSource(studentId, period);
    if (!source) throw new NotFoundException('학생을 찾을 수 없습니다.');
    const overview = await this.repository.getOverview(
      studentId,
      READING_SPEED_DAYS,
      RECENT_REFLECTIONS,
    );

    const byStage: StageAnalysisDto[] = STAGES.map((stage) => {
      const { metrics: m, state } = judgeStages([stage], source.books);
      const valid = m.validQuestionCount;
      return {
        stage,
        label: STAGE_LABELS[stage],
        total: valid,
        firstTryRate: rate(m.firstIndependentCorrectCount, valid),
        afterRetryRate: rate(
          m.firstErrorRecoveredWithHintCount +
            m.firstErrorRecoveredWithoutHintCount,
          valid,
        ),
        revealedRate: rate(m.answerRevealedQuestionCount, valid),
        status: STATUS_OF[state],
      };
    });
    const collecting = byStage.every((s) => s.status === 'COLLECTING');

    return {
      student: { studentId: source.student.id, name: source.student.name },
      summary: {
        completedBooks: overview.completedBooks,
        stampTotal: overview.stampTotal,
        inProgress: overview.inProgress,
      },
      readingSpeed: overview.dailyReading
        .filter((day) => day.durationMs > 0)
        .sort((a, b) => a.date.localeCompare(b.date))
        .map((day) => ({
          ...day,
          syllablesPerMinute:
            Math.round((day.syllables / (day.durationMs / 60_000)) * 10) / 10,
        })),
      collecting,
      ...(collecting && { collectingMessage: COLLECTING_MESSAGE }),
      byStage,
      needsHelp: byStage
        .filter((s) => s.status === 'NEEDS_HELP')
        .map((s) => s.stage),
      comfortable: byStage
        .filter((s) => s.status === 'COMFORTABLE')
        .map((s) => s.stage),
      comments: byStage
        .filter((s) => s.status !== 'COLLECTING')
        .map((s) => ({
          stage: s.stage,
          status: s.status,
          text: commentOf(s.stage as QuestionStage, s.status),
        })),
      reflections: overview.reflections.map(
        ({ drawingKey, ...reflection }) => ({
          ...reflection,
          coverImageUrl: this.storage.urlFor(drawingKey),
        }),
      ),
    };
  }
}
