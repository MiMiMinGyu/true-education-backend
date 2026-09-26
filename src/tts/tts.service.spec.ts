import {
  BadRequestException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { BookContent } from '../content/interfaces/book-content.interface';
import { StorageService } from '../storage/storage.interface';
import {
  TtsProvider,
  TtsProviderError,
} from './interfaces/tts-provider.interface';
import {
  CachedAudio,
  ITtsRepository,
} from './interfaces/tts-repository.interface';
import { TtsService } from './tts.service';

// 여울이 먼저: p001-1(YEOUL), p001-2(STUDENT), p002-1(YEOUL)
const content: BookContent = {
  paragraphs: [
    {
      id: 'p001',
      lines: [
        { id: 'p001-1', text: '옛날 옛적에', syllableCount: 5 },
        { id: 'p001-2', text: '호랑이가 살았어요', syllableCount: 7 },
      ],
    },
    {
      id: 'p002',
      lines: [{ id: 'p002-1', text: '어느 날', syllableCount: 3 }],
    },
  ],
  glossary: {},
};

function setup(identity = 'voice|model') {
  const audios = new Map<string, CachedAudio>();
  const repository: ITtsRepository = {
    findBookContent: jest.fn(async (id: number) => (id === 1 ? content : null)),
    listBooks: jest.fn(),
    findAudio: jest.fn(
      async (bookId, lineId) => audios.get(`${bookId}/${lineId}`) ?? null,
    ),
    upsertAudio: jest.fn(async (bookId, lineId, contentHash, key) => {
      audios.set(`${bookId}/${lineId}`, { contentHash, key });
    }),
  };
  const provider: TtsProvider & { synthesize: jest.Mock } = {
    cacheIdentity: identity,
    fileExtension: 'mp3',
    contentType: 'audio/mpeg',
    synthesize: jest.fn(async (text: string) => Buffer.from(text)),
  };
  const storage: StorageService & { put: jest.Mock } = {
    put: jest.fn(),
    urlFor: (key) => `http://files/${key}`,
  };
  return {
    repository,
    provider,
    storage,
    service: new TtsService(repository, provider, storage),
  };
}

describe('TtsService', () => {
  it('처음 요청에만 만들어 저장하고 이후에는 재사용한다', async () => {
    const { service, provider, storage } = setup();
    const url = await service.audioUrl(1, 'p001-1');
    expect(url).toMatch(/^http:\/\/files\/tts\/1\/p001-1-[0-9a-f]{8}\.mp3$/);
    expect(await service.audioUrl(1, 'p001-1')).toBe(url);
    expect(provider.synthesize).toHaveBeenCalledTimes(1);
    expect(provider.synthesize).toHaveBeenCalledWith('옛날 옛적에');
    expect(storage.put).toHaveBeenCalledWith(
      expect.stringMatching(/^tts\/1\/p001-1-/),
      Buffer.from('옛날 옛적에'),
      'audio/mpeg',
    );
  });

  it('같은 줄을 동시에 처음 요청하면 외부 호출은 1번', async () => {
    const { service, provider } = setup();
    const urls = await Promise.all(
      Array.from({ length: 5 }, () => service.audioUrl(1, 'p002-1')),
    );
    expect(new Set(urls).size).toBe(1);
    expect(provider.synthesize).toHaveBeenCalledTimes(1);
  });

  it('목소리·모델이 바뀌면 다시 만든다', async () => {
    const first = setup('voice-a|model');
    const url = await first.service.audioUrl(1, 'p001-1');
    const second = new TtsService(
      first.repository,
      { ...first.provider, cacheIdentity: 'voice-b|model' },
      first.storage,
    );
    expect(await second.audioUrl(1, 'p001-1')).not.toBe(url);
    expect(first.provider.synthesize).toHaveBeenCalledTimes(2);
  });

  it('학생 줄 400, 없는 책·줄 404, 외부 실패 503(캐시에 남기지 않음)', async () => {
    const { service, provider, repository } = setup();
    await expect(service.audioUrl(1, 'p001-2')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(service.audioUrl(2, 'p001-1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(service.audioUrl(1, 'p999-1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    provider.synthesize.mockRejectedValueOnce(new TtsProviderError('429', 429));
    await expect(service.audioUrl(1, 'p001-1')).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    expect(repository.upsertAudio).not.toHaveBeenCalled();
    // 실패한 작업은 공유 목록에서 빠져 다음 요청에 다시 시도한다
    await expect(service.audioUrl(1, 'p001-1')).resolves.toContain('p001-1');
  });

  it('warmup: 여울이 줄만 만들고, 다시 실행하면 모두 건너뛴다', async () => {
    const { service, provider } = setup();
    expect(await service.warmup(1)).toEqual({
      created: 2,
      cached: 0,
      failed: [],
    });
    expect(await service.warmup(1)).toEqual({
      created: 0,
      cached: 2,
      failed: [],
    });
    expect(provider.synthesize).toHaveBeenCalledTimes(2);
  });

  it('warmup: 실패한 줄은 모아서 알려 주고 나머지는 계속한다', async () => {
    const { service, provider } = setup();
    provider.synthesize.mockImplementation(async (text: string) => {
      if (text === '어느 날') throw new TtsProviderError('402', 402);
      return Buffer.from(text);
    });
    expect(await service.warmup(1)).toEqual({
      created: 1,
      cached: 0,
      failed: [{ lineId: 'p002-1', reason: '402' }],
    });
  });
});
