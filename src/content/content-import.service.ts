import { Inject, Injectable } from '@nestjs/common';
import {
  DEFAULT_ORDERING_TEXT,
  ORDERING_EXTERNAL_KEY,
} from '../common/constants/content.constants';
import {
  CONTENT_REPOSITORY,
  type BookRecord,
  type IContentRepository,
  type QuestionRecord,
} from './interfaces/content-repository.interface';
import { ImportBook } from './interfaces/import-book.interface';
import { buildBookContent } from './utils/book-content.util';
import { validateImportBook } from './utils/import-book.validator';

export type ImportStatus =
  'CREATED' | 'UPDATED' | 'SKIPPED_ASSIGNED' | 'INVALID';

export interface ImportResult {
  externalId: string;
  status: ImportStatus;
  errors: string[];
  warnings: string[];
}

export interface ImportOptions {
  /** 이미 학생에게 배정된 책도 덮어씁니다 */
  force?: boolean;
}

@Injectable()
export class ContentImportService {
  constructor(
    @Inject(CONTENT_REPOSITORY) private readonly repository: IContentRepository,
  ) {}

  async importBook(
    book: ImportBook,
    options: ImportOptions = {},
  ): Promise<ImportResult> {
    const externalId =
      typeof book?.externalId === 'string'
        ? book.externalId
        : '(externalId 없음)';
    const { errors, warnings } = validateImportBook(book);
    if (errors.length > 0) {
      return { externalId, status: 'INVALID', errors, warnings };
    }

    const existing = await this.repository.findBook(book.externalId);
    // 배정된 책의 줄 id·문제가 바뀌면 진행 중인 학습과 서재 기록이 어긋나므로 기본은 건너뜁니다.
    if (existing && existing.assignmentCount > 0 && !options.force) {
      return {
        externalId,
        status: 'SKIPPED_ASSIGNED',
        errors,
        warnings: [
          ...warnings,
          `학생 ${existing.assignmentCount}명에게 배정된 책이라 바꾸지 않았습니다(덮어쓰려면 --force).`,
        ],
      };
    }

    await this.repository.saveBook(toBookRecord(book), toQuestionRecords(book));
    return {
      externalId,
      status: existing ? 'UPDATED' : 'CREATED',
      errors,
      warnings,
    };
  }
}

function toBookRecord(book: ImportBook): BookRecord {
  return {
    externalId: book.externalId,
    title: book.title.trim(),
    author: book.author ?? null,
    sourceUrl: book.sourceUrl ?? null,
    license: book.license ?? null,
    bibliography: book.bibliography ?? null,
    content: buildBookContent(book),
    titleHints: book.titleHints?.length
      ? book.titleHints.map((hint) => hint.trim())
      : null,
    sourceMeta: book.sourceMeta ?? null,
  };
}

function toQuestionRecords(book: ImportBook): QuestionRecord[] {
  const choices: QuestionRecord[] = book.questions.map((question, index) => ({
    externalKey: question.externalKey,
    format: 'CHOICE',
    stage: question.stage,
    order: index + 1,
    text: question.text.trim(),
    options: question.options.map((option) => option.trim()),
    correctAnswer: question.correct,
    hint: question.hint?.trim() || null,
    evidence: question.evidence?.length ? question.evidence : null,
    explanation: question.explanation?.trim() || null,
  }));

  if (!book.ordering) return choices;

  const cards = book.ordering.cards.map((card) => ({
    id: card.id,
    text: card.text.trim(),
  }));
  return [
    ...choices,
    {
      externalKey: ORDERING_EXTERNAL_KEY,
      format: 'ORDERING',
      stage: 'ORDER',
      order: choices.length + 1,
      text: book.ordering.text?.trim() || DEFAULT_ORDERING_TEXT,
      // 카드는 정답 순서로 저장하고, 화면에 보낼 때 섞습니다.
      options: cards,
      correctAnswer: cards.map((card) => card.id),
      hint: null,
      evidence: null,
      explanation: null,
    },
  ];
}
