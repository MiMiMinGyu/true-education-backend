import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import connectPgSimple from 'connect-pg-simple';
import session from 'express-session';
import { AppModule } from './app.module';

const PgSessionStore = connectPgSimple(session);

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // 프론트엔드가 별도 레포/오리진에서 쿠키 기반 세션을 사용하므로 credentials 허용이 필수입니다.
  app.enableCors({
    origin: process.env.CORS_ORIGIN ?? 'http://localhost:3000',
    credentials: true,
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
      // 이미 쓰는 PostgreSQL에 세션을 저장해 별도 저장소(Redis 등) 없이 재시작·다중 인스턴스에서도 세션을 유지합니다.
      // 테이블(user_sessions)은 Prisma 마이그레이션이 관리하므로 자동 생성은 끕니다.
      store: new PgSessionStore({
        conString: process.env.DATABASE_URL,
        tableName: 'user_sessions',
        createTableIfMissing: false,
      }),
    }),
  );

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // TODO: 운영 환경에서는 접근 제한(인증/IP 제한 등) 검토 필요
  const swaggerConfig = new DocumentBuilder()
    .setTitle('True Education API')
    .setDescription('AI 독서 학습 서비스 백엔드 API 문서')
    .setVersion('0.1')
    .addCookieAuth('connect.sid', {
      type: 'apiKey',
      in: 'cookie',
      name: 'connect.sid',
      description: '로그인 성공 시 발급되는 세션 쿠키 (httpOnly)',
    })
    .build();
  const swaggerDocument = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api-docs', app, swaggerDocument);

  await app.listen(process.env.PORT ?? 4000);
}
bootstrap();
