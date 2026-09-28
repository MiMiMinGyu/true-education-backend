import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { todayKst } from '../common/utils/kst-date.util';
import {
  createTestApp,
  loginAsNewStudent,
  resetDatabase,
  TestContext,
} from '../test-utils/integration';
import { ContentImportService } from './content-import.service';
import { PrismaContentRepository } from './repositories/prisma-content.repository';
import { convertAiStory } from './utils/ai-story.converter';

describe('AI 동화 적재 → 학습 (통합)', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await createTestApp();
  });

  beforeEach(async () => {
    await resetDatabase(ctx.prisma);
  });

  afterAll(async () => {
    await ctx.close();
  });

  it('AI가 나눈 쪽 그대로 읽고, 문제가 없는 책은 읽기 뒤 제목 짓기로 넘어간다', async () => {
    const converted = convertAiStory(
      JSON.parse(
        await readFile(
          join(__dirname, '../../prisma/seed/ai/good-brothers.json'),
          'utf8',
        ),
      ),
    );
    if (converted.status !== 'OK') throw new Error(JSON.stringify(converted));
    const importer = new ContentImportService(
      new PrismaContentRepository(ctx.prisma),
    );
    await expect(importer.importBook(converted.book)).resolves.toMatchObject({
      status: 'CREATED',
    });

    const kid = await loginAsNewStudent(ctx.app, 'kid01');
    const { body: today } = await kid.agent.get('/sessions/today').expect(200);
    expect(today).toMatchObject({
      type: 'LEARNING',
      book: { title: '의좋은 형제' },
      stage: 'READING',
    });
    expect(today.steps.map((s: { key: string }) => s.key)).toEqual([
      'READING',
      'TITLE',
      'DRAWING',
      'REFLECTION',
    ]);

    const { body: reading } = await kid.agent
      .get(`/assignments/${today.assignmentId}/reading`)
      .expect(200);
    expect(reading.totalPages).toBe(6);
    expect(
      reading.pages.map((p: { lines: unknown[] }) => p.lines.length),
    ).toEqual([2, 2, 2, 2, 2, 2]);

    let stage = '';
    for (const page of reading.pages as {
      page: number;
      lines: { id: string; speaker: string }[];
    }[]) {
      const { body } = await kid.agent
        .post(`/assignments/${today.assignmentId}/reading/pages/${page.page}`)
        .send({
          lines: page.lines
            .filter((line) => line.speaker === 'STUDENT')
            .map((line) => ({ lineId: line.id, durationMs: 3000 })),
        })
        .expect(200);
      stage = body.stage;
    }
    expect(stage).toBe('TITLE');

    // 학생 줄 6개(쪽마다 두 번째 줄)의 음절이 오늘 기록에 더해짐
    const session = await ctx.prisma.learningSession.findFirstOrThrow({
      where: { bookAssignmentId: today.assignmentId },
    });
    expect(session.readingDurationMs).toBe(6 * 3000);
    expect(session.sessionDate.toISOString().slice(0, 10)).toBe(todayKst());
  });

  it('기준 형식(금도끼은도끼): 문제·정답 설명·제목 힌트·출처가 적재되고, 설명은 문제가 끝난 뒤에만 나간다', async () => {
    const converted = convertAiStory(
      JSON.parse(
        await readFile(
          join(__dirname, '../../prisma/seed/ai/folkency-5747.json'),
          'utf8',
        ),
      ),
    );
    if (converted.status !== 'OK') throw new Error(JSON.stringify(converted));
    await new ContentImportService(
      new PrismaContentRepository(ctx.prisma),
    ).importBook(converted.book);

    const book = await ctx.prisma.book.findUniqueOrThrow({
      where: { externalId: 'folkency-5747' },
      include: { questions: { orderBy: { questionOrder: 'asc' } } },
    });
    expect(book.sourceUrl).toContain('folkency.nfm.go.kr');
    expect(book.titleHints).toHaveLength(3);
    expect(book.sourceMeta).toMatchObject({ model: 'exaone4.0-edit:32b' });
    expect(book.questions.map((q) => [q.externalKey, q.stage])).toEqual([
      ['q1', 'WHO'],
      ['q2', 'WHAT'],
      ['q3', 'WHY'],
      ['q4', 'EMOTION'],
      ['ORDER', 'ORDER'],
    ]);

    const kid = await loginAsNewStudent(ctx.app, 'kid02');
    const { body: today } = await kid.agent.get('/sessions/today').expect(200);
    const id = today.assignmentId as number;
    const { body: reading } = await kid.agent.get(`/assignments/${id}/reading`);
    for (const page of reading.pages as {
      page: number;
      lines: { id: string; speaker: string }[];
    }[]) {
      await kid.agent
        .post(`/assignments/${id}/reading/pages/${page.page}`)
        .send({
          lines: page.lines
            .filter((line) => line.speaker === 'STUDENT')
            .map((line) => ({ lineId: line.id, durationMs: 3000 })),
        })
        .expect(200);
    }

    // 제목 힌트는 제목 짓기 단계 전에는 조회할 수 없음
    await kid.agent.get(`/assignments/${id}/title`).expect(409);

    const { body: questions } = await kid.agent
      .get(`/assignments/${id}/questions`)
      .expect(200);
    expect(JSON.stringify(questions)).not.toContain('explanation');
    const [q1, q2, q3, q4] = questions as { questionId: number }[];

    // 1차 오답: 힌트만, 설명 없음 / 2차 오답(끝): 정답 + 설명
    const wrong1 = await kid.agent
      .post(`/assignments/${id}/questions/${q1.questionId}/attempts`)
      .send({ answer: 0 })
      .expect(201);
    expect(wrong1.body.hint).toBeDefined();
    expect(wrong1.body.explanation).toBeUndefined();
    const wrong2 = await kid.agent
      .post(`/assignments/${id}/questions/${q1.questionId}/attempts`)
      .send({ answer: 1 })
      .expect(201);
    expect(wrong2.body).toMatchObject({
      finished: true,
      answer: 2,
      explanation: '이야기의 첫 문장에 나무꾼이 살았다고 나와 있어요.',
    });
    // 정답: 설명
    const right = await kid.agent
      .post(`/assignments/${id}/questions/${q2.questionId}/attempts`)
      .send({ answer: 0 })
      .expect(201);
    expect(right.body.explanation).toContain('도끼를 빠뜨린');

    // 이어하기 조회: 끝난 문제만 설명
    const { body: again } = await kid.agent.get(`/assignments/${id}/questions`);
    expect(again[0].state.explanation).toBeDefined();
    expect(again[2].state.explanation).toBeUndefined();

    for (const [question, answer] of [
      [q3, 1],
      [q4, 1],
    ] as const) {
      await kid.agent
        .post(`/assignments/${id}/questions/${question.questionId}/attempts`)
        .send({ answer })
        .expect(201);
    }
    await kid.agent
      .post(`/assignments/${id}/ordering/attempts`)
      .send({ order: ['e1', 'e2', 'e3', 'e4'] })
      .expect(201);

    const { body: title } = await kid.agent
      .get(`/assignments/${id}/title`)
      .expect(200);
    expect(title).toEqual({
      originalTitle: '금도끼은도끼',
      hintQuestions: [
        '이야기의 주인공은 누구일까요?',
        '주인공이 어떤 일을 겪었나요?',
        '이야기의 결말은 어떻게 되었나요?',
      ],
    });
  });
});
