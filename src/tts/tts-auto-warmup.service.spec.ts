import type { ITtsRepository } from './interfaces/tts-repository.interface';
import { TtsAutoWarmupService } from './tts-auto-warmup.service';
import type { TtsService } from './tts.service';

describe('TtsAutoWarmupService', () => {
  const env = { ...process.env };
  const books = [
    { id: 1, externalId: 'folkency-5747' },
    { id: 2, externalId: 'folkency-5720' },
  ];
  const tts = { warmup: jest.fn() };
  const repository = {
    listBooks: jest.fn((externalId?: string) =>
      Promise.resolve(
        externalId ? books.filter((b) => b.externalId === externalId) : books,
      ),
    ),
  };
  let service: TtsAutoWarmupService;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.TYPECAST_API_KEY = 'key';
    process.env.TYPECAST_VOICE_ID = 'voice';
    process.env.TYPECAST_MODEL = 'ssfm-v30';
    tts.warmup.mockResolvedValue({ created: 1, cached: 0, failed: [] });
    service = new TtsAutoWarmupService(
      tts as unknown as TtsService,
      repository as unknown as ITtsRepository,
    );
  });

  afterEach(() => {
    service.onModuleDestroy();
    process.env = { ...env };
  });

  it('켜기 전(명령줄 스크립트)에는 저장 트리거가 와도 아무것도 하지 않는다', async () => {
    service.scheduleBook('folkency-5747');
    await service.drain();
    expect(tts.warmup).not.toHaveBeenCalled();
  });

  it('Typecast 설정이 하나라도 없으면 켜지지 않는다', async () => {
    process.env.TYPECAST_MODEL = '';
    service.activate();
    service.scheduleBook('folkency-5747');
    await service.drain();
    expect(service.enabled).toBe(false);
    expect(tts.warmup).not.toHaveBeenCalled();
  });

  it('새 책이 저장되면 그 책을 미리 만들고, 처리 전 같은 책이 겹쳐 오면 한 번만 처리한다', async () => {
    service.activate();
    let release!: () => void;
    tts.warmup.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = () => resolve({ created: 3, cached: 0, failed: [] });
        }),
    );
    service.scheduleBook('folkency-5747'); // 처리 시작
    service.scheduleBook('folkency-5720'); // 대기
    service.scheduleBook('folkency-5720'); // 대기 중 중복 → 무시
    while (tts.warmup.mock.calls.length === 0) {
      await new Promise((resolve) => setImmediate(resolve));
    }
    release();
    await service.drain();
    expect(tts.warmup.mock.calls.map(([id]) => id)).toEqual([1, 2]);
  });

  it('점검은 모든 책을 훑는다(캐시 있는 줄 건너뛰기는 TtsService.warmup이 담당)', async () => {
    service.activate();
    await service.sweep();
    expect(tts.warmup.mock.calls.map(([id]) => id)).toEqual([1, 2]);
  });

  it('한 책이 실패해도 다음 책은 계속 처리한다', async () => {
    service.activate();
    tts.warmup.mockRejectedValueOnce(new Error('Typecast 402'));
    await service.sweep();
    expect(tts.warmup).toHaveBeenCalledTimes(2);
  });
});
