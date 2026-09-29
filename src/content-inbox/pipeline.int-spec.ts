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
import {
  AI_PIPELINE_CLIENT,
  type PipelineJob,
  type RandomJobRequest,
} from './ai-pipeline.client';
import { ALERT_NOTIFIER } from './alert-notifier';
import { jobIdFor, RefillService } from './refill.service';

const CALLBACK_TOKEN = 'test-callback-token';

/** AI 파트 파이프라인 가짜: 접수 기록만 남기고 작업 상태는 테스트가 정함 */
function fakePipeline() {
  const submitted: { body: RandomJobRequest; key: string }[] = [];
  let jobStatus: PipelineJob = { id: '', status: 'queued' };
  return {
    submitted,
    setJob: (job: Partial<PipelineJob>) => {
      jobStatus = { ...jobStatus, ...job };
    },
    client: {
      enabled: true,
      listBooks: async () => [],
      getBook: async () => ({}),
      submitJob: async (body: RandomJobRequest, key: string) => {
        submitted.push({ body, key });
        // 네트워크 왕복처럼 잠깐 기다려 동시 요청 경합을 드러냄
        await new Promise((resolve) => setTimeout(resolve, 20));
        return {
          httpStatus: 202,
          job: { id: jobIdFor(key), status: 'queued' },
          error: null,
        };
      },
      getJob: async (jobId: string) => ({ ...jobStatus, id: jobId }),
      retryDelivery: async () => ({ httpStatus: 200, body: {} }),
    },
  };
}

describe('AI 파이프라인 보충 요청·완성본 수신 (통합)', () => {
  let ctx: TestContext;
  let book: Record<string, unknown>;
  const pipeline = fakePipeline();
  const alerts: string[] = [];
  const previous = process.env.AI_PIPELINE_CALLBACK_TOKEN;

  beforeAll(async () => {
    process.env.AI_PIPELINE_CALLBACK_TOKEN = CALLBACK_TOKEN;
    ctx = await createTestApp([
      [AI_PIPELINE_CLIENT, pipeline.client],
      [ALERT_NOTIFIER, { notify: async (m: string) => void alerts.push(m) }],
    ]);
    book = JSON.parse(
      await readFile(
        join(__dirname, '../../prisma/seed/ai/folkency-5747.json'),
        'utf8',
      ),
    ) as Record<string, unknown>;
  });

  beforeEach(async () => {
    await resetDatabase(ctx.prisma);
    pipeline.submitted.length = 0;
    pipeline.setJob({ status: 'queued', error: null, delivery: null });
    alerts.length = 0;
  });

  afterAll(async () => {
    process.env.AI_PIPELINE_CALLBACK_TOKEN = previous;
    await ctx.close();
  });

  const deliver = (
    body: unknown,
    headers: Partial<Record<'auth' | 'job' | 'key', string | null>> = {},
  ) => {
    let req = request(ctx.app.getHttpServer()).post('/internal/ai/books');
    const auth =
      headers.auth === undefined ? `Bearer ${CALLBACK_TOKEN}` : headers.auth;
    const job = headers.job === undefined ? 'job-1' : headers.job;
    const key = headers.key === undefined ? 'job-1:folkency-5747' : headers.key;
    if (auth) req = req.set('Authorization', auth);
    if (job) req = req.set('X-Pipeline-Job-Id', job);
    if (key) req = req.set('Idempotency-Key', key);
    return req.send(body as object);
  };

  const waitFor = async (check: () => Promise<boolean>) => {
    for (let i = 0; i < 50; i += 1) {
      if (await check()) return;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    throw new Error('조건을 기다리다 시간 초과');
  };

  it('수신 API: 토큰이 없거나 틀리면 401, 서버에 토큰이 없으면 404, 헤더가 빠지면 400', async () => {
    await deliver(book, { auth: null }).expect(401);
    await deliver(book, { auth: 'Bearer wrong' }).expect(401);
    await deliver(book, { key: null }).expect(400);
    process.env.AI_PIPELINE_CALLBACK_TOKEN = '';
    try {
      await deliver(book).expect(404);
    } finally {
      process.env.AI_PIPELINE_CALLBACK_TOKEN = CALLBACK_TOKEN;
    }
    expect(await ctx.prisma.book.count()).toBe(0);
  });

  it('완성본을 저장한 뒤 201, 같은 키·같은 본문 재수신은 저장 없이 200, 같은 키·다른 본문은 409', async () => {
    await deliver(book).expect(201);
    const again = await deliver(book).expect(200);
    expect(again.body.status).toBe('ALREADY_STORED');
    await deliver({ ...book, title: '바뀐 제목' }).expect(409);

    const saved = await ctx.prisma.book.findUniqueOrThrow({
      where: { externalId: 'folkency-5747' },
    });
    expect(saved.title).toBe('금도끼은도끼');
    expect(await ctx.prisma.aiBookDelivery.count()).toBe(1);
    expect(
      await ctx.prisma.contentImportLog.count({
        where: { source: 'PIPELINE' },
      }),
    ).toBe(1);
  });

  it('검증에 실패한 결과는 저장하지 않고 400(재시도해도 같은 결과)', async () => {
    await deliver({ ...book, pages: [] }).expect(400);
    expect(await ctx.prisma.book.count()).toBe(0);
    expect(await ctx.prisma.aiBookDelivery.count()).toBe(0);
  });

  it('재고가 기준 이하면 random 모드로 1편 요청하고, 보유 목록 전체를 제외 목록으로 보낸다', async () => {
    await seedDevBooks(ctx.prisma);
    const kid = await loginAsNewStudent(ctx.app, 'refill_kid');
    await kid.agent.get('/sessions/today').expect(200);

    await waitFor(async () => pipeline.submitted.length === 1);
    const [{ body, key }] = pipeline.submitted;
    const owned = await ctx.prisma.book.findMany({
      select: { externalId: true },
    });
    expect(body.mode).toBe('random');
    expect([...body.exclude_book_ids].sort()).toEqual(
      owned.map((b) => b.externalId).sort(),
    );
    expect(key).toMatch(/^refill-[0-9a-f-]{36}$/);

    await waitFor(async () =>
      Boolean(
        await ctx.prisma.contentRefillRequest.findFirst({
          where: { status: 'ACTIVE' },
        }),
      ),
    );
    const refill = await ctx.prisma.contentRefillRequest.findFirstOrThrow();
    expect(refill.jobId).toBe(jobIdFor(key));
  });

  it('동시에 여러 번 요청해도 진행 중인 보충은 1건만 만든다', async () => {
    const refill = ctx.app.get(RefillService);
    const outcomes = await Promise.all(
      Array.from({ length: 5 }, () =>
        refill.requestIfNeeded({ reason: '동시성 테스트' }),
      ),
    );
    expect(outcomes.filter((o) => o.status === 'REQUESTED')).toHaveLength(1);
    expect(await ctx.prisma.contentRefillRequest.count()).toBe(1);
    expect(pipeline.submitted).toHaveLength(1);
  });

  it('완성본 콜백이 오면 보충을 완료하고, 콜백이 작업 id 저장보다 먼저 와도 미리 계산한 id로 연결된다', async () => {
    const refill = ctx.app.get(RefillService);
    const outcome = await refill.requestIfNeeded({ reason: '테스트' });
    if (outcome.status !== 'REQUESTED') throw new Error(outcome.status);
    const { jobId } = outcome.refill;

    await deliver(book, { job: jobId, key: `${jobId}:folkency-5747` }).expect(
      201,
    );
    const done = await ctx.prisma.contentRefillRequest.findUniqueOrThrow({
      where: { jobId },
    });
    expect(done).toMatchObject({
      status: 'COMPLETED',
      bookExternalId: 'folkency-5747',
    });
    expect(done.finishedAt).not.toBeNull();
  });

  it('생성이 rejected면 실패로 기록·알리고, 대기 시간 동안 자동 요청을 막는다(수동 force는 허용)', async () => {
    const refill = ctx.app.get(RefillService);
    await refill.requestIfNeeded({ reason: '테스트' });
    pipeline.setJob({ status: 'rejected', error: '검수 불합격' });

    await refill.poll();

    const failed = await ctx.prisma.contentRefillRequest.findFirstOrThrow();
    expect(failed).toMatchObject({ status: 'FAILED', error: '검수 불합격' });
    expect(alerts.join('\n')).toContain('동화 보충 실패');
    expect((await refill.requestIfNeeded({ reason: '재시도' })).status).toBe(
      'COOLDOWN',
    );
    expect(
      (await refill.requestIfNeeded({ reason: '수동', force: true })).status,
    ).toBe('REQUESTED');
  });

  it('생성 성공 후 책이 이미 DB에 있으면(콜백 응답만 끊긴 경우) 상태 확인이 보충을 완료한다', async () => {
    const refill = ctx.app.get(RefillService);
    const outcome = await refill.requestIfNeeded({ reason: '테스트' });
    if (outcome.status !== 'REQUESTED') throw new Error(outcome.status);
    await deliver(book, { job: 'other-job', key: 'other-job:folkency-5747' });
    pipeline.setJob({
      status: 'succeeded',
      delivery: { status: 'delivered' },
      result: { books: [{ id: 'folkency-5747' }] },
    });

    await refill.poll();

    expect(
      await ctx.prisma.contentRefillRequest.findFirstOrThrow(),
    ).toMatchObject({ status: 'COMPLETED' });
  });
});
