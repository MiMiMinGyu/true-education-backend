import { Inject, Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import {
  PIPELINE_SYNC_FIRST_DELAY_MS,
  PIPELINE_SYNC_INTERVAL_MS,
} from '../common/constants/inbox.constants';
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
 * AI 파트 파이프라인에서 검증을 통과한 책 중 DB에 없는 것만 받아 적재합니다(당겨오기).
 * 학습 요청과 분리되어 있어 파이프라인 PC가 꺼져 있어도 학습에는 영향이 없습니다.
 */
@Injectable()
export class PipelineSyncService implements OnModuleDestroy {
  private readonly logger = new Logger('PipelineSync');
  private running: Promise<PipelineSyncResult> | null = null;
  private timers: NodeJS.Timeout[] = [];

  constructor(
    @Inject(AI_PIPELINE_CLIENT) private readonly client: AiPipelineClient,
    private readonly importer: AiStoryImportService,
    @Inject(INBOX_REPOSITORY) private readonly repository: IInboxRepository,
  ) {}

  get enabled(): boolean {
    return this.client.enabled;
  }

  /** 서버(main.ts)에서만 호출. 명령줄 스크립트에서는 주기 실행을 켜지 않습니다. */
  startSchedule(): void {
    if (!this.enabled || this.timers.length > 0) return;
    const tick = () => void this.syncQuietly();
    const first = setTimeout(tick, PIPELINE_SYNC_FIRST_DELAY_MS);
    const every = setInterval(tick, PIPELINE_SYNC_INTERVAL_MS);
    first.unref();
    every.unref();
    this.timers = [first, every];
    this.logger.log(
      `AI 파이프라인 동기화를 ${PIPELINE_SYNC_INTERVAL_MS / 60000}분마다 실행합니다.`,
    );
  }

  onModuleDestroy(): void {
    this.timers.forEach((timer) => clearTimeout(timer));
    this.timers = [];
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

  private async syncQuietly(): Promise<void> {
    try {
      const result = await this.sync();
      if (result.imported.length > 0 || result.failed.length > 0) {
        this.logger.log(describe(result));
      }
    } catch (error) {
      this.logger.warn(`동기화 실패: ${message(error)}`);
    }
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
          await this.importer.importJson(raw, { source: 'API' }),
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
