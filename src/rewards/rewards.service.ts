import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  MAX_REWARD_MILESTONE,
  STAMPS_PER_REWARD,
} from '../common/constants/learning.constants';
import { RewardBoardDto } from './dto/rewards.dto';
import {
  REWARD_REPOSITORY,
  type IRewardRepository,
  type RewardRecord,
} from './interfaces/reward-repository.interface';

/** 아직 달성하지 않은 가장 작은 목표치 */
export function nextMilestone(stampTotal: number): number {
  return (Math.floor(stampTotal / STAMPS_PER_REWARD) + 1) * STAMPS_PER_REWARD;
}

/**
 * 보상판: 누적 스탬프 5·10·15…개마다 보호자가 정한 보상. 달성 여부는 "합계 >= 목표치"로 계산하므로
 * 한 번에 2개를 받아 4 → 6이 되어도 5번 보상을 놓치지 않습니다.
 * 스탬프는 쓰지 않고 계속 쌓이며, 보호자가 실제로 보상을 전하면 "선물했어요"(givenAt)로 기록합니다.
 * 보상 글은 아이에게 전하기 전까지(달성한 뒤에도) 정하거나 바꿀 수 있고, 전한 뒤에는 바꿀 수 없습니다.
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
        milestone: reward.milestone,
        name: reward.name,
        achieved: stampTotal >= reward.milestone,
        givenAt: reward.givenAt,
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
    assertMilestone(milestone);
    assertNotGiven(await this.repository.findReward(studentId, milestone));
    await this.repository.upsertReward(parentId, studentId, milestone, name);
    return this.board(studentId);
  }

  async remove(studentId: number, milestone: number): Promise<void> {
    assertMilestone(milestone);
    assertNotGiven(await this.repository.findReward(studentId, milestone));
    await this.repository.deleteReward(studentId, milestone);
  }

  /** 보호자가 아이에게 보상을 전했다고 기록합니다. 보상을 정했고 스탬프를 다 모은 목표치만 됩니다(다시 눌러도 처음 시각 유지) */
  async markGiven(
    studentId: number,
    milestone: number,
  ): Promise<RewardBoardDto> {
    assertMilestone(milestone);
    const reward = await this.repository.findReward(studentId, milestone);
    if (!reward) throw new NotFoundException('먼저 보상을 정해 주세요.');
    if ((await this.repository.sumStamps(studentId)) < milestone) {
      throw new ConflictException('아직 스탬프를 다 모으지 않았어요.');
    }
    if (!reward.givenAt) {
      await this.repository.setGivenAt(studentId, milestone, new Date());
    }
    return this.board(studentId);
  }

  /** "선물했어요"를 잘못 눌렀을 때 되돌립니다 */
  async unmarkGiven(
    studentId: number,
    milestone: number,
  ): Promise<RewardBoardDto> {
    assertMilestone(milestone);
    if (!(await this.repository.findReward(studentId, milestone))) {
      throw new NotFoundException('정해 둔 보상이 없어요.');
    }
    await this.repository.setGivenAt(studentId, milestone, null);
    return this.board(studentId);
  }
}

function assertMilestone(milestone: number) {
  if (
    milestone <= 0 ||
    milestone > MAX_REWARD_MILESTONE ||
    milestone % STAMPS_PER_REWARD !== 0
  ) {
    throw new BadRequestException(
      `목표치는 ${STAMPS_PER_REWARD}의 배수(최대 ${MAX_REWARD_MILESTONE})여야 합니다.`,
    );
  }
}

/** 아이에게 이미 전한 보상은 약속이 바뀌지 않도록 고치거나 지울 수 없습니다 */
function assertNotGiven(reward: RewardRecord | null) {
  if (reward?.givenAt) {
    throw new ConflictException('이미 선물한 보상은 바꿀 수 없어요.');
  }
}
