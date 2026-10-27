// Copies the region data this project needs from a local gojang checkout (read only),
// checks the 185-cell count and sha256 of every copy, and writes data/source/gojang/SOURCE.md.
// Usage: pnpm data:import-gojang   (GOJANG_DIR overrides ~/dev/gojang)
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFileSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const VERSION = "20261001";
const CELL_COUNT = 185;

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const gojangDir = resolve(process.env.GOJANG_DIR ?? join(homedir(), "dev/gojang"));
const outDir = join(repoRoot, "data/source/gojang");

type CopyItem = { from: string; to: string };

function fail(message: string): never {
  console.error(`가져오기 실패: ${message}`);
  process.exit(1);
}

function sha256(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

function git(args: string[]): string {
  return execFileSync("git", ["-C", gojangDir, ...args], { encoding: "utf8" }).trim();
}

function listCopies(): CopyItem[] {
  const publicRegions = `public/regions/${VERSION}`;
  const sigunguFiles = readdirSync(join(gojangDir, publicRegions))
    .filter((name) => /^sigungu-\d+\.topo\.json$/.test(name))
    .sort();
  const regionsOut = `regions/${VERSION}`;
  return [
    { from: `data/regions/${VERSION}/sigungu-precise.topo.json`, to: `${regionsOut}/sigungu-precise.topo.json` },
    { from: `${publicRegions}/index.json`, to: `${regionsOut}/index.json` },
    { from: `${publicRegions}/korea-sido.topo.json`, to: `${regionsOut}/korea-sido.topo.json` },
    ...sigunguFiles.map((name) => ({ from: `${publicRegions}/${name}`, to: `${regionsOut}/${name}` })),
    { from: "data/board/adjacency-report.json", to: "board/adjacency-report.json" },
    { from: "data/board/links.json", to: "board/links.json" },
  ];
}

type Index = {
  source: { name: string; url: string; commit: string; license: string; attributionFull: string };
  sido: { code: string; file: string }[];
  sigungu: { code: string }[];
};
type Topo = { objects: Record<string, { geometries: { properties: { code: string } }[] }> };

function checkCellCount(dir: string): void {
  const regions = join(dir, `regions/${VERSION}`);
  const index = readJson<Index>(join(regions, "index.json"));
  const codes = new Set(index.sigungu.map((s) => s.code));
  if (index.sigungu.length !== CELL_COUNT || codes.size !== CELL_COUNT) {
    fail(`index.json 지역 수가 ${CELL_COUNT}이 아니에요 (${index.sigungu.length}).`);
  }

  const sameCodes = (label: string, list: string[]) => {
    const missing = [...codes].filter((c) => !list.includes(c));
    if (list.length !== CELL_COUNT || missing.length > 0) {
      fail(`${label}의 지역이 index.json과 달라요 (수 ${list.length}, 빠진 코드 ${missing.join(", ") || "없음"}).`);
    }
  };

  const precise = readJson<Topo>(join(regions, "sigungu-precise.topo.json"));
  sameCodes("sigungu-precise.topo.json", precise.objects.sigungu!.geometries.map((g) => g.properties.code));

  const perSido = index.sido.flatMap((s) =>
    readJson<Topo>(join(regions, s.file)).objects.sigungu!.geometries.map((g) => g.properties.code),
  );
  sameCodes("sigungu-*.topo.json", perSido);

  const adjacency = readJson<{ cells: { code: string }[] }>(join(dir, "board/adjacency-report.json"));
  sameCodes("adjacency-report.json", adjacency.cells.map((c) => c.code));
}

function main(): void {
  const items = listCopies();
  const paths = items.map((i) => i.from);
  const dirty = git(["status", "--porcelain", "--", ...paths]);
  if (dirty) fail(`gojang에 커밋하지 않은 변경이 있어요. 커밋된 파일만 가져와요.\n${dirty}`);
  const commit = git(["rev-parse", "HEAD"]);
  const lastChange = git(["log", "-1", "--format=%H", "--", ...paths]);

  const rows: { to: string; from: string; hash: string }[] = [];
  for (const item of items) {
    const src = join(gojangDir, item.from);
    const dest = join(outDir, item.to);
    mkdirSync(dirname(dest), { recursive: true });
    copyFileSync(src, dest);
    const hash = sha256(dest);
    if (hash !== sha256(src)) fail(`${item.to} 복사본의 sha256이 원본과 달라요.`);
    rows.push({ to: item.to, from: item.from, hash });
  }

  checkCellCount(outDir);

  const index = readJson<Index>(join(outDir, `regions/${VERSION}/index.json`));
  const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" });
  const md = `# gojang에서 가져온 지역 데이터

\`scripts/data/import-gojang.ts\`가 만든 파일이다. 손으로 고치지 않는다. 다시 가져오려면 \`pnpm data:import-gojang\`.

- 가져온 곳: 고장 탐험대(gojang) 저장소의 생성물. 빌드 스크립트는 가져오지 않았다.
- gojang 커밋: \`${commit}\` (이 파일들이 마지막으로 바뀐 커밋: \`${lastChange}\`)
- 복사 날짜: ${today}
- 검사: 지역 ${CELL_COUNT}칸(index.json, sigungu-precise, 시·도별 sigungu, adjacency-report의 코드가 모두 같음), 복사본과 원본의 sha256 일치

## 원 출처·라이선스

- 경계: ${index.source.name} (${index.source.url}, 커밋 \`${index.source.commit}\`)
- 라이선스: ${index.source.license}. 원문은 \`LICENSES/CC-BY-4.0.txt\`.
- 표기: ${index.source.attributionFull}
- \`board/adjacency-report.json\`은 위 경계에서 gojang이 계산한 땅 인접 표다. \`board/links.json\`은 gojang이 조사한 다리·해저터널·배편 목록이며, 항목마다 근거 주소가 들어 있다.

## 파일과 sha256

| 이 저장소 (data/source/gojang/) | gojang 원본 | sha256 |
|---|---|---|
${rows.map((r) => `| \`${r.to}\` | \`${r.from}\` | \`${r.hash}\` |`).join("\n")}
`;
  writeFileSync(join(outDir, "SOURCE.md"), md);
  console.log(`가져오기 완료: 파일 ${rows.length}개 → ${relative(repoRoot, outDir)} (gojang ${commit.slice(0, 7)})`);
}

main();
