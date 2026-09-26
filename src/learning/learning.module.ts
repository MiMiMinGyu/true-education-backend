import { Module } from '@nestjs/common';
import { AssignmentsController } from './assignments.controller';
import { BookSelector } from './book-selector';
import { AssignmentOwnerGuard } from './guards/assignment-owner.guard';
import { LEARNING_REPOSITORY } from './interfaces/learning-repository.interface';
import { QuizService } from './quiz.service';
import { ReadingService } from './reading.service';
import { PrismaLearningRepository } from './repositories/prisma-learning.repository';
import { SessionsController } from './sessions.controller';
import { SessionsService } from './sessions.service';

@Module({
  controllers: [SessionsController, AssignmentsController],
  providers: [
    { provide: LEARNING_REPOSITORY, useClass: PrismaLearningRepository },
    BookSelector,
    AssignmentOwnerGuard,
    SessionsService,
    ReadingService,
    QuizService,
  ],
})
export class LearningModule {}
