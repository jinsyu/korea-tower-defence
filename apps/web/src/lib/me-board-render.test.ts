import { createElement, type ComponentType } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import BoardPage from "@/app/board/page";
import MePage from "@/app/me/page";

const render = (page: ComponentType) => renderToStaticMarkup(createElement(page));
const count = (html: string, re: RegExp) => (html.match(re) ?? []).length;
const FREE_TEXT = /<input\b|<textarea\b|contenteditable/i;

describe("my-guardian screen (D53)", () => {
  const html = render(MePage);

  it("shows level, step, the four stats, 5 stances, 3 tower types and 12 colours", () => {
    expect(html).toContain("Lv 23 · 47단계");
    expect(html).toContain("다음 업그레이드");
    expect(html).toContain("레벨업까지");
    for (const stat of ["힘", "빠르기", "멀리", "행운"]) expect(html).toContain(`<span>${stat}</span>`);
    expect(count(html, /data-stance=/g)).toBe(5);
    expect(count(html, /data-type=/g)).toBe(3);
    expect(count(html, /data-pal=/g)).toBe(12);
    // Level 23 opens 3 colours; the rest say when they open.
    expect(count(html, /data-pal="\d+" disabled=""/g)).toBe(9);
    expect(html).toContain("레벨 30에 열림");
  });

  it("previews the 7 thresholds and the next look as a silhouette with its step", () => {
    expect(count(html, /data-preview="/g)).toBe(7);
    expect(html).toContain('data-preview-next="50"');
    expect(html).toContain("50단계에 청동 타워");
  });

  it("goes back to the defence screen and has no text input", () => {
    expect(html).toContain('href="/play"');
    expect(html).not.toMatch(FREE_TEXT);
  });
});

describe("national board (D59)", () => {
  const html = render(BoardPage);

  it("has the two ranking tabs, the boundary credit and the way back", () => {
    expect(count(html, /data-rank=/g)).toBe(2);
    expect(html).toContain("최고 웨이브");
    expect(html).toContain("오늘 1인당 정답");
    expect(html).toContain("통계청 SGIS");
    expect(html).toContain('href="/play"');
    expect(html).not.toMatch(FREE_TEXT);
  });
});
