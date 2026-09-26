import { INestApplication, ValidationPipe } from '@nestjs/common';
import connectPgSimple from 'connect-pg-simple';
import express from 'express';
import session from 'express-session';
import { LOCAL_FILES_PATH } from './storage/local-storage.service';
import { storageConfig } from './storage/storage.config';

const PgSessionStore = connectPgSimple(session);

/**
 * 서버와 통합 테스트가 같은 설정(CORS·세션·입력 검증)으로 앱을 띄우도록 한 곳에 둡니다.
 * 반환하는 close()는 세션 저장소의 DB 연결을 닫습니다(테스트 종료 시 필요).
 */
export function configureApp(app: INestApplication): { close: () => void } {
  // 프론트엔드가 별도 레포/오리진에서 쿠키 기반 세션을 사용하므로 credentials 허용이 필수입니다.
  app.enableCors({
    origin: process.env.CORS_ORIGIN ?? 'http://localhost:3000',
    credentials: true,
  });

  // 이미 쓰는 PostgreSQL에 세션을 저장해 별도 저장소(Redis 등) 없이 재시작·다중 인스턴스에서도 세션을 유지합니다.
  // 테이블(user_sessions)은 Prisma 마이그레이션이 관리하므로 자동 생성은 끕니다.
  const store = new PgSessionStore({
    conString: process.env.DATABASE_URL,
    tableName: 'user_sessions',
    createTableIfMissing: false,
  });

  app.use(
    session({
      secret: process.env.SESSION_SECRET ?? 'dev-only-session-secret',
      resave: false,
      saveUninitialized: false,
      cookie: {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 1000 * 60 * 60 * 24,
      },
      store,
    }),
  );

  // 로컬 저장소 파일(표지 그림 등) 제공. 키에 무작위 uuid가 들어가 URL을 추측할 수 없습니다(S3는 서명된 URL로 대체).
  const storage = storageConfig();
  if (storage.driver === 'local') {
    app.use(
      LOCAL_FILES_PATH,
      express.static(storage.localDir, {
        index: false,
        dotfiles: 'deny',
        setHeaders: (res) => res.setHeader('X-Content-Type-Options', 'nosniff'),
      }),
    );
  }

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  return { close: () => store.close() };
}
