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

/**
 * Phone: height kept for the problem panel and level bar under the board (T7 fills it).
 * Panel = 4 border + 44 head + 4 + expression + 4 + 2 rows of choices + 6 gap + 6 padding, then 4 + 44 bar.
 * Choices are 56px when the screen is 700px tall or less, 64px otherwise (D41).
 */
export function phoneSideHeight(vw: number, vh: number): number {
  if (vh <= 700) return 4 + 44 + 4 + 32 * 1.05 + 4 + (56 * 2 + 6) + 6 + 4 + 44;
  return 4 + 44 + 4 + clamp(vw * 0.09, 32, 48) * 1.1 + 4 + (64 * 2 + 6) + 6 + 4 + 44;
}

/** Wide: right column width clamp(360px, 27vw, 520px). */
export const wideSideWidth = (vw: number): number => clamp(vw * 0.27, 360, 520);

/** The board area (.st-map) inside a vw × vh screen. */
export function mapBox(vw: number, vh: number): ScreenBox {
  if (isWide(vw, vh)) {
    // padding 10 12 0; rows 44 / 22 / map / 30 (ticker); row gap 6, column gap 12.
    const y = 10 + 44 + 6 + 22 + 6;
    return { x: 12, y, w: vw - 24 - 12 - wideSideWidth(vw), h: vh - y - 6 - 30 };
  }
  // padding 6 8; rows 36 / 20 / map / side; gap 4.
  const y = 6 + 36 + 4 + 20 + 4;
  return { x: 8, y, w: vw - 16, h: vh - y - 4 - phoneSideHeight(vw, vh) - 6 };
}

/** Fit the whole board into the area (4px inset, centred); spot diameter clamp(92·scale, 44, 96). */
export function fitBoard(w: number, h: number, board: StageFile["board"]): BoardView {
  const s = Math.min((w - 8) / board.width, (h - 8) / board.height);
  return { w, h, s, ox: (w - board.width * s) / 2, oy: (h - board.height * s) / 2, D: clamp(92 * s, 44, 96) };
}
