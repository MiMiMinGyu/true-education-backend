import { Injectable } from '@nestjs/common';
import { LearningStage } from '../../common/constants/learning.constants';
import { BookContent } from '../../content/interfaces/book-content.interface';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  AssignmentDetail,
  AttemptRecord,
  CompletedAssignment,
  ILearningRepository,
  NewAttempt,
} from '../interfaces/learning-repository.interface';

type Db = PrismaService | Prisma.TransactionClient;

const DAY_MS = 24 * 60 * 60 * 1000;

/** DATE 컬럼 값('YYYY-MM-DD'를 그 날짜 0시 UTC로) */
const toDateColumn = (date: string) => new Date(`${date}T00:00:00.000Z`);
/** Asia/Seoul 기준 그 날짜 0시 */
const kstMidnight = (date: string) => new Date(`${date}T00:00:00+09:00`);

const isUniqueViolation = (error: unknown) =>
  error instanceof Prisma.PrismaClientKnownRequestError &&
  error.code === 'P2002';

/** 쿼리 구현. 트랜잭션 안에서는 트랜잭션 클라이언트로 만든 인스턴스를 씁니다 */
class PrismaLearningStore implements ILearningRepository {
  constructor(protected readonly db: Db) {}

  runInTransaction<T>(
    work: (repo: ILearningRepository) => Promise<T>,
  ): Promise<T> {
    // 이미 트랜잭션 안이면 그대로 이어서 실행합니다.
    return work(this);
  }

  async findInProgressAssignmentId(studentId: number): Promise<number | null> {
    const assignment = await this.db.bookAssignment.findFirst({
      where: { studentId, status: 'IN_PROGRESS' },
      select: { id: true },
    });
    return assignment?.id ?? null;
  }

  async findCompletedAssignmentOn(
    studentId: number,
    date: string,
  ): Promise<CompletedAssignment | null> {
    const start = kstMidnight(date);
    const assignment = await this.db.bookAssignment.findFirst({
      where: {
        studentId,
        status: 'COMPLETED',
        completedAt: { gte: start, lt: new Date(start.getTime() + DAY_MS) },
      },
      orderBy: { completedAt: 'desc' },
      select: {
        id: true,
        studentTitle: true,
        book: { select: { title: true } },
        stamp: { select: { amount: true } },
      },
    });
    return (
      assignment && {
        assignmentId: assignment.id,
        title: assignment.studentTitle ?? assignment.book.title,
        stampsEarned: assignment.stamp?.amount ?? 0,
      }
    );
  }

  async findUnassignedBookIds(studentId: number): Promise<number[]> {
    const books = await this.db.book.findMany({
      where: { assignments: { none: { studentId } } },
      select: { id: true },
      orderBy: { id: 'asc' },
    });
    return books.map((book) => book.id);
  }

  async createAssignment(
    studentId: number,
    bookId: number,
    date: string,
    firstStage: LearningStage,
  ): Promise<number | null> {
    try {
      // 중첩 생성은 하나의 트랜잭션으로 실행됩니다.
      const assignment = await this.db.bookAssignment.create({
        data: {
          studentId,
          bookId,
          startDate: toDateColumn(date),
          progress: { create: { currentStage: firstStage, currentStep: 0 } },
        },
        select: { id: true },
      });
      return assignment.id;
    } catch (error) {
      if (isUniqueViolation(error)) return null;
      throw error;
    }
  }

  async touchSession(assignmentId: number, date: string): Promise<number> {
    // 같은 날 동시 요청에도 행이 하나만 생기도록 INSERT … ON CONFLICT를 씁니다.
    const rows = await this.db.$queryRaw<{ id: number }[]>`
      INSERT INTO learning_sessions (book_assignment_id, session_date)
      VALUES (${assignmentId}, ${date}::date)
      ON CONFLICT (book_assignment_id, session_date) DO UPDATE SET last_active_at = now()
      RETURNING id`;
    return rows[0].id;
  }

  async findAssignmentOwner(assignmentId: number): Promise<number | null> {
    const assignment = await this.db.bookAssignment.findUnique({
      where: { id: assignmentId },
      select: { studentId: true },
    });
    return assignment?.studentId ?? null;
  }

  async getAssignment(assignmentId: number): Promise<AssignmentDetail | null> {
    const assignment = await this.db.bookAssignment.findUnique({
      where: { id: assignmentId },
      select: {
        id: true,
        studentId: true,
        status: true,
        progress: { select: { currentStage: true, currentStep: true } },
        book: {
          select: {
            id: true,
            title: true,
            author: true,
            content: true,
            questions: { orderBy: { questionOrder: 'asc' } },
          },
        },
      },
    });
    if (!assignment) return null;
    const { book } = assignment;
    return {
      id: assignment.id,
      studentId: assignment.studentId,
      stage:
        assignment.status === 'COMPLETED'
          ? 'COMPLETED'
          : (assignment.progress?.currentStage ?? 'READING'),
      step: assignment.progress?.currentStep ?? 0,
      book: {
        id: book.id,
        title: book.title,
        author: book.author,
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
      })),
    };
  }

  async lockProgress(
    assignmentId: number,
  ): Promise<{ stage: LearningStage; step: number } | null> {
    const rows = await this.db.$queryRaw<
      { stage: LearningStage; step: number }[]
    >`
      SELECT current_stage::text AS stage, current_step AS step
      FROM reading_progress WHERE book_assignment_id = ${assignmentId}
      FOR UPDATE`;
    return rows[0] ?? null;
  }

  async updateProgress(
    assignmentId: number,
    stage: LearningStage,
    step: number,
  ): Promise<void> {
    await this.db.readingProgress.update({
      where: { bookAssignmentId: assignmentId },
      data: { currentStage: stage, currentStep: step },
    });
  }

  async addReadingStats(
    sessionId: number,
    syllables: number,
    durationMs: number,
  ): Promise<void> {
    await this.db.learningSession.update({
      where: { id: sessionId },
      data: {
        readSyllableCount: { increment: syllables },
        readingDurationMs: { increment: durationMs },
        lastActiveAt: new Date(),
      },
    });
  }

  async listAttempts(assignmentId: number): Promise<AttemptRecord[]> {
    const attempts = await this.db.questionAttempt.findMany({
      where: { bookAssignmentId: assignmentId },
      orderBy: [{ questionId: 'asc' }, { attemptNumber: 'asc' }],
      select: {
        questionId: true,
        attemptNumber: true,
        studentAnswer: true,
        isCorrect: true,
      },
    });
    return attempts.map((attempt) => ({
      questionId: attempt.questionId,
      attemptNumber: attempt.attemptNumber,
      answer: attempt.studentAnswer,
      isCorrect: attempt.isCorrect,
    }));
  }

  async createAttempt(attempt: NewAttempt): Promise<void> {
    await this.db.questionAttempt.create({
      data: {
        bookAssignmentId: attempt.assignmentId,
        learningSessionId: attempt.sessionId,
        questionId: attempt.questionId,
        attemptNumber: attempt.attemptNumber,
        studentAnswer: attempt.answer as Prisma.InputJsonValue,
        isCorrect: attempt.isCorrect,
        responseTimeMs: attempt.responseTimeMs,
      },
    });
  }

  async saveTitle(assignmentId: number, title: string): Promise<void> {
    await this.db.bookAssignment.update({
      where: { id: assignmentId },
      data: { studentTitle: title },
    });
  }

  async upsertDrawing(assignmentId: number, imageKey: string): Promise<void> {
    await this.db.drawing.upsert({
      where: { bookAssignmentId: assignmentId },
      create: { bookAssignmentId: assignmentId, imageUrl: imageKey },
      update: { imageUrl: imageKey },
    });
  }

  async findDrawingId(assignmentId: number): Promise<number | null> {
    const drawing = await this.db.drawing.findUnique({
      where: { bookAssignmentId: assignmentId },
      select: { id: true },
    });
    return drawing?.id ?? null;
  }

  async createReflection(
    drawingId: number,
    transcript: string,
    durationMs: number,
  ): Promise<void> {
    await this.db.drawingReflection.create({
      data: { drawingId, transcript, durationMs },
    });
  }

  async completeAssignment(assignmentId: number): Promise<void> {
    await this.db.bookAssignment.update({
      where: { id: assignmentId },
      data: {
        status: 'COMPLETED',
        completedAt: new Date(),
        progress: { update: { currentStage: 'COMPLETED', currentStep: 0 } },
      },
    });
  }

  async createStamp(
    studentId: number,
    assignmentId: number,
    amount: number,
  ): Promise<void> {
    await this.db.studentStamp.create({
      data: { studentId, bookAssignmentId: assignmentId, amount },
    });
  }

  async sumStamps(studentId: number): Promise<number> {
    const result = await this.db.studentStamp.aggregate({
      where: { studentId },
      _sum: { amount: true },
    });
    return result._sum.amount ?? 0;
  }
}

@Injectable()
export class PrismaLearningRepository extends PrismaLearningStore {
  constructor(private readonly prisma: PrismaService) {
    super(prisma);
  }

  override runInTransaction<T>(
    work: (repo: ILearningRepository) => Promise<T>,
  ): Promise<T> {
    return this.prisma.$transaction((tx) => work(new PrismaLearningStore(tx)));
  }
}
