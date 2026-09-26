import { config } from 'dotenv';

config({ quiet: true });

/**
 * 통합 테스트용 DB 주소. 개발 DB를 건드리지 않도록 TEST_DATABASE_URL이 없으면
 * DATABASE_URL의 DB 이름 뒤에 _test를 붙인 별도 DB를 씁니다(로컬·CI 공통).
 */
export function testDatabaseUrl(): string {
  if (process.env.TEST_DATABASE_URL) return process.env.TEST_DATABASE_URL;
  const base = process.env.DATABASE_URL;
  if (!base)
    throw new Error('DATABASE_URL 또는 TEST_DATABASE_URL이 필요합니다.');
  const url = new URL(base);
  const name = url.pathname.slice(1);
  url.pathname = `/${name.endsWith('_test') ? name : `${name}_test`}`;
  return url.toString();
}
