import { Module } from '@nestjs/common';
import { RewardsModule } from '../rewards/rewards.module';
import { DashboardService } from './dashboard.service';
import { ObservationService } from './observation.service';
import { LinkedStudentGuard } from './guards/linked-student.guard';
import { PARENT_REPOSITORY } from './interfaces/parent-repository.interface';
import { ParentsController } from './parents.controller';
import { PrismaParentRepository } from './repositories/prisma-parent.repository';

@Module({
  imports: [RewardsModule],
  controllers: [ParentsController],
  providers: [
    { provide: PARENT_REPOSITORY, useClass: PrismaParentRepository },
    LinkedStudentGuard,
    DashboardService,
    ObservationService,
  ],
})
export class ParentsModule {}
