# Plan: 전국 시군구 타워 디펜스

- spec: `docs/spec.md` (3판, 2026-10-27 승인)
- 화면 기준 자료: `docs/design/mockups/option-b.html` (시안 B, 2026-10-27 확정). 화면 태스크는 아래에 적은 `?screen=` 값과 데모를 그대로 따른다. 여는 법은 `docs/design/mockups/README.md` "여는 법"(data 복사 뒤 `python3 -m http.server 8765`, 끝나면 그 PID를 끈다).
- 그림 기준: `docs/design/asset-research.md`, 시안 B `?screen=assets`
- 작성: 2026-10-27

## 운영 규칙 (이 프로젝트)

- **코드 리뷰는 herdr 옆 pane의 codex가 한다.** reviewer 서브에이전트를 부르지 않는다. 태스크가 끝나면 메인이 변경 내용(diff)을 codex에 넘겨 리뷰를 받고, 지적을 고친 뒤 태스크에 체크한다.
- **E2E는 꼭 필요한 태스크에만 쓴다.** 아래에서 `[E2E]`가 붙은 태스크(T12, T13, T19)만 Playwright 시험을 새로 쓰고 돌린다. 나머지 태스크는 단위·통합 시험(Vitest, 서버는 socket.io-client 통합 시험)과 빌드로 검증한다. 화면 태스크의 겉모습 확인은 메인이 `/browse`로 360·390·1920px 스크린샷과 `scrollWidth` 측정으로 한다(시험 코드 아님).
- **띄운 것은 끝나면 끈다.** 개발 서버, 게임 서버, 부하 시험 컨테이너, 브라우저, 백그라운드 셸은 띄운 쪽이 PID나 컨테이너 이름으로 끈다. coder 지시서에도 넣는다. docker `inpocket_postgres`, `hbbs`, `hbbr`는 끄지 않는다.
- **e2e·빌드는 동시에 2개까지.** 시작 전에 `uptime`을 보고 load average가 14를 넘으면 기다린다. 부하 시험(T1, T14)은 다른 빌드·e2e 없이 혼자 돌린다.
- **운영 서버에서 부하 시험을 하지 않는다.** 부하는 로컬 Docker로 Lightsail 2GB를 흉내 내어 잰다.
- **사용자만 하는 일은 하지 않는다.** DNS, Caddy 사이트 파일, 포트 할당표, 비밀값, 서버 설정 변경, GitHub·Vercel 계정 작업, 결제가 드는 일(스냅숏 등)은 스크립트와 안내만 만들고 아래 "사용자가 할 일"로 넘긴다.
- **gojang은 읽기만 한다.** 복사 스크립트(T3)만 gojang 파일을 읽는다.
- **에셋 라이선스**(Q35 확정, 2026-10-27): CC0 우선, CC BY(3.0·4.0)는 작가·출처 URL·라이선스를 manifest에 적고 표기하면 허용, SA·NC·ND는 쓰지 않는다. MIT·Apache 등 그 밖의 라이선스는 허용 목록에 없다. 필요해지면 멈추고 사용자에게 다시 묻는다. 생성형 AI 이미지는 쓰지 않는다.
- **공개 저장소다.** 비밀값은 커밋하지 않고 `.env.example`에 키 이름만 둔다.
- **개인정보 원칙**(D68·D69): 이름·학교·연락처·위치 입력을 만들지 않는다. IP는 메모리에서 HMAC 값으로만, 1시간 뒤 버린다. 로그에 별명·열쇠·복구 코드·IP를 남기지 않는다.
- 태스크 하나가 coder 한 번(도구 호출 60회 안팎)에 끝나지 않으면 `-1`, `-2`로 쪼개 plan을 고친다.

## 태스크

### T1: 부하 PoC — Lightsail 2GB 한 대가 버티는지 — DoD 사전 확인: D25, D55, D56, D57

- [x] T1

spec 위험 요소 "한 대 서버의 부하 한계 (PoC 필요)". 이 결과로 서버 설계(T11~T13)와 서버 배치를 정하므로 가장 먼저 한다. 워크스페이스와 따로 `poc/load/`(독립 pnpm 패키지)에 만든다. 부하 발생기는 T14에서 `apps/server/load/`로 옮겨 다시 쓴다.

- 최소 게임 서버 `poc/load/server.ts`
  - Node 22 LTS, TypeScript(tsx), socket.io(지역 185개 = 방 185개)
  - 미리 넣은 지킴이 50,000명(지역별로 치우치게, 한 지역은 2,000명)
  - `answer` 처리: 메모리의 지킴이 상태 갱신 → 쓰기 대기열 → **50ms마다 한 트랜잭션으로 SQLite(WAL)에 쓴 뒤 응답**(D57 방식)
  - 지역 화력은 메모리에 모았다가 10초마다 반영하고, 지역 방마다 1초에 한 번 방송한다(메시지에 서버 시각을 넣음)
  - 문제 만들기 비용은 실제와 비슷한 가짜 함수(보기 4개, 식 문자열)로 흉내 낸다
  - SQLite 드라이버 `better-sqlite3`와 Node 내장 `node:sqlite`를 같은 시나리오로 비교해 하나를 고른다
  - `/health`: RSS, 이벤트 루프 지연(`monitorEventLoopDelay`), 접속 수, 대기열 길이
- 부하 발생기 `poc/load/run.ts`
  - socket.io-client를 여러 프로세스(예: 4개 × 2,500연결)로 나눠 돌린다. websocket 전송만 쓴다.
  - 보낸 답 번호와 응답(ack) 번호를 파일에 남겨 중복·누락을 센다.
- Lightsail 2GB 흉내
  - 서버만 Docker 컨테이너 `ktd-load`에서 돌린다: `--cpus=1 --memory=768m --memory-swap=768m`(systemd `MemoryMax=768M`과 같은 몫)
  - Lightsail은 버스트형 CPU라 오래 돌면 더 느려질 수 있다. 그래서 CPU를 1개로 묶어 보수적으로 잰다.
  - 부하 발생기는 서버 제한 밖에서 돌린다. 공식 측정은 같은 Docker 네트워크의 발생기 컨테이너(`poc/load/gen.sh`, CPU 제한 없음)로 한다. 맥 포트 포워더 경로(`pnpm -C poc/load s1` 등, 시작 전 `ulimit -n 65536`)는 참고로만 잰다(2026-10-27 T1 결과).
- 시나리오와 통과 기준

| 시나리오 | 내용 | 통과 기준 |
|---|---|---|
| S1 한 지역 몰림 | 같은 지역 1,000명이 1초 안에 정답 하나씩 동시에 보냄(배경 접속 없음) | 1,000건 모두 정확히 한 번 처리(중복 0, 누락 0), 누적 포인트 합 = 기대값, 다음 화력 반영 뒤 지역 화력 = 지킴이 힘의 합, 응답 p95 ≤ 500ms, p99 ≤ 1,000ms, 오류 0 |
| S2 전국 지속 | 185개 지역에 나눠 동시 접속 10,000, 초당 정답 1,000건(포아송)을 10분 | 응답 p95 ≤ 500ms, p99 ≤ 1,000ms, 지역 방송 지연 p95 ≤ 2초, 방송은 지역마다 1초에 1번 이하, 메시지 ≤ 2KB, 서버 RSS 최고값 ≤ 768MB(여유 목표 ≤ 600MB), 오류율 ≤ 0.1%, 이벤트 루프 지연 p99 ≤ 200ms, 평균 CPU ≤ 1코어의 70% |
| S3 강제 종료 | S2 도중 `docker kill`로 서버를 끄고 다시 켬 | 응답을 받은 정답이 DB에 모두 남음(누락 0), 다시 켜고 5초 안에 응답, 웨이브가 저장 시각부터 이어짐 |
| S4 최악(참고) | S2 배경 위에 S1을 겹침 | 수치만 기록(통과 기준 아님) |

- 실패하면 바꿀 것(위에서부터 차례로 하고 다시 잰다)
  1. **메모리 초과**
     - 연결마다 쓰는 메모리를 줄인다: websocket 전송만 받기(long polling은 3순위 `/rt` 경로에만), `perMessageDeflate` 끄기, `maxHttpBufferSize` 4KB, 연결마다 저장하는 상태 줄이기
     - 그래도 넘으면 uWebSockets.js 기반 엔진을 시험한다(새 의존성이라 이유를 spec에 적음)
  2. **응답 지연 초과(DB)**
     - 묶어 쓰는 간격을 50ms → 20ms로 줄이고, `synchronous=NORMAL`(WAL에서는 프로세스 강제 종료에도 커밋이 남음), 준비된 문장, 바뀐 열만 쓰기
     - 그래도 넘으면 DB 쓰기를 worker_threads로 옮긴다
  3. **CPU·이벤트 루프 초과**
     - 지역 방송을 방마다 한 번 만든 버퍼로 보내고, 방송을 합친다
     - 그래도 넘으면 msgpack 파서(새 의존성)를 쓴다
  4. **위로도 안 되면 사용자가 정한다**
     - (가) 게임 서버를 따로 Lightsail 인스턴스로 옮김(추가 비용)
     - (나) `MemoryMax`를 올림(같은 서버 다른 앱 몫이 줄어듦)
     - (다) D55·D56 수치를 낮춤
     - 정한 것은 spec 결정 사항에 적는다. 서버 여러 대로 나누기는 범위 밖이라 쓰지 않는다.
- 결과 기록: `docs/poc/load-poc.md`에 환경(맥 사양, Docker 제한, Node 버전, 드라이버), 시나리오별 수치표, 고른 드라이버, 바꾼 설정, 실패 시 사용자 결정 요청을 적는다.
- 검증 명령
  ```sh
  uptime                                   # load 14 이하에서 시작
  pnpm -C poc/load install
  pnpm -C poc/load seed                    # 지킴이 50,000명 DB
  # 서버 이미지는 poc/load/Dockerfile(node:22-slim)에서 의존성을 컨테이너 안에서 설치한다(better-sqlite3는 맥에서 만든 것을 쓸 수 없음)
  docker build -t ktd-load poc/load
  docker network create ktd-load-net
  docker run -d --name ktd-load --network ktd-load-net --cpus=1 --memory=768m --memory-swap=768m -p 127.0.0.1:4100:4100 -v ktd-load-db:/data -e SQLITE_DRIVER=better ktd-load
  # 발생기는 같은 Docker 네트워크의 컨테이너(ktd-load-gen)에서 돈다. 맥 포트 포워더가 지연·누락을 더해 측정을 흔들기 때문(docs/poc/load-poc.md)
  poc/load/gen.sh s1 && poc/load/gen.sh s2 && poc/load/gen.sh s3   # s3은 docker 소켓으로 ktd-load를 kill·start
  docker rm -f ktd-load && docker volume rm ktd-load-db && docker network rm ktd-load-net && docker rmi ktd-load   # 끝나면 반드시 끔(다른 컨테이너는 건드리지 않음)
  ```
- 완료 기준
  - S1~S3이 모두 통과한다. 하나라도 실패하면 "실패하면 바꿀 것"을 적용한 결과와 사용자 결정 요청이 기록에 있다.
  - 이 태스크는 D25·D55·D56·D57의 사전 확인이고, 실제 서버 코드로 하는 최종 확인은 T14다.

### T2: 프로젝트 초기화 (워크스페이스, 테스트 환경, 기본 SEO·파비콘, 빈 배포 가능 상태) — DoD: D75(기본)

- [x] T2

- pnpm 워크스페이스
  - `apps/web`: Next.js App Router, TypeScript, Tailwind, shadcn/ui
  - `apps/server`: Node + TypeScript + socket.io 뼈대와 `/health`만
  - `packages/core`: 빈 모듈과 경로 별칭
- 시험 환경: Vitest 워크스페이스(core·web·server), Playwright 설정(시험 파일은 T12부터), `typecheck`·`lint`·`test` 스크립트
- 글꼴과 생중계 색
  - 글꼴 Black Han Sans·Gothic A1을 자체 호스팅한다(`next/font`로 빌드 때 받아 우리 주소에서 줌, D70)
  - 생중계 색 토큰(`--deep`, `--navy`, `--yellow`, `--red`, `--cyan`)을 Tailwind에 넣는다
- 기본 SEO·파비콘(`~/.claude/standards/web-quality.md`)
  - robots, sitemap, manifest, icon, 공유 이미지(한글)
  - canonical은 `https://korea-tower-defence.vercel.app`
- 저장소 파일
  - `.env.example`(키 이름만: `SESSION_SECRET`, `IP_HMAC_KEY`, `PROXY_SHARED_SECRET`, `NEXT_PUBLIC_RT_URLS`)
  - `LICENSE`(코드), `LICENSES/`(데이터 라이선스 자리)
  - `README.md`(개발 명령, 끄는 법)
  - GitHub Actions: typecheck·lint·unit만, 비밀값 없음
- `git init`과 첫 커밋까지만 한다. 원격 저장소 연결·push는 사용자가 저장소를 만든 뒤에 한다.
- 첫 화면은 시안 B 첫 화면의 빈 틀(제목, 버튼 2개)만 둔다.
- 검증 명령
  ```sh
  pnpm install && pnpm typecheck && pnpm lint && pnpm test
  pnpm --filter web build
  pnpm --filter web start -p 3000 &   # 확인 뒤 PID로 끔
  curl -sI localhost:3000/robots.txt localhost:3000/sitemap.xml localhost:3000/manifest.webmanifest localhost:3000/icon.png
  ```
- 완료 기준
  - 위 명령이 모두 성공한다
  - SEO 파일 4개가 200으로 응답한다(D75 기본)
  - `pnpm --filter web build` 결과를 Vercel에 그대로 올릴 수 있다(배포는 T20)

### T3: 첫 진입 화면 1 — gojang 데이터 가져오기, 첫 화면, 학년군, 지역 고르기 — DoD: D2, D26(화면), D43, D60(화면), D62(이 화면들)

- [x] T3
- 기준 시안: `option-b.html?screen=home`, `?screen=grade`, `?screen=region`, 데모 `flow`, `pick-region`

- `scripts/data/import-gojang.ts`
  - spec "gojang에서 가져오는 것" 표의 파일을 `data/source/gojang/`로 복사한다
  - 185칸 수와 sha256을 검사하고, `SOURCE.md`에 gojang 커밋, 복사 날짜, 출처·라이선스를 적는다
  - 복사한 파일은 커밋한다
- 전국 지도 컴포넌트(SVG): 전국 → 시·도 확대 → 지역 카드, 아래 목록. 상황판(T8)에서도 쓴다.
- 화면
  - 첫 화면: 처음 하기 / 복구 코드로 이어 하기. 높이 700px 이하 휴대폰은 지도 그림을 줄인다(시안 1차 검수 반영).
  - 학년군 고르기: 버튼 3개와 예시 식, "다음"
  - 지역 고르기: "어느 지역을 지킬까요?", 지역마다 가짜 지킴이 수·최고 웨이브
- 데이터는 가짜다. 학년군·지역 선택은 화면 상태에만 둔다(서버 연결은 T11).
- 검증 명령
  ```sh
  pnpm data:import-gojang && pnpm test --filter core --filter web
  pnpm --filter web build
  ```
- 확인
  - 메인이 `/browse`로 360×640, 390×844, 1920×1080에서 세 화면의 스크린샷을 찍고 `scrollWidth` ≤ `clientWidth`, 학년군 화면 스크롤 없음, 목록 줄 44px 이상을 잰다
  - 단위 시험으로 "주소·사는 곳" 낱말 0건과 `navigator.geolocation` 호출 0건(코드 검사)을 확인한다
- 완료 기준: D2, D43, D60(화면 부분), D26(화면 부분), D62(이 세 화면)

### T4: 타워·풍선 그림과 에셋 견본, 별명·타워 계열 화면 — DoD: D50, D51, D78

- [x] T4
- 기준 시안: `option-b.html?screen=assets`(데모 `assets-sil`, `assets-gray`, `assets-blur`), `?screen=nick`, `asset-research.md`

- `packages/core/looks.ts`: 단계 → (진화, 재질, 등급, 몸체, 포신, 장식, ★, 위치 점), 크기 비율, 다음 문턱(nextLook)
- `apps/web/lib/art/`: 시안 B의 캔버스 그림 코드를 옮긴다(Q36 확정: SVG로 다시 쓰지 않고, 빌드 때 스프라이트 시트도 만들지 않는다)
  - 그림 코드: OKLCH 세 단 셀 음영, 재질 무늬, 계열별 몸체, 포신, 장식, 합친 실루엣 외곽선·후광, 등급 고리, 배지, 풍선 4축, 체력 상태
  - 처음 그릴 때 화면 배율(최대 2)로 스프라이트를 굽고 LRU 500으로 캐시한다. 그 뒤로는 찍기만 하고 실행 중 필터를 쓰지 않는다.
  - 배지 글꼴이 늦게 오면 캐시를 비우고 다시 굽는다(시안 B와 같음)
  - 아이가 고른 색은 몸체 면에만 칠한다
- 개발용 견본 화면 `/dev/assets`
  - 계열 3 × 문턱 8 × 44px·88px, 풍선 상태 10종, 재질 10, 테두리 6, 장식 20
  - 회색조·실루엣·흐림 보기
  - 운영 빌드에서는 `noindex`이고 링크하지 않는다
- 별명·계열 화면: 후보 3개 + 다시 뽑기(가짜 목록), 계열 3종 그림 버튼
- 단위 시험
  - D50: 문턱 앞뒤 경계값, 5단계 묶음 100개 조합이 서로 다름, 499와 500이 다름, 색은 재질·등급 계산에 쓰지 않음
  - D51(자동 부분): 88px 검은 실루엣 알파 마스크(불투명도 50% 기준)의 해시가 계열끼리, 진화 단계끼리 서로 다름. 브라우저 캔버스가 필요하므로 Vitest browser mode 또는 `@napi-rs/canvas` 중 하나를 고르고 이유를 적는다.
  - D78: 왕 50%, 대장 66%·33% 경계에서 체력 상태가 바뀐다
- 검증 명령
  ```sh
  pnpm test --filter core --filter web
  pnpm --filter web build
  ```
- 확인: 메인이 `/browse`로 `/dev/assets`를 시안 B `?screen=assets`와 나란히 찍어 비교한다. D51·D78의 사람 확인 부분(44px 구별, 회색조 구별)은 메인이 사용자에게 보여 준다.
- 완료 기준: D50, D51, D78 자동 부분 통과, 견본 화면 가로 넘침 0

### T5: 첫 진입 화면 2 — 복구 코드, 이어 하기, 정보 화면 — DoD: D1(화면 흐름), D68(화면 부분), D73(문구)

- [x] T5
- 기준 시안: `option-b.html?screen=code`, `?screen=restore`(데모 `restore-ok`, `restore-bad`, `restore-lock`)

- 화면
  - 복구 코드 보여 주기(낱말 4 + 숫자 2)
  - 이어 하기: 자음 → 낱말 고르기, 숫자 패드, 틀림·잠김 안내
  - 정보 화면: 놀이 방법, 학년군·지역·별명 바꾸기 자리, 새 복구 코드, 내 기록 지우기(두 번 확인), 출처·라이선스·데이터 공개, 성취기준 근거, "서버에 무엇을 저장하나요"
- `packages/core/names/`: 별명 낱말 목록과 복구 코드 낱말 목록(1,024개)의 초안. 사람 검토는 사용자 할 일이다.
- 흐름은 가짜 상태로 끝까지 이어진다: 첫 화면 → 학년군 → 지역 → 별명 → 복구 코드 → 방어 화면 자리.
- 단위 시험
  - 흐름 전체에서 복구 코드 입력 화면 말고 text 입력이 0개다(DOM 렌더 시험)
  - 이어 하기 칸은 낱말 목록과 숫자만 받는다
- 검증 명령
  ```sh
  pnpm test --filter web --filter core && pnpm --filter web build
  ```
- 확인: 메인이 `/browse`로 세 화면을 360·390·1920px에서 찍는다
- 완료 기준
  - D1(화면 흐름, 서버 연결은 T11), D68(입력 칸 부분)
  - D73의 문구가 정보 화면에 있다. 에셋 목록은 T18에서 채운다.

### T6: 방어 화면 1 — 방어판 캔버스(평창군 시험 판) — DoD: D16(시험 판), D22(가짜), D63(시험 판), D64, D72, D79(단위)

- [x] T6
- 기준 시안: `option-b.html?screen=stage`, 데모 `boss`, `breach`, `record`, `barrage`, `rep`

- `packages/core/stage/schema.ts`
  - 판 파일 형식: 판 좌표 경계, 이웃 윤곽·이름, 배경 도로, 길, 입구, 지킬 곳, 대표 자리, 내 자리, 화면 속도, 출처 필드
  - 시안의 "시안용 가짜 길"과 자리 배치 단계를 `scripts/data/dev-fixture.ts`로 옮겨 평창군 시험 판 파일(`apps/web/public/stages/dev/32540.json`)을 만든다
  - 자리 배치 단계는 시안 3차 검수를 통과한 방식이다: 군 안 우선, 모자라면 군 밖, 간격 240→200
  - T16에서 실제 판 생성에 그대로 다시 쓴다
- 캔버스
  - 배경을 오프스크린에 한 번 그린다
  - 그리는 것: 풍선 이동, 대표 타워 N + 내 타워, 응원 포격, 정해진 결과에 맞춘 웨이브 연출(막음·뚫림·대장)
  - 이름표는 8방향 × 3거리에 2px 여백(시안 A·B 검수 방식)
  - 모서리 "© OpenStreetMap" 링크
- 점수판과 속보 띠(가짜 수치)
- 손맛 효과
  - 효과 표대로: 숫자는 내 타워만, 흔들림은 3가지 사건만 150ms, 대장 멈춤 50ms
  - 효과는 이벤트로 내보내서 단위 시험으로 셀 수 있게 한다
  - `prefers-reduced-motion`이면 효과를 끈다
- 단위 시험
  - 풍선 위치가 매 틱 길 위에 있다(오차 0.5 판 좌표, D16)
  - 가짜 지킴이 1,000명이어도 그리는 타워가 N + 1 이하다(D22, 배치 계산 단위)
  - 360×640에서 자리 44px 이상, 간격 8px 이상, 이름표 겹침 0(D63)
  - D79 이벤트 수
- 검증 명령
  ```sh
  pnpm data:dev-fixture && pnpm test --filter core --filter web && pnpm --filter web build
  ```
- 확인: 메인이 `/browse`로 360·390·1024·1440·1920px에서 판 비율과 판이 남은 높이를 채우는지(D64) 재고, 대장·뚫림 연출을 찍는다
- 완료 기준: 위 DoD(시험 판 1곳 기준). 185곳 확인은 T16이다.

### T7: 방어 화면 2 — 문제 패널, 레벨 막대, 대표 목록, 띠, 지난 소식, 연결 끊김 — DoD: D41, D42, D66(띠), D58(화면 부분)

- [x] T7
- 기준 시안: `option-b.html?screen=stage`, `?screen=stage-wrong`, `?screen=stage-away`, `?screen=stage-34`, `?screen=stage-56`, 데모 `right`, `wrong`, `streak5`, `down3`, `fast`, `guess`, `daily`, `upgrade`, `newlook`, `material`, `evolve`, `levelup`, `offline`

- 문제 패널(가짜 문제 목록)
  - 머리줄 "학년군 · 유형"(찍기 의심·하루 많이 안내는 머리줄 칸을 바꿔 씀)
  - 식, 보기 2×2
  - 오답이면 고른 답 / 정답 / 풀이가 보기 자리를 대신 차지한다. 패널 높이가 바뀌지 않는다(시안 2차 검수 반영).
  - 건너뛰기, 다음 문제
- 내 레벨·업그레이드 막대, 대표 목록(오늘의 대표 지킴이)
- 띠: 정답, 도전, 업그레이드, 새 장식, 재질·진화, 레벨업, 속보, 재정비, 쉬어 가요, 천천히, 연결 끊김
- 지난 소식 시트, 연결 끊김 상태(보기 잠금)
- **판의 내 타워, 대표 목록의 "나" 줄, 막대는 같은 상태 저장소 하나에서 그린다.** 시안 `evolve` 데모의 "47단계" 불일치를 되풀이하지 않는다(메모 참고).
- 단위 시험
  - 패널 배치 계산: 360×640·390×844에서 판 + 패널이 한 화면, 식 32px, 보기 높이 700px 이하 휴대폰 56px 이상·그 밖 64px 이상(D41)
  - 머리줄에 단계 번호 0건
  - 상태 저장소 하나에서 세 곳이 같은 단계를 그린다
- 검증 명령
  ```sh
  pnpm test --filter web && pnpm --filter web build
  ```
- 확인: 메인이 `/browse`로 위 데모를 360·390·1920px에서 찍고 `mathPanelHeightPx`가 정답·오답에서 같은지 잰다
- 완료 기준: D41, D42, D66 띠 부분, D58 화면 부분(끊김 표시·잠금. 실제 끊김은 T13)

### T8: 내 지킴이 화면과 전국 상황판 (가짜 데이터) — DoD: D53(화면), D59(화면), D60, D61

- [x] T8
- 기준 시안: `option-b.html?screen=me`(데모 `me-type`, `me-stance`, `me-color`, `me-500`), `?screen=board`(데모 `board-tab`, `board-mine`, `board-empty`)

- 내 지킴이 화면
  - 레벨, 스탯 4, 성향 5, 계열 3, 색 12(10레벨마다 열림)
  - 문턱 7개 미리보기(1·10·25·50·100·200·500), 다음 모양 검은 실루엣 + "50단계에 청동 타워"
- 전국 상황판
  - 185칸 5색 + 회색, 순위 탭 2개, 우리 지역 고정 줄, 지역 카드
  - T3의 지도 컴포넌트를 다시 쓴다
- `packages/core/format.ts`: 한국식 큰 수(만·억·조·경, 그 위 × 10ⁿ)
- 단위 시험: D61 경계값, 미리보기 7개의 겉모습 열쇠가 서로 다름, 계열·성향·색을 바꾸면 상태 저장소가 바뀜
- 검증 명령
  ```sh
  pnpm test --filter core --filter web && pnpm --filter web build
  ```
- 확인: 메인이 `/browse`로 두 화면을 360·390·1920px에서 찍는다
- 완료 기준: D53 화면 부분, D59 화면 부분, D60, D61

### T9-1: 수학 생성기 — 1~2·3~4학년군 — DoD: D27, D28·D29·D30·D31(이 학년군)

- [x] T9-1
- 기준: spec "학년군별 수학 문제", `~/.claude/skills/elementary-problem-generator/references/` 성취기준·품질 기준(읽기만)

- `packages/core/math/levels.ts`: 유형표
- `packages/core/math/generators/`
  - (시드) → {식, 정답, 보기 4, 풀이, 유형 이름, 성취기준}
  - 곱셈구구 3단계, 두 자리 수 곱셈, 나머지 나눗셈, 세 자리 × 두 자리, 두 자리 수로 나누기
- 조사 고르기(받침), 오답 규칙
- 방어 화면 문제 패널이 가짜 목록 대신 이 생성기를 쓴다. 개발 모드 화면 변화다. 실제 문제는 T12부터 서버가 낸다.
- 시드 10,000개 검사 시험: 범위, 정답 1개, 보기 서로 다름, ±1 오답 1개 이하, 나머지 < 나누는 수, 정답 위치 25% ± 3%, 조사 자리표시 0, 서로 다른 문제 18개 이상
- 검증 명령
  ```sh
  pnpm test --project core math
  ```
- 완료 기준: 위 DoD를 1~2·3~4학년군에서 통과

### T9-2: 수학 생성기 — 5~6학년군(분수·소수) — DoD: D27~D31 완료

- [x] T9-2
- 기준 시안: `option-b.html?screen=stage-56`(분수 세로꼴)

- `packages/core/math/rational.ts`: 직접 만든 유리수 모듈(새 라이브러리 없음)
- 분수 덧셈·뺄셈, 분수·소수 곱셈, 분수·소수 나눗셈 생성기
- 분수 세로꼴 표기 컴포넌트(분수 숫자 20px 이상)
- 같은 10,000개 검사 + 소수 넷째 자리 이하 0, 대분수의 분수 부분은 진분수, 약분 문제는 모양으로 채점
- 검증 명령
  ```sh
  pnpm test --project core math && pnpm --filter web build
  ```
- 완료 기준: D27~D31 전체 통과(세 학년군)

### T10-1: 웨이브와 게으른 계산 (정확성 PoC 포함) — DoD: D17, D18, D19

- [x] T10-1

spec 위험 "게으른 계산의 정확성 (PoC 필요)". 서버(T13)보다 앞에 둔다.

- `packages/core/game/waves.ts`
  - BigInt만 쓴다: H(w), 막기·뚫림(max(1, w − 5)), 최고 웨이브
  - 6웨이브 주기로 바로 구하는 정산, 화력 변화는 "다음 웨이브부터"
- 검산기: 한 웨이브씩 정산
- 무작위 화력 변화 기록 1,000가지(최대 30일)에서 두 정산이 같은지 본다
- 시간 측정: 30일 정산 ≤ 5ms, 365일 ≤ 20ms
- 부동소수 사용 0건 검사(lint 규칙 또는 코드 검사 시험)
- 개발용 화면 `/dev/sim`: 화력·기간을 넣으면 웨이브 흐름 표와 그래프를 보여 준다
- 검증 명령
  ```sh
  pnpm test --project core waves
  ```
- 완료 기준
  - D17, D18, D19
  - 어긋나면 공식을 고치고, 고친 내용을 spec 결정 사항에 적는다

### T10-2: 성장 규칙과 진행 속도 봇 — DoD: D20(core), D45, D46, D47, D49

- [x] T10-2

spec 위험 "진행 속도 맞추기 (PoC 필요)". 포인트·업그레이드를 서버에 붙이는 T12보다 앞에 둔다.

- `packages/core/game/progress.ts`
  - 포인트표, 레벨표, 업그레이드 비용, 타워 힘 B(s), 스탯 나누기(성향)
  - 하루 줄이기 계산(순수 함수)
- 진행 속도 봇
  - 하루 정답 50개 기준과 하루 300개 기준
  - 결과를 `/dev/sim`에 표로 보여 준다
- 수치가 목표 밖이면 시작 후보 수치를 고치고 spec 결정 사항에 적는다
- 검증 명령
  ```sh
  pnpm test --project core progress
  ```
- 완료 기준: D45, D46, D47, D49, D20(뚫림이 아이 값을 바꾸지 않음, core 단위)

### T11: 게임 서버 1 — 지킴이, 복구 코드, 지역 고르기·바꾸기, 기록 지우기 (화면 연결) — DoD: D1, D3, D4, D5, D6, D7, D8, D26, D40(새 지킴이 한도), D54(일부), D69, D76

- [ ] T11

- `apps/server`
  - SQLite(WAL) 스키마: spec "서버 DB"
  - T1에서 고른 드라이버와 설정, 50ms 묶어 쓰기를 쓴다
- 기능
  - 익명 지킴이 만들기, 기기 열쇠 해시
  - 별명 번호 검사, 복구 코드 해시, 이어 하기
  - 시도 제한: 같은 주소 HMAC 1시간 10번, 새 지킴이 60개
  - 학년군·지역·별명 바꾸기, 지역 바꾸기 규칙(24시간 / 30일)
  - 기록 지우기, 365일 미접속 정리
- 허용 Origin 하나. 로그에 별명·열쇠·코드·IP를 남기지 않는다.
- 화면 T3·T5의 첫 진입 흐름을 서버에 붙인다. 기기에는 열쇠만 둔다.
- 통합 시험(socket.io-client·HTTP, 실제 SQLite 임시 파일)
  - D4 DB 덤프에 원문 0
  - D5·D40 한도
  - D7 경계값(24시간·30일 직전·직후)
  - D8 지우기 뒤 열쇠·코드 실패
  - D54 남의 열쇠 거절
  - D69 스키마에 IP·UA 열 0
  - D76 시계를 바꾼 시험
- 검증 명령
  ```sh
  pnpm test --filter server --filter core && pnpm --filter server build && pnpm --filter web build
  ```
- 확인: 메인이 `/browse`로 처음 하기 → 방어 화면, 새로 고침 뒤 이어짐(D6), 다른 브라우저에서 복구 코드로 이어짐(D4)을 손으로 확인한다. 서버와 웹은 확인 뒤 끈다.
- 완료 기준: 위 DoD(D3의 낱말 사람 검토와 D1의 E2E는 T19)

### T12: 게임 서버 2 — 문제 내기·채점, 포인트, 찍기 막기, 자동 업그레이드 [E2E] — DoD: D20, D32, D33, D34, D35, D36, D37, D38, D39, D40, D48, D54

- [ ] T12

- 서버
  - 열린 문제 하나, 최근 50문제 중복 막기
  - 서버 채점, 두 번째 답 거절
  - 포인트(10/12/15), 하루 줄이기, 1.0초 안 답, 분당 20개, 찍기 의심 5분, 건너뛰기 반복 대기
  - 단계 이동(5연속 / 3연속)
  - 레벨·스탯·자동 업그레이드는 T10-2 규칙을 쓴다
- 응답에는 문제를 낼 때 정답이 없고, 답을 낸 뒤에만 정답을 보낸다
- 화면 T7 패널과 막대를 서버에 붙인다. 정답 포탄과 업그레이드·재질·진화 연출은 서버 결과로 낸다.
- 시험
  - 단위·통합: D35~D39 경계값, D36 0시 넘김, D54 화면이 보낸 값 무시
  - E2E는 이 셋만:
    - D32 연속 100문제와 새로 고침 뒤 같은 문제
    - D33 응답 기록에 정답 0
    - D34·D48 포인트와 업그레이드 띠
- 검증 명령
  ```sh
  pnpm test --filter server --filter core
  uptime && pnpm --filter web test:e2e -- tests/e2e/math.spec.ts   # 시험용 서버·웹을 띄우고 끝나면 끔
  ```
- 완료 기준: 위 DoD

### T13: 게임 서버 3 — 지역 정산, 화력 모으기, 대표 뽑기, 지역 방송, 지난 소식, 연결 순서 [E2E] — DoD: D21, D22, D23, D24, D57, D58, D77

- [ ] T13

- 서버
  - 지역 상태와 게으른 정산(T10-1), 화력 10초 모으기, 대표 10분 뽑기
  - 지역 방 1초 방송(정답 수·화력·대표·속보)
  - 지난 소식 계산, 재시작 뒤 이어 계산
  - `/health`에 경로별 접속 수
- 화면
  - 방어판을 서버 상태로 그린다(늦으면 그 웨이브로 건너뜀)
  - 연결 끊김 3초 표시
  - 연결 순서: 도메인 → IP 경로 `/ktd/socket.io` → `/rt` 프록시(long polling). gojang `lib/rt-client/url.ts` 방식을 본뜨되 코드는 새로 쓴다.
- 시험용 서버 시계(배속)
- 시험
  - 단위·통합: D21 동점 규칙, D24 1시간 경계, D57 강제 종료 뒤 정답 남음(통합 시험)
  - E2E는 이 셋만:
    - D23: 60배속 100웨이브의 화면·서버 일치
    - D58: 서버를 끊었다 켬
    - D77: 가짜 차단 3경우
  - D22는 가짜 지역 1,000명으로 통합 시험한다
- 검증 명령
  ```sh
  pnpm test --filter server --filter core
  uptime && pnpm --filter web test:e2e -- tests/e2e/region.spec.ts tests/e2e/connect.spec.ts
  ```
- 완료 기준: 위 DoD

### T14: 부하 시험 본편 (실제 서버 코드) — DoD: D25, D55, D56, D57

- [ ] T14

- T1의 부하 발생기를 `apps/server/load/`로 옮기고 실제 서버(T11~T13)로 S1~S3을 다시 돈다
- 같은 Docker 제한(`--cpus=1 --memory=768m`)에서 잰다
- T1 기록과 비교한 표를 `docs/poc/load-poc.md`에 더한다
- 실패하면 T1의 "실패하면 바꿀 것" 순서를 따른다. 사용자 결정이 필요하면 멈추고 묻는다.
- 검증 명령
  ```sh
  uptime
  docker run -d --name ktd-load ... && pnpm --filter server load:s1 && pnpm --filter server load:s2 && pnpm --filter server load:s3
  docker rm -f ktd-load
  ```
- 완료 기준: D25, D55, D56, D57 통과. 실측 RSS를 사용자에게 알린다(systemd `MemoryHigh`·`MemoryMax` 값 확정용).

### T15: 판 데이터 PoC — 종로구, 평창군, 신안군, 울릉군 — DoD: D10·D11·D12·D15·D63(4곳)

- [ ] T15

spec 위험 "185개 맵 자동 생성", "OSM 도로 품질과 태그", "경계와 도로가 어긋남"(모두 PoC 필요). T16보다 앞에 둔다.

- OSM 추출본
  - Geofabrik 대한민국 `.osm.pbf` 하나를 받아 날짜·sha256을 고정한다. 원본은 커밋하지 않는다.
  - pbf 읽기 도구를 고르고 이유를 spec에 적는다
- 주요 도로 뽑기와 처리
  - 태그 대응(trunk/primary/secondary)을 정한다
  - 왕복 도로를 하나로 합치고, 경계 교차점을 묶는다
  - 입구(땅 인접·links.json), 지킬 곳, 길 그래프와 단순화
  - 자리 배치는 T6의 단계를 다시 쓴다
- 항구 좌표 `data/stages/ports.json`(출처 기록)
- 4곳 판 파일을 만들고 방어 화면에서 지역 코드로 연다. 판 선택이 화면 변화다.
- 검증 명령
  ```sh
  pnpm data:osm-fetch-check && pnpm data:build-stages --only 11110,32540,46910,47940 && pnpm test --filter data
  ```
- 확인: 메인이 `/browse`로 4곳을 360·1920px에서 찍는다
- 완료 기준: 4곳이 D10·D11·D12·D15·D63을 만족하고, 결과와 고친 규칙이 `docs/poc/stage-poc.md`에 있다

### T16-1: 전국 185곳 일괄 생성과 이상 지역 보고서 — DoD: D9, D13, D16, D74

- [ ] T16-1

- 185곳 판 파일 `public/stages/<버전>/`과 `index.json`, 전국 상황판용 `public/map/<버전>/korea.topo.json`을 만든다
- 각 판에 출처 필드를 넣는다(OSM ODbL, 경계 CC BY 4.0, 추출 날짜)
- 화면 속도 규칙(한 웨이브 60초 안)을 넣는다
- 보고서 `data/stages/report.json`(spec "만드는 순서" 4단계 기준)
- 같은 입력으로 다시 빌드하면 바이트가 같은지 본다
- 검증 명령
  ```sh
  pnpm data:build-stages && pnpm data:check-stages && pnpm data:build-stages && git diff --exit-code public/stages
  ```
- 완료 기준
  - D9, D13, D16, D74를 통과한다(D9는 보정 전 걸린 지역이 보고서에 있으면 T16-2에서 마무리)
  - 보고서가 만들어진다

### T16-2: 수작업 보정 — 보고서 비우기 — DoD: D10, D11, D12, D14, D15, D63

- [ ] T16-2

- 걸린 지역만 `data/stages/overrides/<code>.json`으로 고치고 이유를 적는다
- 보고서가 빌 때까지 반복한다. 한 세션에 끝나지 않으면 T16-3으로 나눈다.
- 검증 명령
  ```sh
  pnpm data:build-stages && pnpm data:check-stages   # report.json 비어 있음
  ```
- 확인: 메인이 `/browse`로 보정한 지역 몇 곳을 찍는다
- 완료 기준: D14(보고서 0곳), D10, D11, D12, D15, D63(185곳 자동 확인)

### T17: 전국 상황판과 지역 고르기를 실제 데이터에 연결 — DoD: D59, D60

- [ ] T17

- 서버에 상황판 API를 둔다: 30초마다 받기, 최고 웨이브 구간 5색(분위수), 오늘 1인당 정답(3명 이상)
- 지역 고르기 화면의 지킴이 수·최고 웨이브를 실제 값으로 바꾼다
- 시험: 통합 시험(가짜 지역 데이터로 5색·회색·순위)
- 검증 명령
  ```sh
  pnpm test --filter server --filter web && pnpm --filter web build
  ```
- 확인: 메인이 `/browse`로 상황판을 360·390·1920px에서 찍는다
- 완료 기준: D59(E2E 부분은 T19), D60

### T18: 에셋 목록과 Kenney 입자, 빌드 검사 — DoD: D52, D73(에셋 목록)

- [ ] T18

- `assets/manifest.json`
  - 코드로 그린 그림 모듈은 "자체 제작"으로, Kenney Particle Pack(CC0) 가져온 파일은 원본 주소·날짜와 함께 적는다
  - CC BY 그림(예: game-icons.net 장식 밑그림을 쓸 때)은 `author`(작가), `sourceUrl`(출처 URL), `license`(`CC-BY-3.0` / `CC-BY-4.0`과 라이선스 링크), `modified`(고쳤는지), `attribution`(표기 문구)을 모두 적는다
- 효과 입자는 Kenney 그림에 색을 입혀 쓴다. 시안 B 효과 모양을 지킨다.
- 빌드 검사 `pnpm assets:check`. 아래 중 하나라도 있으면 빌드가 실패한다.
  - 목록 밖 그림
  - 허용 목록(자체 제작, `CC0-1.0`, `CC-BY-3.0`, `CC-BY-4.0`) 밖 라이선스(SA·NC·ND, MIT·Apache 포함)
  - CC BY인데 `author`·`sourceUrl`·`license`·`attribution` 중 빈 칸
- 표기
  - manifest에서 정보 화면 "에셋 출처" 목록과 저장소 `CREDITS.md`를 만든다
  - CC BY 그림마다 작가, 출처 링크, 라이선스 링크, 고쳤는지, 표기 문구를 보여 준다
  - 검사로 둘이 manifest와 같은지 본다
- MIT·Apache 그림이 필요해지면 넣지 말고 멈춰서 사용자에게 묻는다
- 검증 명령
  ```sh
  pnpm assets:check && pnpm assets:credits --check && pnpm --filter web build
  # 실패 시험: 목록 밖 파일, MIT 라이선스 항목, author가 빈 CC BY 항목을 각각 넣어 빌드가 실패하는지 본다
  ```
- 확인: 메인이 `/browse`로 정보 화면 "에셋 출처"를 360·1920px에서 찍는다
- 완료 기준: D52, D73의 에셋 부분

### T19: 마감 — 너비, 성능, 외부 요청 0, 움직임 줄이기, SEO, 개인정보 검사 [E2E] — DoD: D1, D22, D53, D59, D62, D65, D66, D67, D68, D70, D71, D75, D79

- [ ] T19

- Playwright
  - 처음 하기 흐름에서 text 입력 0(D1)
  - 360·390·1024·1440·1920px의 모든 화면 가로 넘침 0(D62)
  - 버튼 44px·8px 간격(D65)
  - 띠 E2E(D66)
  - 4배 느린 CPU 성능(D67, 풍선 60·타워 15·포격 20)
  - 외부 요청 0(D70)
  - `prefers-reduced-motion` 효과 이벤트 0(D79)
  - 내 타워 화면 바꾸기가 판에 바로 반영(D53)
  - 상황판 E2E(D59), 타워 수 N + 1(D22)
- 코드 검사: 위치·카메라·마이크 API 0(D68), 광고·결제 화면 0(D71)
- SEO 파일 200(D75)
- D67이 실패하면 스프라이트 캐시·배경 오프스크린부터 고친다. 그래도 실패하면 PixiJS 검토를 사용자에게 묻는다.
- 검증 명령
  ```sh
  uptime && pnpm --filter web build && pnpm --filter web test:e2e   # 동시에 2개까지, 띄운 서버는 끔
  ```
- 완료 기준: 위 DoD 자동 부분. 실기기 확인(D67 수동)은 T20 뒤에 한다.

### T20: 배포 준비와 배포 (스크립트·안내, 실행은 사용자) — DoD: D77(실제 경로), D44·D67(수동)

- [ ] T20

- 서버 배포 파일
  - `scripts/rt/`: gojang 방식을 본뜬다. 빌드 → 올리기 → systemd 유닛(`MemoryHigh`·`MemoryMax`는 T14 실측으로), 쓰기 허용 폴더, 자동 재시작
  - Caddy 사이트 파일 초안: 도메인 사이트, IP 사이트 `/ktd` handle_path, 접근 로그 없음
  - 매일 DB 파일 백업 스크립트와 복원 시험 안내
  - 점검 화면
- Vercel 설정: 환경 변수 이름, `/rt` 프록시 rewrite, 공유 비밀값 헤더
- `docs/ops.md`: 사용자 실행 순서, 끄기·되돌리기, 확인 명령
- 사용자가 실행한 뒤 확인한다
  - 세 경로 연결(D77 실제)
  - 가벼운 연기 시험(접속 50개 이하, 사용자 허락 뒤. 부하 시험은 하지 않음)
- 수동 확인
  - D44: 학년군마다 아이 2명
  - D67: 중급 안드로이드 휴대폰·아이패드
  - D3: 별명 낱말 검토
  - 정보 화면 문구 검토
  - 확인할 목록을 사용자에게 넘긴다
- 검증 명령
  ```sh
  pnpm --filter server build && pnpm --filter web build && bash scripts/rt/check.sh   # 서버 /health, 세 경로
  ```
- 완료 기준
  - 사용자가 배포를 마친다
  - D77 세 경로가 운영 주소에서 된다
  - 수동 확인 목록이 사용자에게 넘어간다

## DoD 연결표

| DoD | 태스크 |
|---|---|
| D1 | T5(화면), T11, T19 |
| D2 | T3 |
| D3 | T4(화면), T11, T20(사람 검토) |
| D4~D8 | T11 |
| D9 | T16-1 |
| D10~D12 | T15, T16-2 |
| D13 | T16-1 |
| D14 | T16-2 |
| D15 | T15, T16-2 |
| D16 | T6, T16-1 |
| D17~D19 | T10-1 |
| D20 | T10-2, T12 |
| D21 | T13 |
| D22 | T6, T13, T19 |
| D23, D24 | T13 |
| D25 | T1(사전), T14 |
| D26 | T3, T11 |
| D27~D31 | T9-1, T9-2 |
| D32~D39 | T12 |
| D40 | T11, T12 |
| D41, D42 | T7 |
| D43 | T3 |
| D44 | T20(수동) |
| D45~D47, D49 | T10-2 |
| D48 | T12 |
| D50, D51 | T4 |
| D52 | T18 |
| D53 | T8, T19 |
| D54 | T11, T12 |
| D55, D56 | T1(사전), T14 |
| D57 | T1(사전), T13, T14 |
| D58 | T7, T13 |
| D59 | T8, T17, T19 |
| D60 | T3, T8, T17 |
| D61 | T8 |
| D62 | T3, T19 |
| D63 | T6, T15, T16-2 |
| D64 | T6 |
| D65 | T19 |
| D66 | T7, T19 |
| D67 | T19, T20(수동) |
| D68 | T5, T19 |
| D69 | T11 |
| D70, D71 | T19 |
| D72 | T6 |
| D73 | T5, T18 |
| D74 | T16-1 |
| D75 | T2, T19 |
| D76 | T11 |
| D77 | T13, T20 |
| D78 | T4 |
| D79 | T6, T19 |

## 사용자가 할 일

| # | 할 일 | 언제까지 | 막히는 태스크 |
|---|---|---|---|
| U1 | ~~Q35 에셋 라이선스 규칙 답~~ 끝남(2026-10-27: CC0 우선 + CC BY 표기 허용). MIT·Apache 그림이 필요해지면 그때 다시 답 | 필요할 때 | T18 |
| U2 | ~~Q36 타워 그림을 굽는 곳 답~~ 끝남(2026-10-27: 처음 그릴 때 굽고 캐시) | - | - |
| U3 | **GitHub 공개 저장소 만들기**(`korea-tower-defence`)와 원격 연결·push 허락 | T2 뒤 아무 때나 | 원격 push, Actions |
| U4 | T1 부하 PoC가 실패하면 서버 배치 결정(별도 인스턴스 / MemoryMax 올림 / 기준 낮춤) | T1 결과 뒤 | T11 |
| U5 | 별명 낱말 목록과 복구 코드 낱말 목록 사람 검토(외모·성별·지역 비하·놀림 말 없음) | T11 전 | T11(D3) |
| U6 | **Vercel 프로젝트 이름 `korea-tower-defence` 확인**, GitHub 저장소를 Vercel 프로젝트로 연결, 환경 변수 넣기 | T20 | T20 |
| U7 | **jigsaw 포트 할당표에서 4000이 비었는지 확인**하고 `4000 · korea-tower-defence · korea-tower-defence-rt.gyosil.app` 등록 | T20 | T20 |
| U8 | **`gyosil.app` DNS(Vercel)에 A 레코드** `korea-tower-defence-rt` → `13.124.90.119` | T20 | T20 |
| U9 | **서버 Caddy**: 도메인 사이트 파일 설치, IP 사이트에 **`/ktd` 경로 추가**(공통 설정이라 다른 앱 영향 확인), 접근 로그 끔 | T20 | T20 |
| U10 | 서버에 비밀값 넣기(`SESSION_SECRET`, `IP_HMAC_KEY`, `PROXY_SHARED_SECRET`), systemd 유닛 설치·시작, `MemoryHigh`·`MemoryMax` 승인(T14 실측 기준) | T20 | T20 |
| U11 | 백업 방식 승인: 매일 DB 파일 복사(서버 안) + Lightsail 스냅숏 여부(스냅숏은 요금이 듦) | T20 | T20 |
| U12 | 정보 화면 문구(개인정보 안내, "서버에 무엇을 저장하나요") 검토 | 배포 전 | 공개 |
| U13 | 실사용 확인: 학년군마다 아이 2명 이상 10분 사용(D44), 중급 안드로이드 휴대폰·아이패드 확인(D67) | 배포 뒤 | 마감 |

## 메모

- **순서 이유**
  - 가장 큰 위험(서버 한 대 부하)을 T1에서 먼저 잰다. 실패하면 서버 배치가 바뀌어 이후 서버 설계가 달라지기 때문이다.
  - 그다음 초기화(T2)와 확정 시안 화면(T3~T8, 가짜 데이터)을 먼저 만들어 화면을 일찍 확정한다.
  - core 규칙(T9·T10)은 서버보다 앞에 둔다. 게으른 계산과 진행 속도의 PoC가 들어 있다.
  - 서버(T11~T13)와 부하 본편(T14)이 그 뒤다.
  - 판 데이터(T15·T16)는 화면이 시험 판으로 먼저 돌아가므로 서버 뒤에 해도 막히는 곳이 없다.
- **같은 상태에서 그리기**: 시안 `evolve` 데모에서 판의 내 타워는 100단계인데 대표 목록 "나" 줄은 "타워 47단계"로 남는다(시안은 고치지 않음). 구현에서는 내 지킴이 상태를 저장소 하나에 두고, 판의 내 타워, 대표 목록 "나" 줄, 레벨 막대, 내 지킴이 화면이 모두 그 하나를 읽는다(T7 단위 시험).
- **시안에서 그대로 가져올 것**
  - 자리 배치 단계(군 안 우선, 모자라면 군 밖, 간격 240→200)
  - 이름표 8방향 × 3거리 + 2px 여백
  - 오답일 때 패널 높이 고정(보기 자리를 풀이가 대신 차지)
  - 360~429px에서 지표 줄의 "지킴이 N명" 숨김, 높이 700px 이하 첫 화면 지도 축소
  - 그림 코드(T4)와 효과 규칙(T6)
- **시안과 다르게 할 것**
  - 시안의 가짜 길은 시험 판(T6)에만 쓰고, 실제 판은 OSM(T15·T16)으로 만든다
  - 시안의 한 웨이브 20초는 실제 60초다
  - `/dev/*` 화면은 운영에서 noindex이고 링크하지 않는다
- **새 의존성**: socket.io, SQLite 드라이버(T1에서 고름), OSM pbf 도구(T15에서 고름), 실루엣 시험용 캔버스(T4에서 고름). 각각 이유를 spec 기술 스택·위험 요소에 적는다.
- **열린 질문 기본값**: Q15·Q16·Q19~Q22·Q24~Q34는 추천안으로 진행한다. Q35(CC0 우선 + CC BY 표기 허용)와 Q36(처음 그릴 때 굽고 캐시)은 2026-10-27 사용자 답으로 닫혔다.
