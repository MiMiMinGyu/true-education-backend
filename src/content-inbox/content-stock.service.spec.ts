import {
  LOW_STOCK_ALERT_COOLDOWN_MS,
  LOW_STOCK_THRESHOLD,
} from '../common/constants/inbox.constants';
import { ContentStockService } from './content-stock.service';
import { IInboxRepository } from './interfaces/inbox-repository.interface';

function setup(remaining: number) {
  const messages: string[] = [];
  const repository: IInboxRepository = {
    saveLog: async () => {},
    countUnassignedBooks: async () => remaining,
    stockSummary: async () => ({
      totalBooks: 10,
      activeStudents: 4,
      lowStudents: 1,
      minRemaining: remaining,
    }),
  };
  const service = new ContentStockService(repository, {
    notify: async (message) => void messages.push(message),
  });
  return { service, messages };
}

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
