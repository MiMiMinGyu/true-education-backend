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

export class DashboardPeriodDto {
  @ApiProperty({ example: '2026-09-13' }) startDate: string;
  @ApiProperty({ example: '2026-09-26' }) endDate: string;
  @ApiProperty({ example: 'Asia/Seoul' }) timeZone: string;
}

export class DashboardHeaderDto {
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

export class DashboardAreaDto {
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

export class DashboardGroupDto {
  @ApiProperty({ enum: AREA_STATES }) id: string;
  @ApiProperty({ example: '함께 연습해 봐요' }) title: string;
  @ApiProperty({ example: ['cause'] }) areaIds: string[];
}

export class DashboardReflectionDto {
  @ApiProperty({ example: 12 }) assignmentId: number;
  @ApiProperty({ example: '호랑이와 나무꾼' }) title: string;
  @ApiProperty({ example: '호랑이가 나무꾼을 형님이라고 불렀어요.' })
  transcript: string;
  @ApiProperty({ example: 42000 }) durationMs: number;
  @ApiProperty() completedAt: Date;
}

export class DashboardDto {
  @ApiProperty({ example: '3.0.0' }) specVersion: string;
  @ApiProperty({ example: 'guardian-observation-2026-09-v1' })
  policyVersion: string;
  @ApiProperty({ example: '3' }) childId: string;
  @ApiProperty({ example: 'available' }) availability: string;
  @ApiProperty({ type: DashboardPeriodDto }) period: DashboardPeriodDto;
  @ApiProperty({ example: 'early-reading-v1' }) profileId: string;
  @ApiProperty({ type: DashboardHeaderDto }) header: DashboardHeaderDto;
  @ApiProperty({
    type: [DashboardAreaDto],
    description:
      '원인 이해 → 마음 이해 → 순서 정리 → 인물과 사건 → 요약과 제목 순',
  })
  areas: DashboardAreaDto[];
  @ApiProperty({
    type: [DashboardGroupDto],
    description: '상태별 묶음(빈 묶음은 뺌)',
  })
  groups: DashboardGroupDto[];
  @ApiProperty() notice: string;
  @ApiProperty({ nullable: true, type: String, example: null })
  errorCode: string | null;
  @ApiProperty({
    type: [DashboardReflectionDto],
    description: 'v3 외 추가: 기간 안 설명 말하기(최근 완료 순)',
  })
  reflections: DashboardReflectionDto[];
}
