import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { configureApp } from './app.setup';
import { RefillService } from './content-inbox/refill.service';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  configureApp(app);

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
    .addApiKey(
      {
        type: 'apiKey',
        in: 'header',
        name: 'X-API-Key',
        description: 'AI 파트 동화 전송용 키(CONTENT_API_KEY)',
      },
      'contentApiKey',
    )
    .build();
  const swaggerDocument = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api-docs', app, swaggerDocument);

  await app.listen(process.env.PORT ?? 4000);

  // AI 파트 파이프라인 보충 작업의 실패 감지(AI_PIPELINE_URL·TOKEN이 있을 때만, 완성본은 콜백으로 받음).
  // 명령줄 스크립트에서는 켜지 않습니다.
  app.get(RefillService).startPolling();
}
bootstrap();
