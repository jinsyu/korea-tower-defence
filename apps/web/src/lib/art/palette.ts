import { lookOf } from "@ktd/core";
import { tones, type Tones } from "./color";

// Broadcast colours fixed by the spec.
export const DEEP = "#06102A";
export const NAVY = "#0B1B3A";
export const YEL = "#FFD60A";
export const RED = "#FF3B30";
export const CYAN = "#22D3EE";

/** 12 body colours a child can pick (one unlocks every 10 levels). */
export const PALETTE = [
  { c: "#FFD60A", n: "방송 노랑" },
  { c: "#FFFFFF", n: "하양" },
  { c: "#22D3EE", n: "하늘" },
  { c: "#FF6B5B", n: "다홍" },
  { c: "#9BE15D", n: "연두" },
  { c: "#FF9F1C", n: "주황" },
  { c: "#FF5DA2", n: "분홍" },
  { c: "#60A5FA", n: "파랑" },
  { c: "#C77DFF", n: "라벤더" },
  { c: "#4ADE80", n: "초록" },
  { c: "#F5D0A9", n: "모래" },
  { c: "#D1D5DB", n: "은색" },
] as const;

/** Material rim colours (index = material grade). Prism (9) is drawn as a rainbow gradient. */
export const MAT_COLORS = [
  "#A0673A",
  "#8C96A8",
  "#6E7F99",
  "#C7843E",
  "#D7E0EA",
  "#3A4E7A",
  "#FFC93C",
  "#7FE7F2",
  "#9B5CF6",
  "#FFE7A8",
] as const;

/** Tier rim colours (index = tier). Gold (5) is drawn as a gradient. */
export const TIER_COLORS = ["#FFFFFF", "#4ADE80", "#3B82F6", "#B26BFF", "#FF9F1C", "#FFC93C"] as const;

/** Body is lifted to OKLCH L 0.62 so it stays 0.35+ above the navy board. */
const BODY_MIN_L = 0.62;

export function bodyTones(pal: number): Tones {
  return tones((PALETTE[pal] ?? PALETTE[0]).c, BODY_MIN_L);
}

/** Colours of one tower. The picked colour goes to the body only. */
export function layerColors(step: number, pal: number): { body: Tones; material: string; tier: string } {
  const L = lookOf(step);
  return { body: bodyTones(pal), material: MAT_COLORS[L.mat], tier: TIER_COLORS[L.tier] };
}
