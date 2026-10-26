# UI 시안 (1.5단계)

spec: `/Users/jinsyu/dev/korea-tower-defence/docs/spec.md`

세 시안 모두 실제 경계 데이터(gojang `public/regions/20261001`)를 읽어 그린다. 화면 흐름과 게임 동작(웨이브, 적 이동, 타워 공격, 하트, 돈, 결과)은 같은 코어 코드로 움직이고, 세계관·배치·글꼴·그리기만 다르다.

## 여는 법 (메인 세션 준비 명령)

planner는 셸이 없어 데이터를 복사하지 못했다. 아래 명령을 먼저 실행해야 한다. gojang은 읽기만 하고 고치지 않는다.

```sh
M=/Users/jinsyu/dev/korea-tower-defence/docs/design/mockups
mkdir -p $M/data/regions/20261001 $M/data/board
cp /Users/jinsyu/dev/gojang/public/regions/20261001/*.json $M/data/regions/20261001/
cp /Users/jinsyu/dev/gojang/data/board/adjacency-report.json /Users/jinsyu/dev/gojang/data/board/links.json $M/data/board/
cd $M && python3 -m http.server 8765 &   # 끝나면 이 PID로 종료
# http://localhost:8765/option-a.html  option-b.html  option-c.html
```

- `korea-sido.topo.json`, `sigungu-*.topo.json`, `index.json` 외에, 이웃 판정용으로 `adjacency-report.json`(땅 이웃)과 `links.json`(다리·터널·배편 15개)도 함께 복사한다. 이 두 파일이 없으면 전국 지도에서 열림·잠김 상태를 계산할 수 없다.
- `file://`로 열면 fetch가 막혀 "지도 데이터를 불러오지 못했어요" 안내가 뜬다.

## 검수 도우미

- 주소 끝에 `?screen=home|pick|map|stage|result|info`를 붙이면 해당 화면이 바로 열린다. 시안 B는 `grade|equip|math|math-2|math-3|math-5`도 된다(아래 "시안 B 2판 보강").
- `?qa=1`을 붙이면 왼쪽 아래에 측정 패널(scrollWidth, clientWidth, 설치 자리 크기·간격, 44px 미만 버튼)이 뜬다.
- 콘솔에서 `__qa()`를 실행하면 다음 값을 돌려준다.
  - 공통: `horizontalOverflow`, `scrollWidth`, `clientWidth`, `smallTargets`(44px 미만 버튼), `elementsOutsideViewport`
  - 지역 판: `spotCount`, `spotDiameterPx`(설치 자리 지름, 44 이상), `spotMinGapPx`(자리 사이 최소 빈틈), `spotsInsideMap`, `stageFitsViewport`(판 전체가 스크롤 없이 화면 안), `labelSpotOverlaps`(이름표와 설치 자리 사각형이 겹치는 수, 0이어야 함), `labelGateOverlaps`(이름표와 입구 표시가 겹치는 수, 0이어야 함)
- `?screen=result`로 바로 열면 승리 가짜 상태(별 3, 새로 열린 곳 강릉시)가 채워져 있다. 이때 전국 지도의 진행 상태는 바뀌지 않는다.
- 위쪽 "시안 데모" 버튼에서 연출을 바로 볼 수 있다: 색칠·새 이웃 열림, 잠긴 지역, 진행 처음으로, 저장 오류 안내, 처음 판 손가락 안내, 타워 자동 배치, 웨이브 시작, 하트 깎임, 대장 등장, 돈 부족, 하트 3개 위험, 일시정지, 승리(별 3·2), 실패.
- 시안 B의 아래쪽 속보 띠는 일부러 흐르는 장식이라 `data-qa-ignore`로 측정에서 뺐다. 띠 자체는 `overflow:hidden` 상자 안에 있다.

## 공통 사항

- 지역 판 예시: 평창군(32540). 입구는 맞닿은 이웃 횡성·강릉·영월·정선 경계의 실제 공유선 가운데 점. 홍천 쪽은 배경 길만 둔다.
- 길은 **시안용 가짜 길**이다. 평창 경계 안에서 격자 길찾기로 만든 선이며, 판 오른쪽 아래에 "시안용 가짜 길"이라고 표시했다. 실제 서비스는 OSM 도로를 단순화해 쓴다.
- 설치 자리 지름은 `clamp(92 × 배율, 44, 96)`px. 자리 간격은 판 좌표 140(긴 변 1000 기준)이라 360×640 휴대폰에서도 빈틈이 약 14px 남는다(계산값).
- 진행 상태는 가짜 데이터: 원주에서 시작해 원주·횡성·영월·충주·제천·양평 6곳을 지킨 상태(평창은 열림).
- 외부 자원은 Google Fonts CSS 링크뿐이다. JS 라이브러리나 CDN 스크립트는 없다. Google Fonts CSS2 API는 버전 고정 주소가 없어 고정하지 못했다(글꼴이 안 오면 시스템 글꼴로 대체되고 기능은 그대로).
- 파비콘 404로 콘솔 오류가 나지 않게 `<link rel="icon" href="data:,">`를 넣었다.

## 시안 A: 동네 지킴이 스티커북

- 파일: `option-a.html`
- 콘셉트: 문방구 스티커북과 종이 오리기. 지역은 오려 붙인 색종이, 길은 마스킹 테이프, 타워는 스티커, 별은 금박 스티커.
- 글꼴: Jua(제목), Gowun Dodum(본문).
- 배치: 휴대폰은 아래쪽 스티커 서랍(타워 3개 + 시작 버튼), 900px 이상은 오른쪽 공책 패널.
- 이름: 고무줄 새총 / 비눗방울 펑 / 끈끈 달팽이, 적은 먼지 친구들.

## 시안 B: 전국 지킴이 생중계

- 파일: `option-b.html`
- 콘셉트: 스포츠 중계와 개표 방송. 점수판(스코어버그) HUD, LIVE 표시, 아래 속보 띠, 지역 카드는 하단 자막, 결과는 "경기 종료" 점수판.
- 글꼴: Black Han Sans(제목), Gothic A1(본문).
- 배치: 설치 자리를 누르면 둥근 메뉴(링)가 그 자리에서 열린다(타워 버튼 62px). 넓은 화면은 오른쪽 "중계석" 패널, 전국 지도는 시·도별 진행 막대가 붙은 판세 화면.
- 이름: 스피드건 / 물대포 / 끈끈 테이프, 적은 풍선.

### 시안 B 2판 보강 (2026-10-26, 확정 시안)

사용자가 시안 B를 골랐고(2026-10-26), spec 2판의 "장비 + 부품 끼우기"와 "학년별 수학 문제"를 B에만 더했다. A·C는 고치지 않았다.

- 새 화면
  - 학년군 고르기(`?screen=grade`, 2.1판): 학년군 3개 큰 버튼(1~2 / 3~4 / 5~6학년)과 버튼마다 유형 이름과 예시 식(7 × 8 / 34 × 26 / 2/3 + 1/4). 학년·학기·단계 목록은 없다. 휴대폰은 세로 3줄(버튼 88px), 넓은 화면은 3열 카드. "처음부터"와 정보 화면 "학년군 바꾸기"에서 들어간다.
  - 장비 정비 시트(`?screen=equip`): 놓은 장비를 누르면 열린다. 휴대폰은 아래(장비가 아래쪽이면 위)에 판 높이 50% 이하로, 넓은 화면은 오른쪽 중계석 자리에 뜬다. 부품 칸 3개(잠긴 칸은 "강화하면 열림"), 효과 줄, 보관함 부품 8종(남은 수), 강화·팔기.
  - 수학 문제 시트(`?screen=math` 또는 `math-2`, `math-3`, `math-5`): 웨이브 1~4가 끝나면 배너 뒤 1.7초에 뜬다. 머리줄 "학년군 · 유형"(단계는 보이지 않음), 성취기준 코드, 식(32px 이상), 4지선다(64px 이상), 연속 정답 막대, 도장 5칸, 건너뛰기. 넓은 화면은 2단(식·풀이 / 보기).
    - `math`: "1~2학년 · 곱셈구구" 7 × 8
    - `math-3`: "3~4학년 · 곱셈" 34 × 26
    - `math-5`: "5~6학년 · 분수 덧셈" 2/3 + 1/4
    - 고른 오답에는 "✕ 내가 고른 답" 표시와 빗금이, 정답에는 "정답" 표시가 남는다.
- 새 "시안 데모"
  - 장비·부품: 장비 정비 시트, 부품 끼우기(렌즈, 손가락 안내 → 찰칵 → 사거리 원 커짐), 강화 → 새 칸 열림, 빈 칸 없음 안내
  - 수학 문제: 웨이브 끝 → 문제, 정답 + 새 부품(도장 5개째), 오답 + 풀이, 5연속 → "더 어려운 문제에 도전!", 3연속 오답 → "조금 쉬운 문제로 연습해요", 3~4학년 두 자리 곱셈, 3~4학년 나머지 나눗셈, 5~6학년 분수 덧셈
  - 학년군: 학년군 고르기, 5~6학년 고른 상태
- 판 위 부품 표시: 장비 아래 색 칸(열린 칸 수만큼), 얼음 탄은 하늘색, 추는 큰 탄, 번개는 지그재그 선, 깔때기는 맞은 자리 고리, 두 갈래는 탄 두 발.
- 결과(승리)에 "첫 방어 보상 · 새 부품" 줄을 더했다.
- 문제 생성기는 시안용으로 네 유형(곱셈구구, 두 자리 수 곱셈, 나머지 나눗셈, 분모가 다른 분수 덧셈)만 넣었다. 시드가 같으면 같은 문제이고, 오답은 spec 표의 실수 유형에서 만든다.
- 이름표 배치에 A와 같은 2px 여백과 `getBoundingClientRect` 크기 재기를 넣었다.
- `__qa()` 추가 값
  - 지역 판: `eqVisible`, `eqMode`(bottom/top/side), `eqInViewport`, `towerHiddenByEq`(false여야 함), `eqHeightRatio`(휴대폰에서 0.5 이하), `eqScrolls`, `eqSlotMinPx`·`eqPartMinPx`(56 이상), `mqVisible`, `mathTitleClipped`(제목이 말줄임 없이 잘리면 true, false여야 함), `mathTitleEllipsis`(말줄임으로 줄었는지, 참고값), `mathInViewport`, `mathFitsNoScroll`(true여야 함), `mathExprFontPx`(32 이상), `mathExprClipped`, `mathChoiceCount`(4), `mathChoiceMinPx`(64 이상), `mathFractionFontPx`(분수 문제에서 20 이상)
  - 학년군 고르기: `gradeBtnMinPx`(72 이상), `gradeBandCount`(3), `gradeExampleCount`(3), `gradeNextVisible`(true), `gradeScreenScrolls`(false여야 함)

### 시안 B 3판 개편 (2026-10-27, spec 3판 구조)

spec 3판(지역 공동 방어 + 끝없는 수학 + 자동 업그레이드)에 맞춰 `option-b.html`을 다시 썼다. 생중계 방향(점수판, LIVE, 속보 띠, 하단 자막, Black Han Sans·Gothic A1)은 그대로 두었다. A·C는 고치지 않았다. **위 "2판 보강"의 장비 정비 시트, 부품 끼우기, 웨이브 끝 문제 시트, 5웨이브 결과(하트·별·돈), 설치 링 메뉴, 이웃 열기 지도는 모두 없어졌다.** 위 "검수 도우미"의 `?screen=pick|map|result|info|equip|math*` 값과 하트·돈·결과 데모는 B에서 더 이상 쓰지 않는다.

- 가짜 데이터: 평창군 지킴이 4,218명, 지금 접속 1,036명, 웨이브 1,284, 최고 1,290, 화력 8.2조, 1초 정답 38개. 전국 185곳은 코드 해시로 만든 가짜 수치(서울·부산·경기 등은 지킴이 수천~수만 명, 일부는 지킴이 0명 회색). 첫 화면에 "전국 지금 48,210명". 대표 지킴이 14명(한 명은 512단계).
- 나: "씩씩한 수달 #0427", 1~2학년, 스피드건, 골고루, Lv 23, 47단계, 지갑 580P(다음 업그레이드 691P = ⌈10·47^1.1⌉).
- 시안에서는 한 웨이브를 20초로 줄였다(실제 60초). 막는 웨이브는 풍선이 끝까지 가기 전에 모두 터지고, 뚫리는 웨이브는 흰 점선 테두리 풍선이 지킬 곳에 닿는다.

**`?screen=` 값**

| 값 | 화면 |
|---|---|
| `home` | 첫 화면(처음 하기 / 복구 코드로 이어 하기) |
| `grade` | ① 학년군 3개 |
| `region` | ① 우리 지역 고르기(전국 → 시·도 → 지역 카드 "여기를 지킬래요") |
| `nick` | ① 별명 3개 + 다시 뽑기, 타워 계열 3개 |
| `code` | ① 복구 코드(낱말 4 + 숫자 2) 보여 주기 |
| `stage` | ② 지역 방어판 생중계 + 끝없는 수학 문제 + 레벨 막대 |
| `stage-wrong` / `stage-breach` / `stage-away` | ② 오답·풀이 / 방어선 뚫림 / 지난 소식이 바로 나온 상태 |
| `stage-34` / `stage-56` | ② 3~4학년(곱셈·나머지 나눗셈) / 5~6학년(분수 덧셈) 문제 |
| `me` | ③ 내 지킴이(레벨·스탯·단계, 성향·계열·색, 1·10·25·50·100·200·500단계 미리보기 + "다음 모양" 실루엣 카드) |
| `board` | ④ 전국 상황판(지도 색 5단계 + 회색, 최고 웨이브 / 오늘 1인당 정답 탭, 우리 지역 고정 줄) |
| `restore` | ⑤ 복구 코드로 이어 하기(자음 → 낱말, 숫자 패드) |
| `assets` | 에셋 견본(검수용, 아이에게는 안 보임): 계열 3 × 문턱 8(1·10·25·50·100·200·300·500, 진화 5개와 받침 테두리 6개를 모두 지남)을 자리 44px·88px로, 풍선 4종·체력 상태, 재질 10, 받침 테두리 6, 장식 20. 회색조·실루엣·흐림 2px 보기 |

- `&demo=이름`을 붙이면 열린 뒤 그 데모가 바로 돈다(예: `?screen=stage&demo=record`). `&band=34|56`은 처음 문제의 학년군을 바꾼다. `&qa=1`은 측정 패널.

**"시안 데모" 목록**

- ① 첫 진입: `flow`(처음 하기 흐름), `nick-reroll`(별명 다시 뽑기), `pick-region`(평창군 카드), `code`(복구 코드)
- ② 수학: `right`(정답 → "+12P"가 내 타워로 날아가 큰 한 발), `wrong`(✕ 내가 고른 답 + 정답 + 풀이, "다음 문제"), `streak5`("더 어려운 문제에 도전!"), `down3`("조금 쉬운 문제로 연습해요"), `band34`, `band56`, `fast`(1초 안 답 → +0 "천천히 풀어도 괜찮아요"), `guess`(찍기 의심 → 포인트 멈춤 5:00), `daily`(하루 많이 → 포인트 절반 안내)
- ② 성장: `upgrade`(내 타워 단계 +1, 빛 고리 + 통통 튐), `newlook`(5단계마다 새 장식 공개, 무대 조명), `material`(49 → 50단계: 청동 + 초록 테두리, 빛기둥 + 흰 옛 모습이 사라짐), `evolve`(99 → 100단계: III 전문형 진화, "진화!" 띠), `levelup`(레벨 배지 튀기 + 스탯 안내), `rep`(내가 대표 지킴이로 뽑힘 / 해제)
- ② 지역: `barrage`(응원 포격 몰림, 1초 정답 320개), `crowd`(접속 3,412명 급증), `record`(최고 웨이브 경신 속보 + 색종이), `breach`(풍선 3개가 지킬 곳에 닿음 → 판 흔들림 → "방어선 재정비 — 웨이브 N부터 다시", N = 지금 − 5), `boss`(10번째 웨이브 대장 풍선), `away`(지난 소식 하단 자막: 자리 비운 14시간), `offline`(연결 끊김 → 4.5초 뒤 다시 이어짐)
- ③ 내 지킴이: `me-type`, `me-stance`, `me-color`, `me-500`(500단계 미리보기 강조)
- 에셋 견본: `assets`, `assets-sil`(실루엣), `assets-gray`(회색조), `assets-blur`(흐림 2px)
- ④ 전국 상황판: `board-tab`(1인당 정답 탭), `board-mine`(우리 지역 카드), `board-empty`(지킴이 없는 지역)
- ⑤ 이어 하기: `restore-ok`(맞는 코드 → 중계 + 지난 소식), `restore-bad`(틀림, 남은 횟수), `restore-lock`(10번째 틀림 → 1시간 잠김)

**`__qa()` 값 (3판)**

- 공통: `screen`, `horizontalOverflow`, `scrollWidth`, `clientWidth`, `screenScrolls`(화면 상자 세로 스크롤 여부), `screenInnerOverflowX`, `smallTargets`(44px 미만 버튼, 빈 배열이어야 함), `elementsOutsideViewport`(빈 배열이어야 함. 흐르는 속보 띠, 숨은 배너·안내는 `data-qa-ignore`로 뺌)
- 지역 판(`stage`): `spotCount`(대표 자리 수, 6~14), `mySpotShown`, `repCount`, `towersDrawn`·`towersDrawnMax`(대표 + 나), `spotDiameterPx`(44 이상), `spotMinGapPx`(0보다 커야 함), `spotsInsideMap`, `stageFitsViewport`(true), `boardInsideMap`, `labelSpotOverlaps`(0), `labelGateOverlaps`(0), `labelCount`, `mapScale`, `mapRect`, `mapHeightRatio`(지도 높이 ÷ (화면 높이 − 44), 참고값), `enemies`, `regionWave`, `regionBest`
- 수학 패널(`stage`): `mqVisible`, `mathTitle`, `mathTitleClipped`(false), `mathTitleEllipsis`(참고), `mathExprFontPx`(32 이상), `mathExprClipped`, `mathChoiceCount`(4), `mathChoiceMinPx`(휴대폰 높이 700 이하 56, 그 밖 64 이상), `mathFractionFontPx`(분수 문제에서 20 이상), `mathInViewport`, `mathFitsNoScroll`(true), `meBarVisible`, `meBarHeightPx`(44), `newsVisible`, `offline`
- 학년군(`grade`): `gradeBtnMinPx`, `gradeBandCount`(3), `gradeExampleCount`(3), `gradeNextVisible`, `gradeScreenScrolls`(false)
- 지역 고르기·상황판(`region`, `board`): `mapRegionCount`(185), `mapFillColors`, `mapListRowMinPx`(44 이상), `mapCardVisible`, `mapSvgPx`
- 상황판(`board`)만: `boardGrayCount`(지킴이 없는 지역 수), `boardMyRegionMarked`(true), `rankTabCount`(2), `rankTab`, `rankRows`, `rankRowMinPx`(44 이상)
- 별명(`nick`): `nickOptionCount`(3), `nickTypeCount`(3), `nickBtnMinPx`(44 이상), `nickNextVisible`
- 복구 코드(`code`): `codeTileCount`(5), `codeTileFontPx`, `codeTileClipped`(false), `codeNextVisible`
- 내 지킴이(`me`): `mePreviewCount`(7), `mePreviewKeysDistinct`(true, 7개 문턱의 겉모습 층 조합이 모두 다름), `mePreviewKeys`, `meNextShown`(다음 모양 실루엣 카드, true), `meNextText`(예: "50단계에 청동 타워 · 초록 테두리 · 앞으로 3단계"), `meSwatchCount`(12), `meSwatchMinPx`(44 이상), `meStanceCount`(5), `meTypeCount`(3), `meCanvasPainted`
- 이어 하기(`restore`): `restoreSlotCount`(5), `restoreKeyMinPx`(44 이상), `restoreActVisible`, `restoreLocked`
- 에셋 견본(`assets`): `assetTileCount`(전체 견본 칸 수, 104 = 타워 48 + 풍선 20 + 재질 10 + 테두리 6 + 장식 20), `assetTowerTileCount`(48), `assetBalloonTileCount`(20), `assetMinPx`(타워 견본의 가장 작은 자리 지름, 44), `assetCanvasPainted`, `assetScreenScrolls`(참고값, 휴대폰에서는 true가 정상), `assetView`(normal / gray / sil / blur), `assetToolMinPx`(보기 버튼, 44 이상), `assetSilhouetteDistinctTypes`(진화 단계 5개마다 계열 3개의 검은 실루엣 알파 마스크 해시가 모두 다름, 44px·88px 둘 다, true여야 함), `assetSilhouetteDistinctStages`(계열마다 진화 5단계의 실루엣 해시가 모두 다름, true여야 함), `assetSilhouetteMinTypeDiff`·`assetSilhouetteMinStageDiff`(두 실루엣의 1 − IoU 최솟값, 0이면 같은 모양. 참고값)
- 지역 판 참고값: `spriteCacheSize`(타워 스프라이트 캐시 수, 500 이하)

**판 배치 변경 (2차 검수 뒤 고침)**: 평창군 안만 쓰면 길 띠·지킬 곳·입구 제외와 자리 간격 때문에 넓이상 4자리 안팎(2차 측정 대표 3 + 나)밖에 안 나온다. 그래서 군 안 자리를 먼저 고르고, 모자라면 지도 사각형 안의 옆 지역 바탕(군 경계에서 30 이상 밖)에도 둔다. 후보는 판 격자 전체(10 단위)이고, 판 가장자리에서 90(아래는 출처 글씨 때문에 130) 안쪽만 쓴다. 군 안 → 군 밖, 같은 쪽이면 길에 가까운 순서로 고르며 길과의 거리 위쪽 한계는 없다. 단계(자리 간격 / 길에서 / 지킬 곳에서 / 입구에서 / 군 밖): 240 / 115 / 240 / 220 / 안 씀 → 220 / 100 / 210 / 180 / 안 씀 → 220 / 100 / 210 / 180 / 씀 → 200 / 85 / 180 / 150 / 씀. 9자리(대표 8 + 나)를 채우면 멈추고, 최대 12자리. 지킬 곳에 가장 가까운 자리가 "내 자리"다. 자리는 판 좌표로 정하므로 화면 크기와 상관없이 같다.
- 오답이어도 수학 패널 높이가 변하지 않는다: 보기 칸은 늘 2줄(줄 높이 64px, 높이 700 이하 휴대폰 56px, 넓은 화면 clamp(72px, 9vh, 108px))이고, 오답이면 흐린 보기 2개가 빠지고 "내가 고른 답 / 정답"이 첫 줄, 풀이가 둘째 줄을 차지한다(넘치면 그 칸 안에서만 스크롤). "더 어려운 문제에 도전!"은 지도 위 띠 배너로, "조금 쉬운 문제로 연습해요"는 지도 아래 안내로, 찍기 의심·하루 많이 안내는 문제 제목 칸(빨강·하늘색)으로 옮겼다. 그래서 지도 높이가 어느 상태에서도 그대로다.
- `__qa()` 추가 값(수학 패널): `mathChoiceVisible`(보이는 보기 수, 오답이면 2), `mathSolutionShown`, `mathPanelHeightPx`(정답·오답 상태에서 같아야 함). `mathChoiceMinPx`는 보이는 보기만 잰다.
- 360~429px에서는 지표 줄의 "지킴이 N명"을 숨긴다(점수판에 안 들어감). 높이 700px 이하 휴대폰 첫 화면은 지도 그림을 150px로 줄여 스크롤 없이 들어간다. 타워 겉모습은 아래 "에셋 리서치 반영"에서 다시 그렸다.

### 시안 B 에셋 다시 그리기 (2026-10-27, 에셋 리서치 반영)

`docs/design/asset-research.md`의 그리는 법을 따라 타워·풍선·효과를 다시 그렸다. 이미지 파일은 내려받지 않았고 모두 캔버스 코드다. 판 배치, 레이아웃, 기존 `__qa` 값은 그대로다.

- 타워: 96 단위 격자, 3/4 정면(윗면이 보이는 원통 받침). 머리와 포신만 돈다(24방향으로 맞춤). 면마다 OKLCH 세 단 셀 음영(그림자 L−0.12·h−15°, 밝은 면 L+0.10·h+10°) + 오른쪽 청록 역광. 층을 다 그린 뒤 합친 실루엣에 흰 후광(40%, 6단위)과 남색 외곽선(4단위)을 한 번 두른다. 아래에 접지 그림자와 받침 등급 테두리(흰 → 초록 → 파랑 → 보라 → 주황 → 금), 위에 단계 배지(테두리 = 등급 색), 500단계부터 ★.
- 세 층: 진화 실루엣(1·25·100·200·500) × 재질 10(1·10·25·50·100·150·200·300·400·500: 나무결·벽돌·리벳·반사·면 나눔·무지개) × 5단계 장식 블록. 아이가 고른 색은 몸통 면에만 칠한다.
- 계열 모양 언어: 스피드건 = 좁은 오각 몸통 + 뾰족 머리(II 날개깃, III 안테나, V 날개), 물대포 = 넓고 낮은 통(II 옆 물탱크, III 물 돔, V 금 고리), 끈끈 테이프 = 모서리 깎은 네모 + 앞 큰 롤(II 작은 옆 롤, III 큰 옆 롤 + 늘어진 테이프, V 날개). IV는 셋 다 왕관 + 키 15%.
- 크기: 1단계 72% → 100단계 100% (자리 지름 대비).
- 스프라이트 캐시(LRU 500)로 그린다: 계열·단계·색·크기·조준 방향·반동이 같으면 다시 그리지 않는다.
- 풍선 4축(크기·모양·색·부착물): 보통(빨강 둥근, 매듭·끈), 쌩쌩(0.8배 하늘색 물방울, 15° 기울기, 고글, 속도선), 왕(1.25배 주황, 왕관 + 띠 2줄, 체력 절반이면 띠 한 줄이 끊김), 대장(비행선 1.9배, 꼬리 날개·곤돌라·선장 모자·체력 막대, 66%·33%에서 반창고·주름). 합친 외곽선, 눈은 점 → 맞으면 "> <" → 터지기 직전 "@".
- 효과: 총구 섬광, 반동 3단위, 내 타워 발사 때 찌그러짐, 계열별 탄(다트 + 꼬리 점 / 포물선 물방울 / 테이프 띠), 맞은 자리 별, 물대포 물 고리, 터짐(고무 조각 3 + 색종이 + 충격 고리), 왕·대장 "펑!", 내 큰 한 방만 "+12" 숫자, 업그레이드 고리 + 통통 튐, 재질·진화 때 빛기둥 + 흰 옛 모습이 0.5초에 사라짐, 등급 효과(반짝 / 빛 고리 / 번개 / 둘 다 / 무지개), 흔들림은 대장 터짐·웨이브 깸·본부 뚫림에만 150ms(넓은 화면 4px, 휴대폰 2px), 대장 터지기 전 50ms 멈춤. 지도 상자를 흔들던 CSS 애니메이션은 없앴다(빨간 테두리 번쩍임만 남김).
- 움직임 줄이기(prefers-reduced-motion): 흔들림·입자·번쩍임·튐·빛기둥·등급 효과를 끄고, 숫자와 본부 뚫림 고리만 남긴다.

## 시안 C: 지킴이 노선도

- 파일: `option-c.html`
- 콘셉트: 지하철 노선도와 역 표지판. 이웃에서 오는 길은 번호 붙은 색깔 노선, 설치 자리는 점선 정류장, 지킬 곳은 환승역 모양 "종점", 타워는 승차권, 적은 동그라미·세모·네모·별 도형.
- 글꼴: IBM Plex Sans KR. 바탕 #F4F2EE, 먹색 #111, 노선색 4개(파랑·초록·주황·분홍)와 경고 빨강.
- 배치: 휴대폰은 위쪽 검은 표지판 HUD, 아래쪽 승차권 3장 + "출발" 버튼. 900px 이상은 오른쪽 승차권 열, 1200px 이상은 왼쪽에 노선 안내와 운행 시간표(웨이브 표)를 더한 3단.

## 참고한 레퍼런스와 가져온 요소

이미지를 직접 볼 수 없어 **작품 제목·설명·글 본문**에서 콘셉트와 장치를 가져왔다.

| 레퍼런스 | 가져온 요소 | 쓴 시안 |
|---|---|---|
| Kingdom Rush 조작 방식 토론 — https://www.construct.net/en/forum/construct-2/how-do-i-18/kingdom-rush-style-controls-60587 | 정해진 설치 자리를 누르면 그 자리에서 타워 선택이 열리는 흐름 | 전체(B는 링 메뉴) |
| Kingdom Rush iOS 리뷰 (Macworld) — https://www.macworld.com/article/219523/review-kingdom-rush-for-ios-brings-fantasy-and-fun-to-tower-defense-gaming.html | 웨이브를 버튼으로 시작, 별 3개 평가, 짧은 판 | 전체 |
| Radial menu 글 (prototypr) — https://blog.prototypr.io/putting-the-rad-back-in-radial-menus-66ea76a39acc | 누른 자리 둘레에 버튼을 고르게 놓는 링 메뉴, 손가락 거리 최소화 | B |
| Mini Metro (Wikipedia) — https://en.wikipedia.org/wiki/Mini_Metro_(video_game) | 노선 = 색 선, 역 = 단순 도형, 승객 = 도형 | C |
| Mini Metro 시각 디자인 분석 — https://mechanicsofmagic.com/2023/04/22/visual-design-of-games-mini-metro/ | 연한 바탕 + 굵은 원색 선, 정보 최소화, 도형으로 종류 구분 | C |
| Mini Metro 제작자 인터뷰 — https://www.indieorama.com/mini-metro-and-robert-curry-the-minimalism-was-one-of-the-things-that-made-the-game-hard-to-make | 장식 없이 읽히는 화면, 색 수 제한 | C |
| 스코어버그 디자인 글 (Sports Video Group) — https://www.sportsvideo.org/2026/06/09/designing-the-modern-scorebug-how-broadcast-graphics-teams-are-rethinking-the-most-important-element-on-screen/ | 한 줄 점수판에 핵심 수치(하트·돈·웨이브)만, 고대비 색 | B |
| 방송 그래픽 패키지 (Ross Video) — https://buy.rossvideo.com/products/euro-sports-graphics-xpression | 하단 자막(로어서드), 속보 띠, 경기 종료 화면 | B |
| 종이 오리기 콜라주 요소 — https://masterbundles.com/snowhitema/playful-paper-cut-collage-elements-set-bold-color-cut-out-objects-for-stickers-scrapbooking-creative/ | 굵은 색면을 오려 붙인 느낌, 흰 테두리 스티커 | A |
| 종이 오리기 게임 UI (Adobe Stock 설명) — https://stock.adobe.com/images/quiz-online-game-interface-in-paper-cut-style-yellow-and-black-color-trivia-mobile-app-papercut-art-template-ui-smartphone-application-design-craft-vector-flat-screens-questionnaire-game/497112969 | 게임 UI 전체를 종이 질감으로 통일 | A |
| 다이컷 스티커 일러스트 — https://masterbundles.com/snowhitema/die-cut-ready-illustration-with-clear-contour-frame-cut-ready-design-for-stickers-crafts-diy-project/ | 타워·별을 칼선 있는 스티커로 | A |
