# 백엔드 운영 이미지. 빌드 컨텍스트 = 백엔드 레포 루트
# Node 버전은 .nvmrc(20)에 맞춤 — node:22-bookworm-slim(흐르는 태그)을 쓰다가 몇 주 사이 Node 22 패치가 올라가면서
# 기본으로 켜진 네이티브 TS 처리 때문에 Prisma 생성 클라이언트가 "./internal/class.ts"를 그대로 require해 production에서만
# MODULE_NOT_FOUND로 죽는 문제가 발생(2026-10-29, Phase 4 배포 중 발견). 버전을 고정해 재현성을 맞춘다.
FROM node:20-bookworm-slim AS build
WORKDIR /app
# postinstall(prisma generate)에 스키마·설정이 필요해 의존성 설치 전에 복사합니다.
COPY package.json package-lock.json prisma.config.ts ./
COPY prisma ./prisma
RUN npm ci
COPY tsconfig.json tsconfig.build.json nest-cli.json ./
COPY src ./src
RUN npm run build

FROM node:20-bookworm-slim
ENV NODE_ENV=production
WORKDIR /app
# 시작 시 마이그레이션(prisma CLI)과 운영 스크립트(content:import 등)를 쓰므로 node_modules를 통째로 가져갑니다.
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json prisma.config.ts ./
COPY prisma ./prisma
RUN mkdir -p storage && chown -R node:node /app
USER node
EXPOSE 4000
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main"]
