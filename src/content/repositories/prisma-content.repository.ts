import { Injectable } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  BookRecord,
  ExistingBook,
  IContentRepository,
  QuestionRecord,
} from '../interfaces/content-repository.interface';

@Injectable()
export class PrismaContentRepository implements IContentRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findBook(externalId: string): Promise<ExistingBook | null> {
    const book = await this.prisma.book.findUnique({
      where: { externalId },
      select: { id: true, _count: { select: { assignments: true } } },
    });
    return book && { id: book.id, assignmentCount: book._count.assignments };
  }

  saveBook(
    book: BookRecord,
    questions: QuestionRecord[],
  ): Promise<{ id: number }> {
    return this.prisma.$transaction(async (tx) => {
      const bookData = {
        ...book,
        content: book.content as unknown as Prisma.InputJsonValue,
      };
      const saved = await tx.book.upsert({
        where: { externalId: book.externalId },
        create: bookData,
        update: bookData,
        select: { id: true },
      });

      // (book_id, question_order)가 UNIQUE라 순서를 바꿔 갱신하면 중간에 충돌합니다. 기존 순서를 음수로 비켜 둡니다.
      await tx.$executeRaw`UPDATE questions SET question_order = -question_order WHERE book_id = ${saved.id}`;

      // 풀이 기록(question_attempts)이 남은 문제는 FK 때문에 지워지지 않아 오류로 끝납니다(--force 재적재 시).
      await tx.question.deleteMany({
        where: {
          bookId: saved.id,
          externalKey: {
            notIn: questions.map((question) => question.externalKey),
          },
        },
      });

      for (const question of questions) {
        const data = {
          questionFormat: question.format,
          stage: question.stage,
          questionOrder: question.order,
          questionText: question.text,
          options: question.options as Prisma.InputJsonValue,
          correctAnswer: question.correctAnswer as Prisma.InputJsonValue,
          hint: question.hint,
          evidence:
            question.evidence == null
              ? Prisma.DbNull
              : (question.evidence as Prisma.InputJsonValue),
        };
        await tx.question.upsert({
          where: {
            bookId_externalKey: {
              bookId: saved.id,
              externalKey: question.externalKey,
            },
          },
          create: {
            bookId: saved.id,
            externalKey: question.externalKey,
            ...data,
          },
          update: data,
        });
      }
      return saved;
    });
  }
}
