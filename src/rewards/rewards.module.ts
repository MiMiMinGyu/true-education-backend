import { Module } from '@nestjs/common';
import { REWARD_REPOSITORY } from './interfaces/reward-repository.interface';
import { PrismaRewardRepository } from './repositories/prisma-reward.repository';
import { RewardsService } from './rewards.service';
import { StudentRewardsController } from './student-rewards.controller';

@Module({
  controllers: [StudentRewardsController],
  providers: [
    { provide: REWARD_REPOSITORY, useClass: PrismaRewardRepository },
    RewardsService,
  ],
  // 보호자 API(parents 모듈)가 같은 보상 로직을 씁니다.
  exports: [RewardsService],
})
export class RewardsModule {}
