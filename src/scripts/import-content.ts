// AI 파트 동화 JSON 적재: npm run content:import -- <파일|폴더> [--force] [--dry-run]
// 서버 API(POST /admin/books)와 같은 변환·검증·저장 경로(AiStoryImportService)를 쓰고, 받은 원본과 결과를 content_import_logs에 남깁니다.
// --dry-run: DB에 넣지 않고 변환·검증 결과만 출력합니다. --force: 이미 학생에게 배정된 책도 덮어씁니다(명령줄에서만 가능).
import { Logger, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { readdir, readFile, stat } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import {
  AiStoryImportService,
  type StoryImportResult,
} from '../content-inbox/ai-story-import.service';
import { ContentInboxModule } from '../content-inbox/content-inbox.module';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    ContentInboxModule,
  ],
})
class ImportModule {}

async function jsonFiles(target: string): Promise<string[]> {
  if (!(await stat(target)).isDirectory()) return [target];
  return (await readdir(target))
    .filter((file) => file.endsWith('.json'))
    .sort()
    .map((file) => join(target, file));
}

async function main() {
  const args = process.argv.slice(2);
  const force = args.includes('--force');
  const dryRun = args.includes('--dry-run');
  const target = args.find((arg) => !arg.startsWith('--'));
  if (!target) {
    console.log(
      '사용법: npm run content:import -- <파일|폴더> [--force] [--dry-run]',
    );
    process.exitCode = 1;
    return;
  }

  const files = await jsonFiles(resolve(target));
  if (files.length === 0) {
    console.log(`${target}에 JSON 파일이 없습니다.`);
    return;
  }

  const app = await NestFactory.createApplicationContext(ImportModule, {
    logger: ['error', 'warn'],
  });
  const importer = app.get(AiStoryImportService);
  const results: (StoryImportResult & { file: string })[] = [];

  try {
    for (const path of files) {
      const file = basename(path);
      let raw: unknown;
      try {
        raw = JSON.parse(await readFile(path, 'utf8'));
      } catch (error) {
        results.push({
          file,
          externalId: '-',
          status: 'INVALID',
          summary: null,
          errors: [
            `JSON을 읽지 못했습니다: ${error instanceof Error ? error.message : String(error)}`,
          ],
          warnings: [],
        });
        continue;
      }
      results.push({
        file,
        ...(await importer.importJson(raw, { source: 'CLI', force, dryRun })),
      });
    }
  } finally {
    await app.close();
  }

  for (const result of results) {
    console.log(`[${result.status}] ${result.file} (${result.externalId})`);
    if (result.summary) console.log(`  ! ${result.summary}`);
    result.errors.forEach((text) => console.log(`  ✗ ${text}`));
    result.warnings.forEach((text) => console.log(`  ! ${text}`));
  }
  const count = (status: string) =>
    results.filter((result) => result.status === status).length;
  console.log(
    dryRun
      ? `\n(dry-run: DB에 넣지 않음) 적재 가능 ${count('DRY_RUN')} · 건너뜀 ${count('SKIPPED')} · 실패 ${count('INVALID')}`
      : `\n생성 ${count('CREATED')} · 갱신 ${count('UPDATED')} · 배정돼 건너뜀 ${count('SKIPPED_ASSIGNED')} · 규칙 검사 미통과 ${count('SKIPPED')} · 실패 ${count('INVALID')}`,
  );
  if (count('INVALID') > 0) process.exitCode = 1;
}

main().catch((error: unknown) => {
  new Logger('import-content').error(error);
  process.exit(1);
});
