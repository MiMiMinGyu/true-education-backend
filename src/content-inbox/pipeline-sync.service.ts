import { Inject, Injectable } from '@nestjs/common';
import {
  AI_PIPELINE_CLIENT,
  type AiPipelineClient,
} from './ai-pipeline.client';
import {
  AiStoryImportService,
  type StoryImportResult,
} from './ai-story-import.service';
import {
  INBOX_REPOSITORY,
  type IInboxRepository,
} from './interfaces/inbox-repository.interface';

export interface PipelineSyncResult {
  /** 파이프라인에 있는 검증된 책 수 */
  listed: number;
  /** 이미 DB에 있어 건너뛴 책 수 */
  existing: number;
  /** 새로 받아 적재를 시도한 책 */
  imported: StoryImportResult[];
  /** 받는 중 실패(네트워크 등) */
  failed: { id: string; error: string }[];
}

/**
 * 수동 복구용 동기화: AI 파트 파이프라인에서 검증을 통과한 책 중 DB에 없는 것만 받아 적재합니다(당겨오기).
 * 정상 흐름은 완성 즉시 콜백(POST /internal/ai/books)이라 주기 실행하지 않고 `pipeline sync` 명령으로만 씁니다.
 */
@Injectable()
export class PipelineSyncService {
  private running: Promise<PipelineSyncResult> | null = null;

  constructor(
    @Inject(AI_PIPELINE_CLIENT) private readonly client: AiPipelineClient,
    private readonly importer: AiStoryImportService,
    @Inject(INBOX_REPOSITORY) private readonly repository: IInboxRepository,
  ) {}

  get enabled(): boolean {
    return this.client.enabled;
  }

  /** 동시에 여러 번 불려도 한 번만 실행하고 같은 결과를 돌려줍니다. */
  sync(): Promise<PipelineSyncResult> {
    if (!this.enabled) {
      return Promise.reject(
        new Error('AI_PIPELINE_URL·AI_PIPELINE_TOKEN이 설정되지 않았습니다.'),
      );
    }
    this.running ??= this.run().finally(() => {
      this.running = null;
    });
    return this.running;
  }

  private async run(): Promise<PipelineSyncResult> {
    const books = await this.client.listBooks();
    const ids = [...new Set(books.map((book) => book.id))];
    const existing = new Set(await this.repository.existingExternalIds(ids));
    const result: PipelineSyncResult = {
      listed: ids.length,
      existing: existing.size,
      imported: [],
      failed: [],
    };
    for (const id of ids.filter((id) => !existing.has(id))) {
      try {
        const raw = await this.client.getBook(id);
        result.imported.push(
          await this.importer.importJson(raw, { source: 'PIPELINE' }),
        );
      } catch (error) {
        result.failed.push({ id, error: message(error) });
      }
    }
    return result;
  }
}

export function describe(result: PipelineSyncResult): string {
  const lines = [
    `파이프라인 책 ${result.listed}권 · 이미 있음 ${result.existing} · 새로 받음 ${result.imported.length} · 실패 ${result.failed.length}`,
    ...result.imported.map(
      (r) =>
        `  [${r.status}] ${r.externalId}${r.summary ? ` · ${r.summary}` : ''}${r.errors.length ? ` · 오류: ${r.errors.join(' / ')}` : ''}`,
    ),
    ...result.failed.map((f) => `  [FAILED] ${f.id} · ${f.error}`),
  ];
  return lines.join('\n');
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
