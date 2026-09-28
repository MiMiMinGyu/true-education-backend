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
    // 영역 판정의 기록 요건(5문제·3세션·3이야기)을 채우려면 5권이 필요해 시드 1권을 3번 복제해 적재합니다.
    const copy = JSON.parse(
      await readFile(
        join(__dirname, '../../prisma/seed/books/dev-little-bear.json'),
        'utf8',
      ),
    ) as ImportBook;
    const importer = new ContentImportService(
      new PrismaContentRepository(ctx.prisma),
    );
    for (const n of [1, 2, 3]) {
      await importer.importBook({ ...copy, externalId: `dev-copy-${n}` });
    }
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
        agreements: [
          'terms',
          'guardianPrivacy',
          'childPrivacy',
          'childSpeech',
          'guardianDashboard',
        ],
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
        attempts: {
          updateMany: {
            where: {},
            data: { answeredAt: new Date(Date.now() - daysAgo * DAY_MS) },
          },
        },
      },
    });
    return id;
  }

  const dashboardOf = async (parent: TestAgent, studentId: number, q = '') =>
    (
      await parent
        .get(`/parents/me/students/${studentId}/dashboard${q}`)
        .expect(200)
    ).body;
  const areaOf = (body: { areas: { id: string }[] }, id: string) =>
    body.areas.find((area) => area.id === id) as Record<string, unknown> & {
      state: string;
      metrics: Record<string, number | null>;
      missingEvidence: string[];
    };

  it('대시보드 v3: 기록 요건 전에는 기록 부족, 5권 완료 후 영역별 판정·문구·묶음, 기간 밖 책은 제외', async () => {
    const kid = await loginAsNewStudent(ctx.app, 'kid10');
    const parent = await loginAsLinkedParent(kid.studentCode, 'parent10');

    // 가입 동의가 항목별로 기록된다(학생 3개, 보호자 필수 5개 중 자녀 관련 3개는 대상 자녀 포함)
    const consents = await ctx.prisma.userConsent.findMany({
      orderBy: { id: 'asc' },
    });
    expect(
      consents.map((c) => [c.subjectType, c.consentKey, c.studentId]),
    ).toEqual([
      ['STUDENT', 'activityRecord', kid.studentId],
      ['STUDENT', 'speechToText', kid.studentId],
      ['STUDENT', 'guardianView', kid.studentId],
      ['PARENT', 'terms', null],
      ['PARENT', 'guardianPrivacy', null],
      ['PARENT', 'childPrivacy', kid.studentId],
      ['PARENT', 'childSpeech', kid.studentId],
      ['PARENT', 'guardianDashboard', kid.studentId],
    ]);

    expect((await parent.get('/parents/me/students').expect(200)).body).toEqual(
      [{ studentId: kid.studentId, name: '테스트' }],
    );

    // 1) 기록 없음: 모든 영역 활동 없음
    const today = todayKst();
    const empty = await dashboardOf(parent, kid.studentId);
    expect(empty).toMatchObject({
      specVersion: '3.0.0',
      policyVersion: 'guardian-observation-2026-09-v1',
      childId: String(kid.studentId),
      availability: 'available',
      period: { endDate: today, timeZone: 'Asia/Seoul' },
      header: {
        title: '테스트의 읽기 기록',
        sessionCount: 0,
        summary: expect.stringContaining('아직 없어요'),
      },
      groups: [
        {
          id: 'notObserved',
          areaIds: ['cause', 'emotion', 'sequence', 'facts', 'gist'],
        },
      ],
      errorCode: null,
      reflections: [],
    });
    expect(empty.period.startDate).toBe(
      todayKst(new Date(Date.now() - 13 * DAY_MS)),
    );

    // 2) 2권: 기록 요건 미달
    await completeBook(kid.agent, 5, ['WHY', 'ORDER']);
    await completeBook(kid.agent, 4, ['WHY', 'ORDER']);
    const two = await dashboardOf(parent, kid.studentId);
    expect(areaOf(two, 'cause')).toMatchObject({
      state: 'insufficientData',
      ruleId: 'insufficient_records',
      missingEvidence: [
        'validQuestionCount',
        'validSessionCount',
        'validStoryCount',
      ],
    });
    expect(areaOf(two, 'gist').state).toBe('notAssessable');

    // 3) 5권: 원인 3/5 첫 오답(3세션) → 함께 연습, 순서 2/5 → 연습하며 관찰, 마음 4/5 → 스스로 해결
    await completeBook(kid.agent, 3, ['WHY']);
    await completeBook(kid.agent, 2, ['EMOTION']);
    const lastId = await completeBook(kid.agent, 1);

    const full = await dashboardOf(parent, kid.studentId);
    expect(full.header).toMatchObject({
      sessionCount: 5,
      summary: '이 기간에 5번의 이야기 시간을 보냈어요.',
    });
    expect(full.areas.map((a: { state: string }) => a.state)).toEqual([
      'needsSupport',
      'supported',
      'practicing',
      'supported',
      'notAssessable',
    ]);
    expect(full.groups).toEqual([
      { id: 'needsSupport', title: '함께 연습해 봐요', areaIds: ['cause'] },
      {
        id: 'practicing',
        title: '연습하며 살펴보고 있어요',
        areaIds: ['sequence'],
      },
      {
        id: 'supported',
        title: '첫 답에서 스스로 해결했어요',
        areaIds: ['emotion', 'facts'],
      },
      {
        id: 'notAssessable',
        title: '아직 판정할 수 없어요',
        areaIds: ['gist'],
      },
    ]);

    const cause = areaOf(full, 'cause');
    expect(cause).toMatchObject({
      ruleId: 'repeated_non_independent',
      observation:
        '원인 이해 5문제 중 3문제는 첫 답에서 도움 없이 정답에 도달하지 못했어요. 어떤 부분을 다시 살펴볼지 함께 찾아봐 주세요.',
      evidenceText:
        '확인한 5문제의 첫 답: 도움 없이 정답 2개, 도움받고 정답 0개, 부분 정답 0개, 오답 3개예요.',
      recoveryTexts: ['첫 답에서 틀린 문제 중 3개는 힌트를 본 뒤 맞혔어요.'],
      reference: { label: '읽기 이해 지도법 더 보기' },
    });
    expect(cause.metrics).toMatchObject({
      validQuestionCount: 5,
      validSessionCount: 5,
      validStoryCount: 5,
      validDayCount: 5,
      nonIndependentSessionCount: 3,
      independentCorrectRate: 0.4,
      scorableCoverage: 1,
    });
    expect(cause.evidenceSessionIds as string[]).toHaveLength(5);
    // 순서 맞추기는 재도전으로 맞히면 "힌트 없이"
    expect(areaOf(full, 'sequence').recoveryTexts).toEqual([
      '첫 답에서 틀린 문제 중 2개는 힌트 없이 다시 풀어 맞혔어요.',
    ]);
    // 인물과 사건 = 누가 + 무슨 일(5권 × 2문제)
    expect(areaOf(full, 'facts').metrics.validQuestionCount).toBe(10);
    expect(full.reflections).toHaveLength(5);
    expect(full.reflections[0]).toMatchObject({
      assignmentId: lastId,
      title: '내 책 1',
      transcript: '설명 1',
      durationMs: 10000,
    });

    // 4) 기간을 좁히면 기간 밖 책은 빠진다(최근 3일 = 2권)
    const recent = await dashboardOf(
      parent,
      kid.studentId,
      `?startDate=${todayKst(new Date(Date.now() - 2 * DAY_MS))}&endDate=${today}`,
    );
    expect(recent.header.sessionCount).toBe(2);
    expect(areaOf(recent, 'cause').state).toBe('insufficientData');

    const base = `/parents/me/students/${kid.studentId}/dashboard`;
    await parent.get(`${base}?startDate=2026-02-30`).expect(400);
    await parent.get(`${base}?startDate=26-09-01`).expect(400);
    await parent
      .get(`${base}?startDate=2026-09-10&endDate=2026-09-01`)
      .expect(400);
  });

  it('보상: 5의 배수 목표치만, 선물한 뒤에는 고치거나 지울 수 없고, 학생은 같은 보상판을 읽기만', async () => {
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
    ).toEqual([{ milestone: 5, name: '간식', achieved: false, givenAt: null }]);
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
        { milestone: 5, name: '아이스크림', achieved: true, givenAt: null },
        { milestone: 10, name: '공원 가기', achieved: false, givenAt: null },
      ],
      nextMilestone: 10,
    };
    expect(
      (await kid.agent.get('/students/me/rewards').expect(200)).body,
    ).toEqual(board);

    // 달성했어도 아직 전하지 않았으면 바꿀 수 있다
    await parent.put(`${base}/5`).send({ name: '간식 먹기' }).expect(200);

    // 선물했어요: 보상이 없거나(15) 스탬프가 모자라면(10) 안 됨
    await parent.put(`${base}/15/given`).expect(404);
    await parent.put(`${base}/10/given`).expect(409);
    await kid.agent.put(`${base}/5/given`).expect(403);
    const given = (await parent.put(`${base}/5/given`).expect(200)).body;
    const givenAt: string = given.rewards[0].givenAt;
    expect(Date.parse(givenAt)).not.toBeNaN();
    // 다시 눌러도 처음 시각 유지, 학생 보상판에도 보임
    expect(
      (await parent.put(`${base}/5/given`).expect(200)).body.rewards[0].givenAt,
    ).toBe(givenAt);
    expect(
      (await kid.agent.get('/students/me/rewards')).body.rewards[0].givenAt,
    ).toBe(givenAt);

    // 선물한 보상은 고치거나 지울 수 없다 → 취소하면 다시 가능
    await parent.put(`${base}/5`).send({ name: '바꿈' }).expect(409);
    await parent.delete(`${base}/5`).expect(409);
    expect(
      (await parent.delete(`${base}/5/given`).expect(200)).body.rewards[0]
        .givenAt,
    ).toBeNull();
    await parent.put(`${base}/5`).send({ name: '바꿈' }).expect(200);

    await parent.delete(`${base}/15`).expect(204);
    await parent.delete(`${base}/10`).expect(204);
    expect((await parent.get(base)).body.rewards).toEqual([
      { milestone: 5, name: '바꿈', achieved: true, givenAt: null },
    ]);
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
