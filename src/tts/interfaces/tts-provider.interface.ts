export const TTS_PROVIDER = Symbol('TTS_PROVIDER');

/** 외부 음성 합성 실패(키 없음, 크레딧 부족, 요청 과다, 5xx, 시간 초과). 서비스가 503으로 바꿉니다 */
export class TtsProviderError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'TtsProviderError';
  }
}

export interface TtsProvider {
  /**
   * 캐시 키에 들어가는 값. 목소리·모델·출력 옵션이 바뀌면 캐시가 달라져 자동으로 다시 만듭니다.
   * 키가 없는 등 설정이 비어 있어도 값은 돌려주고, synthesize에서 실패합니다.
   */
  readonly cacheIdentity: string;
  readonly fileExtension: string;
  readonly contentType: string;
  /** @throws TtsProviderError */
  synthesize(text: string): Promise<Buffer>;
}
