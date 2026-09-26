import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import { toPages } from '../learning/utils/reading.util';
import {
  STORAGE_SERVICE,
  type StorageService,
} from '../storage/storage.interface';
import {
  TTS_PROVIDER,
  TtsProviderError,
  type TtsProvider,
} from './interfaces/tts-provider.interface';
import {
  TTS_REPOSITORY,
  type ITtsRepository,
} from './interfaces/tts-repository.interface';

/** Typecast 무료 요금제 동시 요청 한도 */
export const TTS_WARMUP_CONCURRENCY = 2;

export interface WarmupResult {
  created: number;
  cached: number;
  failed: { lineId: string; reason: string }[];
}

/**
 * 여울이 차례 줄의 음성. 줄마다 처음 요청할 때 한 번만 만들어 저장하고 이후에는 재사용합니다(학생 수와 무관하게 1회 과금).
 * 캐시 키 = sha256(글 + 목소리·모델·출력 옵션)이라 목소리를 바꾸면 자동으로 다시 만듭니다.
 */
@Injectable()
export class TtsService {
  private readonly logger = new Logger(TtsService.name);
  /** 같은 줄을 동시에 처음 요청하면 진행 중인 생성 작업을 공유해 외부 호출을 1회로 줄입니다(서버 인스턴스 단위) */
  private readonly inFlight = new Map<string, Promise<string>>();

  constructor(
    @Inject(TTS_REPOSITORY) private readonly repository: ITtsRepository,
    @Inject(TTS_PROVIDER) private readonly provider: TtsProvider,
    @Inject(STORAGE_SERVICE) private readonly storage: StorageService,
  ) {}

  async audioUrl(bookId: number, lineId: string): Promise<string> {
    const text = await this.yeoulLineText(bookId, lineId);
    try {
      return this.storage.urlFor(await this.ensureAudio(bookId, lineId, text));
    } catch (error) {
      if (error instanceof TtsProviderError) {
        this.logger.warn(
          `TTS 실패 book=${bookId} line=${lineId}: ${error.message}`,
        );
        throw new ServiceUnavailableException('음성을 불러오지 못했어요');
      }
      throw error;
    }
  }

  /** 책의 여울이 줄을 모두 미리 만듭니다(발표 전 실행해 시연 중 외부 호출 0회) */
  async warmup(bookId: number): Promise<WarmupResult> {
    const content = await this.repository.findBookContent(bookId);
    if (!content) throw new NotFoundException('책을 찾을 수 없습니다.');
    const lines = toPages(content)
      .flatMap((page) => page.lines)
      .filter((line) => line.speaker === 'YEOUL');

    const result: WarmupResult = { created: 0, cached: 0, failed: [] };
    const queue = [...lines];
    const worker = async () => {
      for (let line = queue.shift(); line; line = queue.shift()) {
        try {
          const cached = await this.isCached(bookId, line.id, line.text);
          await this.ensureAudio(bookId, line.id, line.text);
          result[cached ? 'cached' : 'created']++;
        } catch (error) {
          result.failed.push({
            lineId: line.id,
            reason: error instanceof Error ? error.message : String(error),
          });
        }
      }
    };
    await Promise.all(
      Array.from({ length: TTS_WARMUP_CONCURRENCY }, () => worker()),
    );
    return result;
  }

  private async yeoulLineText(bookId: number, lineId: string): Promise<string> {
    const content = await this.repository.findBookContent(bookId);
    if (!content) throw new NotFoundException('책을 찾을 수 없습니다.');
    const line = toPages(content)
      .flatMap((page) => page.lines)
      .find((item) => item.id === lineId);
    if (!line) throw new NotFoundException('줄을 찾을 수 없습니다.');
    if (line.speaker !== 'YEOUL') {
      throw new BadRequestException('여울이 차례 줄만 음성을 제공합니다.');
    }
    return line.text;
  }

  private hashOf(text: string): string {
    return createHash('sha256')
      .update(text)
      .update('\n')
      .update(this.provider.cacheIdentity)
      .digest('hex');
  }

  private async isCached(bookId: number, lineId: string, text: string) {
    const cached = await this.repository.findAudio(bookId, lineId);
    return cached?.contentHash === this.hashOf(text);
  }

  /** 저장소 키를 돌려줍니다. 캐시가 없거나 글·목소리가 바뀌었으면 새로 만듭니다 */
  private async ensureAudio(
    bookId: number,
    lineId: string,
    text: string,
  ): Promise<string> {
    const hash = this.hashOf(text);
    const cached = await this.repository.findAudio(bookId, lineId);
    if (cached?.contentHash === hash) return cached.key;

    const jobKey = `${bookId}:${lineId}:${hash}`;
    let job = this.inFlight.get(jobKey);
    if (!job) {
      job = this.generate(bookId, lineId, text, hash).finally(() =>
        this.inFlight.delete(jobKey),
      );
      this.inFlight.set(jobKey, job);
    }
    return job;
  }

  private async generate(
    bookId: number,
    lineId: string,
    text: string,
    hash: string,
  ): Promise<string> {
    const audio = await this.provider.synthesize(text);
    const key = `tts/${bookId}/${lineId}-${hash.slice(0, 8)}.${this.provider.fileExtension}`;
    await this.storage.put(key, audio, this.provider.contentType);
    await this.repository.upsertAudio(bookId, lineId, hash, key);
    return key;
  }
}
