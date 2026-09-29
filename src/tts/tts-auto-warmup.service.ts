import { Inject, Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import {
  TTS_REPOSITORY,
  type ITtsRepository,
} from './interfaces/tts-repository.interface';
import { TtsService } from './tts.service';
import { typecastConfig } from './typecast.provider';

/** 서버 시작 뒤 첫 점검까지 기다리는 시간(기동 직후 부하 회피) */
export const TTS_SWEEP_FIRST_DELAY_MS = 30 * 1000;
/** 캐시가 빠진 줄을 찾아 채우는 점검 간격(즉시 트리거를 놓친 경우의 안전망) */
export const TTS_SWEEP_INTERVAL_MS = 30 * 60 * 1000;

/**
 * 여울이 음성 자동 미리 만들기.
 * - 즉시: 책이 새로 저장·갱신되면(scheduleBook) 그 책의 캐시 없는 줄만 생성
 * - 안전망: 서버 시작 직후와 30분마다 모든 책을 점검(재시작·일시 장애·명령줄 적재로 놓친 줄)
 * 캐시가 있는 줄은 건너뛰어 과금이 없고, 한 번에 한 권씩(책 안에서는 동시 2건, Typecast 무료 요금제 제한) 처리합니다.
 * 서버(main.ts)에서 activate()한 뒤에만 동작합니다(명령줄 스크립트는 작업 중에 끝나므로 제외).
 */
@Injectable()
export class TtsAutoWarmupService implements OnModuleDestroy {
  private readonly logger = new Logger('TtsAutoWarmup');
  private active = false;
  private readonly queue: string[] = [];
  private draining: Promise<void> | null = null;
  private timers: NodeJS.Timeout[] = [];

  constructor(
    private readonly tts: TtsService,
    @Inject(TTS_REPOSITORY) private readonly repository: ITtsRepository,
  ) {}

  /** Typecast 키·목소리·모델이 모두 있을 때만 */
  get enabled(): boolean {
    const config = typecastConfig();
    return Boolean(config.apiKey && config.voiceId && config.model);
  }

  activate(): void {
    if (!this.enabled || this.active) return;
    this.active = true;
    const first = setTimeout(() => void this.sweep(), TTS_SWEEP_FIRST_DELAY_MS);
    const every = setInterval(() => void this.sweep(), TTS_SWEEP_INTERVAL_MS);
    first.unref();
    every.unref();
    this.timers = [first, every];
    this.logger.log(
      `새 책 저장 시 즉시, 그리고 ${TTS_SWEEP_INTERVAL_MS / 60000}분마다 빠진 음성을 미리 만듭니다.`,
    );
  }

  onModuleDestroy(): void {
    this.timers.forEach((timer) => clearTimeout(timer));
    this.timers = [];
    this.active = false;
  }

  /** 책이 저장·갱신된 직후 호출(기다리지 않음). 같은 책이 대기 중이면 한 번만 처리 */
  scheduleBook(externalId: string): void {
    if (!this.active) return;
    if (!this.queue.includes(externalId)) this.queue.push(externalId);
    this.drain();
  }

  /** 모든 책을 대기열에 넣습니다(캐시 있는 줄은 건너뜀) */
  async sweep(): Promise<void> {
    if (!this.active) return;
    try {
      const books = await this.repository.listBooks();
      books.forEach(({ externalId }) => {
        if (!this.queue.includes(externalId)) this.queue.push(externalId);
      });
      await this.drain();
    } catch (error) {
      this.logger.warn(`음성 점검 실패: ${message(error)}`);
    }
  }

  /** 대기열을 한 권씩 처리합니다. 이미 처리 중이면 같은 작업을 돌려줍니다 */
  drain(): Promise<void> {
    this.draining ??= this.run().finally(() => {
      this.draining = null;
    });
    return this.draining;
  }

  private async run(): Promise<void> {
    for (let id = this.queue.shift(); id; id = this.queue.shift()) {
      try {
        const [book] = await this.repository.listBooks(id);
        if (!book) continue;
        const result = await this.tts.warmup(book.id);
        if (result.created > 0 || result.failed.length > 0) {
          this.logger.log(
            `[${id}] 음성 생성 ${result.created} · 이미 있음 ${result.cached} · 실패 ${result.failed.length}` +
              (result.failed.length
                ? ` (${result.failed[0].lineId}: ${result.failed[0].reason})`
                : ''),
          );
        }
      } catch (error) {
        this.logger.warn(`[${id}] 음성 미리 만들기 실패: ${message(error)}`);
      }
    }
  }
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
