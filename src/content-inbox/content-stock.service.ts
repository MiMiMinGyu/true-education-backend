import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  LOW_STOCK_ALERT_COOLDOWN_MS,
  LOW_STOCK_THRESHOLD,
} from '../common/constants/inbox.constants';
import { ALERT_NOTIFIER, type AlertNotifier } from './alert-notifier';
import {
  INBOX_REPOSITORY,
  type IInboxRepository,
  type StockSummary,
} from './interfaces/inbox-repository.interface';

/**
 * 동화 부족 감지. 오늘의 학습에서 새 책을 배정했거나 읽을 책이 없을 때 호출되어,
 * 그 학생에게 남은 책이 기준 이하면 AI 파트에 알립니다(같은 알림은 일정 시간에 한 번).
 */
@Injectable()
export class ContentStockService {
  private readonly logger = new Logger('ContentStock');
  // TODO: 서버가 여러 대가 되면 알림 간격을 DB에 두어 인스턴스끼리 공유(지금은 1대 전제)
  private lastAlertAt = 0;

  constructor(
    @Inject(INBOX_REPOSITORY) private readonly repository: IInboxRepository,
    @Inject(ALERT_NOTIFIER) private readonly notifier: AlertNotifier,
  ) {}

  /** 학습 응답을 늦추지 않도록 기다리지 않고 실행합니다(실패는 로그만) */
  observe(studentId: number): void {
    this.check(studentId).catch((error: unknown) =>
      this.logger.warn(
        `동화 재고 확인 실패: ${error instanceof Error ? error.message : String(error)}`,
      ),
    );
  }

  async check(studentId: number, now = Date.now()): Promise<boolean> {
    const remaining = await this.repository.countUnassignedBooks(studentId);
    if (remaining > LOW_STOCK_THRESHOLD) return false;
    if (now - this.lastAlertAt < LOW_STOCK_ALERT_COOLDOWN_MS) return false;
    this.lastAlertAt = now;

    const stock = await this.summary();
    await this.notifier.notify(
      [
        '📚 [여울] 동화가 곧 부족해요',
        remaining === 0
          ? '읽을 책이 모두 떨어진 학생이 있어요(오늘의 학습에서 NO_BOOK).'
          : `남은 책이 ${remaining}권인 학생이 있어요.`,
        `전체 동화 ${stock.totalBooks}권 · 남은 책 ${LOW_STOCK_THRESHOLD}권 이하 학생 ${stock.lowStudents}/${stock.activeStudents}명 · 가장 적게 남은 학생 ${stock.minRemaining}권`,
        '새 동화 JSON을 POST /admin/books 로 보내 주세요.',
      ].join('\n'),
    );
    return true;
  }

  summary(): Promise<StockSummary> {
    return this.repository.stockSummary(LOW_STOCK_THRESHOLD);
  }
}
