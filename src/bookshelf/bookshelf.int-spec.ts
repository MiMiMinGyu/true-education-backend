import request from 'supertest';
import type TestAgent from 'supertest/lib/agent';
import { todayKst } from '../common/utils/kst-date.util';
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
  Buffer.from('cover-image'),
]);

describe('서재 (통합)', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await createTestApp();
  });

  beforeEach(async () => {
    await resetDatabase(ctx.prisma);
    await seedDevBooks(ctx.prisma);
  });

  afterAll(async () => {
    await ctx.close();
  });

  /** 첫 이해 질문과 순서 맞추기는 한 번 틀린 뒤 맞히고, 나머지는 바로 맞혀 책을 완료합니다 */
  async function completeTodayBook(agent: TestAgent, title: string) {
    const today = (await agent.get('/sessions/today').expect(200)).body;
    const id: number = today.assignmentId;
    const book = await ctx.prisma.book.findUniqueOrThrow({
      where: { id: today.book.id },
      include: { questions: { orderBy: { questionOrder: 'asc' } } },
    });
    const choices = book.questions.filter((q) => q.questionFormat === 'CHOICE');
    const ordering = book.questions.find(
      (q) => q.questionFormat === 'ORDERING',
    )!;

    for (let page = 1; page <= today.totalPages; page++) {
      await agent
        .post(`/assignments/${id}/reading/pages/${page}`)
        .send({ lines: [] })
        .expect(200);
    }
    for (const [index, question] of choices.entries()) {
      const correct = question.correctAnswer as number;
      if (index === 0) {
        const wrong = (correct + 1) % (question.options as string[]).length;
        await agent
          .post(`/assignments/${id}/questions/${question.id}/attempts`)
          .send({ answer: wrong })
          .expect(201);
      }
      await agent
        .post(`/assignments/${id}/questions/${question.id}/attempts`)
        .send({ answer: correct })
        .expect(201);
    }
    const answer = ordering.correctAnswer as string[];
    await agent
      .post(`/assignments/${id}/ordering/attempts`)
      .send({ order: [...answer].reverse() })
      .expect(201);
    await agent
      .post(`/assignments/${id}/ordering/attempts`)
      .send({ order: answer })
      .expect(201);
    await agent.put(`/assignments/${id}/title`).send({ title }).expect(200);
    await agent
      .post(`/assignments/${id}/drawing`)
      .attach('image', PNG, 'cover.png')
      .expect(201);
    await agent
      .post(`/assignments/${id}/reflection`)
      .send({ transcript: `${title} 이야기`, durationMs: 30000 })
      .expect(201);
    return { id, book, choices, ordering };
  }

  it('완료한 책만 최근 완료 순으로, 상세에는 본문·정답·내 시도 기록·제목·표지·설명', async () => {
    const { agent } = await loginAsNewStudent(ctx.app, 'reader01');
    expect((await agent.get('/bookshelf').expect(200)).body).toEqual([]);

    const first = await completeTodayBook(agent, '첫 번째 내 책');

    const [item] = (await agent.get('/bookshelf').expect(200)).body;
    expect(item).toEqual({
      assignmentId: first.id,
      title: '첫 번째 내 책',
      originalTitle: first.book.title,
      coverImageUrl: expect.stringMatching(
        new RegExp(`/files/drawings/${first.id}/.+\\.png$`),
      ),
      completedAt: expect.any(String),
    });

    const detail = (await agent.get(`/bookshelf/${first.id}`).expect(200)).body;
    expect(detail).toMatchObject({
      assignmentId: first.id,
      title: '첫 번째 내 책',
      source: {
        author: first.book.author,
        license: first.book.license,
      },
      reflection: { transcript: '첫 번째 내 책 이야기', durationMs: 30000 },
    });
    expect(detail.pages[0].lines[0].speaker).toBe('YEOUL');
    expect(detail.questions).toHaveLength(first.choices.length);
    const q1 = first.choices[0];
    const q1Correct = q1.correctAnswer as number;
    expect(detail.questions[0]).toMatchObject({
      questionId: q1.id,
      answer: q1Correct,
      attempts: [
        {
          attemptNumber: 1,
          answer: (q1Correct + 1) % (q1.options as string[]).length,
          correct: false,
        },
        { attemptNumber: 2, answer: q1Correct, correct: true },
      ],
    });
    expect(detail.questions[1].attempts).toHaveLength(1);
    const answer = first.ordering.correctAnswer as string[];
    expect(detail.ordering).toMatchObject({
      questionId: first.ordering.id,
      attempts: [
        { attemptNumber: 1, answer: [...answer].reverse(), correct: false },
        { attemptNumber: 2, answer, correct: true },
      ],
    });
    expect(
      detail.ordering.cards.map((card: { id: string }) => card.id),
    ).toEqual(answer);
    expect(JSON.stringify(detail)).not.toMatch(/"hint"|evidence/);

    // 서재 열람은 기록을 바꾸지 않는다
    expect(
      await ctx.prisma.questionAttempt.count({
        where: { bookAssignmentId: first.id },
      }),
    ).toBe(first.choices.length + 1 + 2);

    // 어제 끝낸 것으로 옮기고 오늘 한 권 더 → 최근 완료 순
    await ctx.prisma.bookAssignment.update({
      where: { id: first.id },
      data: {
        completedAt: new Date(Date.now() - DAY_MS),
        startDate: new Date(
          `${todayKst(new Date(Date.now() - DAY_MS))}T00:00:00.000Z`,
        ),
      },
    });
    const second = await completeTodayBook(agent, '두 번째 내 책');
    const shelf = (await agent.get('/bookshelf').expect(200)).body;
    expect(
      shelf.map((book: { assignmentId: number }) => book.assignmentId),
    ).toEqual([second.id, first.id]);
  });

  it('접근 제어: 비로그인 401, 보호자 403, 다른 학생 403, 없는 배정·완료 전 404', async () => {
    await request(ctx.app.getHttpServer()).get('/bookshelf').expect(401);

    const owner = await loginAsNewStudent(ctx.app, 'owner02');
    const { id } = await completeTodayBook(owner.agent, '내 책');

    const other = await loginAsNewStudent(ctx.app, 'other02');
    await other.agent.get(`/bookshelf/${id}`).expect(403);
    await other.agent.get('/bookshelf/999999').expect(404);
    expect((await other.agent.get('/bookshelf').expect(200)).body).toEqual([]);

    // 진행 중인 책은 서재에 없다
    const { body: inProgress } = await other.agent
      .get('/sessions/today')
      .expect(200);
    await other.agent.get(`/bookshelf/${inProgress.assignmentId}`).expect(404);

    const parent = request.agent(ctx.app.getHttpServer());
    await parent
      .post('/auth/signup/parent')
      .send({
        name: '보호자',
        loginId: 'parent02',
        password: 'password123',
        studentCode: owner.studentCode,
        termsAgreed: true,
        marketingAgreed: false,
        guardianConsentAgreed: true,
      })
      .expect(201);
    await parent
      .post('/auth/login')
      .send({ role: 'PARENT', loginId: 'parent02', password: 'password123' })
      .expect(200);
    await parent.get('/bookshelf').expect(403);
    await parent.get(`/bookshelf/${id}`).expect(403);
  });
});
