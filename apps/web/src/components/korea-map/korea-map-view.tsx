"use client";

import { useEffect, useRef, useState, type MouseEvent } from "react";
import type { Box, KoreaMap, RegionShape } from "@/lib/korea-map";

/** SVG viewBox [x, y, width, height] in map units. */
export type View = [number, number, number, number];

const ZOOM_MS = 480;
// Regions whose box is smaller than this on screen get no name label (picked from the list instead).
const MIN_LABEL_BOX_PX = 26;

export function nationView(map: KoreaMap): View {
  return [0, 0, map.width, map.height];
}

export function boxView([x0, y0, x1, y1]: Box): View {
  const padX = (x1 - x0) * 0.08 + 4;
  const padY = (y1 - y0) * 0.08 + 4;
  return [x0 - padX, y0 - padY, x1 - x0 + padX * 2, y1 - y0 + padY * 2];
}

const LABEL_PX = 12;
const SUBLABEL_DY_PX = 14;
// Halo stroke (3.2px) plus a 2px gap.
const LABEL_PAD_PX = 3.6;

let measureCtx: CanvasRenderingContext2D | null | undefined;
function labelWidthPx(text: string): number {
  if (measureCtx === undefined) {
    measureCtx = typeof document === "undefined" ? null : document.createElement("canvas").getContext("2d");
    if (measureCtx) measureCtx.font = `900 ${LABEL_PX}px ${getComputedStyle(document.body).fontFamily}`;
  }
  if (measureCtx) return measureCtx.measureText(text).width;
  return [...text].reduce((w, c) => w + (c.charCodeAt(0) > 0x2e80 ? LABEL_PX : LABEL_PX * 0.62), 0);
}

/**
 * Keeps labels that do not touch one another on screen. `first` (my region, the picked region) always stay;
 * the rest go by size, bigger regions first, so small neighbours give way instead of piling up.
 */
function dropOverlappingLabels(
  regions: RegionShape[],
  scale: number,
  first: (string | null | undefined)[],
  sublabelOf?: (code: string) => string,
): RegionShape[] {
  const area = ([x0, y0, x1, y1]: Box) => (x1 - x0) * (y1 - y0);
  const rank = (r: RegionShape) => {
    const i = first.indexOf(r.code);
    return i >= 0 ? i - first.length : 0;
  };
  const ordered = [...regions].sort((a, b) => rank(a) - rank(b) || area(b.box) - area(a.box));
  const kept: { r: RegionShape; box: Box }[] = [];
  for (const r of ordered) {
    const w = Math.max(labelWidthPx(r.name), sublabelOf ? labelWidthPx(sublabelOf(r.code)) : 0) / 2 + LABEL_PAD_PX;
    const x = r.point[0] * scale;
    const y = r.point[1] * scale;
    const top = y - LABEL_PX / 2 - LABEL_PAD_PX;
    const bottom = y + LABEL_PX / 2 + (sublabelOf ? SUBLABEL_DY_PX : 0) + LABEL_PAD_PX;
    const box: Box = [x - w, top, x + w, bottom];
    const hits = kept.some(({ box: k }) => box[0] < k[2] && k[0] < box[2] && box[1] < k[3] && k[1] < box[3]);
    if (!hits || rank(r) < 0) kept.push({ r, box });
  }
  return kept.map((k) => k.r);
}

const viewAttr = (v: View) => v.map((n) => n.toFixed(2)).join(" ");

type Props = {
  map: KoreaMap;
  view: View;
  label: string;
  fillOf: (code: string) => string;
  selected: string | null;
  /** Sido whose region names are drawn, or null for none. */
  labelSido: string | null;
  onRegionClick: (code: string) => void;
  /** Region drawn with a bold white pulsing rim ("우리 지역" on the national board); its name is always labelled. */
  marked?: string | null;
  /** Second label line under the name (national board: best wave). */
  sublabelOf?: (code: string) => string;
};

export function KoreaMapView({ map, view, label, fillOf, selected, labelSido, onRegionClick, marked, sublabelOf }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const shownView = useRef<View>(view);
  const [settled, setSettled] = useState<View>(view);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const viewKey = viewAttr(view);

  // Animate the viewBox outside React; state changes once when the zoom ends.
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const from = shownView.current;
    const to = view;
    const duration = matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : ZOOM_MS;
    const start = performance.now();
    let raf = 0;
    const step = (now: number) => {
      const k = duration ? Math.min(1, (now - start) / duration) : 1;
      const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
      const v = from.map((a, i) => a + (to[i]! - a) * e) as View;
      shownView.current = v;
      svg.setAttribute("viewBox", viewAttr(v));
      if (k < 1) raf = requestAnimationFrame(step);
      else setSettled(to);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
    // viewKey stands for `view`, whose array identity changes on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewKey]);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setSize({ w: entry.contentRect.width, h: entry.contentRect.height });
    });
    observer.observe(svg);
    return () => observer.disconnect();
  }, []);

  const scale = size ? Math.min(size.w / settled[2], size.h / settled[3]) : 0;
  const candidates =
    labelSido && scale
      ? map.regions.filter((r) => {
          if (r.sidoCode !== labelSido) return false;
          const [x0, y0, x1, y1] = r.box;
          return r.code === selected || r.code === marked || Math.min(x1 - x0, y1 - y0) * scale >= MIN_LABEL_BOX_PX;
        })
      : [];
  const labels = scale ? dropOverlappingLabels(candidates, scale, [marked, selected], sublabelOf) : [];
  const selectedShape = selected ? map.regions.find((r) => r.code === selected) : undefined;
  const markedShape = marked ? map.regions.find((r) => r.code === marked) : undefined;

  const handleClick = (e: MouseEvent<SVGSVGElement>) => {
    const code = (e.target as Element).closest("[data-code]")?.getAttribute("data-code");
    if (code) onRegionClick(code);
  };

  return (
    <svg
      ref={svgRef}
      role="img"
      aria-label={label}
      viewBox={viewAttr(settled)}
      preserveAspectRatio="xMidYMid meet"
      className="block size-full"
      onClick={handleClick}
    >
      <g stroke="rgb(6 16 42 / 0.75)" strokeWidth={0.6} vectorEffect="non-scaling-stroke">
        {map.regions.map((r) => (
          <path
            key={r.code}
            d={r.d}
            data-code={r.code}
            fill={fillOf(r.code)}
            vectorEffect="non-scaling-stroke"
            className="cursor-pointer transition-[fill] duration-300"
          />
        ))}
      </g>
      <g fill="none" stroke="rgb(255 255 255 / 0.55)" strokeWidth={1.1} pointerEvents="none">
        {map.sido.map((s) => (
          <path key={s.code} d={s.d} vectorEffect="non-scaling-stroke" />
        ))}
      </g>
      {markedShape && (
        <path
          d={markedShape.d}
          data-marked={markedShape.code}
          fill="none"
          stroke="#fff"
          strokeWidth={2.6}
          vectorEffect="non-scaling-stroke"
          pointerEvents="none"
          className="animate-mine-pulse"
        />
      )}
      {selectedShape && (
        <path
          d={selectedShape.d}
          fill="none"
          stroke="var(--red)"
          strokeWidth={3.2}
          vectorEffect="non-scaling-stroke"
          pointerEvents="none"
        />
      )}
      {labels.length > 0 && (
        <g
          fontSize={LABEL_PX / scale}
          strokeWidth={3.2 / scale}
          className="pointer-events-none font-sans font-black"
          fill="#fff"
          stroke="var(--navy)"
          paintOrder="stroke"
          strokeLinejoin="round"
          textAnchor="middle"
          dominantBaseline="middle"
        >
          {labels.map((r) => (
            <text key={r.code} x={r.point[0].toFixed(2)} y={r.point[1].toFixed(2)}>
              {r.name}
              {sublabelOf && (
                <tspan x={r.point[0].toFixed(2)} dy={(SUBLABEL_DY_PX / scale).toFixed(3)} fill="var(--yellow)">
                  {sublabelOf(r.code)}
                </tspan>
              )}
            </text>
          ))}
        </g>
      )}
    </svg>
  );
}
