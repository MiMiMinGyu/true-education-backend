import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  CHOICE_MAX_ATTEMPTS,
  ORDERING_MAX_ATTEMPTS,
} from '../common/constants/learning.constants';
import { todayKst } from '../common/utils/kst-date.util';
import {
  ChoiceAttemptResponseDto,
  OrderingAttemptResponseDto,
  OrderingResponseDto,
  QuestionDto,
  QuestionStateDto,
} from './dto/responses/learning-responses.dto';
import {
  LEARNING_REPOSITORY,
  type AttemptRecord,
  type ILearningRepository,
  type QuestionData,
} from './interfaces/learning-repository.interface';
import {
  choiceQuestions,
  featuresOf,
  loadAssignment,
  orderingQuestion,
} from './utils/assignment.util';
import {
  resolveHint,
  sameOrder,
  sameSet,
  shuffleUntilDifferent,
} from './utils/quiz.util';
import { hasReached, nextStage } from './utils/stage-flow.util';

interface Card {
  id: string;
  text: string;
}

/** 문제별 풀이 상태(기록에서 계산) */
function progressOf(attempts: AttemptRecord[], maxAttempts: number) {
  const solved = attempts.some((attempt) => attempt.isCorrect);
  return {
    attempts: attempts.length,
    solved,
    finished: solved || attempts.length >= maxAttempts,
  };
}

function attemptsFor(
  all: AttemptRecord[],
  questionId: number,
): AttemptRecord[] {
  return all.filter((attempt) => attempt.questionId === questionId);
}

@Injectable()
export class QuizService {
  constructor(
    @Inject(LEARNING_REPOSITORY)
    private readonly repository: ILearningRepository,
  ) {}

  // ---------- 이해 질문 ----------

  async getQuestions(assignmentId: number): Promise<QuestionDto[]> {
    const assignment = await loadAssignment(this.repository, assignmentId);
    if (!hasReached(assignment.stage, 'QUESTION')) {
      throw new ConflictException('아직 이해 질문 단계가 아닙니다.');
    }
    const attempts = await this.repository.listAttempts(assignmentId);

    return choiceQuestions(assignment).map((question) => {
      const progress = progressOf(
        attemptsFor(attempts, question.id),
        CHOICE_MAX_ATTEMPTS,
      );
      const state: QuestionStateDto = {
        attempts: progress.attempts,
        finished: progress.finished,
      };
      if (progress.finished) {
        state.correct = progress.solved;
        state.answer = question.correctAnswer as number;
      } else if (progress.attempts > 0) {
        // 1차 오답 뒤 재접속한 경우 이미 받은 힌트를 다시 보여 줍니다(오답 전에는 절대 내려가지 않음).
        state.hint =
          resolveHint(question, assignment.book.content) ?? undefined;
      }
      return {
        questionId: question.id,
        order: question.order,
        stage: question.stage,
        text: question.text,
        options: question.options as string[],
        state,
      };
    });
  }

  submitChoice(
    assignmentId: number,
    questionId: number,
    answer: number,
    responseTimeMs?: number,
  ): Promise<ChoiceAttemptResponseDto> {
    return this.repository.runInTransaction(async (repo) => {
      await repo.lockProgress(assignmentId);
      const assignment = await loadAssignment(repo, assignmentId);
      const choices = choiceQuestions(assignment);
      const question = choices.find((item) => item.id === questionId);
      if (!question)
        throw new NotFoundException('이 책의 이해 질문이 아닙니다.');
      if (assignment.stage !== 'QUESTION') {
        throw new ConflictException('이해 질문 단계가 아닙니다.');
      }
      const options = question.options as string[];
      if (answer >= options.length) {
        throw new BadRequestException(
          `보기 번호는 0~${options.length - 1} 사이여야 합니다.`,
        );
      }

      const allAttempts = await repo.listAttempts(assignmentId);
      const before = progressOf(
        attemptsFor(allAttempts, question.id),
        CHOICE_MAX_ATTEMPTS,
      );
      if (before.finished) throw new ConflictException('이미 끝난 문제입니다.');

      const attemptNumber = before.attempts + 1;
      const correct = answer === question.correctAnswer;
      await repo.createAttempt({
        assignmentId,
        sessionId: await repo.touchSession(assignmentId, todayKst()),
        questionId,
        attemptNumber,
        answer,
        isCorrect: correct,
        responseTimeMs: responseTimeMs ?? null,
      });
      const finished = correct || attemptNumber >= CHOICE_MAX_ATTEMPTS;

      const finishedCount = choices.filter((item) =>
        item.id === questionId
          ? finished
          : progressOf(attemptsFor(allAttempts, item.id), CHOICE_MAX_ATTEMPTS)
              .finished,
      ).length;
      const allDone = finishedCount === choices.length;
      const stage = allDone
        ? nextStage('QUESTION', featuresOf(assignment))
        : 'QUESTION';
      await repo.updateProgress(
        assignmentId,
        stage,
        allDone ? 0 : finishedCount,
      );

      const response: ChoiceAttemptResponseDto = { correct, finished, stage };
      if (!correct && !finished) {
        response.hint =
          resolveHint(question, assignment.book.content) ?? undefined;
      }
      if (!correct && finished)
        response.answer = question.correctAnswer as number;
      return response;
    });
  }

  // ---------- 순서 맞추기 ----------

  async getOrdering(assignmentId: number): Promise<OrderingResponseDto> {
    const assignment = await loadAssignment(this.repository, assignmentId);
    const question = this.requireOrdering(orderingQuestion(assignment));
    if (!hasReached(assignment.stage, 'ORDERING')) {
      throw new ConflictException('아직 순서 맞추기 단계가 아닙니다.');
    }
    const attempts = attemptsFor(
      await this.repository.listAttempts(assignmentId),
      question.id,
    );
    const progress = progressOf(attempts, ORDERING_MAX_ATTEMPTS);

    return {
      questionId: question.id,
      text: question.text,
      cards: shuffleUntilDifferent(question.options as Card[]),
      state: {
        attempts: progress.attempts,
        remaining: progress.finished
          ? 0
          : ORDERING_MAX_ATTEMPTS - progress.attempts,
        finished: progress.finished,
        ...(progress.finished && {
          correct: progress.solved,
          answer: question.correctAnswer as string[],
        }),
      },
    };
  }

  submitOrdering(
    assignmentId: number,
    order: string[],
    responseTimeMs?: number,
  ): Promise<OrderingAttemptResponseDto> {
    return this.repository.runInTransaction(async (repo) => {
      await repo.lockProgress(assignmentId);
      const assignment = await loadAssignment(repo, assignmentId);
      const question = this.requireOrdering(orderingQuestion(assignment));
      if (assignment.stage !== 'ORDERING') {
        throw new ConflictException('순서 맞추기 단계가 아닙니다.');
      }
      const correctOrder = question.correctAnswer as string[];
      if (!sameSet(order, correctOrder)) {
        throw new BadRequestException('카드를 빠짐없이 한 번씩 놓아야 합니다.');
      }

      const attempts = attemptsFor(
        await repo.listAttempts(assignmentId),
        question.id,
      );
      const before = progressOf(attempts, ORDERING_MAX_ATTEMPTS);
      if (before.finished) throw new ConflictException('이미 끝난 문제입니다.');

      const attemptNumber = before.attempts + 1;
      const correct = sameOrder(order, correctOrder);
      await repo.createAttempt({
        assignmentId,
        sessionId: await repo.touchSession(assignmentId, todayKst()),
        questionId: question.id,
        attemptNumber,
        answer: order,
        isCorrect: correct,
        responseTimeMs: responseTimeMs ?? null,
      });
      const finished = correct || attemptNumber >= ORDERING_MAX_ATTEMPTS;
      const stage = finished
        ? nextStage('ORDERING', featuresOf(assignment))
        : 'ORDERING';
      if (finished) await repo.updateProgress(assignmentId, stage, 0);

      if (correct) return { correct, finished, stage };
      return finished
        ? { correct, finished, answer: correctOrder, stage }
        : {
            correct,
            finished,
            remaining: ORDERING_MAX_ATTEMPTS - attemptNumber,
            stage,
          };
    });
  }

  private requireOrdering(question: QuestionData | undefined): QuestionData {
    if (!question)
      throw new NotFoundException('이 책에는 순서 맞추기 문제가 없습니다.');
    return question;
  }
}
