import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  IRewardRepository,
  RewardRecord,
} from '../interfaces/reward-repository.interface';

const REWARD_SELECT = {
  requiredStamps: true,
  name: true,
  givenAt: true,
} as const;

const toRecord = (reward: {
  requiredStamps: number;
  name: string;
  givenAt: Date | null;
}): RewardRecord => ({
  milestone: reward.requiredStamps,
  name: reward.name,
  givenAt: reward.givenAt,
});

@Injectable()
export class PrismaRewardRepository implements IRewardRepository {
  constructor(private readonly prisma: PrismaService) {}

  async sumStamps(studentId: number): Promise<number> {
    const result = await this.prisma.studentStamp.aggregate({
      where: { studentId },
      _sum: { amount: true },
    });
    return result._sum.amount ?? 0;
  }

  async listRewards(studentId: number): Promise<RewardRecord[]> {
    const rewards = await this.prisma.parentReward.findMany({
      where: { studentId },
      orderBy: { requiredStamps: 'asc' },
      select: REWARD_SELECT,
    });
    return rewards.map(toRecord);
  }

  async findReward(
    studentId: number,
    milestone: number,
  ): Promise<RewardRecord | null> {
    const reward = await this.prisma.parentReward.findUnique({
      where: {
        studentId_requiredStamps: { studentId, requiredStamps: milestone },
      },
      select: REWARD_SELECT,
    });
    return reward && toRecord(reward);
  }

  async upsertReward(
    parentId: number,
    studentId: number,
    milestone: number,
    name: string,
  ): Promise<void> {
    await this.prisma.parentReward.upsert({
      where: {
        studentId_requiredStamps: { studentId, requiredStamps: milestone },
      },
      create: { parentId, studentId, requiredStamps: milestone, name },
      update: { parentId, name },
    });
  }

  async deleteReward(studentId: number, milestone: number): Promise<void> {
    await this.prisma.parentReward.deleteMany({
      where: { studentId, requiredStamps: milestone },
    });
  }

  async setGivenAt(
    studentId: number,
    milestone: number,
    givenAt: Date | null,
  ): Promise<void> {
    await this.prisma.parentReward.update({
      where: {
        studentId_requiredStamps: { studentId, requiredStamps: milestone },
      },
      data: { givenAt },
    });
  }
}
