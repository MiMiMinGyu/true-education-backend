# 여울(Yeoul) 백엔드

경계선 지능 초등 저학년 학생을 위한 독서 학습 서비스 **여울**의 백엔드입니다.
NestJS 11 · Prisma 7 · PostgreSQL 16 · 세션(쿠키) 로그인.

API 문서(Swagger): 서버 실행 후 <http://localhost:4000/api-docs>

> 여울이 음성은 **타입캐스트(Typecast)** 로 제작되었습니다(출연진: 토비). 음성·동화 원문 출처는 [5. 출처 표기](#5-출처-표기)를 참고하세요.

---

## 글 모음

이 프로젝트를 만들며 내린 결정과 그 과정을 기록한 글입니다. 발행 순서대로 정리했습니다.

| # | 제목 | 주제 |
|---|---|---|
| 1 | [느린 학습자 독서 서비스 — 프로젝트 소개](docs/blog/01-project-intro.md) | 문제 정의, 팀 구성, 수상 |
| 2 | [4명의 클로드가 같은 곳을 보게 만들기 — 하네스 엔지니어링](docs/blog/02-harness-engineering.md) | AI 협업 방식, 바이브코딩에서 하네스 엔지니어링으로 |
| 3 | [Redis의 자리는 남겨두다 — 세션 저장소](docs/blog/03-session-store.md) | 세션 저장소 설계 |
| 4 | [UNIQUE 제약이 못 막아준 순간 — 아이디 유일성](docs/blog/04-id-uniqueness.md) | 동시성, advisory lock |
| 5 | [사용자 수와 비용의 분리 — TTS 캐싱](docs/blog/05-tts-caching.md) | 외부 유료 API 비용 설계 |
| 6 | [개인정보와 관련 있다면 더욱 민감하게 — 연결 요청·수락](docs/blog/06-link-request.md) | 권한 모델 재설계 |
| 7 | [인프라 재구축 — Terraform·망분리·최소 권한](docs/blog/07-infra-rebuild.md) | VPC, IAM, 비밀 관리 |
| 8 | [알고 있던 것과 지킨 것의 차이 — 백업 공백, RTO 실측](docs/blog/08-backup-restore.md) | RDS 백업·복구 드릴 |
| 9 | [로컬에서 안 터지던 버그 — 배포 후 프로덕션 버그 3개](docs/blog/09-production-bugs.md) | Docker, tsconfig, RDS TLS |
| 10 | [의도치 않은 사고 발생 — Elastic IP·Terraform 드리프트·알람 버그](docs/blog/10-ops-incidents.md) | 운영 중 재부팅, 상태 드리프트, 모니터링 |

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

이 라이선스 때문에 실제 서비스에 쓰인 동화 데이터는 이 레포에 포함하지 않았습니다. 로컬 시드(`prisma/seed/books/`)는 전부 팀이 테스트용으로 직접 쓴 창작 동화(저작권 문제 없음)입니다. 자세한 내용은 [6. 외부 연동 현황](#6-외부-연동-현황)을 참고하세요.

---

## 6. 외부 연동 현황

이 백엔드는 외부 서비스 키가 없어도 핵심 기능(로그인, 학습, 서재, 보호자 대시보드)은 전부 정상 동작합니다. 아래 네 가지만 키가 없으면 그 부분만 꺼지는 식으로 설계돼 있고, 지금 이 레포를 그대로 받으면 전부 비어있는 상태입니다.

| 연동 | 역할 | 키 없을 때 동작 | 비고 |
|---|---|---|---|
| **Typecast**(TTS) | 여울이 차례 음성 생성 | `503`(음성 없이 진행) | 과거 실제 서버에선 팀원 계정 키로 동작했으나, 그 서버는 삭제되어 지금은 동작하는 키가 없음 |
| **AI 파이프라인**(`AI_PIPELINE_URL`·`TOKEN`) | 동화 재고 부족 시 팀원 PC(Tailscale)에 새 동화 생성을 요청 | 요청 시도 안 함 | 로컬 시드는 동화 2권뿐이라, 실제 서비스 당시엔 이 연동으로 채워졌음. 지금은 연결이 끊겨 동화가 금방 바닥남(`NO_BOOK`) |
| **동화 수신 API**(`CONTENT_API_KEY`, `POST /admin/books`) | AI 파트가 완성된 동화를 서버로 보내는 경로 | `404`(경로 자체가 꺼짐) | 위 파이프라인과 짝을 이루는 수신 쪽. 혼자 로컬에서 테스트할 때는 필요 없음 |
| **재고 부족 알림**(`CONTENT_ALERT_WEBHOOK_URL`) | 동화 재고 부족 시 디스코드·슬랙 알림 | 서버 로그에만 남김 | 영향 없음 |

### 그래서 지금 로컬에서 띄우면
- 로그인·학습·서재·보호자 대시보드는 전부 정상 작동합니다.
- 여울이 음성은 안 나옵니다(텍스트만 표시).
- `demo:seed`가 만든 동화 6권(저작권 없는 자체 창작 2종 × 복제 포함, 코드에 `// TODO: AI 파트 동화가 들어오면 복제본 없이 실제 동화로 시연합니다` 주석이 남아있습니다)을 다 읽으면 새 동화 배정이 멈춥니다(에러 아님, `NO_BOOK` 응답). 보호자 대시보드 판정에 필요한 최소 완독 권수(3권, `MIN_VALID_STORIES`)는 이 6권만으로 충분히 채울 수 있습니다.

### 직접 동작시켜보려면
Typecast만 본인 키로 바로 테스트할 수 있습니다. [Typecast](https://typecast.ai)에서 가입 후 API 콘솔에서 키를 발급받고, `voice_id`는 [보이스 목록](https://typecast.ai/developers/api/voices)에서 확인해 `.env`의 `TYPECAST_API_KEY`·`TYPECAST_VOICE_ID`·`TYPECAST_MODEL`에 넣으면 됩니다(무료 요금제 월 15,000크레딧). AI 파이프라인·동화 수신 쪽은 팀원 개인 PC와 묶여 있던 기능이라 재현이 어렵습니다.
