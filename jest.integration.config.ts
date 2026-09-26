import type { Config } from 'jest';
import baseConfig from './jest.config';

// 통합 테스트: 실제 PostgreSQL(테스트 전용 DB)에 앱을 띄워 API를 순서대로 호출합니다.
// 실행: npm run test:int (DB가 떠 있어야 함: npm run db:up)
const config: Config = {
  ...baseConfig,
  testRegex: '.*\\.int-spec\\.ts$',
  globalSetup: '<rootDir>/src/test-utils/integration-global-setup.ts',
  setupFiles: ['<rootDir>/src/test-utils/integration-env.ts'],
  // 모든 파일이 같은 DB를 비우고 쓰므로 한 번에 하나씩 실행합니다.
  maxWorkers: 1,
  // @nestjs/config 12는 ESM 전용입니다. Node(20.19+)는 require(esm)로 불러오지만 Jest(Node 24.9 미만)는 못 하므로
  // 이 패키지만 CommonJS로 변환합니다. 단위 테스트는 AppModule을 불러오지 않아 필요 없습니다.
  transform: {
    '^.+\\.ts$': 'ts-jest',
    '^.+\\.js$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.jest-esm.json' }],
  },
  transformIgnorePatterns: ['/node_modules/(?!@nestjs/config/)'],
  // Prisma가 생성한 클라이언트(src/generated)는 './internal/class.js'처럼 .js 확장자로 TS 파일을 가리킵니다.
  moduleNameMapper: {
    ...baseConfig.moduleNameMapper,
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  testTimeout: 30_000,
};

export default config;
