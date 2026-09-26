import { Module } from '@nestjs/common';
import { AssignmentsController } from './assignments.controller';
import { BookMakingService } from './book-making.service';
import { BookSelector } from './book-selector';
import { AssignmentOwnerGuard } from './guards/assignment-owner.guard';
import { LEARNING_REPOSITORY } from './interfaces/learning-repository.interface';
import { ProgressService } from './progress.service';
import { QuizService } from './quiz.service';
import { ReadingService } from './reading.service';
import { PrismaLearningRepository } from './repositories/prisma-learning.repository';
import { SessionsController } from './sessions.controller';
import { SessionsService } from './sessions.service';
import { StampsController } from './stamps.controller';

@Module({
  controllers: [SessionsController, AssignmentsController, StampsController],
  providers: [
    { provide: LEARNING_REPOSITORY, useClass: PrismaLearningRepository },
    BookSelector,
    AssignmentOwnerGuard,
    SessionsService,
    ReadingService,
    QuizService,
    ProgressService,
    BookMakingService,
  ],
})
export class LearningModule {}
