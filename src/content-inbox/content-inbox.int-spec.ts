import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import request from 'supertest';
import {
  createTestApp,
  loginAsNewStudent,
  resetDatabase,
  seedDevBooks,
  TestContext,
} from '../test-utils/integration';
import { ALERT_NOTIFIER } from './alert-notifier';
import { ContentStockService } from './content-stock.service';

const API_KEY = 'test-content-key';

describe('AI 파트 → 서버 동화 전송·부족 알림 (통합)', () => {
  let ctx: TestContext;
  let story: Record<string, unknown>;
  const alerts: string[] = [];
  const previousKey = process.env.CONTENT_API_KEY;

  beforeAll(async () => {
    process.env.CONTENT_API_KEY = API_KEY;
    ctx = await createTestApp([
      [ALERT_NOTIFIER, { notify: async (m: string) => void alerts.push(m) }],
    ]);
    story = JSON.parse(
      await readFile(
        join(__dirname, '../../prisma/seed/ai/good-brothers.json'),
        'utf8',
      ),
    ) as Record<string, unknown>;
  });

  beforeEach(async () => {
    await resetDatabase(ctx.prisma);
    alerts.length = 0;
    // 알림 간격은 서버 메모리에 있어 테스트마다 초기화합니다.
    (
      ctx.app.get(ContentStockService) as unknown as { lastAlertAt: number }
    ).lastAlertAt = 0;
  });

  afterAll(async () => {
    process.env.CONTENT_API_KEY = previousKey;
    await ctx.close();
  });

  const send = (body: unknown, key: string | null = API_KEY) => {
    const req = request(ctx.app.getHttpServer()).post('/admin/books');
    return (key === null ? req : req.set('X-API-Key', key)).send(
      body as object,
    );
  };

  it('API 키가 없거나 틀리면 401, 서버에 키가 설정되지 않았으면 404', async () => {
    await send(story, null).expect(401);
    await send(story, 'wrong').expect(401);
    process.env.CONTENT_API_KEY = '';
    try {
      await send(story).expect(404);
    } finally {
      process.env.CONTENT_API_KEY = API_KEY;
    }
    expect(await ctx.prisma.book.count()).toBe(0);
  });

  it('받은 동화를 저장하고 원본·결과를 기록한다(새 책 201, 같은 id 다시 보내면 200 갱신)', async () => {
    const created = await send(story).expect(201);
    expect(created.body).toMatchObject({
      externalId: 'good-brothers',
      status: 'CREATED',
      errors: [],
    });
    expect(created.body.summary).toContain('의좋은 형제 · 6쪽 12줄');
    await send({ ...story, title: '의좋은 형제(고침)' }).expect(200);

    const book = await ctx.prisma.book.findUniqueOrThrow({
      where: { externalId: 'good-brothers' },
    });
    expect(book.title).toBe('의좋은 형제(고침)');
    const logs = await ctx.prisma.contentImportLog.findMany({
      orderBy: { id: 'asc' },
    });
    expect(logs.map((log) => [log.source, log.status])).toEqual([
      ['API', 'CREATED'],
      ['API', 'UPDATED'],
    ]);
    expect((logs[0].payload as { id: string }).id).toBe('good-brothers');
  });

  it('검증 실패 400·규칙 검사 미통과 422는 저장하지 않고 사유를 기록한다', async () => {
    const invalid = await send({ id: 'broken', title: '빈 책', pages: [] });
    expect(invalid.status).toBe(400);
    expect(invalid.body.errors).toContain('pages가 1쪽 이상 있어야 합니다.');

    await send({
      ...story,
      id: 'not-passed',
      meta: { rule_check: { passed: false } },
    }).expect(422);

    expect(await ctx.prisma.book.count()).toBe(0);
    const logs = await ctx.prisma.contentImportLog.findMany({
      orderBy: { id: 'asc' },
    });
    expect(logs.map((log) => [log.externalId, log.status])).toEqual([
      ['broken', 'INVALID'],
      ['not-passed', 'SKIPPED'],
    ]);
  });

  it('이미 학생에게 배정된 책은 API로 바꾸지 않는다(409)', async () => {
    await send(story).expect(201);
    const kid = await loginAsNewStudent(ctx.app, 'inbox01');
    await kid.agent.get('/sessions/today').expect(200);

    const res = await send({ ...story, title: '바꾸려는 제목' }).expect(409);
    expect(res.body.status).toBe('SKIPPED_ASSIGNED');
    const book = await ctx.prisma.book.findUniqueOrThrow({
      where: { externalId: 'good-brothers' },
    });
    expect(book.title).toBe('의좋은 형제');
  });

  it('새 책을 배정했을 때 남은 책이 기준 이하면 AI 파트에 한 번 알리고, 재고를 조회할 수 있다', async () => {
    await seedDevBooks(ctx.prisma);
    const first = await loginAsNewStudent(ctx.app, 'inbox02');
    await first.agent.get('/sessions/today').expect(200);
    const second = await loginAsNewStudent(ctx.app, 'inbox03');
    await second.agent.get('/sessions/today').expect(200);

    // 알림은 응답을 기다리지 않고 보내므로 잠시 기다립니다.
    for (let i = 0; i < 50 && alerts.length === 0; i++) {
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toContain('동화가 곧 부족해요');

    const stock = await request(ctx.app.getHttpServer())
      .get('/admin/content/stock')
      .set('X-API-Key', API_KEY)
      .expect(200);
    const totalBooks = await ctx.prisma.book.count();
    expect(stock.body).toEqual({
      totalBooks,
      activeStudents: 2,
      lowStudents: 2,
      minRemaining: totalBooks - 1,
    });
  });
});
