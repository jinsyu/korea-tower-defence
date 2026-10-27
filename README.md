# 전국 시군구 타워 디펜스

초등학생이 수학 계산 문제를 풀며 우리 시·군·구를 친구들과 함께 24시간 지키는 타워 디펜스. 기획 문서는 `docs/spec.md`, 작업 계획은 `docs/plan.md`.

## 구성 (pnpm 워크스페이스)

| 경로 | 내용 |
|---|---|
| `apps/web` | 화면. Next.js(App Router) + TypeScript + Tailwind + shadcn/ui. Vercel에 올린다 |
| `apps/server` | 게임 서버. Node + TypeScript + socket.io. 지금은 `/health`만 있다 |
| `packages/core` | 화면과 서버가 함께 쓰는 게임 규칙(`@ktd/core`) |
| `poc/load` | 부하 PoC(T1). 워크스페이스 밖의 독립 패키지 |

## 개발 명령

Node 24 이상, pnpm 10.

```sh
pnpm install
cp apps/web/.env.example apps/web/.env.local         # 화면: Next.js가 apps/web에서 읽는다
cp apps/server/.env.example apps/server/.env.local   # 게임 서버: node --env-file-if-exists로 apps/server에서 읽는다
# 값은 직접 넣는다. .env.local 파일은 커밋하지 않는다(루트 .env 파일은 어느 쪽도 읽지 않는다)

pnpm dev:web                   # 화면 http://localhost:3000
pnpm dev:server                # 게임 서버 http://127.0.0.1:4000/health

pnpm typecheck                 # 모든 패키지 타입 검사
pnpm lint                      # 모든 패키지 ESLint
pnpm test                      # Vitest (core·web·server)
pnpm --filter web build        # 화면 빌드
pnpm test:e2e                  # Playwright (빌드 뒤. 시험은 T12부터)
```

## 끄는 법

띄운 서버는 다 쓰면 끈다.

- 앞에서 돌린 것: 그 터미널에서 `Ctrl+C`
- 뒤에서 돌린 것: 띄울 때 PID를 적어 두고 `kill <PID>`
  ```sh
  pnpm --filter web start -p 3000 & echo $!   # PID가 찍힌다
  kill <PID>
  ```
- PID를 잊었으면 포트로 찾는다: `lsof -nP -iTCP:3000 -sTCP:LISTEN` (게임 서버는 4000)

## 라이선스

코드는 `LICENSE`(MIT). 데이터·글꼴·그림 에셋은 `LICENSES/`와 `CREDITS.md`를 따른다.
