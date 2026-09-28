import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { testDatabaseUrl } from './test-database';

// 각 테스트 파일이 앱을 띄우기 전에 테스트 DB를 가리키게 합니다(.env의 DATABASE_URL보다 우선).
process.env.DATABASE_URL = testDatabaseUrl();
process.env.SESSION_SECRET ??= 'integration-test-secret';
// 업로드 파일은 레포 폴더가 아닌 임시 폴더에 저장합니다.
process.env.STORAGE_DRIVER = 'local';
process.env.STORAGE_LOCAL_DIR = join(tmpdir(), 'true-education-int-storage');
// 외부로 나가는 알림·외부 키는 .env 값을 쓰지 않습니다(빈 문자열은 .env가 덮어쓰지 않음).
// 테스트가 실제 디스코드 채널에 동화 부족 알림을 보내던 문제 방지. 필요한 테스트는 스스로 설정합니다.
process.env.CONTENT_ALERT_WEBHOOK_URL = '';
process.env.CONTENT_API_KEY = '';
process.env.TYPECAST_API_KEY = '';
