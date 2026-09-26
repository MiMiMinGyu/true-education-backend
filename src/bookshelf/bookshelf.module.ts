import { Module } from '@nestjs/common';
import { LearningModule } from '../learning/learning.module';
import { BookshelfController } from './bookshelf.controller';
import { BookshelfService } from './bookshelf.service';
import { BOOKSHELF_REPOSITORY } from './interfaces/bookshelf-repository.interface';
import { PrismaBookshelfRepository } from './repositories/prisma-bookshelf.repository';

@Module({
  // AssignmentOwnerGuard(배정 소유권 확인)를 학습 모듈에서 가져옵니다.
  imports: [LearningModule],
  controllers: [BookshelfController],
  providers: [
    { provide: BOOKSHELF_REPOSITORY, useClass: PrismaBookshelfRepository },
    BookshelfService,
  ],
})
export class BookshelfModule {}
