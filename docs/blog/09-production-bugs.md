# [여울] 로컬에서 안 터지던 버그 - 배포 후 프로덕션 버그 3개

> velog 원문 · [원문 보기](https://velog.io/@_2_min_9_/%EC%97%AC%EC%9A%B8-%EB%A1%9C%EC%BB%AC%EC%97%90%EC%84%9C-%EC%95%88-%ED%84%B0%EC%A7%80%EB%8D%98-%EB%B2%84%EA%B7%B8-%EB%B0%B0%ED%8F%AC-%ED%9B%84-%ED%94%84%EB%A1%9C%EB%8D%95%EC%85%98-%EB%B2%84%EA%B7%B8-3%EA%B0%9C)

## 배경 — 로컬에서는 안 보이던 버그들

Terraform으로 인프라를 다시 짓고, 그 위에 앱을 처음 올렸다.
로컬 개발 환경에서는 수없이 돌려봤고, 이전 EC2·Docker Compose 배포에서도 별문제가 없었다.

하지만 이번에는 달랐다.
RDS에 처음 연결했고, 새로 짠 Docker 이미지로 처음 빌드했다.
버그가 한 번에 세 개 터졌다.
셋 다 로컬에서는 한 번도 본 적 없는 버그였다.

---

## 버그 1 — 흐르는 Docker 태그

운영 이미지는 `node:22-bookworm-slim`으로 빌드하고 있었다.
메이저 버전만 고정하고, 패치 버전은 그때그때 최신으로 받는 태그다.

몇 주 사이 Node 22의 패치 버전이 올라갔고, 그 사이 production 빌드만 `MODULE_NOT_FOUND`로 죽기 시작했다.
로컬 개발은 TypeScript를 그때그때 처리해가며 실행하지만, 운영은 미리 컴파일된 JavaScript만 실행한다.
이 실행 방식 차이 때문에 로컬에서는 멀쩡하던 코드가 운영에서만 깨졌다.

`backend.Dockerfile` 예시

```dockerfile
FROM node:20-bookworm-slim AS build

FROM node:20-bookworm-slim
```

`.nvmrc`에 적힌 버전(20), CI가 쓰는 버전과 똑같이 운영 이미지도 고정했다.
코드를 한 줄도 안 바꿨는데 빌드 결과가 달라지는 상황 자체를 없앴다.

---

## 버그 2 — 진짜 원인

버그 1과는 별개로, 같은 배포 과정에서 또 다른 원인이 있었다. Node 버전을 고정해도 사라지지 않는 문제였다.

Prisma가 만들어주는 클라이언트 코드 안에는 다른 파일을 가져오는 줄이 있는데, 그 경로 끝에 `.ts`가 그대로 붙어 있다(`./internal/class.ts`처럼).
[TypeScript 5.7 공식 릴리스 노트](https://www.typescriptlang.org/docs/handbook/release-notes/typescript-5-7.html)에 따르면, 이런 식으로 소스 코드에 `.ts` 확장자를 그대로 써도 되는 방식을 지원하는데, 자동으로 켜져 있는 기능은 아니다.
`tsconfig.json`에서 별도 옵션(`rewriteRelativeImportExtensions`)을 켜야, 컴파일할 때 그 `.ts`를 `.js`로 자동으로 바꿔준다.

이 프로젝트는 그 옵션이 빠져 있었다.
그래서 어디서 빌드하든(로컬이든 CI든 Docker든) 컴파일된 결과물에는 `.ts` 경로가 그대로 남았다.

문제가 터지는 지점만 달랐다.
찾아보니, 로컬 개발(`nest start`)은 webpack 기반이라 컴파일된 파일을 직접 실행하지 않고 소스 코드를 보고 알아서 경로를 맞춰준다고 한다.

하지만 운영은 다르다.
미리 컴파일된 `dist` 폴더만 가지고 `node dist/main`으로 그 파일을 그대로 실행하는데, 그 폴더에는 `.ts` 파일이 없다. `.js`만 있다.
그래서 `require("./internal/class.ts")`가 존재하지 않는 파일을 찾다가 `MODULE_NOT_FOUND`로 죽었다.

`tsconfig.json` 예시

```json
{
  "compilerOptions": {
    "rewriteRelativeImportExtensions": true
  }
}
```

이 옵션을 켜면 컴파일할 때 `.ts`로 끝나는 import를 전부 `.js`로 바꿔준다.

---

## 버그 3 — RDS TLS, 그리고 지름길 대신 정석

RDS는 암호화 연결을 강제한다(`force_ssl`).
연결 문자열에도 `sslmode=verify-full`을 넣어 가장 엄격한 수준으로 검증하게 해뒀다.

그런데 배포하자마자 연결이 거부됐다.
Node가 기본으로 가진 인증 기관 목록에 Amazon RDS의 발급 기관이 없어서였다.

당연하게도 검증을 꺼버리면 에러는 바로 사라진다.
하지만 그만큼 보안 구멍이 커지는 선택임이 자명했기에, 이 시도는 Claude Code가 자체적으로 막았다.
대신 정석대로 풀었다.

AWS가 공개한 RDS 인증 기관 번들을 이미지 빌드 시점에 받아서, Node에게 "이것도 믿어도 된다"고 알려주는 환경 변수(`NODE_EXTRA_CA_CERTS`)로 연결했다.

`backend.Dockerfile` 예시

```dockerfile
RUN apt-get update && apt-get install -y --no-install-recommends curl ca-certificates \
  && curl -fsSL https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem -o /app/rds-ca-bundle.pem \
  && apt-get purge -y curl && apt-get autoremove -y && rm -rf /var/lib/apt/lists/*
ENV NODE_EXTRA_CA_CERTS=/app/rds-ca-bundle.pem
```

검증 수준은 그대로 `verify-full`로 뒀다.
검증을 낮추지 않고, Node가 모르던 인증 기관 하나를 더 알려주는 쪽으로 풀었다.

---

## 마무리

세 버그 모두 공통점이 있다.
로컬에서는 한 번도 안 터졌고, 운영에 올리고 나서야 드러났다.
흐르는 태그, 컴파일 설정, TLS 인증서 모두 평소에는 안 보이다가 환경이 바뀌는 순간 드러나는 종류의 문제였다.

아래 PR에서 세 수정을 모두 확인할 수 있다.
> [fix: 운영 Docker 빌드 — Node 버전 고정, TS 확장자 변환, RDS TLS 인증서 (#32)](https://github.com/MiMiMinGyu/true-education-backend/pull/32)

다음 글에서는 운영 중 재부팅 한 번으로 겪은 일을 다룬다.
