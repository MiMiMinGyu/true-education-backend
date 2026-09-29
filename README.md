# 여울(Yeoul) 백엔드

경계선 지능 초등 저학년 학생을 위한 독서 학습 서비스 **여울**의 백엔드입니다.
NestJS 11 · Prisma 7 · PostgreSQL 16 · 세션(쿠키) 로그인.

API 문서(Swagger): 서버 실행 후 <http://localhost:4000/api-docs>

> 여울이 음성은 **타입캐스트(Typecast)** 로 제작되었습니다(출연진: 토비). 음성·동화 원문 출처는 [5. 출처 표기](#5-출처-표기)를 참고하세요.

---

## 1. 로컬에서 실행하기

### 준비물
- **Node.js 20**(`.nvmrc`), npm
- **Docker**(DB를 컨테이너로 띄웁니다)

### 처음 한 번
```bash
cp .env.example .env        # 기본값 그대로 로컬에서 동작합니다
npm ci
npm run setup:local         # DB 실행 → 테이블 생성 → 개발용 동화·시연 데이터 적재
```

### 매번
```bash
npm run db:up               # DB 컨테이너가 꺼져 있으면
npm run start:dev           # http://localhost:4000
```

프론트(Next.js)는 `http://localhost:3000`에서 실행하면 됩니다. 백엔드는 이 주소의 요청과 쿠키를 허용해 두었습니다(`.env`의 `CORS_ORIGIN`).

### 시연 계정(`npm run setup:local` 또는 `npm run demo:seed` 후)
| 역할 | 아이디 | 비밀번호 | 들어 있는 것 |
|---|---|---|---|
| 학생 | `demo_kid` | `yeoul1234` | 지난 5일간 완료한 책 5권(서재·표지·설명 말하기), 스탬프 7개. 오늘은 로그인하면 새 책이 배정됨 |
| 보호자 | `demo_parent` | `yeoul1234` | `demo_kid`와 연결, 보상 2개(5개 달성, 10개 대기), 대시보드 판정 결과 |

`npm run demo:seed`를 다시 실행하면 시연 계정의 기록만 지우고 처음 상태로 되돌립니다(다른 계정은 그대로).

### 처음부터 다시(로컬 DB 완전 초기화)
```bash
npm run db:reset            # DB 컨테이너와 데이터를 지우고 setup:local을 다시 실행
```

---

## 2. 프론트 연동 시 알아 둘 것

- **모든 요청에 `credentials: "include"`** 가 필요합니다(로그인 = httpOnly 세션 쿠키).
- 역할 값은 `STUDENT` / `PARENT`. 로그인 요청에 `role`이 필요합니다.
- **정답·힌트는 채점 전에 내려가지 않습니다.** 채점은 제출 응답으로만 합니다.
- **단계 전환은 서버만** 합니다. 현재 단계와 맞지 않는 요청은 `409`입니다(예: 순서 맞추기를 끝내기 전에 제목 저장).
- 학습 흐름: `GET /sessions/today`로 오늘의 배정(`assignmentId`)과 단계를 받고, 단계별 API를 호출합니다.

| 단계 | API | 규칙 |
|---|---|---|
| 번갈아 읽기 | `GET /assignments/{id}/reading`, `POST …/reading/pages/{page}` | 쪽마다 저장, `savedPages + 1`쪽부터 이어 읽기, 학생 줄별 읽은 시간(`durationMs`) |
| 이해 질문 | `GET …/questions`, `POST …/questions/{questionId}/attempts` | 최대 2회. 1차 오답 → `hint`, 2차 오답 → `answer`(정답 공개) |
| 순서 맞추기 | `GET …/ordering`, `POST …/ordering/attempts` | 카드는 서버가 섞어 보냄, 카드 id 배열로 제출, 최대 3회 |
| 제목 짓기 | `PUT …/title` `{ title }` | 앞뒤 공백 제거 1~50자 |
| 표지 그림 | `POST …/drawing` (multipart, 필드명 **`image`**) | PNG/WebP, 2MB 이하 |
| 설명 말하기 | `POST …/reflection` `{ transcript, durationMs }` | 브라우저 음성 인식 결과만(음성은 보내지 않음), 2분 이하, 빈 글은 `422`. **저장하면 책 완료 + 스탬프 적립**(응답 `stampsEarned`: 1 또는 2) |

- 책을 완료한 날에는 `GET /sessions/today`가 `{ type: "DONE", stampsEarned }`를 돌려줍니다(하루 1권). 보물상자 연출에 이 값을 씁니다.
- 서재 `GET /bookshelf`(최근 완료 순), 스탬프 `GET /students/me/stamps`, 보상 `GET /students/me/rewards`
- 보호자: `GET /parents/me/students`, `GET /parents/me/students/{studentId}/dashboard`, 보상 `GET·PUT·DELETE /parents/me/students/{studentId}/rewards[/{milestone}]`
- 여울이 음성 `GET /books/{bookId}/lines/{lineId}/tts`: Typecast 키가 없으면 항상 `503`입니다. 음성 없이(또는 브라우저 TTS로) 진행하면 됩니다.
- 업로드한 그림 등 파일은 백엔드의 `/files/…` 주소로 제공됩니다(응답에 절대 URL로 들어 있음).

---

## 3. 명령어

| 명령 | 설명 |
|---|---|
| `npm run setup:local` | DB 실행 → 마이그레이션 → 개발용 동화·시연 데이터 적재 |
| `npm run db:reset` | 로컬 DB 컨테이너와 데이터를 지우고 `setup:local` 다시 실행 |
| `npm run demo:seed` | 시연 계정과 기록을 처음 상태로 |
| `npm run content:seed` | `prisma/seed/books`의 개발용 동화만 적재 |
| `npm run tts:warmup -- --book <external_id\|all>` | 여울이 음성 미리 만들기(Typecast 키 필요) |
| `npm run start:dev` | 개발 서버(파일 변경 시 재시작) |
| `npm test` / `npm run test:int` | 단위 테스트 / 통합 테스트(실제 DB, 테스트 전용 DB를 자동 생성) |
| `npm run lint` / `npm run build` | 린트 / 빌드 |

---

## 4. 문제 해결

- **DB 연결 실패**: `npm run db:up`으로 컨테이너를 켜세요. 호스트 포트는 다른 PostgreSQL과 겹치지 않게 **5434**입니다(`.env`의 `POSTGRES_PORT`·`DATABASE_URL`). 예전 `.env`(5433)를 쓰고 있다면 두 곳을 5434로 바꾸세요.
- **로그인했는데 다음 요청이 401**: 프론트 요청에 `credentials: "include"`가 빠졌거나, 프론트 주소가 `CORS_ORIGIN`과 다릅니다.
- **`Unknown argument` 오류**(스키마를 바꾼 뒤): `npx prisma generate`로 Prisma 클라이언트를 다시 만드세요.

---

## 5. 출처 표기

### 여울이 음성(TTS) — Typecast

이 콘텐츠는 인공지능 가상 연기자 서비스, 타입캐스트를 활용하여 제작되었습니다.
출연진: 토비
<https://typecast.ai/kr>

This content was produced with Typecast, an AI virtual actor service.
Characters casted: 토비
<https://typecast.ai>

### 동화 원문

동화 원문은 국립민속박물관 **한국민속대백과사전**의 민담을 바탕으로 순화·재구성했으며, **공공누리 제2유형(출처표시 + 상업적 이용금지)** 조건을 따릅니다.
책마다의 원문 주소·라이선스·출처는 `books.source_url`·`license`·`bibliography`에 저장되며 서재 상세(`GET /bookshelf/{assignmentId}`)의 `source`로 제공됩니다.
