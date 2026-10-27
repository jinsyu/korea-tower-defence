// Defence screen geometry (mockup B .st grid). The CSS in apps/web/src/components/stage uses the same numbers;
// the stage builder and unit tests use these to check spot sizes and label overlaps without a browser.
import type { BoardView } from "./labels.ts";
import type { StageFile } from "./schema.ts";

export type ScreenBox = { x: number; y: number; w: number; h: number };

/** Same condition as the `wide-or-landscape` CSS variant. */
export function isWide(vw: number, vh: number): boolean {
  return vw >= 900 || (vw > vh && vh <= 560 && vw >= 600);
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** Same condition as the `short-phone` CSS variant (phone, 700px tall or less). */
export const isShortPhone = (vw: number, vh: number): boolean => vw <= 899 && vh <= 700;

/** Problem panel sizes (mockup B .mq); the panel CSS in apps/web/src/components/stage uses the same numbers. */
export type PanelMetrics = {
  /** Expression font size (D41: 32px or more). */
  exprPx: number;
  /** Height of the expression row. A 5~6 band row is tall enough for a stacked fraction. */
  exprRowPx: number;
  /** Fraction digit size in the expression (D41: 20px or more). */
  fracPx: number;
  /** Fraction digit size in the wrong-answer solution (D41: 20px or more); the solution row scrolls if needed. */
  solutionFracPx: number;
  /** Choice button height (D41: 56px on phones 700px tall or less, 64px or more elsewhere). */
  choicePx: number;
  /** Whole panel: 4 border + 44 head + 4 + expression + 4 + 2 rows of choices + 6 gap + 6 padding. */
  panelPx: number;
};

/** A stacked fraction is 2.23 × its font size tall (two lines, rule and padding); rows leave a little room. */
export const FRACTION_ROW_EM = 2.3;

export function panelMetrics(vw: number, vh: number, fractions = false): PanelMetrics {
  const wide = isWide(vw, vh);
  const short = !wide && isShortPhone(vw, vh);
  const exprPx = wide ? clamp(vw * 0.036, 48, 80) : short ? 32 : clamp(vw * 0.09, 32, 48);
  const fracPx = Math.max(20, exprPx * 0.62);
  const lineRow = exprPx * (short ? 1.05 : 1.1);
  const exprRowPx = fractions ? Math.max(lineRow, fracPx * FRACTION_ROW_EM) : lineRow;
  const choicePx = wide ? clamp(vh * 0.09, 72, 108) : short ? 56 : 64;
  const solutionFracPx = Math.max(20, (wide ? 14 : 13) * 0.85);
  return { exprPx, exprRowPx, fracPx, solutionFracPx, choicePx, panelPx: 4 + 44 + 4 + exprRowPx + 4 + (choicePx * 2 + 6) + 6 };
}

/** Phone: height kept for the problem panel and, under it, the 44px level bar (gap 4). */
export function phoneSideHeight(vw: number, vh: number, fractions = false): number {
  return panelMetrics(vw, vh, fractions).panelPx + 4 + 44;
}

/** Wide: right column width clamp(360px, 27vw, 520px). */
export const wideSideWidth = (vw: number): number => clamp(vw * 0.27, 360, 520);

/** The board area (.st-map) inside a vw × vh screen. */
export function mapBox(vw: number, vh: number, fractions = false): ScreenBox {
  if (isWide(vw, vh)) {
    // padding 10 12 0; rows 44 / 22 / map / 30 (ticker); row gap 6, column gap 12.
    const y = 10 + 44 + 6 + 22 + 6;
    return { x: 12, y, w: vw - 24 - 12 - wideSideWidth(vw), h: vh - y - 6 - 30 };
  }
  // padding 6 8; rows 36 / 20 / map / side; gap 4.
  const y = 6 + 36 + 4 + 20 + 4;
  return { x: 8, y, w: vw - 16, h: vh - y - 4 - phoneSideHeight(vw, vh, fractions) - 6 };
}

/** Fit the whole board into the area (4px inset, centred); spot diameter clamp(92·scale, 44, 96). */
export function fitBoard(w: number, h: number, board: StageFile["board"]): BoardView {
  const s = Math.min((w - 8) / board.width, (h - 8) / board.height);
  return { w, h, s, ox: (w - board.width * s) / 2, oy: (h - board.height * s) / 2, D: clamp(92 * s, 44, 96) };
}
