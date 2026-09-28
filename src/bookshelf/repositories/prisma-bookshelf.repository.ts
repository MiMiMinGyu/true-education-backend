import { Injectable } from '@nestjs/common';
import { BookContent } from '../../content/interfaces/book-content.interface';
import { PrismaService } from '../../prisma/prisma.service';
import {
  IBookshelfRepository,
  ShelfBook,
  ShelfItem,
} from '../interfaces/bookshelf-repository.interface';

const shelfItemSelect = {
  id: true,
  studentTitle: true,
  completedAt: true,
  book: { select: { title: true, coverImageUrl: true } },
  drawing: { select: { imageUrl: true } },
} as const;

@Injectable()
export class PrismaBookshelfRepository implements IBookshelfRepository {
  constructor(private readonly prisma: PrismaService) {}

  async listCompleted(studentId: number): Promise<ShelfItem[]> {
    const assignments = await this.prisma.bookAssignment.findMany({
      where: { studentId, status: 'COMPLETED' },
      orderBy: { completedAt: 'desc' },
      select: shelfItemSelect,
    });
    return assignments.map(toShelfItem);
  }

  async findCompleted(assignmentId: number): Promise<ShelfBook | null> {
    const assignment = await this.prisma.bookAssignment.findFirst({
      where: { id: assignmentId, status: 'COMPLETED' },
      select: {
        ...shelfItemSelect,
        studentId: true,
        book: {
          select: {
            title: true,
            coverImageUrl: true,
            author: true,
            sourceUrl: true,
            license: true,
            bibliography: true,
            content: true,
            questions: { orderBy: { questionOrder: 'asc' } },
          },
        },
        drawing: {
          select: {
            imageUrl: true,
            reflection: { select: { transcript: true, durationMs: true } },
          },
        },
        attempts: {
          orderBy: [{ questionId: 'asc' }, { attemptNumber: 'asc' }],
          select: {
            questionId: true,
            attemptNumber: true,
            studentAnswer: true,
            isCorrect: true,
          },
        },
      },
    });
    if (!assignment) return null;
    const { book } = assignment;
    return {
      ...toShelfItem(assignment),
      studentId: assignment.studentId,
      book: {
        author: book.author,
        sourceUrl: book.sourceUrl,
        license: book.license,
        bibliography: book.bibliography,
        content: book.content as unknown as BookContent,
      },
      questions: book.questions.map((question) => ({
        id: question.id,
        format: question.questionFormat,
        stage: question.stage,
        order: question.questionOrder,
        text: question.questionText,
        options: question.options,
        correctAnswer: question.correctAnswer,
        hint: question.hint,
        evidence: question.evidence,
        explanation: question.explanation,
      })),
      attempts: assignment.attempts.map((attempt) => ({
        questionId: attempt.questionId,
        attemptNumber: attempt.attemptNumber,
        answer: attempt.studentAnswer,
        isCorrect: attempt.isCorrect,
      })),
      reflection: assignment.drawing?.reflection ?? null,
    };
  }
}

function toShelfItem(assignment: {
  id: number;
  studentTitle: string | null;
  completedAt: Date | null;
  book: { title: string; coverImageUrl: string | null };
  drawing: { imageUrl: string } | null;
}): ShelfItem {
  return {
    assignmentId: assignment.id,
    studentTitle: assignment.studentTitle,
    originalTitle: assignment.book.title,
    drawingKey: assignment.drawing?.imageUrl ?? null,
    bookCoverUrl: assignment.book.coverImageUrl,
    // status = COMPLETED면 completed_at이 있음(CHECK chk_assignment_completed)
    completedAt: assignment.completedAt!,
  };
}
