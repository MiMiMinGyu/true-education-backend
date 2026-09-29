import {
  LOW_STOCK_ALERT_COOLDOWN_MS,
  LOW_STOCK_THRESHOLD,
} from '../common/constants/inbox.constants';
import { ContentStockService } from './content-stock.service';
import { IInboxRepository } from './interfaces/inbox-repository.interface';
import type { RefillService } from './refill.service';

function setup(remaining: number) {
  const messages: string[] = [];
  const refillRequests: string[] = [];
  const repository: IInboxRepository = {
    saveLog: async () => {},
    existingExternalIds: async () => [],
    countUnassignedBooks: async () => remaining,
    stockSummary: async () => ({
      totalBooks: 10,
      activeStudents: 4,
      lowStudents: 1,
      minRemaining: remaining,
    }),
  };
  const refill = {
    enabled: true,
    requestInBackground: (reason: string) => void refillRequests.push(reason),
  } as unknown as RefillService;
  const service = new ContentStockService(
    repository,
    { notify: async (message) => void messages.push(message) },
    refill,
  );
  return { service, messages, refillRequests };
}

describe('ContentStockService → 자동 보충', () => {
  it('기준 이하이면 알림 간격과 상관없이 매번 보충을 요청한다(진행 중 1개 제한은 RefillService가 판단)', async () => {
    const { service, refillRequests } = setup(LOW_STOCK_THRESHOLD);
    await service.check(1, 1_000);
    await service.check(2, 2_000);
    expect(refillRequests).toHaveLength(2);
  });

  it('남은 책이 기준보다 많으면 요청하지 않는다', async () => {
    const { service, refillRequests } = setup(LOW_STOCK_THRESHOLD + 1);
    await service.check(1);
    expect(refillRequests).toHaveLength(0);
  });
});

describe('ContentStockService', () => {
  it('남은 책이 기준보다 많으면 알리지 않는다', async () => {
    const { service, messages } = setup(LOW_STOCK_THRESHOLD + 1);
    expect(await service.check(1)).toBe(false);
    expect(messages).toHaveLength(0);
  });

  it('기준 이하이면 알리고, 같은 간격 안에서는 다시 알리지 않는다', async () => {
    const { service, messages } = setup(LOW_STOCK_THRESHOLD);
    const now = 1_000_000_000;
    expect(await service.check(1, now)).toBe(true);
    expect(await service.check(2, now + 1000)).toBe(false);
    expect(await service.check(3, now + LOW_STOCK_ALERT_COOLDOWN_MS)).toBe(
      true,
    );
    expect(messages).toHaveLength(2);
    expect(messages[0]).toContain(`남은 책이 ${LOW_STOCK_THRESHOLD}권인 학생`);
  });

  it('읽을 책이 모두 떨어졌으면 그 사실을 알린다', async () => {
    const { service, messages } = setup(0);
    await service.check(1);
    expect(messages[0]).toContain('읽을 책이 모두 떨어진 학생');
  });
});
