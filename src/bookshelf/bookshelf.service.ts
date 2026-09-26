import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { OrderingCardDto } from '../learning/dto/responses/learning-responses.dto';
import { toPages } from '../learning/utils/reading.util';
import {
  STORAGE_SERVICE,
  type StorageService,
} from '../storage/storage.interface';
import {
  ShelfAttemptDto,
  ShelfBookDto,
  ShelfItemDto,
} from './dto/bookshelf-responses.dto';
import {
  BOOKSHELF_REPOSITORY,
  type IBookshelfRepository,
  type ShelfAttempt,
  type ShelfItem,
} from './interfaces/bookshelf-repository.interface';

/** 서재: 완료한 책만 보여 주는 열람 전용 화면. 새로 풀거나 기록을 바꾸지 않습니다 */
@Injectable()
export class BookshelfService {
  constructor(
    @Inject(BOOKSHELF_REPOSITORY)
    private readonly repository: IBookshelfRepository,
    @Inject(STORAGE_SERVICE) private readonly storage: StorageService,
  ) {}

  async list(studentId: number): Promise<ShelfItemDto[]> {
    const items = await this.repository.listCompleted(studentId);
    return items.map((item) => this.toItem(item));
  }

  /** 소유권은 AssignmentOwnerGuard가 확인합니다. 아직 완료하지 않은 책은 서재에 없으므로 404 */
  async detail(assignmentId: number): Promise<ShelfBookDto> {
    const shelf = await this.repository.findCompleted(assignmentId);
    if (!shelf) throw new NotFoundException('서재에 없는 책입니다.');

    const attemptsOf = (questionId: number): ShelfAttemptDto[] =>
      shelf.attempts
        .filter((attempt) => attempt.questionId === questionId)
        .map(toAttempt);
    const ordering = shelf.questions.find((q) => q.format === 'ORDERING');

    return {
      ...this.toItem(shelf),
      source: {
        author: shelf.book.author,
        sourceUrl: shelf.book.sourceUrl,
        license: shelf.book.license,
        bibliography: shelf.book.bibliography,
      },
      pages: toPages(shelf.book.content).map((page) => ({
        page: page.page,
        lines: page.lines.map(({ id, text, speaker }) => ({
          id,
          text,
          speaker,
        })),
      })),
      glossary: shelf.book.content.glossary ?? {},
      questions: shelf.questions
        .filter((question) => question.format === 'CHOICE')
        .map((question) => ({
          questionId: question.id,
          order: question.order,
          stage: question.stage,
          text: question.text,
          options: question.options as string[],
          answer: question.correctAnswer as number,
          attempts: attemptsOf(question.id),
        })),
      ordering: ordering
        ? {
            questionId: ordering.id,
            text: ordering.text,
            cards: ordering.options as OrderingCardDto[],
            attempts: attemptsOf(ordering.id),
          }
        : null,
      reflection: shelf.reflection,
    };
  }

  private toItem(item: ShelfItem): ShelfItemDto {
    return {
      assignmentId: item.assignmentId,
      title: item.studentTitle ?? item.originalTitle,
      originalTitle: item.originalTitle,
      coverImageUrl: item.drawingKey
        ? this.storage.urlFor(item.drawingKey)
        : item.bookCoverUrl,
      completedAt: item.completedAt,
    };
  }
}

function toAttempt(attempt: ShelfAttempt): ShelfAttemptDto {
  return {
    attemptNumber: attempt.attemptNumber,
    answer: attempt.answer as number | string[],
    correct: attempt.isCorrect,
  };
}
