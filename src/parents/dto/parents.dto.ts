import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, Matches } from 'class-validator';

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const AREA_IDS = ['cause', 'emotion', 'sequence', 'facts', 'gist'];
const AREA_STATES = [
  'needsSupport',
  'practicing',
  'supported',
  'insufficientData',
  'notAssessable',
  'notObserved',
];

export class LinkedStudentDto {
  @ApiProperty({ example: 3 }) studentId: number;
  @ApiProperty({ example: '김여울' }) name: string;
}

export class DashboardQueryDto {
  @ApiPropertyOptional({
    example: '2026-09-13',
    description: '조회 시작일(Asia/Seoul). 생략하면 종료일 포함 최근 14일',
  })
  @IsOptional()
  @Matches(DATE_PATTERN, {
    message: 'startDate는 YYYY-MM-DD 형식이어야 합니다.',
  })
  startDate?: string;

  @ApiPropertyOptional({
    example: '2026-09-26',
    description: '조회 종료일(Asia/Seoul, 포함). 생략하면 오늘',
  })
  @IsOptional()
  @Matches(DATE_PATTERN, { message: 'endDate는 YYYY-MM-DD 형식이어야 합니다.' })
  endDate?: string;
}

export class ObservationPeriodDto {
  @ApiProperty({ example: '2026-09-13' }) startDate: string;
  @ApiProperty({ example: '2026-09-26' }) endDate: string;
  @ApiProperty({ example: 'Asia/Seoul' }) timeZone: string;
}

export class ObservationHeaderDto {
  @ApiProperty({ example: '다은의 읽기 기록' }) title: string;
  @ApiProperty({ example: '2026-09-13 – 2026-09-26' }) periodLabel: string;
  @ApiProperty({ example: 5, description: '기간 안에 완료한 책 수' })
  sessionCount: number;
  @ApiProperty({ example: '이 기간에 5번의 이야기 시간을 보냈어요.' })
  summary: string;
}

export class ReferenceDto {
  @ApiProperty({ example: '읽기 이해 지도법 더 보기' }) label: string;
  @ApiProperty() url: string;
}

export class ObservationAreaDto {
  @ApiProperty({ enum: AREA_IDS }) id: string;
  @ApiProperty({ example: '원인 이해' }) title: string;
  @ApiProperty({ enum: AREA_STATES }) state: string;
  @ApiProperty({ example: 'repeated_non_independent' }) ruleId: string;
  @ApiProperty({
    type: 'object',
    additionalProperties: { type: 'number', nullable: true },
    description:
      'v3 metrics. 첫 답 도움받고 정답·부분 정답·이전 노출·중복 제시·채점 불가는 구조상 항상 0',
    example: {
      validQuestionCount: 5,
      firstIndependentCorrectCount: 2,
      firstIncorrectCount: 3,
      nonIndependentSessionCount: 3,
      independentCorrectRate: 0.4,
      scorableCoverage: 1,
    },
  })
  metrics: Record<string, number | null>;
  @ApiProperty({
    example: [],
    description: '기록 부족일 때 채우지 못한 요건(validQuestionCount 등)',
  })
  missingEvidence: string[];
  @ApiProperty({ example: ['attempt-31', 'attempt-35'] })
  evidenceRecordIds: string[];
  @ApiProperty({ example: ['assignment-12', 'assignment-13'] })
  evidenceSessionIds: string[];
  @ApiProperty() observation: string;
  @ApiProperty({ nullable: true, type: String }) evidenceText: string | null;
  @ApiProperty({ type: [String] }) recoveryTexts: string[];
  @ApiProperty() suggestion: string;
  @ApiProperty({ type: ReferenceDto }) reference: ReferenceDto;
}

export class ObservationGroupDto {
  @ApiProperty({ enum: AREA_STATES }) id: string;
  @ApiProperty({ example: '함께 연습해 봐요' }) title: string;
  @ApiProperty({ example: ['cause'] }) areaIds: string[];
}

export class ObservationReflectionDto {
  @ApiProperty({ example: 12 }) assignmentId: number;
  @ApiProperty({ example: '호랑이와 나무꾼' }) title: string;
  @ApiProperty({ example: '호랑이가 나무꾼을 형님이라고 불렀어요.' })
  transcript: string;
  @ApiProperty({ example: 42000 }) durationMs: number;
  @ApiProperty() completedAt: Date;
}

export class ObservationDto {
  @ApiProperty({ example: '3.0.0' }) specVersion: string;
  @ApiProperty({ example: 'guardian-observation-2026-09-v1' })
  policyVersion: string;
  @ApiProperty({ example: '3' }) childId: string;
  @ApiProperty({ example: 'available' }) availability: string;
  @ApiProperty({ type: ObservationPeriodDto }) period: ObservationPeriodDto;
  @ApiProperty({ example: 'early-reading-v1' }) profileId: string;
  @ApiProperty({ type: ObservationHeaderDto }) header: ObservationHeaderDto;
  @ApiProperty({
    type: [ObservationAreaDto],
    description:
      '원인 이해 → 마음 이해 → 순서 정리 → 인물과 사건 → 요약과 제목 순',
  })
  areas: ObservationAreaDto[];
  @ApiProperty({
    type: [ObservationGroupDto],
    description: '상태별 묶음(빈 묶음은 뺌)',
  })
  groups: ObservationGroupDto[];
  @ApiProperty() notice: string;
  @ApiProperty({ nullable: true, type: String, example: null })
  errorCode: string | null;
  @ApiProperty({
    type: [ObservationReflectionDto],
    description: 'v3 외 추가: 기간 안 설명 말하기(최근 완료 순)',
  })
  reflections: ObservationReflectionDto[];
}

// ---------- 프론트 보호자 화면 형태(GET …/dashboard) ----------

const STAGES = ['WHO', 'WHAT', 'WHY', 'EMOTION', 'ORDER'];
const STATUSES = ['COLLECTING', 'NEEDS_HELP', 'COMFORTABLE', 'NORMAL'];

export type StageStatus =
  'COLLECTING' | 'NEEDS_HELP' | 'COMFORTABLE' | 'NORMAL';

export class InProgressBookDto {
  @ApiProperty({ example: 12 }) assignmentId: number;
  @ApiProperty({ example: '작은 곰과 꿀단지' }) title: string;
  @ApiProperty({ example: 'QUESTION' }) stage: string;
}

export class DashboardSummaryDto {
  @ApiProperty({ example: 4, description: '지금까지 완료한 책 수' })
  completedBooks: number;
  @ApiProperty({ example: 6 }) stampTotal: number;
  @ApiProperty({ type: InProgressBookDto, nullable: true })
  inProgress: InProgressBookDto | null;
}

export class ReadingSpeedDto {
  @ApiProperty({ example: '2026-09-26' }) date: string;
  @ApiProperty({ example: 84.5, description: '음절/분' })
  syllablesPerMinute: number;
  @ApiProperty({ example: 169 }) syllables: number;
  @ApiProperty({ example: 120000 }) durationMs: number;
}

export class StageAnalysisDto {
  @ApiProperty({ enum: STAGES }) stage: string;
  @ApiProperty({ example: '왜' }) label: string;
  @ApiProperty({
    example: 5,
    description: '기간 안에 완료한 책에서 푼 문제 수',
  })
  total: number;
  @ApiProperty({
    example: 0.4,
    nullable: true,
    type: Number,
    description: '1차에 스스로 맞힌 비율(0~1)',
  })
  firstTryRate: number | null;
  @ApiProperty({
    example: 0.4,
    nullable: true,
    type: Number,
    description:
      '1차 오답 후 맞힌 비율(이해 질문: 힌트를 보고 / 순서 맞추기: 다시 도전해서)',
  })
  afterRetryRate: number | null;
  @ApiProperty({
    example: 0.2,
    nullable: true,
    type: Number,
    description: '정답이 공개된 비율',
  })
  revealedRate: number | null;
  @ApiProperty({
    enum: STATUSES,
    description:
      'AI 파트 판정 기준(기록 요건 5문제·3세션·3이야기·2날짜 충족 후 함께 연습 60%↑/스스로 해결 80%↑/그 사이)을 유형별로 적용. ' +
      'COLLECTING: 기록 부족 / NEEDS_HELP: 함께 연습 / COMFORTABLE: 스스로 해결 / NORMAL: 연습하며 관찰',
  })
  status: StageStatus;
}

export class DashboardCommentDto {
  @ApiProperty({ enum: STAGES }) stage: string;
  @ApiProperty({ enum: STATUSES.slice(1) }) status: string;
  @ApiProperty({ example: '정답을 바로 알려주기 전에, …' }) text: string;
}

export class DashboardReflectionDto {
  @ApiProperty({ example: 12 }) assignmentId: number;
  @ApiProperty({ example: '호랑이와 나무꾼' }) title: string;
  @ApiProperty({
    example: '호랑이가 나무꾼을 형님이라고 불렀어요.',
    description: '아이가 그린 표지를 말로 설명한 글',
  })
  transcript: string;
  @ApiProperty({ example: 42000 }) durationMs: number;
  @ApiProperty() completedAt: Date;
  @ApiProperty({
    example: 'http://localhost:4000/files/drawings/12/3f0c….webp',
    nullable: true,
    type: String,
    description: '아이가 그린 표지 그림 주소',
  })
  coverImageUrl: string | null;
}

export class DashboardDto {
  @ApiProperty({ type: LinkedStudentDto }) student: LinkedStudentDto;
  @ApiProperty({ type: DashboardSummaryDto }) summary: DashboardSummaryDto;
  @ApiProperty({
    type: [ReadingSpeedDto],
    description:
      '최근 학습 날짜의 읽기 속도(날짜 오름차순, 아이 차례 줄 기준 음절/분)',
  })
  readingSpeed: ReadingSpeedDto[];
  @ApiProperty({
    description: '모든 유형이 아직 판정 전(기록 부족)이면 true',
  })
  collecting: boolean;
  @ApiPropertyOptional({ example: '데이터를 모으고 있어요' })
  collectingMessage?: string;
  @ApiProperty({
    type: [StageAnalysisDto],
    description: '조회 기간(기본 최근 14일) 안에 완료한 책 기준',
  })
  byStage: StageAnalysisDto[];
  @ApiProperty({ enum: STAGES, isArray: true, description: '함께 연습할 유형' })
  needsHelp: string[];
  @ApiProperty({
    enum: STAGES,
    isArray: true,
    description: '스스로 해결한 유형',
  })
  comfortable: string[];
  @ApiProperty({
    type: [DashboardCommentDto],
    description: '판정된 유형별 사전 정의 문구(AI 파트 문구, AI 미사용)',
  })
  comments: DashboardCommentDto[];
  @ApiProperty({
    type: [DashboardReflectionDto],
    description: '최근 설명 말하기(최근 완료 순, 표지 그림 포함)',
  })
  reflections: DashboardReflectionDto[];
}
