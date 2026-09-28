import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsString, MaxLength, MinLength } from 'class-validator';

export const REWARD_NAME_MAX_LENGTH = 100;

export class SetRewardDto {
  @ApiProperty({
    example: '공원 가기',
    description: `앞뒤 공백을 뺀 1~${REWARD_NAME_MAX_LENGTH}자. 지우려면 DELETE`,
  })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MinLength(1)
  @MaxLength(REWARD_NAME_MAX_LENGTH)
  name: string;
}

export class RewardDto {
  @ApiProperty({ example: 5, description: '목표 누적 스탬프 수(5의 배수)' })
  milestone: number;
  @ApiProperty({ example: '좋아하는 간식 먹기' }) name: string;
  @ApiProperty({ description: '누적 스탬프가 목표치 이상인지' })
  achieved: boolean;
  @ApiProperty({
    example: null,
    nullable: true,
    type: Date,
    description:
      '보호자가 아이에게 보상을 전하고 "선물했어요"를 누른 시각(안 줬으면 null). 전한 뒤에는 보상 글을 바꾸거나 지울 수 없음',
  })
  givenAt: Date | null;
}

export class RewardBoardDto {
  @ApiProperty({ example: 5 }) stampsPerReward: number;
  @ApiProperty({ example: 7 }) stampTotal: number;
  @ApiProperty({ type: [RewardDto], description: '목표치 오름차순' })
  rewards: RewardDto[];
  @ApiProperty({
    example: 10,
    description: '아직 달성하지 않은 가장 작은 목표치(보상 입력 칸 대상)',
  })
  nextMilestone: number;
}
