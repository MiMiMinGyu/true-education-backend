import {
  TtsProvider,
  TtsProviderError,
} from './interfaces/tts-provider.interface';

const TYPECAST_URL = 'https://api.typecast.ai/v1/text-to-speech';
const TIMEOUT_MS = 10_000;

export interface TypecastConfig {
  apiKey?: string;
  voiceId?: string;
  model?: string;
}

export function typecastConfig(env = process.env): TypecastConfig {
  return {
    apiKey: env.TYPECAST_API_KEY || undefined,
    voiceId: env.TYPECAST_VOICE_ID || undefined,
    model: env.TYPECAST_MODEL || undefined,
  };
}

/**
 * Typecast 음성 합성(동기 응답: 본문이 곧 mp3). 1글자 = 1크레딧, 요청당 최대 2,000자.
 * 무료 요금제는 비상업·출처 표기 필요, 동시 요청 2건.
 */
export class TypecastProvider implements TtsProvider {
  readonly fileExtension = 'mp3';
  readonly contentType = 'audio/mpeg';
  private readonly output = { audio_format: 'mp3' } as const;

  constructor(
    private readonly config: TypecastConfig,
    private readonly fetchFn: typeof fetch = fetch,
  ) {}

  get cacheIdentity(): string {
    return [
      this.config.voiceId ?? '',
      this.config.model ?? '',
      JSON.stringify(this.output),
    ].join('|');
  }

  async synthesize(text: string): Promise<Buffer> {
    const { apiKey, voiceId, model } = this.config;
    if (!apiKey || !voiceId || !model) {
      throw new TtsProviderError(
        'Typecast 설정(TYPECAST_API_KEY·VOICE_ID·MODEL)이 없습니다.',
      );
    }
    let response: Response;
    try {
      response = await this.fetchFn(TYPECAST_URL, {
        method: 'POST',
        headers: { 'X-API-KEY': apiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          voice_id: voiceId,
          text,
          model,
          language: 'kor',
          output: this.output,
        }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (error) {
      throw new TtsProviderError(
        `Typecast 요청 실패: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    if (!response.ok) {
      // 402 크레딧 부족, 429 요청 과다, 5xx 서버 오류
      throw new TtsProviderError(
        `Typecast 응답 오류 ${response.status}`,
        response.status,
      );
    }
    return Buffer.from(await response.arrayBuffer());
  }
}
