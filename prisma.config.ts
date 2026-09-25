import 'dotenv/config';
import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    // env()는 값이 없으면 예외를 던져 DB 연결이 필요 없는 `prisma generate`(CI, postinstall)까지 막으므로 직접 읽습니다.
    url: process.env.DATABASE_URL ?? '',
  },
});
