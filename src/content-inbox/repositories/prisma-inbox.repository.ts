import { Injectable } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  IInboxRepository,
  ImportLogEntry,
  StockSummary,
} from '../interfaces/inbox-repository.interface';

@Injectable()
export class PrismaInboxRepository implements IInboxRepository {
  constructor(private readonly prisma: PrismaService) {}

  async saveLog(entry: ImportLogEntry): Promise<void> {
    await this.prisma.contentImportLog.create({
      data: {
        ...entry,
        payload: (entry.payload ?? null) as Prisma.InputJsonValue,
      },
    });
  }

  async existingExternalIds(externalIds: string[]): Promise<string[]> {
    if (externalIds.length === 0) return [];
    const books = await this.prisma.book.findMany({
      where: { externalId: { in: externalIds } },
      select: { externalId: true },
    });
    return books.map((book) => book.externalId);
  }

  countUnassignedBooks(studentId: number): Promise<number> {
    return this.prisma.book.count({
      where: { assignments: { none: { studentId } } },
    });
  }

  async stockSummary(threshold: number): Promise<StockSummary> {
    const totalBooks = await this.prisma.book.count();
    const assigned = await this.prisma.bookAssignment.groupBy({
      by: ['studentId'],
      _count: { _all: true },
    });
    const remaining = assigned.map((row) => totalBooks - row._count._all);
    return {
      totalBooks,
      activeStudents: assigned.length,
      lowStudents: remaining.filter((n) => n <= threshold).length,
      minRemaining: remaining.length ? Math.min(...remaining) : totalBooks,
    };
  }
}
