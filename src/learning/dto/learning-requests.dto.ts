import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { LINE_ID_MAX_LENGTH } from '../../common/constants/content.constants';
import {
  REFLECTION_MAX_DURATION_MS,
  REFLECTION_MAX_LENGTH,
  TITLE_MAX_LENGTH,
} from '../../common/constants/learning.constants';

/** 한 시간 이상은 입력 오류로 봅니다(집계 이상치 기준은 서버가 별도로 적용) */
const MAX_CLIENT_MS = 3_600_000;

export class ReadingLineDurationDto {
  @ApiProperty({ example: 'p001-2' })
  @IsString()
  @MaxLength(LINE_ID_MAX_LENGTH)
  lineId: string;

  @ApiProperty({
    example: 5200,
    description: '"읽어볼게요"부터 다 읽을 때까지 걸린 시간(ms)',
  })
  @IsInt()
  @Min(0)
  @Max(MAX_CLIENT_MS)
  durationMs: number;
}

export class SaveReadingPageDto {
  @ApiProperty({
    type: [ReadingLineDurationDto],
    description:
      '이 페이지에서 학생이 읽은 줄. 서버는 이 페이지의 학생 차례 줄만 반영합니다',
  })
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => ReadingLineDurationDto)
  lines: ReadingLineDurationDto[];
}

export class ChoiceAttemptDto {
  @ApiProperty({ example: 1, description: '고른 보기 번호(0부터)' })
  @IsInt()
  @Min(0)
  answer: number;

  @ApiPropertyOptional({ example: 4200 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(MAX_CLIENT_MS)
  responseTimeMs?: number;
}

export class OrderingAttemptDto {
  @ApiProperty({
    example: ['e1', 'e2', 'e3', 'e4'],
    description: '놓은 순서대로 카드 id',
  })
  @IsArray()
  @ArrayMinSize(2)
  @ArrayMaxSize(20)
  @IsString({ each: true })
  order: string[];

  @ApiPropertyOptional({ example: 9000 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(MAX_CLIENT_MS)
  responseTimeMs?: number;
}

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class SaveTitleDto {
  @ApiProperty({
    example: '호랑이와 나무꾼',
    description: `앞뒤 공백을 뺀 1~${TITLE_MAX_LENGTH}자`,
  })
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(TITLE_MAX_LENGTH)
  title: string;
}

export class SaveReflectionDto {
  @ApiProperty({
    example: '호랑이가 나무꾼을 형님이라고 불러서 웃겼어요.',
    description:
      '브라우저 음성 인식으로 받아 적은 글. 공백만 있으면 422(다시 말하기)',
  })
  @IsString()
  @MaxLength(REFLECTION_MAX_LENGTH)
  transcript: string;

  @ApiProperty({ example: 42000, description: '말한 시간(ms), 최대 2분' })
  @IsInt()
  @Min(0)
  @Max(REFLECTION_MAX_DURATION_MS)
  durationMs: number;
}
