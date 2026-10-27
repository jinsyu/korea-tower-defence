"use client";

import {
  anchorDistance,
  labelOverlaps,
  layoutStageLabels,
  overlapArea,
  fixedRects,
  type LabelKind,
  type PlacedLabel,
  type Rect,
  type StageFile,
} from "@ktd/core";
import { useEffect, useEffectEvent, useRef } from "react";
import { useArtFont } from "@/components/art/painted-canvas";
import { BALLOON_COLORS } from "@/lib/art/balloon";
import type { ArtCanvas } from "@/lib/art/canvas";
import { spriteCacheSize } from "@/lib/art/sprite";
import { headUnit } from "@/lib/art/tower";
import { drawFrame, paintBackground, type ScreenView } from "@/lib/stage/draw";
import { fitBoard, isWide } from "@/lib/stage/layout";
import { StageSim, seededRng, type BannerTone, type RegionState, type StageEvent, type TowerInput } from "@/lib/stage/sim";

export type BoardApi = {
  sim: StageSim;
  banner: (text: string, tone: BannerTone, ms: number) => void;
  tip: (text: string, ms: number) => void;
  /** Development builds only. */
  qa?: () => Record<string, unknown>;
};

const LABEL_BASE =
  "absolute top-0 left-0 max-w-[calc(100%-8px)] truncate text-xs leading-[1.2] font-black whitespace-nowrap wide-or-landscape:text-[13px]";
const LABEL_CLASS: Record<LabelKind, string> = {
  gate: `${LABEL_BASE} border-l-4 border-red bg-white px-1.5 py-0.5 text-navy wide-or-landscape:px-2 wide-or-landscape:py-[3px]`,
  base: `${LABEL_BASE} bg-yellow px-1.5 py-0.5 font-heading text-sm font-normal text-navy wide-or-landscape:px-2 wide-or-landscape:py-[3px] wide-or-landscape:text-[15px]`,
  nb: `${LABEL_BASE} font-bold text-white/50`,
};

const BANNER_BASE =
  "pointer-events-none absolute inset-x-0 top-[40%] z-3 -skew-x-8 truncate px-4 py-1 text-center font-heading text-[clamp(20px,4vw,52px)] whitespace-nowrap transition-[translate] duration-300 ease-[cubic-bezier(.2,.9,.3,1)]";
const BANNER_TONE: Record<BannerTone, string> = {
  yellow: "bg-yellow text-navy",
  red: "bg-red text-white",
  white: "bg-white text-navy",
  calm: "border-l-6 border-red bg-black text-white",
};
const TIP_BASE =
  "pointer-events-none absolute inset-x-0 bottom-4 z-3 mx-auto w-max max-w-[calc(100%-16px)] truncate border-l-4 border-cyan bg-black px-3 py-1.5 text-sm font-black whitespace-nowrap text-white transition";
const CONFETTI_COLORS = ["#FFD60A", "#FFFFFF", "#FF3B30", "#22D3EE"];

type Props = {
  stage: StageFile;
  towers: TowerInput[];
  region: RegionState;
  /** Connection lost: the board stands still under a notice (D58). */
  offline: boolean;
  /** Waves end when the game server says so (sim.follow), not on the board's own clock (T13). */
  external: boolean;
  onEvent: (e: StageEvent) => void;
  onReady: (api: BoardApi | null) => void;
};

/** The defence board: canvas, name labels, banner, tip and credit. The board is watched, never touched. */
export function StageBoard({ stage, towers, region, offline, external, onEvent, onReady }: Props) {
  const mapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const labelsRef = useRef<HTMLDivElement>(null);
  const bannerRef = useRef<HTMLDivElement>(null);
  const tipRef = useRef<HTMLDivElement>(null);
  const waveBarRef = useRef<HTMLElement>(null);
  const confettiRef = useRef<HTMLDivElement>(null);
  const simRef = useRef<StageSim | null>(null);
  const relayoutRef = useRef<() => void>(() => {});
  const { font, ready: fontReady } = useArtFont();

  const emit = useEffectEvent((e: StageEvent) => onEvent(e));
  const ready = useEffectEvent((api: BoardApi | null) => onReady(api));
  const initialRegion = useEffectEvent(() => region);
  const isExternal = useEffectEvent(() => external);
  const initialTowers = useEffectEvent(() => towers);
  const displayFont = useEffectEvent(() => font);
  const isOffline = useEffectEvent(() => offline);

  useEffect(() => {
    const map = mapRef.current!;
    const cv = canvasRef.current!;
    const labelBox = labelsRef.current!;
    const g = cv.getContext("2d");
    if (!g) throw new Error("2d canvas context is not available");
    const reduceMq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sans = getComputedStyle(document.documentElement).getPropertyValue("--font-sans").trim() || "sans-serif";
    let view: ScreenView | null = null;
    let bg: ArtCanvas | null = null;
    let towersDrawn = 0;
    let shownLabels: (PlacedLabel & { el: HTMLElement })[] = [];
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const later = (fn: () => void, ms: number) => {
      const id = setTimeout(() => {
        timers.delete(id);
        fn();
      }, ms);
      timers.add(id);
    };

    const sim = new StageSim(stage, {
      region: initialRegion(),
      external: isExternal(),
      rng: seededRng(Date.now()),
      reduced: reduceMq.matches,
      wide: isWide(window.innerWidth, window.innerHeight),
      balloonColor: (k) => BALLOON_COLORS[k],
      headOffset: (t) => {
        if (!view) return [0, 0];
        const [hx, hy] = headUnit(t.type, t.step);
        const u = view.D / view.s / 96;
        return [hx * u, hy * u];
      },
    });
    sim.setTowers(initialTowers());
    simRef.current = sim;

    const placeLabels = () => {
      if (!view) return;
      labelBox.replaceChildren();
      const els = new Map<string, HTMLDivElement>();
      const placed = layoutStageLabels(stage, view, (text, kind) => {
        const el = document.createElement("div");
        el.className = LABEL_CLASS[kind];
        el.textContent = text;
        labelBox.appendChild(el);
        els.set(kind + text, el);
        const r = el.getBoundingClientRect();
        return { w: r.width, h: r.height };
      });
      const keep = new Map(placed.map((p) => [p.kind + p.text, p.rect]));
      shownLabels = placed.filter((p) => p.kind !== "nb").map((p) => ({ ...p, el: els.get(p.kind + p.text)! }));
      for (const [key, el] of els) {
        const rect = keep.get(key);
        if (!rect) el.remove();
        else el.style.transform = `translate(${rect.l.toFixed(1)}px,${rect.t.toFixed(1)}px)`;
      }
    };

    const layout = () => {
      const r = map.getBoundingClientRect();
      const w = Math.round(r.width);
      const h = Math.round(r.height);
      if (w < 2 || h < 2) return;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      cv.width = Math.round(w * dpr);
      cv.height = Math.round(h * dpr);
      view = { ...fitBoard(w, h, stage.board), dpr };
      sim.wide = isWide(window.innerWidth, window.innerHeight);
      bg = paintBackground(stage, view);
      placeLabels();
    };
    relayoutRef.current = layout;

    const banner = (text: string, tone: BannerTone, ms: number) => {
      const b = bannerRef.current!;
      b.textContent = text;
      b.className = `${BANNER_BASE} ${BANNER_TONE[tone]} -translate-x-[105%]`;
      void b.offsetWidth;
      b.className = `${BANNER_BASE} ${BANNER_TONE[tone]} translate-x-0`;
      later(() => (b.className = `${BANNER_BASE} ${BANNER_TONE[tone]} -translate-x-[105%]`), ms);
    };
    const tip = (text: string, ms: number) => {
      const t = tipRef.current!;
      t.textContent = text;
      t.className = `${TIP_BASE} translate-y-0 opacity-100`;
      later(() => (t.className = `${TIP_BASE} translate-y-2.5 opacity-0`), ms);
    };
    const edgeFlash = () => {
      const el = document.createElement("div");
      el.className =
        "pointer-events-none absolute inset-0 animate-edge-flash shadow-[inset_0_0_0_5px_var(--red),inset_0_0_60px_rgba(255,59,48,.55)]";
      map.appendChild(el);
      later(() => el.remove(), 650);
    };
    const confetti = () => {
      const layer = confettiRef.current!;
      for (let i = 0; i < 40; i++) {
        const c = document.createElement("i");
        c.className = "absolute -top-5 left-(--x) h-4 w-2 rotate-(--r) animate-fall bg-(--c)";
        c.style.cssText = `--x:${(Math.random() * 100).toFixed(1)}%;--d:${(Math.random() * 0.6).toFixed(2)}s;--r:${Math.round(Math.random() * 360)}deg;--c:${CONFETTI_COLORS[i % 4]}`;
        layer.appendChild(c);
        later(() => c.remove(), 3400);
      }
    };

    const off = sim.on((e) => {
      if (e.kind === "banner") banner(e.text, e.tone, e.ms);
      else if (e.kind === "flash" && e.cause === "breach") edgeFlash();
      else if (e.kind === "confetti" && e.cause === "record") confetti();
      emit(e);
    });

    const onReduce = () => (sim.reduced = reduceMq.matches);
    reduceMq.addEventListener("change", onReduce);
    const ro = new ResizeObserver(layout);
    ro.observe(map);
    layout();

    let raf = 0;
    let last = performance.now();
    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (!isOffline()) sim.update(dt);
      if (view && bg) towersDrawn = drawFrame(g, sim, view, bg, { display: displayFont(), sans }).towersDrawn;
      if (waveBarRef.current) {
        waveBarRef.current.style.width = `${(Math.min(1, sim.waveT / stage.pace.waveSec) * 100).toFixed(1)}%`;
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    const qa =
      process.env.NODE_ENV === "production"
        ? undefined
        : (): Record<string, unknown> => {
      if (!view) return { boardReady: false };
      const v = view;
      const mr = map.getBoundingClientRect();
      const spots = [...stage.repSpots, stage.mySpot].map((p) => [v.ox + p[0] * v.s, v.oy + p[1] * v.s] as const);
      let gap = Infinity;
      for (let i = 0; i < spots.length; i++) {
        for (let j = i + 1; j < spots.length; j++) {
          gap = Math.min(gap, Math.hypot(spots[i]![0] - spots[j]![0], spots[i]![1] - spots[j]![1]) - v.D);
        }
      }
      const inside = spots.every(([x, y]) => x - v.D / 2 >= 0 && y - v.D / 2 >= 0 && x + v.D / 2 <= v.w && y + v.D / 2 <= v.h);
      const labels: Rect[] = [...labelBox.children].map((el) => {
        const r = el.getBoundingClientRect();
        return { l: r.left - mr.left, t: r.top - mr.top, r: r.right - mr.left, b: r.bottom - mr.top };
      });
      const fixed = fixedRects(stage, v);
      let labelLabel = 0;
      for (let i = 0; i < labels.length; i++) {
        for (let j = i + 1; j < labels.length; j++) if (overlapArea(labels[i]!, labels[j]!) > 0.5) labelLabel++;
      }
      const boardIn =
        v.ox >= -0.5 && v.oy >= -0.5 && v.ox + stage.board.width * v.s <= v.w + 0.5 && v.oy + stage.board.height * v.s <= v.h + 0.5;
      const credit = map.querySelector<HTMLAnchorElement>("a[data-osm]");
      const cr = credit?.getBoundingClientRect();
      return {
        spotCount: stage.repSpots.length,
        mySpotShown: sim.towers.some((t) => t.me && t.spot === stage.mySpot),
        repCount: sim.towers.filter((t) => !t.me).length,
        towersDrawn,
        towersDrawnMax: stage.repSpots.length + 1,
        spotDiameterPx: +v.D.toFixed(1),
        spotMinGapPx: +gap.toFixed(1),
        spotsInsideMap: inside,
        labelSpotOverlaps: labelOverlaps(labels, fixed.spots),
        labelGateOverlaps: labelOverlaps(labels, fixed.gates),
        labelBaseOverlaps: labelOverlaps(labels, [fixed.base]),
        labelLabelOverlaps: labelLabel,
        labelCount: labels.length,
        // Anchor centre to the nearest edge of its base/gate label, from the DOM (A: ≤ 44px on phones).
        labelAnchorMaxDistPx: +Math.max(
          0,
          ...shownLabels.map((l) => {
            const r = l.el.getBoundingClientRect();
            return anchorDistance(l.anchor, { l: r.left - mr.left, t: r.top - mr.top, r: r.right - mr.left, b: r.bottom - mr.top });
          }),
        ).toFixed(1),
        labelTexts: shownLabels.map((l) => l.text),
        mapScale: +v.s.toFixed(3),
        mapRect: [mr.left, mr.top, mr.width, mr.height].map(Math.round),
        mapHeightRatio: +(mr.height / window.innerHeight).toFixed(3),
        boardInsideMap: boardIn,
        enemies: sim.enemies.length,
        regionWave: sim.region.wave,
        regionBest: sim.region.best,
        reducedMotion: sim.reduced,
        osmCreditVisible: !!cr && cr.width > 0 && cr.left >= mr.left - 0.5 && cr.right <= mr.right + 0.5 && cr.bottom <= mr.bottom + 0.5,
        osmCreditHref: credit?.href ?? null,
        spriteCacheSize: spriteCacheSize(),
      };
          };
    ready({ sim, banner, tip, qa });

    return () => {
      ready(null);
      cancelAnimationFrame(raf);
      ro.disconnect();
      reduceMq.removeEventListener("change", onReduce);
      off();
      timers.forEach(clearTimeout);
      simRef.current = null;
    };
  }, [stage]);

  // Towers change (representatives re-picked, my tower moved).
  useEffect(() => {
    simRef.current?.setTowers(towers);
  }, [towers]);

  // Labels measured with the fallback font are placed again once the real font has arrived.
  useEffect(() => {
    if (fontReady) relayoutRef.current();
  }, [fontReady]);

  return (
    <div
      ref={mapRef}
      className="relative min-h-0 overflow-hidden bg-[#08132B] outline-1 outline-white/12 [grid-area:map]"
    >
      <canvas
        ref={canvasRef}
        role="img"
        aria-label={`${stage.name} 방어판: 풍선이 입구에서 본부로 오고 대표 타워와 내 타워가 막아요`}
        className="absolute inset-0 block size-full"
      />
      <div ref={labelsRef} className="pointer-events-none absolute inset-0" aria-hidden="true" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[3px] bg-white/8">
        <i ref={waveBarRef} className="block h-full w-0 bg-yellow" />
      </div>
      <div className="absolute right-0 bottom-0 flex max-w-full items-center bg-black/60 px-1.5 py-px text-[10px] whitespace-nowrap text-white">
        <span className="min-w-0 truncate">
          {stage.sources.fakeRoads && <b className="text-yellow">시험용 가짜 길 · </b>}
          {stage.sources.boundary} ·&nbsp;
        </span>
        <a
          data-osm
          href="https://www.openstreetmap.org/copyright"
          target="_blank"
          rel="noopener noreferrer"
          className="flex-none underline underline-offset-2"
        >
          © OpenStreetMap
        </a>
      </div>
      <div ref={bannerRef} className={`${BANNER_BASE} ${BANNER_TONE.yellow} -translate-x-[105%]`} data-qa-ignore />
      <div ref={tipRef} className={`${TIP_BASE} translate-y-2.5 opacity-0`} data-qa-ignore />
      {offline && (
        <div data-slot="map-offline" className="pointer-events-none absolute inset-0 z-4 grid place-items-center bg-[rgba(6,16,42,.72)]" role="status">
          <span className="max-w-[calc(100%-16px)] truncate border-l-6 border-mut bg-black px-3.5 py-2 text-[15px] font-black">
            중계 연결이 끊겼어요, 다시 잇는 중…
          </span>
        </div>
      )}
      <div ref={confettiRef} className="pointer-events-none fixed inset-0 z-50 overflow-hidden" aria-hidden="true" />
    </div>
  );
}
