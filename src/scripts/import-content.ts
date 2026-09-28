// AI 파트 동화 JSON 적재: npm run content:import -- <파일|폴더> [--force] [--dry-run]
// AI JSON을 적재 형식(ImportBook)으로 바꾼 뒤 개발용 시드와 같은 검증·저장 로직으로 넣습니다.
// --dry-run: DB에 넣지 않고 변환·검증 결과만 출력합니다. --force: 이미 학생에게 배정된 책도 덮어씁니다.
import { Logger, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { readdir, readFile, stat } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { ContentImportService } from '../content/content-import.service';
import { ContentModule } from '../content/content.module';
import { convertAiStory } from '../content/utils/ai-story.converter';
import { validateImportBook } from '../content/utils/import-book.validator';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    ContentModule,
  ],
})
class ImportModule {}

interface FileResult {
  file: string;
  externalId: string;
  status: string;
  messages: { kind: '✗' | '!'; text: string }[];
}

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

  const app = dryRun
    ? null
    : await NestFactory.createApplicationContext(ImportModule, {
        logger: ['error', 'warn'],
      });
  const importer = app?.get(ContentImportService);
  const results: FileResult[] = [];

  try {
    for (const path of files) {
      const file = basename(path);
      let converted: ReturnType<typeof convertAiStory>;
      try {
        converted = convertAiStory(JSON.parse(await readFile(path, 'utf8')));
      } catch (error) {
        results.push({
          file,
          externalId: '-',
          status: 'INVALID',
          messages: [
            {
              kind: '✗',
              text: `JSON을 읽지 못했습니다: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
        });
        continue;
      }

      if (converted.status === 'SKIPPED') {
        results.push({
          file,
          externalId: converted.externalId,
          status: 'SKIPPED',
          messages: [{ kind: '!', text: converted.reason }],
        });
        continue;
      }
      if (converted.status === 'INVALID') {
        results.push({
          file,
          externalId: converted.externalId,
          status: 'INVALID',
          messages: converted.errors.map((text) => ({ kind: '✗', text })),
        });
        continue;
      }

      const { book } = converted;
      const outcome = importer
        ? await importer.importBook(book, { force })
        : { status: 'DRY_RUN', ...validateImportBook(book) };
      const lines = book.paragraphs.reduce(
        (sum, p) => sum + p.sentences.length,
        0,
      );
      results.push({
        file,
        externalId: book.externalId,
        status:
          outcome.errors.length > 0 && outcome.status === 'DRY_RUN'
            ? 'INVALID'
            : outcome.status,
        messages: [
          {
            kind: '!',
            text: `${book.title} · ${book.paragraphs.length}쪽 ${lines}줄 · 이해 질문 ${book.questions.length}개 · 순서 맞추기 ${book.ordering ? '있음' : '없음'}`,
          },
          ...outcome.errors.map((text) => ({ kind: '✗' as const, text })),
          ...[...converted.warnings, ...outcome.warnings].map((text) => ({
            kind: '!' as const,
            text,
          })),
        ],
      });
    }
  } finally {
    await app?.close();
  }

  for (const result of results) {
    console.log(`[${result.status}] ${result.file} (${result.externalId})`);
    result.messages.forEach(({ kind, text }) =>
      console.log(`  ${kind} ${text}`),
    );
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
