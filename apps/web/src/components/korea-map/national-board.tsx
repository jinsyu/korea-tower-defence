"use client";

import { formatBig } from "@ktd/core";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { broadcastButton } from "@/components/broadcast";
import { pageQa, useDemoHooks } from "@/components/dev/use-demo-hooks";
import { PER_RANK_MIN_SOLVERS, type BoardRegion, type BoardStats } from "@/lib/fake-board-stats";
import { BAND_COLORS, bandColor, NO_GUARDIAN_COLOR } from "@/lib/fake-region-stats";
import type { RegionShape } from "@/lib/korea-map";
import { FAKE_BOARD, FAKE_REGION_CODE } from "@/lib/stage/fake-region";
import { KoreaMapView, boxView, nationView } from "./korea-map-view";
import { useKoreaMap } from "./use-korea-map";

type Tab = "wave" | "per";

const TITLE = "전국 상황판";
const NONE_FILL = "url(#board-none)";
const fmt = (n: number) => n.toLocaleString("ko-KR");

const focusRing = "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-yellow";

const rankText = (rank: number | null) => (rank ? `${rank}위` : "—");
const rankOf = (s: BoardRegion, tab: Tab) => (tab === "per" ? s.rankPer : s.rankWave);
const valueOf = (s: BoardRegion, tab: Tab) =>
  tab === "per" ? (s.per === null ? "—" : `${s.per.toFixed(1)}개`) : s.guardians ? fmt(s.best) : "—";

/** Regions shown in the list: the whole ranking, or every region of the opened sido (ranked first). */
function listCodes(stats: BoardStats, regions: RegionShape[], sido: string | null, tab: Tab): string[] {
  const order = tab === "per" ? stats.byPer : stats.byWave;
  if (!sido) return order;
  const inSido = regions.filter((r) => r.sidoCode === sido).map((r) => r.code);
  const rank = (c: string) => rankOf(stats.regions.get(c)!, tab) ?? Infinity;
  return inSido.sort((a, b) => rank(a) - rank(b));
}

/** "전국 상황판": 185 regions coloured by best wave, two ranking tabs, my region pinned, region cards (D59, D60). */
export function NationalBoard() {
  const { map, failed, retry } = useKoreaMap();
  const [sido, setSido] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("wave");

  const regionByCode = useMemo(() => new Map(map?.regions.map((r) => [r.code, r])), [map]);
  const stats = FAKE_BOARD;
  const sidoShape = map?.sido.find((s) => s.code === sido);
  const selectedRegion = selected ? regionByCode.get(selected) : undefined;
  const openerRef = useRef<HTMLElement | null>(null);

  const showRegion = (code: string, opener: HTMLElement | null = null) => {
    const r = regionByCode.get(code);
    if (!r) return false;
    openerRef.current = opener;
    setSido(r.sidoCode);
    setSelected(code);
  };
  const showNation = () => {
    setSido(null);
    setSelected(null);
  };

  useDemoHooks(
    {
      "board-tab": () => setTab("per"),
      "board-mine": () => showRegion(FAKE_REGION_CODE),
      "board-empty": () => {
        const empty = [...stats.regions].find(([, s]) => s.guardians === 0);
        return empty ? showRegion(empty[0]) : false;
      },
    },
    () => {
      const scr = document.querySelector("[data-slot=board]");
      const all = <T extends Element>(sel: string) => [...(scr?.querySelectorAll<T>(sel) ?? [])];
      const paths = all<SVGPathElement>("path[data-code]");
      const fills = new Set(paths.map((p) => p.getAttribute("fill")));
      const card = scr?.querySelector("[data-slot=board-card]");
      const labels = all<SVGTextElement>("svg text").map((t) => t.getBoundingClientRect());
      const zoomFit = () => {
        const svg = scr?.querySelector<SVGSVGElement>("svg[role=img]");
        const ctm = svg?.getScreenCTM();
        const area = scr?.querySelector("[data-slot=board-map]")?.getBoundingClientRect();
        if (!sidoShape || !svg || !ctm || !area) return null;
        const [x0, y0, x1, y1] = sidoShape.box;
        const a = new DOMPoint(x0, y0).matrixTransform(ctm);
        const b = new DOMPoint(x1, y1).matrixTransform(ctm);
        const inside = a.x >= area.left - 0.5 && a.y >= area.top - 0.5 && b.x <= area.right + 0.5 && b.y <= area.bottom + 0.5;
        const fill = Math.max((b.x - a.x) / area.width, (b.y - a.y) / area.height);
        return { sido: sidoShape.name, inside, fill: Math.round(fill * 100) / 100 };
      };
      const minPx = (els: Element[]) => (els.length ? Math.round(Math.min(...els.map((e) => e.getBoundingClientRect().height))) : null);
      return {
        ...pageQa(),
        boardRegionCount: paths.length,
        boardPaintedCount: paths.filter((p) => [...BAND_COLORS, NONE_FILL].includes(p.getAttribute("fill") ?? "")).length,
        boardFillCount: fills.size,
        boardGrayCount: paths.filter((p) => p.getAttribute("fill") === NONE_FILL).length,
        boardMyRegionMarked: !!scr?.querySelector(`[data-marked="${FAKE_REGION_CODE}"]`),
        rankTabCount: all("[data-rank]").length,
        rankTab: tab,
        rankRows: all("[data-slot=board-list] [data-row]").length,
        rankRowMinPx: minPx(all("[data-rank], [data-row]").filter((e) => e.getBoundingClientRect().height > 0)),
        boardLabelCount: labels.length,
        boardLabelOverlaps: labels.reduce(
          (n, a, i) =>
            n + labels.slice(i + 1).filter((b) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom).length,
          0,
        ),
        boardZoomFit: zoomFit(),
        cardShown: !!card,
        cardItems: card ? [...card.querySelectorAll("[data-item]")].map((e) => e.getAttribute("data-item")) : [],
        cardText: card?.textContent ?? null,
      };
    },
  );

  const codes = map ? listCodes(stats, map.regions, sido, tab) : [];
  const mine = stats.regions.get(FAKE_REGION_CODE);

  const row = (code: string, extra = "") => {
    const r = regionByCode.get(code)!;
    const s = stats.regions.get(code)!;
    const isMine = code === FAKE_REGION_CODE;
    return (
      <button
        key={code}
        type="button"
        data-row={code}
        aria-pressed={code === selected}
        onClick={(e) => showRegion(code, e.currentTarget)}
        style={{ borderLeftColor: bandColor(s) }}
        className={`grid min-h-11 min-w-0 grid-cols-[2.6em_minmax(0,1fr)_auto] items-center gap-2 border-l-5 bg-navy2 px-2.5 text-left aria-pressed:outline-2 aria-pressed:-outline-offset-2 aria-pressed:outline-red ${isMine ? "bg-navy3 outline-2 -outline-offset-2 outline-yellow" : ""} ${focusRing} ${extra}`}
      >
        <span className={`font-heading text-lg ${isMine ? "text-yellow" : "text-mut"}`}>{rankOf(s, tab) ?? "—"}</span>
        <span className="grid min-w-0">
          <b className="truncate text-[15px]">{r.name}</b>
          <small className="truncate text-[11px] text-mut">
            {r.sidoName}
            {isMine ? " · 우리 지역" : ""} · {s.guardians ? `지킴이 ${fmt(s.guardians)}명` : "지킴이를 기다려요"}
          </small>
        </span>
        <span className="font-heading text-lg whitespace-nowrap">{valueOf(s, tab)}</span>
      </button>
    );
  };

  return (
    <div
      data-slot="board"
      className="grid h-full min-h-0 grid-cols-1 grid-rows-[44px_minmax(0,1.15fr)_minmax(0,1fr)] gap-1.5 px-2 py-1.5 [grid-template-areas:'top'_'map'_'side'] wide-or-landscape:grid-cols-[minmax(0,1fr)_clamp(320px,26vw,460px)] wide-or-landscape:grid-rows-[44px_minmax(0,1fr)] wide-or-landscape:gap-x-3 wide-or-landscape:gap-y-2 wide-or-landscape:px-3 wide-or-landscape:py-2.5 wide-or-landscape:[grid-template-areas:'top_side'_'map_side']"
    >
      <svg width="0" height="0" className="absolute" aria-hidden="true" focusable="false">
        <defs>
          <pattern id="board-none" width="5" height="5" patternUnits="userSpaceOnUse">
            <rect width="5" height="5" fill={NO_GUARDIAN_COLOR} />
            <rect width="5" height="1.4" fill="#1c2340" />
          </pattern>
        </defs>
      </svg>

      <div className="flex min-w-0 items-stretch bg-navy2 [grid-area:top]">
        <span className="flex flex-none items-center bg-red px-2.5 font-heading text-[13px] text-white">LIVE</span>
        {sido && (
          <button
            type="button"
            aria-label="전국 보기"
            onClick={showNation}
            className="min-w-11 flex-none bg-yellow px-2.5 font-heading text-[15px] whitespace-nowrap text-navy focus-visible:outline-2 focus-visible:-outline-offset-4 focus-visible:outline-navy"
          >
            ← 전국
          </button>
        )}
        <h1 className="min-w-0 flex-auto self-center truncate px-2.5 font-heading text-lg">{sidoShape?.name ?? TITLE}</h1>
        <Link
          href="/play"
          prefetch={false}
          className="flex min-w-11 flex-none items-center bg-white px-2.5 font-heading text-[15px] whitespace-nowrap text-navy focus-visible:outline-3 focus-visible:-outline-offset-4 focus-visible:outline-navy"
        >
          중계로
        </Link>
      </div>

      <div data-slot="board-map" className="relative min-h-0 overflow-hidden [grid-area:map]">
        {map ? (
          <KoreaMapView
            map={map}
            view={sidoShape ? boxView(sidoShape.box) : nationView(map)}
            label="전국 185개 지역 방어 상황 지도"
            fillOf={(code) => {
              const s = stats.regions.get(code)!;
              return s.band < 0 ? NONE_FILL : bandColor(s);
            }}
            selected={selected}
            labelSido={sido}
            marked={FAKE_REGION_CODE}
            sublabelOf={(code) => {
              const s = stats.regions.get(code)!;
              return s.guardians ? `W${fmt(s.best)}` : "—";
            }}
            onRegionClick={(code) => showRegion(code)}
          />
        ) : (
          <p className="grid h-full place-items-center p-4 text-center text-sm font-bold text-mut" role="status">
            {failed ? "지도를 불러오지 못했어요." : "지도를 불러오는 중이에요…"}
          </p>
        )}
        <Legend />
        <Link
          href="/info#sources"
          prefetch={false}
          className="absolute right-1 bottom-1 bg-[rgb(6_16_42/0.8)] px-1.5 text-[10px] font-bold text-mut underline-offset-2 hover:underline"
        >
          경계: 통계청 SGIS · CC BY 4.0
        </Link>
        {selectedRegion && (
          <RegionCard
            region={selectedRegion}
            stats={stats.regions.get(selectedRegion.code)!}
            mine={selectedRegion.code === FAKE_REGION_CODE}
            onClose={() => {
              setSelected(null);
              if (openerRef.current?.isConnected) openerRef.current.focus();
            }}
          />
        )}
      </div>

      <div className="grid min-h-0 min-w-0 grid-rows-[auto_auto_minmax(0,1fr)] gap-1 [grid-area:side]">
        <div className="grid grid-cols-2 gap-1" role="group" aria-label="순위 기준">
          {(
            [
              ["wave", "최고 웨이브"],
              ["per", "오늘 1인당 정답"],
            ] as const
          ).map(([k, label]) => (
            <button
              key={k}
              type="button"
              data-rank={k}
              aria-pressed={tab === k}
              onClick={() => setTab(k)}
              className={`min-h-11 truncate bg-navy2 px-1.5 font-heading text-base aria-pressed:bg-yellow aria-pressed:text-navy ${focusRing}`}
            >
              {label}
            </button>
          ))}
        </div>
        <div data-slot="board-mine" className="grid">
          {map && mine && row(FAKE_REGION_CODE)}
        </div>
        <div data-slot="board-list" className="grid min-h-0 content-start gap-[3px] overflow-y-auto">
          {failed && (
            <button type="button" onClick={retry} className={`${broadcastButton} bg-yellow`}>
              다시 불러오기
            </button>
          )}
          {codes.map((c) => row(c))}
          {map && tab === "per" && (
            <p className="truncate py-1.5 text-[13px] font-bold text-yellow">
              오늘 문제를 푼 지킴이가 {PER_RANK_MIN_SOLVERS}명 이상인 지역만 순위에 올라요
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function Legend() {
  const chip = "inline-flex items-center gap-1 bg-[rgb(6_16_42/0.88)] px-1.5 whitespace-nowrap";
  const swatch = "inline-block size-[11px] border border-white/60";
  return (
    <div className="pointer-events-none absolute top-1 left-1 flex max-w-[calc(100%-8px)] flex-wrap gap-[3px] text-[11px] font-black wide-or-landscape:top-2 wide-or-landscape:left-2 wide-or-landscape:text-xs">
      <span className={chip}>최고 웨이브</span>
      {BAND_COLORS.map((c, i) => (
        <span key={c} className={chip}>
          <i className={swatch} style={{ background: c }} />
          {i === 0 ? "낮음" : i === BAND_COLORS.length - 1 ? "높음" : ""}
        </span>
      ))}
      <span className={chip}>
        <i className={swatch} style={{ background: NO_GUARDIAN_COLOR }} />
        지킴이 없음
      </span>
    </div>
  );
}

function RegionCard({
  region,
  stats: s,
  mine,
  onClose,
}: {
  region: RegionShape;
  stats: BoardRegion;
  mine: boolean;
  onClose: () => void;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);

  // Move keyboard and screen-reader focus into the card whenever it shows a region.
  useEffect(() => {
    closeRef.current?.focus();
  }, [region.code]);

  const closeOnEscape = (e: KeyboardEvent) => {
    if (e.key === "Escape") onClose();
  };

  const items: [string, string, string][] = [
    ["wave", "현재 웨이브", fmt(s.wave)],
    ["best", "최고 웨이브", fmt(s.best)],
    ["guardians", "지킴이", `${fmt(s.guardians)}명`],
    ["online", "지금 접속", `${fmt(s.online)}명`],
    ["today", "오늘 정답", `${formatBig(s.today)}개`],
    ["rank", "순위", `최고 웨이브 ${rankText(s.rankWave)} · 1인당 정답 ${rankText(s.rankPer)}`],
  ];

  return (
    <section
      data-slot="board-card"
      onKeyDown={closeOnEscape}
      aria-label={`${region.name} 지역 카드`}
      className="absolute inset-x-1 bottom-1 z-5 grid min-w-0 animate-lower-in border-t-4 border-yellow bg-[rgb(6_16_42/0.96)] wide-or-landscape:right-auto wide-or-landscape:bottom-3 wide-or-landscape:left-3 wide-or-landscape:w-[min(560px,calc(100%-24px))]"
    >
      <div className="flex min-w-0 items-stretch pr-12">
        <h2
          data-item="name"
          className="min-w-0 truncate bg-yellow px-3 py-1 font-heading text-[22px] text-navy [clip-path:polygon(0_0,100%_0,calc(100%-10px)_100%,0_100%)]"
        >
          {region.name}
        </h2>
        <span className="flex min-w-0 items-center truncate px-2.5 text-[13px] font-black">
          {region.sidoName}
          {mine ? " · 우리 지역" : ""}
        </span>
      </div>
      <dl className="grid grid-cols-3 gap-0.5 px-2 py-1.5">
        {items.map(([key, label, value]) => (
          <div key={key} data-item={key} className={`grid min-w-0 ${key === "rank" ? "col-span-3" : ""}`}>
            <dt className="truncate text-[11px] font-bold text-mut">{label}</dt>
            <dd className="truncate font-heading text-lg">{value}</dd>
          </div>
        ))}
      </dl>
      {!s.guardians && (
        <p className="px-2.5 pb-1.5 text-sm font-bold">지킴이를 기다려요. 아무도 지키지 않아 웨이브 1에 머물러 있어요.</p>
      )}
      <button
        ref={closeRef}
        type="button"
        aria-label="닫기"
        onClick={onClose}
        className="absolute top-0 right-0 size-11 bg-black text-[22px] text-white focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-yellow"
      >
        ×
      </button>
    </section>
  );
}
