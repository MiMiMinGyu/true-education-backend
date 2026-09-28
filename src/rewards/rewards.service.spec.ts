import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import {
  IRewardRepository,
  RewardRecord,
} from './interfaces/reward-repository.interface';
import { nextMilestone, RewardsService } from './rewards.service';

const GIVEN = new Date('2026-09-28T09:00:00Z');

function setup(stampTotal: number) {
  const rewards: RewardRecord[] = [
    { milestone: 5, name: '간식', givenAt: GIVEN },
    { milestone: 10, name: '공원', givenAt: null },
  ];
  const find = (milestone: number) =>
    rewards.find((reward) => reward.milestone === milestone) ?? null;
  const repository = {
    sumStamps: jest.fn().mockResolvedValue(stampTotal),
    listRewards: jest.fn(async () => rewards),
    findReward: jest.fn(async (_studentId: number, milestone: number) =>
      find(milestone),
    ),
    upsertReward: jest.fn(),
    deleteReward: jest.fn(),
    setGivenAt: jest.fn(
      async (_studentId: number, milestone: number, givenAt: Date | null) => {
        find(milestone)!.givenAt = givenAt;
      },
    ),
  };
  return {
    repository,
    service: new RewardsService(repository as IRewardRepository),
  };
}

describe('RewardsService', () => {
  it('다음 목표치는 아직 달성하지 않은 가장 작은 5의 배수', () => {
    expect([0, 4, 5, 6, 9, 10].map(nextMilestone)).toEqual([
      5, 5, 10, 10, 10, 15,
    ]);
  });

  it('달성 여부는 합계 >= 목표치(2개를 한 번에 받아 4 → 6이 되어도 5번 달성), 선물한 시각 포함', async () => {
    const { service } = setup(6);
    expect(await service.board(1)).toEqual({
      stampsPerReward: 5,
      stampTotal: 6,
      rewards: [
        { milestone: 5, name: '간식', achieved: true, givenAt: GIVEN },
        { milestone: 10, name: '공원', achieved: false, givenAt: null },
      ],
      nextMilestone: 10,
    });
  });

  it('목표치는 5의 양의 배수만(최대 1000)', async () => {
    const { service, repository } = setup(0);
    for (const milestone of [0, -5, 7, 1005]) {
      await expect(service.set(9, 1, milestone, '선물')).rejects.toBeInstanceOf(
        BadRequestException,
      );
    }
    expect(repository.upsertReward).not.toHaveBeenCalled();
  });

  it('달성했어도 아직 전하지 않았으면 정하거나 바꿀 수 있고, 선물한 보상은 고치거나 지울 수 없다(409)', async () => {
    const { service, repository } = setup(12);
    await service.set(9, 1, 10, '놀이공원');
    expect(repository.upsertReward).toHaveBeenCalledWith(9, 1, 10, '놀이공원');
    await expect(service.set(9, 1, 5, '바꿈')).rejects.toBeInstanceOf(
      ConflictException,
    );
    await expect(service.remove(1, 5)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('선물했어요: 보상이 있고 스탬프를 다 모았을 때만, 다시 눌러도 처음 시각 유지, 취소 가능', async () => {
    const { service, repository } = setup(12);
    await expect(service.markGiven(1, 15)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    const board = await service.markGiven(1, 10);
    expect(board.rewards[1].givenAt).toBeInstanceOf(Date);
    await service.markGiven(1, 5);
    expect(repository.setGivenAt).toHaveBeenCalledTimes(1); // 5번은 이미 선물함
    expect((await service.unmarkGiven(1, 5)).rewards[0].givenAt).toBeNull();

    const early = setup(7);
    await expect(early.service.markGiven(1, 10)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });
});
