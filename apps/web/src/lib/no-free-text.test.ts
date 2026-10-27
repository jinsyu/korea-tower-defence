import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createElement, type ComponentType } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import HomePage from "@/app/page";
import InfoPage from "@/app/info/page";
import PlayPage from "@/app/play/page";
import CodePage from "@/app/start/code/page";
import { GradePicker } from "@/components/grade-picker";
import { NickPicker } from "@/components/nick-picker";
import { RestorePad } from "@/components/restore-pad";
import { StartFlowProvider, StartRegionPicker } from "@/components/start-flow";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
}));

const render = (screen: ComponentType) =>
  renderToStaticMarkup(createElement(StartFlowProvider, null, createElement(screen)));

// D1 order: home -> grade -> region -> nick -> code -> defence screen; restore is the other way in.
const FLOW: [string, ComponentType][] = [
  ["home", HomePage],
  ["grade", GradePicker],
  ["region", StartRegionPicker],
  ["nick", NickPicker],
  ["code", CodePage],
  ["play", PlayPage],
  ["restore", RestorePad],
  ["info", InfoPage],
];

const FREE_TEXT = /<input\b|<textarea\b|contenteditable/i;

describe("first-entry flow has no free-text field (D1, D68)", () => {
  it.each(FLOW)("%s renders without text inputs", (_name, screen) => {
    const html = render(screen);
    expect(html.length).toBeGreaterThan(100);
    expect(html).not.toMatch(FREE_TEXT);
  });

  it("restore pad offers only buttons: consonants, list words and digits", () => {
    const html = render(RestorePad);
    expect(html).toContain("ㄱ");
    expect(html).toContain("구름");
    expect(html).not.toMatch(FREE_TEXT);
  });

  it("links the flow together", () => {
    expect(render(HomePage)).toContain('href="/start/grade"');
    expect(render(HomePage)).toContain('href="/restore"');
    expect(render(HomePage)).toContain('href="/info"');
    expect(render(CodePage)).toContain('href="/play"');
  });
});

describe("info screen wording (D73)", () => {
  const html = render(InfoPage);
  it.each([
    "통계청",
    "공공누리 제1유형",
    "vuski/admdongkor",
    "CC BY 4.0",
    "OpenStreetMap",
    "ODbL 1.0",
    "/stages/",
    "만드는 방법",
    "준비 중",
    "[2수01-11]",
    "[4수01-04]",
    "[6수01-08]",
    "에셋 출처",
    "서버에 무엇을 저장하나요",
    "별명 번호",
    "학년군",
    "지킬 지역",
    "레벨·포인트·타워",
    "최근 50문제",
    "마지막 접속 날짜",
    "365일",
    "새 복구 코드 만들기",
    "내 기록 지우기",
  ])("mentions %s", (text) => {
    expect(html).toContain(text);
  });
});

// D68 code check: no screen source creates a text field or asks for camera, microphone or location.
const srcDir = fileURLToPath(new URL("..", import.meta.url));
function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx)$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [path] : [];
  });
}

describe("screen sources (D68)", () => {
  const files = sourceFiles(srcDir);
  it.each(["<input", "<textarea", "contentEditable", "getUserMedia", "geolocation"])("never contain %s", (word) => {
    expect(files.filter((f) => readFileSync(f, "utf8").includes(word))).toEqual([]);
  });
});
