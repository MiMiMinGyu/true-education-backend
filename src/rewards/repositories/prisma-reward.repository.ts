import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  IRewardRepository,
  RewardRecord,
} from '../interfaces/reward-repository.interface';

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
      select: { requiredStamps: true, name: true },
    });
    return rewards.map((reward) => ({
      milestone: reward.requiredStamps,
      name: reward.name,
    }));
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
}
