# 백엔드 운영 이미지. 빌드 컨텍스트 = 백엔드 레포 루트
FROM node:22-bookworm-slim AS build
WORKDIR /app
# postinstall(prisma generate)에 스키마·설정이 필요해 의존성 설치 전에 복사합니다.
COPY package.json package-lock.json prisma.config.ts ./
COPY prisma ./prisma
RUN npm ci
COPY tsconfig.json tsconfig.build.json nest-cli.json ./
COPY src ./src
RUN npm run build

FROM node:22-bookworm-slim
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
