import { BadRequestException, ConflictException } from '@nestjs/common';
import { IRewardRepository } from './interfaces/reward-repository.interface';
import { nextMilestone, RewardsService } from './rewards.service';

function setup(stampTotal: number) {
  const repository = {
    sumStamps: jest.fn().mockResolvedValue(stampTotal),
    listRewards: jest.fn().mockResolvedValue([
      { milestone: 5, name: '간식' },
      { milestone: 10, name: '공원' },
    ]),
    upsertReward: jest.fn(),
    deleteReward: jest.fn(),
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

  it('달성 여부는 합계 >= 목표치(2개를 한 번에 받아 4 → 6이 되어도 5번 달성)', async () => {
    const { service } = setup(6);
    expect(await service.board(1)).toEqual({
      stampsPerReward: 5,
      stampTotal: 6,
      rewards: [
        { milestone: 5, name: '간식', achieved: true },
        { milestone: 10, name: '공원', achieved: false },
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

  it('이미 달성한 목표치는 고치거나 지울 수 없다(409)', async () => {
    const { service, repository } = setup(10);
    await expect(service.set(9, 1, 10, '선물')).rejects.toBeInstanceOf(
      ConflictException,
    );
    await expect(service.remove(1, 5)).rejects.toBeInstanceOf(
      ConflictException,
    );
    await service.set(9, 1, 15, '선물');
    expect(repository.upsertReward).toHaveBeenCalledWith(9, 1, 15, '선물');
  });
});
