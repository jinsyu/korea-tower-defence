# gojang에서 가져온 지역 데이터

`scripts/data/import-gojang.ts`가 만든 파일이다. 손으로 고치지 않는다. 다시 가져오려면 `pnpm data:import-gojang`.

- 가져온 곳: 고장 탐험대(gojang) 저장소의 생성물. 빌드 스크립트는 가져오지 않았다.
- gojang 커밋: `deabc95c5e34657d1eb0b0871fafb9062045c2ab` (이 파일들이 마지막으로 바뀐 커밋: `367db69010db47220933b5ed171212de6ce10a2f`)
- 복사 날짜: 2026-10-27
- 검사: 지역 185칸(index.json, sigungu-precise, 시·도별 sigungu, adjacency-report의 코드가 모두 같음), 복사본과 원본의 sha256 일치

## 원 출처·라이선스

- 경계: vuski/admdongkor (https://github.com/vuski/admdongkor, 커밋 `3bc00489b76696db864bdbea4b19985cdfa8b403`)
- 라이선스: CC BY 4.0 (원자료: 통계청 SGIS, 공공누리 제1유형). 원문은 `LICENSES/CC-BY-4.0.txt`.
- 표기: 본 데이터는 통계청 통계지리정보서비스(SGIS, https://sgis.kostat.go.kr)에서 공공누리 제1유형으로 개방한 행정동 경계를 가공한 것이며(가공: vuski/admdongkor, https://github.com/vuski/admdongkor), CC BY 4.0으로 배포됩니다. 고장 탐험대는 이 경계를 시·도, 시·군·구 단위로 합치고(일반구는 상위 시로 합치고, 서울 밖 광역시와 광주는 한 칸으로 합침) 단순화해 씁니다.
- `board/adjacency-report.json`은 위 경계에서 gojang이 계산한 땅 인접 표다. `board/links.json`은 gojang이 조사한 다리·해저터널·배편 목록이며, 항목마다 근거 주소가 들어 있다.

## 파일과 sha256

| 이 저장소 (data/source/gojang/) | gojang 원본 | sha256 |
|---|---|---|
| `regions/20261001/sigungu-precise.topo.json` | `data/regions/20261001/sigungu-precise.topo.json` | `0e9b59f777f266620788924957fd41a6283368b23b55655682c14bfcb4fe3a90` |
| `regions/20261001/index.json` | `public/regions/20261001/index.json` | `c0536655c7cd8aaa62bed7b1ba812f33014978598bc6b0a5747eaf8c03e69de1` |
| `regions/20261001/korea-sido.topo.json` | `public/regions/20261001/korea-sido.topo.json` | `6e9989ada8174c6148868da7f22c1516e8d1835982560cb5787994cb5378e5e3` |
| `regions/20261001/sigungu-11.topo.json` | `public/regions/20261001/sigungu-11.topo.json` | `c1b98d7d41d7d25c48e2911dd9e69329acea48cfafb09a94462a7e4ddaa4d1d9` |
| `regions/20261001/sigungu-12.topo.json` | `public/regions/20261001/sigungu-12.topo.json` | `be8d54dc2b28fd78c4da9f57ddc89fd9fec3f6efdafef0ec622a5da91fa66e68` |
| `regions/20261001/sigungu-21.topo.json` | `public/regions/20261001/sigungu-21.topo.json` | `0969e7b5f51d98b0b29536a3308a8ab39555f1d983db6f1386a4cfde47717622` |
| `regions/20261001/sigungu-22.topo.json` | `public/regions/20261001/sigungu-22.topo.json` | `5ccf015c696167cedb05e29b49f0380bb8a420c70e933580f221c8008b1fa9a8` |
| `regions/20261001/sigungu-23.topo.json` | `public/regions/20261001/sigungu-23.topo.json` | `e11520152f9f890ab94ecb5cd88b9c4b695216eab871df2f788565ecf6b329ab` |
| `regions/20261001/sigungu-25.topo.json` | `public/regions/20261001/sigungu-25.topo.json` | `b9655b7a33442e78604db9150d0cdd3711b96c2a65a090f7e82c090433b58987` |
| `regions/20261001/sigungu-26.topo.json` | `public/regions/20261001/sigungu-26.topo.json` | `94aeea0f1c96cc6b27466752eb719fb78947ce54f1348d381f3714b3137bcb6c` |
| `regions/20261001/sigungu-29.topo.json` | `public/regions/20261001/sigungu-29.topo.json` | `cb45bf3d857613ef04a2b9cfbb5bf0913834c599e209e139c10c477fc46d8acb` |
| `regions/20261001/sigungu-31.topo.json` | `public/regions/20261001/sigungu-31.topo.json` | `3ab218b038b7a577f40d2e2bb3e58a5169b465d9bbee329d8f62a26d2f5f23d0` |
| `regions/20261001/sigungu-32.topo.json` | `public/regions/20261001/sigungu-32.topo.json` | `8eb56350baaa90d79e5b8a3de669ff33a53b771165cd85a4f0a2f1cd9c88f656` |
| `regions/20261001/sigungu-33.topo.json` | `public/regions/20261001/sigungu-33.topo.json` | `41325e877c89c0c22d25194dae361504ba1502279f9c59cd7d4287ca69250ec3` |
| `regions/20261001/sigungu-34.topo.json` | `public/regions/20261001/sigungu-34.topo.json` | `3a5ab59954dc26788d3f8064281b8e2be0ae8e0c40623415f1fe1026dc562273` |
| `regions/20261001/sigungu-35.topo.json` | `public/regions/20261001/sigungu-35.topo.json` | `13a908a429b75745539f41a7c9ae0aae21a543ca4dab33c408a3c7214455e921` |
| `regions/20261001/sigungu-37.topo.json` | `public/regions/20261001/sigungu-37.topo.json` | `2489c2dbab1b2cd8da8ee623bf1c910d6d9b4d6bc63a5a1569c60df630a7c980` |
| `regions/20261001/sigungu-38.topo.json` | `public/regions/20261001/sigungu-38.topo.json` | `765d52bada48d46218d153f3e5f0d97635d3706b977f5b05f191d63f4381f664` |
| `regions/20261001/sigungu-39.topo.json` | `public/regions/20261001/sigungu-39.topo.json` | `3a905d45ac8ee9de6db426288261e92cbfeb29a1ff8c094c1b727c8b62c0fa43` |
| `board/adjacency-report.json` | `data/board/adjacency-report.json` | `0e698175b0a983f2dff1323515031bd99a3ff82f8f733f2801512287485af05d` |
| `board/links.json` | `data/board/links.json` | `26bc7e5c2c277d568c0aca75e329550ce659e2b4bfc812c862c7ed7e93d6eee8` |
