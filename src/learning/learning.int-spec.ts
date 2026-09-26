import request from 'supertest';
import type TestAgent from 'supertest/lib/agent';
import { todayKst } from '../common/utils/kst-date.util';
import { BookContent } from '../content/interfaces/book-content.interface';
import { ProgressService } from './progress.service';
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

// PNG 시그니처 + 임의 바이트(서버는 형식만 판별하고 이미지를 해석하지 않음)
const PNG = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.from('cover-image'),
]);

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

  /** 읽기·이해 질문·순서 맞추기를 모두 맞혀 제목 짓기 단계로 */
  async function advanceToTitle(agent: TestAgent, assignmentId: number) {
    const { body: today } = await agent.get('/sessions/today');
    const { choices, ordering } = await bookData(today.book.id);
    await readAllPages(agent, assignmentId);
    for (const question of choices) {
      await agent
        .post(`/assignments/${assignmentId}/questions/${question.id}/attempts`)
        .send({ answer: question.correctAnswer })
        .expect(201);
    }
    const res = await agent
      .post(`/assignments/${assignmentId}/ordering/attempts`)
      .send({ order: ordering.correctAnswer })
      .expect(201);
    expect(res.body.stage).toBe('TITLE');
  }

  async function advanceToReflection(agent: TestAgent, assignmentId: number) {
    await advanceToTitle(agent, assignmentId);
    await agent
      .put(`/assignments/${assignmentId}/title`)
      .send({ title: '나의 책' })
      .expect(200);
    await agent
      .post(`/assignments/${assignmentId}/drawing`)
      .attach('image', PNG, 'cover.png')
      .expect(201);
  }

  it('제목 짓기 → 표지 그림 → 설명 말하기 → 완료·스탬프 적립 → DONE·스탬프 조회', async () => {
    const { agent, studentId } = await loginAsNewStudent(ctx.app, 'maker01');
    const { assignmentId: id } = await startToday(agent);

    // 단계 전에는 거절
    await agent
      .put(`/assignments/${id}/title`)
      .send({ title: '책' })
      .expect(409);
    await agent
      .post(`/assignments/${id}/drawing`)
      .attach('image', PNG, 'cover.png')
      .expect(409);
    await agent
      .post(`/assignments/${id}/reflection`)
      .send({ transcript: '안녕', durationMs: 1000 })
      .expect(409);

    await advanceToTitle(agent, id);

    // 1) 제목 짓기: 앞뒤 공백 제거, 1~50자
    await agent
      .put(`/assignments/${id}/title`)
      .send({ title: '   ' })
      .expect(400);
    await agent
      .put(`/assignments/${id}/title`)
      .send({ title: '가'.repeat(51) })
      .expect(400);
    expect(
      (
        await agent
          .put(`/assignments/${id}/title`)
          .send({ title: '  호랑이와 나무꾼  ' })
          .expect(200)
      ).body,
    ).toEqual({ title: '호랑이와 나무꾼', stage: 'DRAWING' });
    await agent
      .put(`/assignments/${id}/title`)
      .send({ title: '다시' })
      .expect(409);

    // 2) 표지 그림: 파일 시그니처로 PNG/WebP만, 2MB 이하
    await agent.post(`/assignments/${id}/drawing`).expect(400);
    await agent
      .post(`/assignments/${id}/drawing`)
      .attach(
        'image',
        Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]),
        'fake.png',
      )
      .expect(400);
    await agent
      .post(`/assignments/${id}/drawing`)
      .attach(
        'image',
        Buffer.concat([PNG, Buffer.alloc(2 * 1024 * 1024)]),
        'big.png',
      )
      .expect(413);
    const drawing = (
      await agent
        .post(`/assignments/${id}/drawing`)
        .attach('image', PNG, 'cover.png')
        .expect(201)
    ).body;
    expect(drawing.stage).toBe('REFLECTION');
    expect(drawing.imageUrl).toMatch(
      new RegExp(`/files/drawings/${id}/[0-9a-f-]{36}\\.png$`),
    );
    const file = await agent
      .get(new URL(drawing.imageUrl).pathname)
      .expect(200);
    expect(file.headers['content-type']).toBe('image/png');
    expect(Buffer.compare(file.body as Buffer, PNG)).toBe(0);

    const midway = (await agent.get('/sessions/today').expect(200)).body;
    expect(midway.steps.map((step: { status: string }) => step.status)).toEqual(
      ['DONE', 'DONE', 'DONE', 'DONE', 'DONE', 'CURRENT'],
    );

    // 3) 설명 말하기: 빈 글은 422(단계 유지), 2분 초과는 400, 저장하면 완료 + 스탬프
    await agent
      .post(`/assignments/${id}/reflection`)
      .send({ transcript: '  ', durationMs: 1000 })
      .expect(422);
    await agent
      .post(`/assignments/${id}/reflection`)
      .send({ transcript: '호랑이', durationMs: 120_001 })
      .expect(400);
    const done = (
      await agent
        .post(`/assignments/${id}/reflection`)
        .send({
          transcript: ' 호랑이가 나무꾼을 형님이라고 불렀어요. ',
          durationMs: 42000,
        })
        .expect(201)
    ).body;
    expect(done).toEqual({
      transcript: '호랑이가 나무꾼을 형님이라고 불렀어요.',
      stage: 'COMPLETED',
      completed: true,
      stampsEarned: expect.any(Number),
      stampTotal: done.stampsEarned,
    });
    expect([1, 2]).toContain(done.stampsEarned);
    await agent
      .post(`/assignments/${id}/reflection`)
      .send({ transcript: '또', durationMs: 1000 })
      .expect(409);

    const saved = await ctx.prisma.bookAssignment.findUniqueOrThrow({
      where: { id },
      include: {
        progress: true,
        stamp: true,
        drawing: { include: { reflection: true } },
      },
    });
    expect(saved).toMatchObject({
      status: 'COMPLETED',
      studentTitle: '호랑이와 나무꾼',
      progress: { currentStage: 'COMPLETED' },
      stamp: { studentId, amount: done.stampsEarned },
      drawing: { reflection: { durationMs: 42000 } },
    });
    expect(saved.completedAt).toBeInstanceOf(Date);

    // 4) 오솔길은 DONE(보물상자 연출용 스탬프 수), 스탬프 합계 조회
    expect((await agent.get('/sessions/today').expect(200)).body).toEqual({
      type: 'DONE',
      completedBook: { assignmentId: id, title: '호랑이와 나무꾼' },
      stampsEarned: done.stampsEarned,
    });
    expect((await agent.get('/students/me/stamps').expect(200)).body).toEqual({
      total: done.stampsEarned,
    });
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
    await parent.get('/students/me/stamps').expect(403);
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

  it('동시 요청: 설명 말하기 3회 → 완료·스탬프 1번만, 2개 당첨이면 합계에 2개', async () => {
    const { agent, studentId } = await loginAsNewStudent(ctx.app, 'kid04');
    const { assignmentId } = await startToday(agent);
    await advanceToReflection(agent, assignmentId);

    const progress = ctx.app.get(ProgressService);
    progress.random = () => 0; // 2개 당첨
    try {
      const results = await Promise.all(
        Array.from({ length: 3 }, (_, n) =>
          agent
            .post(`/assignments/${assignmentId}/reflection`)
            .send({ transcript: `설명 ${n}`, durationMs: 1000 }),
        ),
      );
      expect(results.map((res) => res.status).sort()).toEqual([201, 409, 409]);
      const winner = results.find((res) => res.status === 201)!.body;
      expect(winner).toMatchObject({ stampsEarned: 2, stampTotal: 2 });
    } finally {
      progress.random = Math.random;
    }
    expect(await ctx.prisma.studentStamp.count({ where: { studentId } })).toBe(
      1,
    );
    expect(await ctx.prisma.drawingReflection.count()).toBe(1);
    expect((await agent.get('/students/me/stamps')).body).toEqual({ total: 2 });
  });
});
