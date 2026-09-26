import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import request from 'supertest';
import type TestAgent from 'supertest/lib/agent';
import { AppModule } from '../app.module';
import { configureApp } from '../app.setup';
import { ContentImportService } from '../content/content-import.service';
import { ImportBook } from '../content/interfaces/import-book.interface';
import { PrismaContentRepository } from '../content/repositories/prisma-content.repository';
import { PrismaService } from '../prisma/prisma.service';

const SEED_DIR = join(__dirname, '../../prisma/seed/books');

export interface TestContext {
  app: INestApplication;
  prisma: PrismaService;
  close: () => Promise<void>;
}

/**
 * 실제 서버와 같은 설정(세션·검증)으로 앱을 띄웁니다.
 * overrides로 외부 연동(Typecast 등)만 가짜로 바꿀 수 있습니다.
 */
export async function createTestApp(
  overrides: [token: symbol | string, value: unknown][] = [],
): Promise<TestContext> {
  let builder = Test.createTestingModule({ imports: [AppModule] });
  for (const [token, value] of overrides) {
    builder = builder.overrideProvider(token).useValue(value);
  }
  const moduleRef = await builder.compile();
  const app = moduleRef.createNestApplication();
  const store = configureApp(app);
  await app.init();
  return {
    app,
    prisma: app.get(PrismaService),
    close: async () => {
      await app.close();
      store.close();
    },
  };
}

/** 마이그레이션 기록을 뺀 모든 테이블을 비웁니다 */
export async function resetDatabase(prisma: PrismaService): Promise<void> {
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  const list = tables
    .map(({ tablename }) => `"public"."${tablename}"`)
    .join(', ');
  await prisma.$executeRawUnsafe(
    `TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`,
  );
}

/** 개발용 시드 동화를 적재합니다(실제 적재 로직 사용) */
export async function seedDevBooks(prisma: PrismaService): Promise<void> {
  const importer = new ContentImportService(
    new PrismaContentRepository(prisma),
  );
  for (const file of (await readdir(SEED_DIR)).filter((name) =>
    name.endsWith('.json'),
  )) {
    const book = JSON.parse(
      await readFile(join(SEED_DIR, file), 'utf8'),
    ) as ImportBook;
    const result = await importer.importBook(book);
    if (result.status === 'INVALID')
      throw new Error(`${file}: ${result.errors.join(', ')}`);
  }
}

/** 학생 가입 후 로그인한 에이전트(쿠키 유지) */
export async function loginAsNewStudent(
  app: INestApplication,
  loginId: string,
) {
  const agent: TestAgent = request.agent(app.getHttpServer());
  const signup = await agent.post('/auth/signup/student').send({
    name: '테스트',
    loginId,
    password: 'password123',
    age: 8,
    guardianShareAgreed: true,
  });
  if (signup.status !== 201) throw new Error(`signup failed: ${signup.status}`);
  await agent
    .post('/auth/login')
    .send({ role: 'STUDENT', loginId, password: 'password123' })
    .expect(200);
  return {
    agent,
    studentId: signup.body.id as number,
    studentCode: signup.body.studentCode as string,
  };
}
