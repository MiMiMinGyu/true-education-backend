import request from 'supertest';
import type TestAgent from 'supertest/lib/agent';
import { todayKst } from '../common/utils/kst-date.util';
import { BookContent } from '../content/interfaces/book-content.interface';
import {
  createTestApp,
  loginAsNewStudent,
  resetDatabase,
  seedDevBooks,
  TestContext,
} from '../test-utils/integration';

const DAY_MS = 24 * 60 * 60 * 1000;
const dateColumn = (daysAgo: number) =>
  new Date(
    `${todayKst(new Date(Date.now() - daysAgo * DAY_MS))}T00:00:00.000Z`,
  );

interface PageLine {
  id: string;
  speaker: 'YEOUL' | 'STUDENT';
}

describe('학습 흐름 (통합)', () => {
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

  async function startToday(agent: TestAgent) {
    const res = await agent.get('/sessions/today').expect(200);
    return res.body as {
      assignmentId: number;
      book: { id: number };
      totalPages: number;
    };
  }

  async function bookData(bookId: number) {
    const book = await ctx.prisma.book.findUniqueOrThrow({
      where: { id: bookId },
      include: { questions: { orderBy: { questionOrder: 'asc' } } },
    });
    const syllables = new Map(
      (book.content as unknown as BookContent).paragraphs
        .flatMap((paragraph) => paragraph.lines)
        .map((line) => [line.id, line.syllableCount]),
    );
    return {
      syllables,
      choices: book.questions.filter((q) => q.questionFormat === 'CHOICE'),
      ordering: book.questions.find((q) => q.questionFormat === 'ORDERING')!,
    };
  }

  async function readAllPages(agent: TestAgent, assignmentId: number) {
    const { body } = await agent
      .get(`/assignments/${assignmentId}/reading`)
      .expect(200);
    for (const page of body.pages as { page: number; lines: PageLine[] }[]) {
      await agent
        .post(`/assignments/${assignmentId}/reading/pages/${page.page}`)
        .send({ lines: [] })
        .expect(200);
    }
  }

  it('오늘의 학습 → 번갈아 읽기 → 이해 질문 → 순서 맞추기 전체 흐름', async () => {
    const { agent } = await loginAsNewStudent(ctx.app, 'kid01');

    // 1) 오늘의 학습: 새 책 배정, 다시 조회해도 같은 배정
    const today = (await agent.get('/sessions/today').expect(200)).body;
    expect(today).toMatchObject({
      type: 'LEARNING',
      stage: 'READING',
      savedPages: 0,
    });
    expect(today.steps[0]).toMatchObject({
      key: 'READING',
      label: '번갈아 읽기',
      status: 'CURRENT',
    });
    expect(today.steps.map((step: { key: string }) => step.key)).toEqual([
      'READING',
      'QUESTION',
      'ORDERING',
      'TITLE',
      'DRAWING',
      'REFLECTION',
    ]);
    const id: number = today.assignmentId;
    expect((await agent.get('/sessions/today')).body.assignmentId).toBe(id);
    const data = await bookData(today.book.id);

    // 2) 번갈아 읽기
    const reading = (await agent.get(`/assignments/${id}/reading`).expect(200))
      .body;
    const pages = reading.pages as { page: number; lines: PageLine[] }[];
    expect(reading).toMatchObject({
      totalPages: today.totalPages,
      savedPages: 0,
    });
    expect(pages[0].lines.map((line) => line.speaker)).toEqual([
      'YEOUL',
      'STUDENT',
      'YEOUL',
    ]);
    expect(pages[0].lines[0]).not.toHaveProperty('syllableCount');

    // 건너뛰기 불가
    await agent
      .post(`/assignments/${id}/reading/pages/2`)
      .send({ lines: [] })
      .expect(409);

    let expectedSyllables = 0;
    let expectedMs = 0;
    for (const page of pages) {
      const studentLines = page.lines.filter(
        (line) => line.speaker === 'STUDENT',
      );
      const yeoulLine = page.lines.find((line) => line.speaker === 'YEOUL')!;
      let lines;
      if (page.page === 1) {
        // 여울이 줄과 이상치(300ms 미만)는 집계에서 빠진다
        lines = [
          { lineId: yeoulLine.id, durationMs: 2000 },
          ...studentLines.map((line) => ({ lineId: line.id, durationMs: 100 })),
        ];
      } else {
        // 같은 줄을 두 번 보내도 한 번만 센다
        lines = [...studentLines, ...studentLines].map((line) => ({
          lineId: line.id,
          durationMs: 2000,
        }));
        for (const line of studentLines) {
          expectedSyllables += data.syllables.get(line.id)!;
          expectedMs += 2000;
        }
      }
      const res = await agent
        .post(`/assignments/${id}/reading/pages/${page.page}`)
        .send({ lines })
        .expect(200);
      const isLast = page.page === pages.length;
      expect(res.body).toEqual({
        savedPages: page.page,
        totalPages: pages.length,
        stage: isLast ? 'QUESTION' : 'READING',
      });
      if (page.page === 1) {
        // 이미 저장한 페이지를 다시 보내면 상태만 돌려준다(중복 집계 없음)
        const again = await agent
          .post(`/assignments/${id}/reading/pages/1`)
          .send({
            lines: studentLines.map((line) => ({
              lineId: line.id,
              durationMs: 2000,
            })),
          })
          .expect(200);
        expect(again.body.savedPages).toBe(1);
      }
    }
    const session = await ctx.prisma.learningSession.findFirstOrThrow({
      where: { bookAssignmentId: id },
    });
    expect(session.readSyllableCount).toBe(expectedSyllables);
    expect(session.readingDurationMs).toBe(expectedMs);
    await agent
      .post(`/assignments/${id}/reading/pages/1`)
      .send({ lines: [] })
      .expect(409);

    // 3) 이해 질문
    const questions = (
      await agent.get(`/assignments/${id}/questions`).expect(200)
    ).body;
    expect(questions).toHaveLength(4);
    expect(JSON.stringify(questions)).not.toMatch(
      /correctAnswer|evidence|"hint"|"answer"/,
    );
    const [q1, q2, q3, q4] = data.choices;
    const correct = (q: (typeof data.choices)[number]) =>
      q.correctAnswer as number;
    const wrong = (q: (typeof data.choices)[number]) =>
      (correct(q) + 1) % (q.options as string[]).length;
    const submit = (q: (typeof data.choices)[number], answer: number) =>
      agent
        .post(`/assignments/${id}/questions/${q.id}/attempts`)
        .send({ answer, responseTimeMs: 3000 });

    expect((await submit(q1, correct(q1)).expect(201)).body).toEqual({
      correct: true,
      finished: true,
      stage: 'QUESTION',
    });
    const firstWrong = (await submit(q2, wrong(q2)).expect(201)).body;
    expect(firstWrong).toMatchObject({
      correct: false,
      finished: false,
      stage: 'QUESTION',
    });
    expect(typeof firstWrong.hint).toBe('string');
    expect(firstWrong).not.toHaveProperty('answer');
    // 재접속해도 1차 오답 힌트를 이어서 보여 준다
    const resumed = (await agent.get(`/assignments/${id}/questions`)).body;
    expect(resumed[1].state).toEqual({
      attempts: 1,
      finished: false,
      hint: firstWrong.hint,
    });
    expect((await submit(q2, correct(q2)).expect(201)).body).toEqual({
      correct: true,
      finished: true,
      stage: 'QUESTION',
    });
    await submit(q3, wrong(q3)).expect(201);
    expect((await submit(q3, wrong(q3)).expect(201)).body).toEqual({
      correct: false,
      finished: true,
      answer: correct(q3),
      stage: 'QUESTION',
    });
    await submit(q3, correct(q3)).expect(409);
    await submit(q4, 99).expect(400);
    expect((await submit(q4, correct(q4)).expect(201)).body.stage).toBe(
      'ORDERING',
    );
    const attemptNumbers = await ctx.prisma.questionAttempt.findMany({
      where: { bookAssignmentId: id, questionId: q3.id },
      orderBy: { attemptNumber: 'asc' },
    });
    expect(attemptNumbers.map((attempt) => attempt.attemptNumber)).toEqual([
      1, 2,
    ]);

    // 4) 순서 맞추기
    const answer = data.ordering.correctAnswer as string[];
    const ordering = (
      await agent.get(`/assignments/${id}/ordering`).expect(200)
    ).body;
    expect(ordering.cards.map((card: { id: string }) => card.id)).not.toEqual(
      answer,
    );
    expect(ordering.state).toEqual({
      attempts: 0,
      remaining: 3,
      finished: false,
    });
    const order = (value: string[]) =>
      agent.post(`/assignments/${id}/ordering/attempts`).send({ order: value });
    await order([answer[0], answer[0], ...answer.slice(2)]).expect(400);
    const reversed = [...answer].reverse();
    expect((await order(reversed).expect(201)).body).toEqual({
      correct: false,
      finished: false,
      remaining: 2,
      stage: 'ORDERING',
    });
    expect((await order(reversed).expect(201)).body.remaining).toBe(1);
    expect((await order(reversed).expect(201)).body).toEqual({
      correct: false,
      finished: true,
      answer,
      stage: 'TITLE',
    });
    await order(answer).expect(409);

    // 5) 오솔길에 진행 상태 반영
    const after = (await agent.get('/sessions/today').expect(200)).body;
    expect(after).toMatchObject({
      assignmentId: id,
      stage: 'TITLE',
      savedPages: after.totalPages,
    });
    expect(after.steps.map((step: { status: string }) => step.status)).toEqual([
      'DONE',
      'DONE',
      'DONE',
      'CURRENT',
      'LOCKED',
      'LOCKED',
    ]);
  });

  it('접근 제어: 비로그인 401, 보호자 403, 다른 학생 403, 없는 배정 404, 단계 전 409', async () => {
    await request(ctx.app.getHttpServer()).get('/sessions/today').expect(401);

    const owner = await loginAsNewStudent(ctx.app, 'owner01');
    const { assignmentId } = await startToday(owner.agent);

    const parent = request.agent(ctx.app.getHttpServer());
    await parent
      .post('/auth/signup/parent')
      .send({
        name: '보호자',
        loginId: 'parent01',
        password: 'password123',
        studentCode: owner.studentCode,
        termsAgreed: true,
        marketingAgreed: false,
        guardianConsentAgreed: true,
      })
      .expect(201);
    await parent
      .post('/auth/login')
      .send({ role: 'PARENT', loginId: 'parent01', password: 'password123' })
      .expect(200);
    await parent.get('/sessions/today').expect(403);
    await parent.get(`/assignments/${assignmentId}/reading`).expect(403);

    const other = await loginAsNewStudent(ctx.app, 'other01');
    await other.agent.get(`/assignments/${assignmentId}/reading`).expect(403);
    await other.agent.get('/assignments/999999/reading').expect(404);

    await owner.agent.get(`/assignments/${assignmentId}/questions`).expect(409);
    await owner.agent.get(`/assignments/${assignmentId}/ordering`).expect(409);
    await owner.agent
      .post(`/assignments/${assignmentId}/ordering/attempts`)
      .send({ order: ['e1', 'e2'] })
      .expect(409);
    await owner.agent
      .post(`/assignments/${assignmentId}/reading/pages/1`)
      .send({ lines: [{ lineId: 'x', durationMs: -1 }] })
      .expect(400);
  });

  it('오늘 1권 완료 → DONE(스탬프 수 포함), 어제 완료 → 새 책, 읽을 책이 없으면 NO_BOOK', async () => {
    const { agent, studentId } = await loginAsNewStudent(ctx.app, 'kid02');
    const first = await startToday(agent);

    const complete = async (
      assignmentId: number,
      completedDaysAgo: number,
      startedDaysAgo: number,
      amount: number,
    ) => {
      await ctx.prisma.bookAssignment.update({
        where: { id: assignmentId },
        data: {
          status: 'COMPLETED',
          completedAt: new Date(Date.now() - completedDaysAgo * DAY_MS),
          startDate: dateColumn(startedDaysAgo),
          progress: { update: { currentStage: 'COMPLETED' } },
          stamp: { create: { studentId, amount } },
        },
      });
    };

    await complete(first.assignmentId, 0, 0, 2);
    expect((await agent.get('/sessions/today').expect(200)).body).toEqual({
      type: 'DONE',
      completedBook: {
        assignmentId: first.assignmentId,
        title: expect.any(String),
      },
      stampsEarned: 2,
    });

    // 어제 끝낸 것으로 바꾸면 오늘은 새 책(다른 책)이 배정된다
    await ctx.prisma.bookAssignment.update({
      where: { id: first.assignmentId },
      data: {
        completedAt: new Date(Date.now() - DAY_MS),
        startDate: dateColumn(1),
      },
    });
    const second = await startToday(agent);
    expect(second.assignmentId).not.toBe(first.assignmentId);
    expect(second.book.id).not.toBe(first.book.id);

    // 시드 2권을 모두 받았으므로 더 배정할 책이 없다
    await complete(second.assignmentId, 1, 2, 1);
    await ctx.prisma.bookAssignment.update({
      where: { id: first.assignmentId },
      data: {
        startDate: dateColumn(3),
        completedAt: new Date(Date.now() - 2 * DAY_MS),
      },
    });
    expect((await agent.get('/sessions/today').expect(200)).body).toEqual({
      type: 'NO_BOOK',
    });
  });

  it('동시 요청: 오늘의 학습 5회 → 배정 1건, 같은 페이지 5회 → 1번만 집계, 같은 문제 3회 → 2회까지만 기록', async () => {
    const { agent, studentId } = await loginAsNewStudent(ctx.app, 'kid03');

    const todays = await Promise.all(
      Array.from({ length: 5 }, () => agent.get('/sessions/today')),
    );
    expect(todays.map((res) => res.status)).toEqual([200, 200, 200, 200, 200]);
    const ids = new Set(todays.map((res) => res.body.assignmentId));
    expect(ids.size).toBe(1);
    const [assignmentId] = [...ids] as number[];
    expect(
      await ctx.prisma.bookAssignment.count({ where: { studentId } }),
    ).toBe(1);
    expect(
      await ctx.prisma.learningSession.count({
        where: { bookAssignmentId: assignmentId },
      }),
    ).toBe(1);

    const { body: reading } = await agent.get(
      `/assignments/${assignmentId}/reading`,
    );
    const studentLine = (reading.pages[0].lines as PageLine[]).find(
      (line) => line.speaker === 'STUDENT',
    )!;
    const pageSaves = await Promise.all(
      Array.from({ length: 5 }, () =>
        agent
          .post(`/assignments/${assignmentId}/reading/pages/1`)
          .send({ lines: [{ lineId: studentLine.id, durationMs: 2000 }] }),
      ),
    );
    expect(pageSaves.map((res) => res.status)).toEqual([
      200, 200, 200, 200, 200,
    ]);
    const { syllables, choices } = await bookData(todays[0].body.book.id);
    const session = await ctx.prisma.learningSession.findFirstOrThrow({
      where: { bookAssignmentId: assignmentId },
    });
    expect(session.readSyllableCount).toBe(syllables.get(studentLine.id));
    expect(session.readingDurationMs).toBe(2000);

    // 나머지 페이지를 읽고 이해 질문으로
    await readAllPages(agent, assignmentId);
    const question = choices[0];
    const wrong =
      ((question.correctAnswer as number) + 1) %
      (question.options as string[]).length;
    const submits = await Promise.all(
      Array.from({ length: 3 }, () =>
        agent
          .post(
            `/assignments/${assignmentId}/questions/${question.id}/attempts`,
          )
          .send({ answer: wrong }),
      ),
    );
    expect(submits.map((res) => res.status).sort()).toEqual([201, 201, 409]);
    const attempts = await ctx.prisma.questionAttempt.findMany({
      where: { bookAssignmentId: assignmentId, questionId: question.id },
      orderBy: { attemptNumber: 'asc' },
    });
    expect(attempts.map((attempt) => attempt.attemptNumber)).toEqual([1, 2]);
  });
});
