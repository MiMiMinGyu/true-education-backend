import { ApiProperty } from '@nestjs/swagger';

export class ContentImportResultDto {
  @ApiProperty({ example: 'good-brothers' }) externalId: string;
  @ApiProperty({
    enum: [
      'CREATED',
      'UPDATED',
      'SKIPPED_ASSIGNED',
      'SKIPPED',
      'INVALID',
      'DRY_RUN',
    ],
  })
  status: string;
  @ApiProperty({
    nullable: true,
    example: '의좋은 형제 · 6쪽 12줄 · 이해 질문 0개 · 순서 맞추기 없음',
  })
  summary: string | null;
  @ApiProperty({ type: [String], description: '하나라도 있으면 저장하지 않음' })
  errors: string[];
  @ApiProperty({
    type: [String],
    description: '저장은 했지만 확인이 필요한 점',
  })
  warnings: string[];
}

export class ContentStockDto {
  @ApiProperty({ example: 12 }) totalBooks: number;
  @ApiProperty({ example: 8, description: '배정을 한 번이라도 받은 학생 수' })
  activeStudents: number;
  @ApiProperty({
    example: 1,
    description: '남은 책이 기준(3권) 이하인 학생 수',
  })
  lowStudents: number;
  @ApiProperty({ example: 2, description: '가장 적게 남은 학생의 남은 책 수' })
  minRemaining: number;
}
