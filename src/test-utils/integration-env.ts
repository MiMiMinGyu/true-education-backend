import { testDatabaseUrl } from './test-database';

// 각 테스트 파일이 앱을 띄우기 전에 테스트 DB를 가리키게 합니다(.env의 DATABASE_URL보다 우선).
process.env.DATABASE_URL = testDatabaseUrl();
process.env.SESSION_SECRET ??= 'integration-test-secret';
