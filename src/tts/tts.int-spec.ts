import request from 'supertest';
import {
  createTestApp,
  loginAsNewStudent,
  resetDatabase,
  seedDevBooks,
  TestContext,
} from '../test-utils/integration';
import {
  TTS_PROVIDER,
  TtsProvider,
  TtsProviderError,
} from './interfaces/tts-provider.interface';

// Typecast 대신 쓰는 가짜 생성기(실제 크레딧을 쓰지 않음)
const provider: TtsProvider & { synthesize: jest.Mock } = {
  cacheIdentity: 'fake-voice|fake-model',
  fileExtension: 'mp3',
  contentType: 'audio/mpeg',
  synthesize: jest.fn(),
};

describe('TTS (통합)', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await createTestApp([[TTS_PROVIDER, provider]]);
  });

  beforeEach(async () => {
    await resetDatabase(ctx.prisma);
    await seedDevBooks(ctx.prisma);
    provider.synthesize.mockReset();
    provider.synthesize.mockImplementation(async (text: string) =>
      Buffer.from(`audio:${text}`),
    );
  });

  afterAll(async () => {
    await ctx.close();
  });

  /** 첫 책. 첫 줄 p001-1은 여울이 차례입니다 */
  const firstBook = () =>
    ctx.prisma.book.findFirstOrThrow({ orderBy: { id: 'asc' } });

  it('여울이 줄은 처음 한 번만 만들어 저장하고, 같은 줄 동시 요청도 외부 호출 1번', async () => {
    const { agent } = await loginAsNewStudent(ctx.app, 'listener02');
    const today = (await agent.get('/sessions/today').expect(200)).body;
    const { body: reading } = await agent.get(
      `/assignments/${today.assignmentId}/reading`,
    );
    const [yeoul, student, yeoul2] = reading.pages[0].lines as {
      id: string;
      text: string;
      speaker: string;
    }[];
    expect([yeoul.speaker, student.speaker]).toEqual(['YEOUL', 'STUDENT']);
    const path = (lineId: string) =>
      `/books/${today.book.id}/lines/${lineId}/tts`;

    const first = (await agent.get(path(yeoul.id)).expect(200)).body;
    expect(first.audioUrl).toMatch(
      new RegExp(`/files/tts/${today.book.id}/${yeoul.id}-[0-9a-f]{8}\\.mp3$`),
    );
    const file = await agent.get(new URL(first.audioUrl).pathname).expect(200);
    expect(file.headers['content-type']).toBe('audio/mpeg');
    expect((file.body as Buffer).toString()).toBe(`audio:${yeoul.text}`);
    expect((await agent.get(path(yeoul.id)).expect(200)).body).toEqual(first);
    expect(provider.synthesize).toHaveBeenCalledTimes(1);

    const concurrent = await Promise.all(
      Array.from({ length: 5 }, () => agent.get(path(yeoul2.id))),
    );
    expect(concurrent.map((res) => res.status)).toEqual(Array(5).fill(200));
    expect(provider.synthesize).toHaveBeenCalledTimes(2);
    expect(
      await ctx.prisma.ttsAudio.count({ where: { bookId: today.book.id } }),
    ).toBe(2);

    await agent.get(path(student.id)).expect(400);
    await agent.get(path('p999-1')).expect(404);
    await agent.get(`/books/999999/lines/${yeoul.id}/tts`).expect(404);
  });

  it('Typecast 실패는 503(학습은 계속), 다음 요청에서 다시 시도', async () => {
    const book = await firstBook();
    const { agent } = await loginAsNewStudent(ctx.app, 'listener03');
    const path = `/books/${book.id}/lines/p001-1/tts`;

    provider.synthesize.mockRejectedValueOnce(
      new TtsProviderError('크레딧 부족', 402),
    );
    expect((await agent.get(path).expect(503)).body.message).toBe(
      '음성을 불러오지 못했어요',
    );
    expect(await ctx.prisma.ttsAudio.count()).toBe(0);
    await agent.get(path).expect(200);
  });

  it('접근 제어: 비로그인 401, 보호자 403', async () => {
    const book = await firstBook();
    await request(ctx.app.getHttpServer())
      .get(`/books/${book.id}/lines/p001-1/tts`)
      .expect(401);
    const kid = await loginAsNewStudent(ctx.app, 'listener04');
    const parent = request.agent(ctx.app.getHttpServer());
    await parent
      .post('/auth/signup/parent')
      .send({
        name: '보호자',
        loginId: 'parent20',
        password: 'password123',
        studentCode: kid.studentCode,
        agreements: [
          'terms',
          'guardianPrivacy',
          'childPrivacy',
          'childSpeech',
          'guardianDashboard',
        ],
      })
      .expect(201);
    await parent
      .post('/auth/login')
      .send({ role: 'PARENT', loginId: 'parent20', password: 'password123' })
      .expect(200);
    await parent.get(`/books/${book.id}/lines/p001-1/tts`).expect(403);
    expect(provider.synthesize).not.toHaveBeenCalled();
  });
});
