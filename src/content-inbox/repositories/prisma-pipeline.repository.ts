import { Injectable } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import type { ContentRefillRequest } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import type { RandomJobRequest } from '../ai-pipeline.client';
import {
  DeliveryRecord,
  IPipelineRepository,
  OwnedBooks,
  RefillRecord,
  RefillUpdate,
} from '../interfaces/pipeline-repository.interface';

const ACTIVE = ['PENDING', 'ACTIVE'] as const;

const isUniqueViolation = (error: unknown) =>
  error instanceof Prisma.PrismaClientKnownRequestError &&
  error.code === 'P2002';

function toRecord(row: ContentRefillRequest): RefillRecord {
  return {
    ...row,
    requestBody: row.requestBody as unknown as RandomJobRequest,
  };
}

@Injectable()
export class PrismaPipelineRepository implements IPipelineRepository {
  constructor(private readonly prisma: PrismaService) {}

  async ownedBooks(): Promise<OwnedBooks> {
    const books = await this.prisma.book.findMany({
      select: { externalId: true, sourceUrl: true },
      orderBy: { id: 'asc' },
    });
    return {
      externalIds: books.map((book) => book.externalId),
      sourceUrls: [
        ...new Set(
          books
            .map((book) => book.sourceUrl?.trim())
            .filter((url): url is string => Boolean(url)),
        ),
      ],
    };
  }

  async createRefill(record: {
    id: string;
    jobId: string;
    requestBody: RandomJobRequest;
  }): Promise<RefillRecord | null> {
    try {
      const row = await this.prisma.contentRefillRequest.create({
        data: {
          ...record,
          requestBody: record.requestBody as unknown as Prisma.InputJsonValue,
        },
      });
      return toRecord(row);
    } catch (error) {
      // uq_one_active_refill: 다른 요청이 먼저 보충을 시작함
      if (isUniqueViolation(error)) return null;
      throw error;
    }
  }

  async activeRefill(): Promise<RefillRecord | null> {
    const row = await this.prisma.contentRefillRequest.findFirst({
      where: { status: { in: [...ACTIVE] } },
    });
    return row && toRecord(row);
  }

  async lastFailedRefill(): Promise<RefillRecord | null> {
    const row = await this.prisma.contentRefillRequest.findFirst({
      where: { status: 'FAILED' },
      orderBy: { finishedAt: 'desc' },
    });
    return row && toRecord(row);
  }

  async findRefillByJob(jobId: string): Promise<RefillRecord | null> {
    const row = await this.prisma.contentRefillRequest.findUnique({
      where: { jobId },
    });
    return row && toRecord(row);
  }

  async updateRefill(id: string, data: RefillUpdate): Promise<void> {
    await this.prisma.contentRefillRequest.update({ where: { id }, data });
  }

  async completeRefillByJob(
    jobId: string,
    externalId: string,
  ): Promise<boolean> {
    const { count } = await this.prisma.contentRefillRequest.updateMany({
      where: { jobId, status: { in: [...ACTIVE] } },
      data: {
        status: 'COMPLETED',
        bookExternalId: externalId,
        deliveryStatus: 'delivered',
        finishedAt: new Date(),
      },
    });
    return count > 0;
  }

  findDelivery(deliveryKey: string): Promise<DeliveryRecord | null> {
    return this.prisma.aiBookDelivery.findUnique({
      where: { deliveryKey },
      select: {
        deliveryKey: true,
        jobId: true,
        externalId: true,
        bodyHash: true,
        status: true,
      },
    });
  }

  async saveDelivery(record: DeliveryRecord): Promise<DeliveryRecord> {
    try {
      await this.prisma.aiBookDelivery.create({ data: record });
      return record;
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      return (await this.findDelivery(record.deliveryKey)) ?? record;
    }
  }

  async bookExists(externalId: string): Promise<boolean> {
    return (await this.prisma.book.count({ where: { externalId } })) > 0;
  }
}
