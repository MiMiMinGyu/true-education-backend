import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
} from '@nestjs/common';
import {
  MAX_REWARD_MILESTONE,
  STAMPS_PER_REWARD,
} from '../common/constants/learning.constants';
import { RewardBoardDto } from './dto/rewards.dto';
import {
  REWARD_REPOSITORY,
  type IRewardRepository,
} from './interfaces/reward-repository.interface';

/** 아직 달성하지 않은 가장 작은 목표치 */
export function nextMilestone(stampTotal: number): number {
  return (Math.floor(stampTotal / STAMPS_PER_REWARD) + 1) * STAMPS_PER_REWARD;
}

/**
 * 보상판: 누적 스탬프 5·10·15…개마다 보호자가 정한 보상. 달성 여부는 "합계 >= 목표치"로 계산하므로
 * 한 번에 2개를 받아 4 → 6이 되어도 5번 보상을 놓치지 않습니다.
 */
@Injectable()
export class RewardsService {
  constructor(
    @Inject(REWARD_REPOSITORY)
    private readonly repository: IRewardRepository,
  ) {}

  async board(studentId: number): Promise<RewardBoardDto> {
    const [stampTotal, rewards] = await Promise.all([
      this.repository.sumStamps(studentId),
      this.repository.listRewards(studentId),
    ]);
    return {
      stampsPerReward: STAMPS_PER_REWARD,
      stampTotal,
      rewards: rewards.map((reward) => ({
        ...reward,
        achieved: stampTotal >= reward.milestone,
      })),
      nextMilestone: nextMilestone(stampTotal),
    };
  }

  async set(
    parentId: number,
    studentId: number,
    milestone: number,
    name: string,
  ): Promise<RewardBoardDto> {
    await this.assertEditable(studentId, milestone);
    await this.repository.upsertReward(parentId, studentId, milestone, name);
    return this.board(studentId);
  }

  async remove(studentId: number, milestone: number): Promise<void> {
    await this.assertEditable(studentId, milestone);
    await this.repository.deleteReward(studentId, milestone);
  }

  /** 아이가 이미 받기로 한 약속이 바뀌지 않도록, 달성한 목표치의 보상은 고치거나 지울 수 없습니다 */
  private async assertEditable(studentId: number, milestone: number) {
    if (
      milestone <= 0 ||
      milestone > MAX_REWARD_MILESTONE ||
      milestone % STAMPS_PER_REWARD !== 0
    ) {
      throw new BadRequestException(
        `목표치는 ${STAMPS_PER_REWARD}의 배수(최대 ${MAX_REWARD_MILESTONE})여야 합니다.`,
      );
    }
    if ((await this.repository.sumStamps(studentId)) >= milestone) {
      throw new ConflictException('이미 달성한 보상은 바꿀 수 없습니다.');
    }
  }
}
