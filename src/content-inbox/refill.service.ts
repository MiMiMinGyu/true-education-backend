import { Inject, Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import {
  LOW_STOCK_THRESHOLD,
  REFILL_MAX_BODY_BYTES,
  REFILL_NO_SOURCE_COOLDOWN_MS,
  REFILL_POLL_INTERVAL_MS,
  REFILL_POLL_MAX_BACKOFF_MS,
  REFILL_RETRY_COOLDOWN_MS,
} from '../common/constants/inbox.constants';
import {
  AI_PIPELINE_CLIENT,
  type AiPipelineClient,
  type RandomJobRequest,
} from './ai-pipeline.client';
import { ALERT_NOTIFIER, type AlertNotifier } from './alert-notifier';
import {
  INBOX_REPOSITORY,
  type IInboxRepository,
} from './interfaces/inbox-repository.interface';
import {
  PIPELINE_REPOSITORY,
  type IPipelineRepository,
  type RefillRecord,
} from './interfaces/pipeline-repository.interface';

/** AI 작업 id 규칙(AI 파트 명세): 보충 요청 id의 UTF-8 SHA-256 앞 32자(소문자 hex) */
export const jobIdFor = (refillId: string) =>
  createHash('sha256').update(refillId, 'utf8').digest('hex').slice(0, 32);

export type RefillRequestOutcome =
  | { status: 'DISABLED' | 'ACTIVE_EXISTS' | 'COOLDOWN' | 'TOO_LARGE' }
  | { status: 'REQUESTED'; refill: RefillRecord };

/** 생성 종료 상태 */
const JOB_FAILED = new Set(['rejected', 'error']);
/** 담당자 확인이 필요한 전달 상태(자동으로 풀리지 않음) */
const DELIVERY_STUCK = new Set(['failed', 'waiting_configuration']);

/**
 * 동화 재고 보충(AI 파트 파이프라인 random 모드).
 * 요청 → (AI가 원천 선택·생성·검수) → 완성본은 콜백(POST /internal/ai/books)으로 즉시 받음.
 * 이 서비스는 요청 생성과 실패 감지(상태 확인)를 맡고, 학습 요청과 분리되어 AI PC가 꺼져 있어도 학습은 계속됩니다.
 */
@Injectable()
export class RefillService implements OnModuleDestroy {
  private readonly logger = new Logger('Refill');
  private timer: NodeJS.Timeout | null = null;
  private polling = false;
  private backoffUntil = 0;
  private failures = 0;
  /** 같은 막힘 상태 알림을 반복하지 않도록(메모리, 서버 1대 전제) */
  private notifiedStuck = new Set<string>();

  constructor(
    @Inject(AI_PIPELINE_CLIENT) private readonly client: AiPipelineClient,
    @Inject(PIPELINE_REPOSITORY)
    private readonly repository: IPipelineRepository,
    @Inject(ALERT_NOTIFIER) private readonly notifier: AlertNotifier,
    @Inject(INBOX_REPOSITORY) private readonly inbox: IInboxRepository,
  ) {}

  get enabled(): boolean {
    return this.client.enabled;
  }

  /** 서버(main.ts)에서만 호출. 진행 중인 보충 작업의 상태를 주기적으로 확인합니다. */
  startPolling(): void {
    if (!this.enabled || this.timer) return;
    this.timer = setInterval(
      () => void this.pollQuietly(),
      REFILL_POLL_INTERVAL_MS,
    );
    this.timer.unref();
    this.logger.log(
      `AI 보충 작업 상태를 ${REFILL_POLL_INTERVAL_MS / 1000}초마다 확인합니다.`,
    );
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /** 재고가 기준 이하일 때 호출. 기다리지 않고 실행합니다(실패는 로그만). */
  requestInBackground(reason: string): void {
    this.requestIfNeeded({ reason }).catch((error: unknown) =>
      this.logger.warn(`보충 요청 실패: ${message(error)}`),
    );
  }

  /**
   * 진행 중인 보충이 없고 실패 대기 시간이 지났으면 새 작품 1편을 요청합니다.
   * force(수동 명령)는 실패 대기 시간만 무시하고, 진행 중 1개 제한은 그대로 지킵니다.
   */
  async requestIfNeeded(
    options: { reason: string; force?: boolean },
    now = Date.now(),
  ): Promise<RefillRequestOutcome> {
    if (!this.enabled) return { status: 'DISABLED' };
    if (await this.repository.activeRefill()) {
      return { status: 'ACTIVE_EXISTS' };
    }
    if (!options.force && (await this.inCooldown(now))) {
      return { status: 'COOLDOWN' };
    }

    const owned = await this.repository.ownedBooks();
    const body: RandomJobRequest = {
      mode: 'random',
      exclude_book_ids: owned.externalIds,
      exclude_source_urls: owned.sourceUrls,
    };
    if (Buffer.byteLength(JSON.stringify(body)) > REFILL_MAX_BODY_BYTES) {
      // 목록 일부를 빼고 보내면 중복 생성이 될 수 있어 보내지 않음(명세: 별도 목록 동기화 방식 필요)
      await this.notifier.notify(
        '📚 [여울] 보유 동화 목록이 AI 요청 본문 한도를 넘어 자동 보충을 멈췄어요. 목록 전달 방식을 정해야 해요.',
      );
      return { status: 'TOO_LARGE' };
    }

    const id = `refill-${randomUUID()}`;
    const refill = await this.repository.createRefill({
      id,
      jobId: jobIdFor(id),
      requestBody: body,
    });
    if (!refill) return { status: 'ACTIVE_EXISTS' };
    this.logger.log(
      `보충 요청 ${id} 생성(${options.reason}, 보유 ${body.exclude_book_ids.length}권)`,
    );
    await this.submit(refill);
    return { status: 'REQUESTED', refill };
  }

  /** 저장한 같은 키·같은 본문으로 AI에 접수(재시도 포함). 네트워크 오류면 PENDING으로 남아 다음 확인 때 재전송 */
  async submit(refill: RefillRecord): Promise<void> {
    const attempts = refill.submitAttempts + 1;
    let result;
    try {
      result = await this.client.submitJob(refill.requestBody, refill.id);
    } catch (error) {
      await this.repository.updateRefill(refill.id, {
        submitAttempts: attempts,
        error: `접수 실패(재시도 예정): ${message(error)}`,
      });
      throw error;
    }
    if (result.job) {
      if (result.job.id !== refill.jobId) {
        this.logger.warn(
          `AI 작업 id가 규칙과 다름(${refill.jobId} → ${result.job.id}), 응답 값을 사용`,
        );
      }
      await this.repository.updateRefill(refill.id, {
        jobId: result.job.id,
        status: 'ACTIVE',
        aiStatus: result.job.status,
        submitAttempts: attempts,
        error: null,
      });
      return;
    }
    if (result.httpStatus >= 500 || result.httpStatus === 408) {
      await this.repository.updateRefill(refill.id, {
        submitAttempts: attempts,
        error: `접수 실패(재시도 예정): ${result.error}`,
      });
      return;
    }
    // 400·401·409 등: 같은 요청을 다시 보내도 결과가 같으므로 종료
    await this.fail(refill, `접수 거부 ${result.error}`);
  }

  /** 진행 중인 보충 1건의 상태를 확인합니다. */
  async poll(): Promise<void> {
    const refill = await this.repository.activeRefill();
    if (!refill) return;
    if (refill.status === 'PENDING') {
      await this.submit(refill);
      return;
    }

    const job = await this.client.getJob(refill.jobId);
    const delivery = job.delivery?.status ?? null;
    await this.repository.updateRefill(refill.id, {
      aiStatus: job.status,
      deliveryStatus: delivery,
    });

    if (JOB_FAILED.has(job.status)) {
      await this.fail(refill, job.error ?? `생성 ${job.status}`);
      return;
    }
    if (job.status !== 'succeeded') return;

    // 콜백이 먼저 와서 이미 저장했거나, 응답이 끊겨 기록만 못 한 경우
    const bookId = job.result?.books?.[0]?.id;
    if (bookId && (await this.repository.bookExists(bookId))) {
      await this.repository.completeRefillByJob(refill.jobId, bookId);
      return;
    }
    if (delivery && DELIVERY_STUCK.has(delivery)) {
      const key = `${refill.id}:${delivery}`;
      if (!this.notifiedStuck.has(key)) {
        this.notifiedStuck.add(key);
        await this.notifier.notify(
          `📚 [여울] AI 작업 ${refill.jobId}은 생성됐지만 전달 상태가 ${delivery}예요. AI 쪽 수신 주소·토큰 설정을 확인한 뒤 ` +
            '`pipeline retry-delivery <작업 id>`로 같은 결과를 다시 보내 주세요.',
        );
      }
    }
  }

  /** 완성본이 저장된 뒤(콜백) 호출. 보충을 끝내고 여전히 부족하면 다음 1편을 요청합니다. */
  async onBookStored(jobId: string, externalId: string): Promise<void> {
    const completed = await this.repository.completeRefillByJob(
      jobId,
      externalId,
    );
    if (!completed) return;
    this.logger.log(`보충 완료: 작업 ${jobId} → ${externalId}`);
    // 적재 직후 재고를 다시 보고 여전히 부족하면 다음 1편(진행 중 1개 제한은 그대로)
    const stock = await this.inbox.stockSummary(LOW_STOCK_THRESHOLD);
    if (stock.activeStudents > 0 && stock.minRemaining <= LOW_STOCK_THRESHOLD) {
      this.requestInBackground(`적재 후에도 남은 책 ${stock.minRemaining}권`);
    }
  }

  private async inCooldown(now: number): Promise<boolean> {
    const failed = await this.repository.lastFailedRefill();
    if (!failed?.finishedAt) return false;
    const wait = failed.error?.startsWith('NO_NEW_SOURCE')
      ? REFILL_NO_SOURCE_COOLDOWN_MS
      : REFILL_RETRY_COOLDOWN_MS;
    return now - failed.finishedAt.getTime() < wait;
  }

  private async fail(refill: RefillRecord, error: string): Promise<void> {
    await this.repository.updateRefill(refill.id, {
      status: 'FAILED',
      error,
      finishedAt: new Date(),
    });
    const noSource = error.startsWith('NO_NEW_SOURCE');
    await this.notifier.notify(
      [
        `📚 [여울] 동화 보충 실패(${refill.id})`,
        error,
        noSource
          ? '새 원천이 없어요. 담당자 확인 전까지 자동 요청을 24시간 멈춥니다.'
          : `${REFILL_RETRY_COOLDOWN_MS / 60000}분 뒤 다시 요청할 수 있어요.`,
      ].join('\n'),
    );
  }

  private async pollQuietly(): Promise<void> {
    if (this.polling || Date.now() < this.backoffUntil) return;
    this.polling = true;
    try {
      await this.poll();
      this.failures = 0;
    } catch (error) {
      this.failures += 1;
      const delay = Math.min(
        REFILL_POLL_INTERVAL_MS * 2 ** this.failures,
        REFILL_POLL_MAX_BACKOFF_MS,
      );
      this.backoffUntil = Date.now() + delay;
      this.logger.warn(
        `보충 상태 확인 실패(${Math.round(delay / 1000)}초 뒤 재시도): ${message(error)}`,
      );
    } finally {
      this.polling = false;
    }
  }
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
