import { TtsProviderError } from './interfaces/tts-provider.interface';
import { TypecastProvider } from './typecast.provider';

const config = { apiKey: 'key', voiceId: 'voice-1', model: 'model-1' };

describe('TypecastProvider', () => {
  it('스펙대로 요청하고 응답 본문을 음성 데이터로 돌려준다', async () => {
    const fetchFn = jest
      .fn()
      .mockResolvedValue(new Response(Buffer.from('mp3-bytes')));
    const audio = await new TypecastProvider(config, fetchFn).synthesize(
      '안녕',
    );

    expect(audio.toString()).toBe('mp3-bytes');
    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe('https://api.typecast.ai/v1/text-to-speech');
    expect(init.headers).toMatchObject({ 'X-API-KEY': 'key' });
    expect(JSON.parse(init.body)).toEqual({
      voice_id: 'voice-1',
      text: '안녕',
      model: 'model-1',
      language: 'kor',
      output: { audio_format: 'mp3' },
    });
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it('설정이 비었으면 호출하지 않고 실패한다', async () => {
    const fetchFn = jest.fn();
    await expect(
      new TypecastProvider(
        { ...config, apiKey: undefined },
        fetchFn,
      ).synthesize('안녕'),
    ).rejects.toBeInstanceOf(TtsProviderError);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('오류 응답·네트워크 오류는 TtsProviderError', async () => {
    const quota = new TypecastProvider(
      config,
      jest.fn().mockResolvedValue(new Response('', { status: 402 })),
    );
    await expect(quota.synthesize('안녕')).rejects.toMatchObject({
      status: 402,
    });
    const offline = new TypecastProvider(
      config,
      jest.fn().mockRejectedValue(new Error('timeout')),
    );
    await expect(offline.synthesize('안녕')).rejects.toBeInstanceOf(
      TtsProviderError,
    );
  });

  it('목소리·모델이 바뀌면 캐시 식별값도 바뀐다', () => {
    const base = new TypecastProvider(config).cacheIdentity;
    expect(
      new TypecastProvider({ ...config, voiceId: 'v2' }).cacheIdentity,
    ).not.toBe(base);
    expect(
      new TypecastProvider({ ...config, apiKey: 'other' }).cacheIdentity,
    ).toBe(base);
  });
});
