// 개발용 동화 시드 적재: npm run content:seed [-- <폴더>] [--force]
// 폴더 안의 *.json(ImportBook 형식)을 한 권씩 검증·적재하고 요약을 출력합니다.
import { Logger, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { readdir, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import {
  ContentImportService,
  type ImportResult,
} from '../content/content-import.service';
import { ContentModule } from '../content/content.module';
import { ImportBook } from '../content/interfaces/import-book.interface';
import { PrismaModule } from '../prisma/prisma.module';

const DEFAULT_DIR = 'prisma/seed/books';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    ContentModule,
  ],
})
class SeedModule {}

async function main() {
  const args = process.argv.slice(2);
  const force = args.includes('--force');
  const dir = resolve(args.find((arg) => !arg.startsWith('--')) ?? DEFAULT_DIR);

  const files = (await readdir(dir))
    .filter((file) => file.endsWith('.json'))
    .sort();
  if (files.length === 0) {
    console.log(`${dir}에 JSON 파일이 없습니다.`);
    return;
  }

  const app = await NestFactory.createApplicationContext(SeedModule, {
    logger: ['error', 'warn'],
  });
  const importer = app.get(ContentImportService);
  const results: (ImportResult & { file: string })[] = [];

  try {
    for (const file of files) {
      try {
        const book = JSON.parse(
          await readFile(join(dir, file), 'utf8'),
        ) as ImportBook;
        results.push({ file, ...(await importer.importBook(book, { force })) });
      } catch (error) {
        results.push({
          file,
          externalId: '-',
          status: 'INVALID',
          errors: [error instanceof Error ? error.message : String(error)],
          warnings: [],
        });
      }
    }
  } finally {
    await app.close();
  }

  for (const result of results) {
    console.log(`[${result.status}] ${result.file} (${result.externalId})`);
    result.errors.forEach((message) => console.log(`  ✗ ${message}`));
    result.warnings.forEach((message) => console.log(`  ! ${message}`));
  }
  const count = (status: ImportResult['status']) =>
    results.filter((result) => result.status === status).length;
  console.log(
    `\n생성 ${count('CREATED')} · 갱신 ${count('UPDATED')} · 배정돼 건너뜀 ${count('SKIPPED_ASSIGNED')} · 실패 ${count('INVALID')}`,
  );
  if (count('INVALID') > 0) process.exitCode = 1;
}

main().catch((error: unknown) => {
  new Logger('seed-content').error(error);
  process.exit(1);
});
