import { Injectable } from '@nestjs/common';
import { todayKst } from '../../common/utils/kst-date.util';
import { PrismaService } from '../../prisma/prisma.service';
import {
  DashboardPeriod,
  DashboardSource,
  IParentRepository,
  LinkedStudent,
  StudentOverview,
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

  async getOverview(
    studentId: number,
    readingDays: number,
    reflectionLimit: number,
  ): Promise<StudentOverview> {
    const [completedBooks, stamps, inProgress, reflections, daily] =
      await Promise.all([
        this.prisma.bookAssignment.count({
          where: { studentId, status: 'COMPLETED' },
        }),
        this.prisma.studentStamp.aggregate({
          where: { studentId },
          _sum: { amount: true },
        }),
        this.prisma.bookAssignment.findFirst({
          where: { studentId, status: 'IN_PROGRESS' },
          select: {
            id: true,
            book: { select: { title: true } },
            progress: { select: { currentStage: true } },
          },
        }),
        this.prisma.bookAssignment.findMany({
          where: {
            studentId,
            status: 'COMPLETED',
            drawing: { reflection: { isNot: null } },
          },
          orderBy: { completedAt: 'desc' },
          take: reflectionLimit,
          select: {
            id: true,
            studentTitle: true,
            completedAt: true,
            book: { select: { title: true } },
            drawing: {
              select: {
                imageUrl: true,
                reflection: { select: { transcript: true, durationMs: true } },
              },
            },
          },
        }),
        // 합계는 bigint라 int로 바꿉니다(학생 1명의 하루 합계라 범위 안).
        this.prisma.$queryRaw<
          { date: string; syllables: number; durationMs: number }[]
        >`
          SELECT to_char(ls.session_date, 'YYYY-MM-DD') AS date,
                 SUM(ls.read_syllable_count)::int AS syllables,
                 SUM(ls.reading_duration_ms)::int AS "durationMs"
          FROM learning_sessions ls
          JOIN book_assignments ba ON ba.id = ls.book_assignment_id
          WHERE ba.student_id = ${studentId}
          GROUP BY ls.session_date
          ORDER BY ls.session_date DESC
          LIMIT ${readingDays}`,
      ]);

    return {
      completedBooks,
      stampTotal: stamps._sum.amount ?? 0,
      inProgress: inProgress && {
        assignmentId: inProgress.id,
        title: inProgress.book.title,
        stage: inProgress.progress?.currentStage ?? 'READING',
      },
      dailyReading: daily,
      reflections: reflections.map((assignment) => ({
        assignmentId: assignment.id,
        title: assignment.studentTitle ?? assignment.book.title,
        transcript: assignment.drawing!.reflection!.transcript,
        durationMs: assignment.drawing!.reflection!.durationMs,
        completedAt: assignment.completedAt!,
        drawingKey: assignment.drawing!.imageUrl,
      })),
    };
  }
}
