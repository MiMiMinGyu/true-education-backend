# 프론트(Next.js) 운영 이미지. 빌드 컨텍스트 = 프론트 레포 루트(프론트 레포에는 파일을 추가하지 않음)
FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
# 브라우저는 같은 주소의 /api로 요청하고 Caddy가 백엔드로 넘깁니다(쿠키가 같은 사이트 쿠키, CORS 불필요).
ARG NEXT_PUBLIC_API_BASE_URL=/api
ARG NEXT_PUBLIC_TTS_PROVIDER=
ENV NEXT_PUBLIC_API_BASE_URL=$NEXT_PUBLIC_API_BASE_URL \
    NEXT_PUBLIC_TTS_PROVIDER=$NEXT_PUBLIC_TTS_PROVIDER \
    NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:22-bookworm-slim
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1
WORKDIR /app
COPY --from=build --chown=node:node /app ./
USER node
EXPOSE 3000
CMD ["npx", "next", "start", "-p", "3000"]
