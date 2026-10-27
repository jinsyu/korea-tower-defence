"use client";

import { useEffect, useEffectEvent, useRef, useSyncExternalStore, type CSSProperties } from "react";
import { setUnitPx } from "@/lib/art/shapes";
import { clearSpriteCache } from "@/lib/art/sprite";
import { paintLook, prepareCanvas, type LookOptions } from "@/lib/art/paint";

// Badge font: next/font gives the display face a generated family name, so read it from the CSS variable.
// When it finishes loading, sprites baked with the fallback are thrown away and every canvas repaints.
type FontState = { font: string; ready: boolean };
const SERVER_FONT: FontState = { font: "sans-serif", ready: false };
let fontState = SERVER_FONT;
let fontStarted = false;
const fontListeners = new Set<() => void>();

function startFontLoad() {
  if (fontStarted) return;
  fontStarted = true;
  const family = getComputedStyle(document.documentElement).getPropertyValue("--font-display").trim() || "sans-serif";
  fontState = { font: family, ready: false };
  document.fonts
    .load(`16px ${family}`, "0123456789")
    .catch((err: unknown) => console.error("badge font failed to load", err))
    .finally(() => {
      clearSpriteCache();
      fontState = { font: family, ready: true };
      fontListeners.forEach((l) => l());
    });
}

function subscribeFont(cb: () => void) {
  fontListeners.add(cb);
  startFontLoad();
  return () => {
    fontListeners.delete(cb);
  };
}

export function useArtFont(): FontState {
  return useSyncExternalStore(
    subscribeFont,
    () => fontState,
    () => SERVER_FONT,
  );
}

/** Repaints on mount, when `paintKey` changes, on size change and when the badge font arrives. */
function usePaint(paintKey: string, paint: (cv: HTMLCanvasElement, font: string) => void) {
  const ref = useRef<HTMLCanvasElement>(null);
  const { font, ready } = useArtFont();
  const onPaint = useEffectEvent((cv: HTMLCanvasElement) => paint(cv, font));
  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    onPaint(cv);
    const ro = new ResizeObserver(() => onPaint(cv));
    ro.observe(cv);
    return () => ro.disconnect();
  }, [paintKey, font, ready]);
  return ref;
}

type CanvasBox = { className?: string; style?: CSSProperties };

/** Decorative tower picture; the surrounding text names it. */
export function TowerCanvas({ className, style, ...look }: LookOptions & CanvasBox) {
  const ref = usePaint(JSON.stringify(look), (cv, font) => paintLook(cv, { ...look, font }));
  return <canvas ref={ref} aria-hidden="true" className={className} style={style} />;
}

/** Free-form art canvas (asset sheet). `paint` gets a context in CSS px. */
export function PaintedCanvas({
  className,
  style,
  paintKey,
  paint,
}: CanvasBox & { paintKey: string; paint: (g: CanvasRenderingContext2D, w: number, h: number, dpr: number) => void }) {
  const ref = usePaint(paintKey, (cv) => {
    const c = prepareCanvas(cv);
    if (!c) return;
    setUnitPx(c.dpr);
    paint(c.g, c.w, c.h, c.dpr);
  });
  return <canvas ref={ref} aria-hidden="true" className={className} style={style} />;
}
