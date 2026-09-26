import { Injectable } from '@nestjs/common';
import { BookContent } from '../../content/interfaces/book-content.interface';
import { PrismaService } from '../../prisma/prisma.service';
import {
  CachedAudio,
  ITtsRepository,
} from '../interfaces/tts-repository.interface';

@Injectable()
export class PrismaTtsRepository implements ITtsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findBookContent(bookId: number): Promise<BookContent | null> {
    const book = await this.prisma.book.findUnique({
      where: { id: bookId },
      select: { content: true },
    });
    return book ? (book.content as unknown as BookContent) : null;
  }

  listBooks(externalId?: string) {
    return this.prisma.book.findMany({
      where: externalId ? { externalId } : {},
      orderBy: { id: 'asc' },
      select: { id: true, externalId: true },
    });
  }

  async findAudio(bookId: number, lineId: string): Promise<CachedAudio | null> {
    const audio = await this.prisma.ttsAudio.findUnique({
      where: { bookId_lineId: { bookId, lineId } },
      select: { contentHash: true, audioUrl: true },
    });
    return audio && { contentHash: audio.contentHash, key: audio.audioUrl };
  }

  async upsertAudio(
    bookId: number,
    lineId: string,
    contentHash: string,
    key: string,
  ): Promise<void> {
    await this.prisma.ttsAudio.upsert({
      where: { bookId_lineId: { bookId, lineId } },
      create: { bookId, lineId, contentHash, audioUrl: key },
      update: { contentHash, audioUrl: key },
    });
  }
}
