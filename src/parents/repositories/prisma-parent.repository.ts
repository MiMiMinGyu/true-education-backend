import { Injectable } from '@nestjs/common';
import { todayKst } from '../../common/utils/kst-date.util';
import { PrismaService } from '../../prisma/prisma.service';
import {
  DashboardPeriod,
  DashboardSource,
  IParentRepository,
  LinkedStudent,
} from '../interfaces/parent-repository.interface';

const DAY_MS = 24 * 60 * 60 * 1000;
/** Asia/Seoul 기준 그 날짜 0시 */
const kstMidnight = (date: string) => new Date(`${date}T00:00:00+09:00`);

@Injectable()
export class PrismaParentRepository implements IParentRepository {
  constructor(private readonly prisma: PrismaService) {}

  async listStudents(parentId: number): Promise<LinkedStudent[]> {
    const links = await this.prisma.parentStudent.findMany({
      where: { parentId },
      orderBy: { createdAt: 'asc' },
      select: { student: { select: { id: true, name: true } } },
    });
    return links.map(({ student }) => ({
      studentId: student.id,
      name: student.name,
    }));
  }

  async isLinked(parentId: number, studentId: number): Promise<boolean> {
    const link = await this.prisma.parentStudent.findUnique({
      where: { parentId_studentId: { parentId, studentId } },
      select: { parentId: true },
    });
    return link !== null;
  }

  async getDashboardSource(
    studentId: number,
    period: DashboardPeriod,
  ): Promise<DashboardSource | null> {
    const student = await this.prisma.student.findUnique({
      where: { id: studentId },
      select: { id: true, name: true },
    });
    if (!student) return null;

    const completed = await this.prisma.bookAssignment.findMany({
      where: {
        studentId,
        status: 'COMPLETED',
        completedAt: {
          gte: kstMidnight(period.startDate),
          lt: new Date(kstMidnight(period.endDate).getTime() + DAY_MS),
        },
      },
      orderBy: { completedAt: 'desc' },
      select: {
        id: true,
        bookId: true,
        studentTitle: true,
        completedAt: true,
        book: {
          select: {
            title: true,
            questions: {
              select: { id: true, stage: true, questionFormat: true },
            },
          },
        },
        attempts: {
          orderBy: { attemptNumber: 'asc' },
          select: {
            id: true,
            questionId: true,
            isCorrect: true,
            answeredAt: true,
          },
        },
        drawing: {
          select: {
            reflection: { select: { transcript: true, durationMs: true } },
          },
        },
      },
    });

    return {
      student,
      books: completed.map((assignment) => ({
        assignmentId: assignment.id,
        bookId: assignment.bookId,
        hasTitle: assignment.studentTitle !== null,
        title: assignment.studentTitle ?? assignment.book.title,
        completedAt: assignment.completedAt!,
        questions: assignment.book.questions.map((question) => ({
          stage: question.stage,
          format: question.questionFormat,
          attempts: assignment.attempts
            .filter((attempt) => attempt.questionId === question.id)
            .map((attempt) => ({
              id: attempt.id,
              isCorrect: attempt.isCorrect,
              answeredDate: todayKst(attempt.answeredAt),
            })),
        })),
        reflection: assignment.drawing?.reflection ?? null,
      })),
    };
  }
}
