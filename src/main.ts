import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import session from 'express-session';
import { AppModule } from './app.module';

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
      // TODO: 현재는 기본 MemoryStore(인메모리) 사용 중. 다중 인스턴스 배포 시
      // 세션 공유를 위해 영속 스토어(예: Redis) 도입 검토 필요.
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
