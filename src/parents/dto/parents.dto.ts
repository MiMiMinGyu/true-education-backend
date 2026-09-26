import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { StageStatus } from '../../common/constants/dashboard';

const STAGES = ['WHO', 'WHAT', 'WHY', 'EMOTION', 'ORDER'];
const STATUSES = ['COLLECTING', 'NEEDS_HELP', 'COMFORTABLE', 'NORMAL'];

export class LinkedStudentDto {
  @ApiProperty({ example: 3 }) studentId: number;
  @ApiProperty({ example: '김여울' }) name: string;
}

export class InProgressBookDto {
  @ApiProperty({ example: 12 }) assignmentId: number;
  @ApiProperty({ example: '작은 곰과 꿀단지' }) title: string;
  @ApiProperty({ example: 'QUESTION' }) stage: string;
}

export class DashboardSummaryDto {
  @ApiProperty({ example: 4 }) completedBooks: number;
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
  @ApiProperty({ example: 4, description: '완료한 책에서 푼 문제 수' })
  total: number;
  @ApiProperty({
    example: 0.75,
    nullable: true,
    type: Number,
    description: '1차에 스스로 맞힌 비율(0~1)',
  })
  firstTryRate: number | null;
  @ApiProperty({
    example: 0.25,
    nullable: true,
    type: Number,
    description:
      '1차 오답 후 맞힌 비율(이해 질문: 힌트를 보고 / 순서 맞추기: 다시 도전해서)',
  })
  afterRetryRate: number | null;
  @ApiProperty({
    example: 0,
    nullable: true,
    type: Number,
    description: '정답이 공개된 비율',
  })
  revealedRate: number | null;
  @ApiProperty({
    enum: STATUSES,
    description:
      'COLLECTING: 판정 전(완료 3권 미만 또는 푼 적 없음) / NEEDS_HELP / COMFORTABLE / NORMAL',
  })
  status: StageStatus;
}

export class DashboardCommentDto {
  @ApiProperty({ enum: STAGES }) stage: string;
  @ApiProperty({ enum: STATUSES.slice(1) }) status: string;
  @ApiProperty({ example: '이유를 찾는 질문을 어려워해요. …' }) text: string;
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
  @ApiProperty({ type: LinkedStudentDto }) student: LinkedStudentDto;
  @ApiProperty({ type: DashboardSummaryDto }) summary: DashboardSummaryDto;
  @ApiProperty({
    type: [ReadingSpeedDto],
    description: '최근 학습 날짜의 읽기 속도(날짜 오름차순)',
  })
  readingSpeed: ReadingSpeedDto[];
  @ApiProperty({
    description: '완료한 책이 3권 미만이면 true(유형별 판정을 하지 않음)',
  })
  collecting: boolean;
  @ApiPropertyOptional({ example: '데이터를 모으고 있어요' })
  collectingMessage?: string;
  @ApiProperty({ type: [StageAnalysisDto] }) byStage: StageAnalysisDto[];
  @ApiProperty({
    enum: STAGES,
    isArray: true,
    description: '도움이 필요한 유형',
  })
  needsHelp: string[];
  @ApiProperty({ enum: STAGES, isArray: true, description: '잘하는 유형' })
  comfortable: string[];
  @ApiProperty({
    type: [DashboardCommentDto],
    description: '판정된 유형별 사전 정의 문구(AI 미사용)',
  })
  comments: DashboardCommentDto[];
  @ApiProperty({
    type: [DashboardReflectionDto],
    description: '최근 설명 말하기(최근 완료 순)',
  })
  reflections: DashboardReflectionDto[];
}
