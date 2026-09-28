import { Inject, Injectable } from '@nestjs/common';
import {
  ContentImportService,
  type ImportStatus,
} from '../content/content-import.service';
import { convertAiStory } from '../content/utils/ai-story.converter';
import { validateImportBook } from '../content/utils/import-book.validator';
import {
  INBOX_REPOSITORY,
  type IInboxRepository,
  type ImportLogSource,
} from './interfaces/inbox-repository.interface';

/** SKIPPED = 규칙 검사 미통과(meta.rule_check.passed === false), DRY_RUN = 저장하지 않고 검사만 */
export type StoryImportStatus = ImportStatus | 'SKIPPED' | 'DRY_RUN';

export interface StoryImportResult {
  externalId: string;
  status: StoryImportStatus;
  /** 변환에 성공했을 때 요약(제목·쪽·문제 수) */
  summary: string | null;
  errors: string[];
  warnings: string[];
}

export interface StoryImportOptions {
  source: ImportLogSource;
  /** 이미 학생에게 배정된 책도 덮어씁니다(명령줄에서만 허용) */
  force?: boolean;
  /** 저장·기록 없이 변환·검증 결과만 */
  dryRun?: boolean;
}

/**
 * AI 파트 동화 JSON 1개를 변환 → 검증 → 저장하고, 받은 원본과 결과를 content_import_logs에 남깁니다.
 * 서버 API(POST /admin/books)와 명령줄(content:import)이 같은 경로를 씁니다.
 */
@Injectable()
export class AiStoryImportService {
  constructor(
    private readonly importer: ContentImportService,
    @Inject(INBOX_REPOSITORY) private readonly repository: IInboxRepository,
  ) {}

  async importJson(
    raw: unknown,
    options: StoryImportOptions,
  ): Promise<StoryImportResult> {
    const result = await this.run(raw, options);
    if (!options.dryRun) {
      await this.repository.saveLog({
        source: options.source,
        externalId: result.externalId === '-' ? null : result.externalId,
        status: result.status,
        errors: result.errors,
        warnings: result.warnings,
        payload: raw,
      });
    }
    return result;
  }

  private async run(
    raw: unknown,
    { force, dryRun }: StoryImportOptions,
  ): Promise<StoryImportResult> {
    const converted = convertAiStory(raw);
    if (converted.status === 'SKIPPED') {
      return {
        externalId: converted.externalId,
        status: 'SKIPPED',
        summary: null,
        errors: [],
        warnings: [converted.reason],
      };
    }
    if (converted.status === 'INVALID') {
      return {
        externalId: converted.externalId,
        status: 'INVALID',
        summary: null,
        errors: converted.errors,
        warnings: [],
      };
    }

    const { book } = converted;
    const lines = book.paragraphs.reduce((n, p) => n + p.sentences.length, 0);
    const summary = `${book.title} · ${book.paragraphs.length}쪽 ${lines}줄 · 이해 질문 ${book.questions.length}개 · 순서 맞추기 ${book.ordering ? '있음' : '없음'}`;

    if (dryRun) {
      const { errors, warnings } = validateImportBook(book);
      return {
        externalId: book.externalId,
        status: errors.length > 0 ? 'INVALID' : 'DRY_RUN',
        summary,
        errors,
        warnings: [...converted.warnings, ...warnings],
      };
    }
    const outcome = await this.importer.importBook(book, { force });
    return {
      externalId: book.externalId,
      status: outcome.status,
      summary,
      errors: outcome.errors,
      warnings: [...converted.warnings, ...outcome.warnings],
    };
  }
}
