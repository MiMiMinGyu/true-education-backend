import { Module } from '@nestjs/common';
import { LINK_REPOSITORY } from './interfaces/link-repository.interface';
import {
  ParentLinksController,
  StudentLinksController,
} from './links.controller';
import { LinksService } from './links.service';
import { PrismaLinkRepository } from './repositories/prisma-link.repository';

@Module({
  controllers: [ParentLinksController, StudentLinksController],
  providers: [
    { provide: LINK_REPOSITORY, useClass: PrismaLinkRepository },
    LinksService,
  ],
})
export class LinksModule {}
