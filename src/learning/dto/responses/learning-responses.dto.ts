import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { LearningStage } from '../../../common/constants/learning.constants';

const STAGES = [
  'READING',
  'QUESTION',
  'ORDERING',
  'TITLE',
  'DRAWING',
  'REFLECTION',
  'COMPLETED',
];

// ---------- 오늘의 학습 ----------

export class TodayBookDto {
  @ApiProperty({ example: 3 }) id: number;
  @ApiProperty({ example: '작은 곰과 꿀단지' }) title: string;
  @ApiProperty({ example: '방정환', nullable: true, type: String }) author:
    string | null;
}

export class TodayStepDto {
  @ApiProperty({ enum: STAGES.slice(0, -1), example: 'READING' }) key: string;
  @ApiProperty({ example: '번갈아 읽기' }) label: string;
  @ApiProperty({ enum: ['DONE', 'CURRENT', 'LOCKED'] }) status:
    'DONE' | 'CURRENT' | 'LOCKED';
}

export class CompletedBookDto {
  @ApiProperty({ example: 12 }) assignmentId: number;
  @ApiProperty({
    example: '호랑이와 나무꾼',
    description: '학생이 지은 제목, 없으면 원제',
  })
  title: string;
}

export class TodayResponseDto {
  @ApiProperty({
    enum: ['LEARNING', 'DONE', 'NO_BOOK'],
    description:
      'LEARNING: 진행 중인 책 / DONE: 오늘 1권 완료(새 책은 내일) / NO_BOOK: 배정할 책이 없음',
  })
  type: 'LEARNING' | 'DONE' | 'NO_BOOK';

  @ApiPropertyOptional({ example: 12 }) assignmentId?: number;
  @ApiPropertyOptional({ type: TodayBookDto }) book?: TodayBookDto;
  @ApiPropertyOptional({ enum: STAGES }) stage?: LearningStage;
  @ApiPropertyOptional({
    example: 0,
    description:
      '저장한 읽기 페이지 수. READING이면서 0이면 아직 한 단계도 시작하지 않은 새 책(소개 화면 표시용)',
  })
  savedPages?: number;
  @ApiPropertyOptional({ example: 5 }) totalPages?: number;
  @ApiPropertyOptional({
    type: [TodayStepDto],
    description: '이 책에서 거치는 단계만 포함(문제가 없는 단계는 빠짐)',
  })
  steps?: TodayStepDto[];

  @ApiPropertyOptional({ type: CompletedBookDto })
  completedBook?: CompletedBookDto;
  @ApiPropertyOptional({
    example: 1,
    description: '오늘 완료한 책으로 받은 스탬프 수(1 또는 2). 보물상자 연출용',
  })
  stampsEarned?: number;
}

// ---------- 번갈아 읽기 ----------

export class ReadingLineDto {
  @ApiProperty({ example: 'p001-1' }) id: string;
  @ApiProperty({ example: '작은 곰은 숲속 길을 천천히 걸어갔어요.' })
  text: string;
  @ApiProperty({
    enum: ['YEOUL', 'STUDENT'],
    description: '여울이가 먼저, 한 줄씩 번갈아',
  })
  speaker: 'YEOUL' | 'STUDENT';
}

export class ReadingPageDto {
  @ApiProperty({ example: 1 }) page: number;
  @ApiProperty({ type: [ReadingLineDto] }) lines: ReadingLineDto[];
}

export class ReadingResponseDto {
  @ApiProperty({ example: 5 }) totalPages: number;
  @ApiProperty({
    example: 1,
    description: '저장한 페이지 수. savedPages + 1 페이지부터 이어 읽기',
  })
  savedPages: number;
  @ApiProperty({ type: [ReadingPageDto] }) pages: ReadingPageDto[];
  @ApiProperty({ example: { 길모퉁이: '길이 꺾여 돌아가는 곳' } })
  glossary: Record<string, string>;
}

export class SaveReadingPageResponseDto {
  @ApiProperty({ example: 2 }) savedPages: number;
  @ApiProperty({ example: 5 }) totalPages: number;
  @ApiProperty({
    enum: STAGES,
    description: '마지막 페이지를 저장하면 다음 단계로 바뀜',
  })
  stage: LearningStage;
}

// ---------- 이해 질문 ----------

export class QuestionStateDto {
  @ApiProperty({ example: 1 }) attempts: number;
  @ApiProperty({ example: false }) finished: boolean;
  @ApiPropertyOptional({
    description: '끝난 문제만: 스스로(또는 힌트 보고) 맞혔는지',
  })
  correct?: boolean;
  @ApiPropertyOptional({
    example: 1,
    description: '끝난 문제만: 정답 보기 번호',
  })
  answer?: number;
  @ApiPropertyOptional({
    description: '1차 오답 후 아직 안 끝난 문제만: 이어하기용 힌트',
  })
  hint?: string;
}

export class QuestionDto {
  @ApiProperty({ example: 31 }) questionId: number;
  @ApiProperty({ example: 1 }) order: number;
  @ApiProperty({
    enum: ['WHO', 'WHAT', 'WHY', 'EMOTION'],
    description: '누가·무슨 일·왜·마음',
  })
  stage: string;
  @ApiProperty({ example: '숲속 길에서 꿀단지를 발견한 것은 누구일까요?' })
  text: string;
  @ApiProperty({
    example: ['토끼', '작은 곰', '부엉이'],
    description: '보기 번호 = 배열 index(0부터)',
  })
  options: string[];
  @ApiProperty({ type: QuestionStateDto }) state: QuestionStateDto;
}

export class ChoiceAttemptResponseDto {
  @ApiProperty() correct: boolean;
  @ApiProperty({ description: '이 문제가 끝났는지(정답 또는 2회 소진)' })
  finished: boolean;
  @ApiPropertyOptional({ description: '1차 오답일 때만: 정답이 있는 문단' })
  hint?: string;
  @ApiPropertyOptional({
    example: 1,
    description: '2차 오답일 때만: 정답 보기 번호',
  })
  answer?: number;
  @ApiProperty({
    enum: STAGES,
    description: '모든 문제가 끝나면 다음 단계로 바뀜',
  })
  stage: LearningStage;
}

// ---------- 순서 맞추기 ----------

export class OrderingCardDto {
  @ApiProperty({ example: 'e3' }) id: string;
  @ApiProperty({ example: '다람쥐와 부엉이도 나무 아래로 모였어요.' })
  text: string;
}

export class OrderingStateDto {
  @ApiProperty({ example: 0 }) attempts: number;
  @ApiProperty({ example: 3 }) remaining: number;
  @ApiProperty({ example: false }) finished: boolean;
  @ApiPropertyOptional() correct?: boolean;
  @ApiPropertyOptional({
    example: ['e1', 'e2', 'e3', 'e4'],
    description: '끝났을 때만: 정답 순서',
  })
  answer?: string[];
}

export class OrderingResponseDto {
  @ApiProperty({ example: 35 }) questionId: number;
  @ApiProperty({ example: '이야기에서 일어난 차례대로 카드를 놓아 보세요.' })
  text: string;
  @ApiProperty({
    type: [OrderingCardDto],
    description: '서버가 섞어서 보냄(정답 순서와 다름)',
  })
  cards: OrderingCardDto[];
  @ApiProperty({ type: OrderingStateDto }) state: OrderingStateDto;
}

export class OrderingAttemptResponseDto {
  @ApiProperty() correct: boolean;
  @ApiProperty() finished: boolean;
  @ApiPropertyOptional({
    example: 2,
    description: '오답이고 기회가 남았을 때: 남은 횟수',
  })
  remaining?: number;
  @ApiPropertyOptional({
    example: ['e1', 'e2', 'e3', 'e4'],
    description: '3회 오답일 때: 정답 순서',
  })
  answer?: string[];
  @ApiProperty({ enum: STAGES }) stage: LearningStage;
}
