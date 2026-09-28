import { ApiProperty } from '@nestjs/swagger';
import {
  OrderingCardDto,
  ReadingPageDto,
} from '../../learning/dto/responses/learning-responses.dto';

export class ShelfItemDto {
  @ApiProperty({ example: 12 }) assignmentId: number;
  @ApiProperty({
    example: '호랑이와 나무꾼',
    description: '학생이 지은 제목, 없으면 원제',
  })
  title: string;
  @ApiProperty({ example: '호랑이 형님' }) originalTitle: string;
  @ApiProperty({
    example: 'http://localhost:4000/files/drawings/12/3f0c….webp',
    nullable: true,
    type: String,
    description: '학생이 그린 표지, 없으면 책 기본 표지(없으면 null)',
  })
  coverImageUrl: string | null;
  @ApiProperty({ example: '2026-09-26T01:00:00.000Z' }) completedAt: Date;
}

export class ShelfSourceDto {
  @ApiProperty({ example: '방정환', nullable: true, type: String }) author:
    string | null;
  @ApiProperty({ nullable: true, type: String }) sourceUrl: string | null;
  @ApiProperty({ example: '공유마당 자유이용', nullable: true, type: String })
  license: string | null;
  @ApiProperty({ nullable: true, type: String }) bibliography: string | null;
}

export class ShelfAttemptDto {
  @ApiProperty({ example: 1 }) attemptNumber: number;
  @ApiProperty({
    example: 2,
    description: '이해 질문: 고른 보기 번호 / 순서 맞추기: 놓은 카드 id 순서',
    oneOf: [{ type: 'number' }, { type: 'array', items: { type: 'string' } }],
  })
  answer: number | string[];
  @ApiProperty() correct: boolean;
}

export class ShelfQuestionDto {
  @ApiProperty({ example: 31 }) questionId: number;
  @ApiProperty({ example: 1 }) order: number;
  @ApiProperty({ enum: ['WHO', 'WHAT', 'WHY', 'EMOTION'] }) stage: string;
  @ApiProperty() text: string;
  @ApiProperty({ example: ['토끼', '작은 곰', '부엉이'] }) options: string[];
  @ApiProperty({ example: 1, description: '정답 보기 번호' }) answer: number;
  @ApiProperty({
    nullable: true,
    type: String,
    description: '정답 설명(데이터에 없으면 null)',
  })
  explanation: string | null;
  @ApiProperty({
    type: [ShelfAttemptDto],
    description: '1차·2차 시도 기록(차수 순)',
  })
  attempts: ShelfAttemptDto[];
}

export class ShelfOrderingDto {
  @ApiProperty({ example: 35 }) questionId: number;
  @ApiProperty() text: string;
  @ApiProperty({ type: [OrderingCardDto], description: '정답 순서' })
  cards: OrderingCardDto[];
  @ApiProperty({ type: [ShelfAttemptDto] }) attempts: ShelfAttemptDto[];
}

export class ShelfReflectionDto {
  @ApiProperty({ example: '호랑이가 나무꾼을 형님이라고 불렀어요.' })
  transcript: string;
  @ApiProperty({ example: 42000 }) durationMs: number;
}

export class ShelfBookDto extends ShelfItemDto {
  @ApiProperty({ type: ShelfSourceDto, description: '출처 표기용' })
  source: ShelfSourceDto;
  @ApiProperty({ type: [ReadingPageDto], description: '본문(열람 전용)' })
  pages: ReadingPageDto[];
  @ApiProperty({ example: { 길모퉁이: '길이 꺾여 돌아가는 곳' } })
  glossary: Record<string, string>;
  @ApiProperty({ type: [ShelfQuestionDto] }) questions: ShelfQuestionDto[];
  @ApiProperty({
    type: ShelfOrderingDto,
    nullable: true,
    description: '순서 맞추기가 없는 책은 null',
  })
  ordering: ShelfOrderingDto | null;
  @ApiProperty({ type: ShelfReflectionDto, nullable: true })
  reflection: ShelfReflectionDto | null;
}
