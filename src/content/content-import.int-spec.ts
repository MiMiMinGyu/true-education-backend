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
});
