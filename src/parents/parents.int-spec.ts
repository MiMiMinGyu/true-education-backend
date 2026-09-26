import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import request from 'supertest';
import type TestAgent from 'supertest/lib/agent';
import { todayKst } from '../common/utils/kst-date.util';
import { ContentImportService } from '../content/content-import.service';
import { ImportBook } from '../content/interfaces/import-book.interface';
import { PrismaContentRepository } from '../content/repositories/prisma-content.repository';
import {
  createTestApp,
  loginAsNewStudent,
  resetDatabase,
  seedDevBooks,
  TestContext,
} from '../test-utils/integration';

const DAY_MS = 24 * 60 * 60 * 1000;
const PNG = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.from('cover'),
]);

describe('보호자 대시보드·보상 (통합)', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await createTestApp();
  });

  beforeEach(async () => {
    await resetDatabase(ctx.prisma);
    await seedDevBooks(ctx.prisma);
    // 약점 판정(최근 3권)을 보려면 3권이 필요해 시드 1권을 복제해 적재합니다.
    const copy = JSON.parse(
      await readFile(
        join(__dirname, '../../prisma/seed/books/dev-little-bear.json'),
        'utf8',
      ),
    ) as ImportBook;
    await new ContentImportService(
      new PrismaContentRepository(ctx.prisma),
    ).importBook({ ...copy, externalId: 'dev-little-bear-copy' });
  });

  afterAll(async () => {
    await ctx.close();
  });

  async function loginAsLinkedParent(studentCode: string, loginId: string) {
    const agent = request.agent(ctx.app.getHttpServer());
    await agent
      .post('/auth/signup/parent')
      .send({
        name: '보호자',
        loginId,
        password: 'password123',
        studentCode,
        termsAgreed: true,
        marketingAgreed: false,
        guardianConsentAgreed: true,
      })
      .expect(201);
    await agent
      .post('/auth/login')
      .send({ role: 'PARENT', loginId, password: 'password123' })
      .expect(200);
    return agent;
  }

  /**
   * 오늘의 책을 끝까지 풀고, 다음 책을 받을 수 있게 daysAgo일 전에 한 것으로 옮깁니다.
   * wrongFirst에 있는 유형은 1차에 틀린 뒤 맞힙니다. 학생 줄은 한 줄에 2초씩 읽습니다.
   */
  async function completeBook(
    agent: TestAgent,
    daysAgo: number,
    wrongFirst: string[] = [],
  ) {
    const today = (await agent.get('/sessions/today').expect(200)).body;
    const id: number = today.assignmentId;
    const { body: reading } = await agent.get(`/assignments/${id}/reading`);
    for (const page of reading.pages as {
      page: number;
      lines: { id: string; speaker: string }[];
    }[]) {
      await agent
        .post(`/assignments/${id}/reading/pages/${page.page}`)
        .send({
          lines: page.lines
            .filter((line) => line.speaker === 'STUDENT')
            .map((line) => ({ lineId: line.id, durationMs: 2000 })),
        })
        .expect(200);
    }
    const questions = await ctx.prisma.question.findMany({
      where: { bookId: today.book.id },
      orderBy: { questionOrder: 'asc' },
    });
    for (const question of questions.filter(
      (q) => q.questionFormat === 'CHOICE',
    )) {
      const correct = question.correctAnswer as number;
      if (wrongFirst.includes(question.stage)) {
        await agent
          .post(`/assignments/${id}/questions/${question.id}/attempts`)
          .send({
            answer: (correct + 1) % (question.options as string[]).length,
          })
          .expect(201);
      }
      await agent
        .post(`/assignments/${id}/questions/${question.id}/attempts`)
        .send({ answer: correct })
        .expect(201);
    }
    const order = questions.find((q) => q.questionFormat === 'ORDERING')!
      .correctAnswer as string[];
    if (wrongFirst.includes('ORDER')) {
      await agent
        .post(`/assignments/${id}/ordering/attempts`)
        .send({ order: [...order].reverse() })
        .expect(201);
    }
    await agent.post(`/assignments/${id}/ordering/attempts`).send({ order });
    await agent
      .put(`/assignments/${id}/title`)
      .send({ title: `내 책 ${daysAgo}` })
      .expect(200);
    await agent
      .post(`/assignments/${id}/drawing`)
      .attach('image', PNG, 'cover.png')
      .expect(201);
    await agent
      .post(`/assignments/${id}/reflection`)
      .send({ transcript: `설명 ${daysAgo}`, durationMs: 10000 })
      .expect(201);

    const date = todayKst(new Date(Date.now() - daysAgo * DAY_MS));
    await ctx.prisma.bookAssignment.update({
      where: { id },
      data: {
        startDate: new Date(`${date}T00:00:00.000Z`),
        completedAt: new Date(Date.now() - daysAgo * DAY_MS),
        sessions: {
          updateMany: {
            where: {},
            data: { sessionDate: new Date(`${date}T00:00:00.000Z`) },
          },
        },
      },
    });
    return id;
  }

  it('대시보드: 3권 전에는 판정하지 않고, 최근 3권 중 2권 이상 1차 오답 유형은 도움 필요', async () => {
    const kid = await loginAsNewStudent(ctx.app, 'kid10');
    const parent = await loginAsLinkedParent(kid.studentCode, 'parent10');

    expect((await parent.get('/parents/me/students').expect(200)).body).toEqual(
      [{ studentId: kid.studentId, name: '테스트' }],
    );

    const empty = (
      await parent
        .get(`/parents/me/students/${kid.studentId}/dashboard`)
        .expect(200)
    ).body;
    expect(empty).toMatchObject({
      student: { studentId: kid.studentId, name: '테스트' },
      summary: { completedBooks: 0, stampTotal: 0, inProgress: null },
      readingSpeed: [],
      collecting: true,
      collectingMessage: '데이터를 모으고 있어요',
      needsHelp: [],
      comments: [],
      reflections: [],
    });
    expect(empty.byStage.map((s: { status: string }) => s.status)).toEqual(
      Array(5).fill('COLLECTING'),
    );

    await completeBook(kid.agent, 3, ['WHY']);
    await completeBook(kid.agent, 2, ['WHY', 'WHO']);

    const two = (
      await parent.get(`/parents/me/students/${kid.studentId}/dashboard`)
    ).body;
    expect(two.collecting).toBe(true);
    expect(two.needsHelp).toEqual([]);

    const lastId = await completeBook(kid.agent, 1);
    const stampTotal = (
      await ctx.prisma.studentStamp.aggregate({
        where: { studentId: kid.studentId },
        _sum: { amount: true },
      })
    )._sum.amount;

    const full = (
      await parent.get(`/parents/me/students/${kid.studentId}/dashboard`)
    ).body;
    expect(full).toMatchObject({
      summary: { completedBooks: 3, stampTotal, inProgress: null },
      collecting: false,
      needsHelp: ['WHY'],
    });
    expect(full).not.toHaveProperty('collectingMessage');
    const why = full.byStage.find((s: { stage: string }) => s.stage === 'WHY');
    expect(why).toEqual({
      stage: 'WHY',
      label: '왜',
      total: 3,
      firstTryRate: 0.33,
      afterRetryRate: 0.67,
      revealedRate: 0,
      status: 'NEEDS_HELP',
    });
    // 1번만 틀린 WHO는 약점이 아니다(1차 정답 2/3 < 0.8이라 NORMAL)
    expect(
      full.byStage.find((s: { stage: string }) => s.stage === 'WHO').status,
    ).toBe('NORMAL');
    expect(full.comfortable).toEqual(
      expect.arrayContaining(['WHAT', 'EMOTION', 'ORDER']),
    );
    expect(full.comments).toContainEqual({
      stage: 'WHY',
      status: 'NEEDS_HELP',
      text: expect.any(String),
    });
    expect(full.reflections).toHaveLength(3);
    expect(full.reflections[0]).toMatchObject({
      assignmentId: lastId,
      title: '내 책 1',
      transcript: '설명 1',
      durationMs: 10000,
    });
    // 날짜 3개(오름차순), 학생 줄 2초씩 → 음절/분 > 0
    expect(full.readingSpeed).toHaveLength(3);
    expect(full.readingSpeed[0].date < full.readingSpeed[2].date).toBe(true);
    expect(full.readingSpeed[0].syllablesPerMinute).toBeGreaterThan(0);
  });

  it('보상: 5의 배수 목표치만, 달성하면 고치거나 지울 수 없고, 학생은 같은 보상판을 읽기만', async () => {
    const kid = await loginAsNewStudent(ctx.app, 'kid11');
    const parent = await loginAsLinkedParent(kid.studentCode, 'parent11');
    const base = `/parents/me/students/${kid.studentId}/rewards`;

    expect((await parent.get(base).expect(200)).body).toEqual({
      stampsPerReward: 5,
      stampTotal: 0,
      rewards: [],
      nextMilestone: 5,
    });
    await parent.put(`${base}/7`).send({ name: '간식' }).expect(400);
    await parent.put(`${base}/0`).send({ name: '간식' }).expect(400);
    await parent.put(`${base}/5`).send({ name: '   ' }).expect(400);
    expect(
      (await parent.put(`${base}/5`).send({ name: '  간식  ' }).expect(200))
        .body.rewards,
    ).toEqual([{ milestone: 5, name: '간식', achieved: false }]);
    await parent.put(`${base}/10`).send({ name: '공원 가기' }).expect(200);
    await parent.put(`${base}/5`).send({ name: '아이스크림' }).expect(200);
    await kid.agent.put(`${base}/15`).send({ name: '장난감' }).expect(403);

    // 스탬프 5개 적립 → 5번 보상 달성
    const book = await ctx.prisma.book.findFirstOrThrow();
    await ctx.prisma.bookAssignment.create({
      data: {
        studentId: kid.studentId,
        bookId: book.id,
        startDate: new Date('2026-01-01T00:00:00.000Z'),
        status: 'COMPLETED',
        completedAt: new Date(),
        stamp: { create: { studentId: kid.studentId, amount: 5 } },
      },
    });
    const board = {
      stampsPerReward: 5,
      stampTotal: 5,
      rewards: [
        { milestone: 5, name: '아이스크림', achieved: true },
        { milestone: 10, name: '공원 가기', achieved: false },
      ],
      nextMilestone: 10,
    };
    expect(
      (await kid.agent.get('/students/me/rewards').expect(200)).body,
    ).toEqual(board);
    await parent.put(`${base}/5`).send({ name: '바꿈' }).expect(409);
    await parent.delete(`${base}/5`).expect(409);
    await parent.delete(`${base}/15`).expect(204);
    await parent.delete(`${base}/10`).expect(204);
    expect((await parent.get(base)).body.rewards).toEqual([board.rewards[0]]);
  });

  it('접근 제어: 비로그인 401, 학생 403, 연결되지 않은 자녀·없는 학생 403, 잘못된 id 400', async () => {
    await request(ctx.app.getHttpServer())
      .get('/parents/me/students')
      .expect(401);
    const kid = await loginAsNewStudent(ctx.app, 'kid12');
    const other = await loginAsNewStudent(ctx.app, 'kid13');
    const parent = await loginAsLinkedParent(kid.studentCode, 'parent12');

    await kid.agent.get('/parents/me/students').expect(403);
    await kid.agent
      .get(`/parents/me/students/${kid.studentId}/dashboard`)
      .expect(403);
    await parent.get('/students/me/rewards').expect(403);

    await parent
      .get(`/parents/me/students/${other.studentId}/dashboard`)
      .expect(403);
    await parent
      .put(`/parents/me/students/${other.studentId}/rewards/5`)
      .send({ name: '간식' })
      .expect(403);
    await parent.get('/parents/me/students/999999/rewards').expect(403);
    await parent.get('/parents/me/students/abc/dashboard').expect(400);
  });
});
