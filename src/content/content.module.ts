import { Module } from '@nestjs/common';
import { ContentImportService } from './content-import.service';
import { CONTENT_REPOSITORY } from './interfaces/content-repository.interface';
import { PrismaContentRepository } from './repositories/prisma-content.repository';

@Module({
  providers: [
    ContentImportService,
    { provide: CONTENT_REPOSITORY, useClass: PrismaContentRepository },
  ],
  exports: [ContentImportService],
})
export class ContentModule {}
