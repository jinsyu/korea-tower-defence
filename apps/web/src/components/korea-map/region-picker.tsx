"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent } from "react";
import { broadcastButton } from "@/components/broadcast";
import { useStartFlow } from "@/components/start-flow";
import { fakeRegionStats, type RegionStats } from "@/lib/fake-region-stats";
import type { RegionShape } from "@/lib/korea-map";
import { KoreaMapView, boxView, nationView } from "./korea-map-view";
import { useKoreaMap } from "./use-korea-map";

const TITLE = "어느 지역을 지킬까요?";
const fmt = (n: number) => n.toLocaleString("ko-KR");

const rowClass =
  "grid min-h-11 min-w-0 grid-cols-[2.6em_minmax(0,1fr)_auto] items-center gap-2 border-l-5 bg-navy2 px-2.5 text-left focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-yellow";

export function RegionPicker() {
  const { map, failed, retry } = useKoreaMap();
  const [sido, setSido] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const { setRegion } = useStartFlow();
  const router = useRouter();

  const regionByCode = useMemo(() => new Map(map?.regions.map((r) => [r.code, r])), [map]);
  const stats = useMemo(
    () => fakeRegionStats([...regionByCode.keys()], (code) => regionByCode.get(code)!.sidoCode),
    [regionByCode],
  );
  const sidoShape = map?.sido.find((s) => s.code === sido);
  const selectedRegion = selected ? regionByCode.get(selected) : undefined;

  // List row that opened the card; focus goes back there when the card closes.
  const openerRef = useRef<HTMLElement | null>(null);

  const showRegion = (code: string, opener: HTMLElement | null = null) => {
    openerRef.current = opener;
    const r = regionByCode.get(code);
    if (!r) return;
    setSido(r.sidoCode);
    setSelected(code);
  };
  const openSido = (code: string) => {
    setSido(code);
    setSelected(null);
  };
  const showNation = () => {
    setSido(null);
    setSelected(null);
  };
  const pick = (r: RegionShape) => {
    setRegion({ code: r.code, name: r.name });
    router.push("/start/nick");
  };

  return (
    <div className="grid h-full min-h-0 grid-cols-1 grid-rows-[44px_minmax(0,1.15fr)_minmax(0,1fr)] gap-1.5 px-2 py-1.5 [grid-template-areas:'top'_'map'_'side'] wide-or-landscape:grid-cols-[minmax(0,1fr)_clamp(320px,26vw,460px)] wide-or-landscape:grid-rows-[44px_minmax(0,1fr)] wide-or-landscape:gap-x-3 wide-or-landscape:gap-y-2 wide-or-landscape:px-3 wide-or-landscape:py-2.5 wide-or-landscape:[grid-template-areas:'top_side'_'map_side']">
      <div className="flex min-w-0 items-stretch bg-navy2 [grid-area:top]">
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
        <h1 className="min-w-0 flex-auto self-center truncate px-2.5 font-heading text-lg">
          {sidoShape?.name ?? TITLE}
        </h1>
      </div>

      <div className="relative min-h-0 overflow-hidden [grid-area:map]">
        {map ? (
          <KoreaMapView
            map={map}
            view={sidoShape ? boxView(sidoShape.box) : nationView(map)}
            label="지킬 지역 고르기 지도"
            fillOf={(code) => (code === selected ? "#FFFFFF" : "#16346B")}
            selected={selected}
            labelSido={sido}
            onRegionClick={(code) => showRegion(code)}
          />
        ) : (
          <p className="grid h-full place-items-center p-4 text-center text-sm font-bold text-mut" role="status">
            {failed ? "지도를 불러오지 못했어요." : "지도를 불러오는 중이에요…"}
          </p>
        )}
        {selectedRegion && (
          <RegionCard
            region={selectedRegion}
            stats={stats.get(selectedRegion.code)!}
            onPick={() => pick(selectedRegion)}
            onClose={() => {
              setSelected(null);
              if (openerRef.current?.isConnected) openerRef.current.focus();
            }}
          />
        )}
      </div>

      <div className="grid min-h-0 min-w-0 grid-rows-[auto_minmax(0,1fr)] gap-1 [grid-area:side]">
        <p className="truncate text-[13px] font-bold text-yellow">185곳 어디든 골라요 · 30일에 한 번 바꿀 수 있어요</p>
        <div className="grid min-h-0 content-start gap-[3px] overflow-y-auto">
          {failed && (
            <button type="button" onClick={retry} className={`${broadcastButton} bg-yellow`}>
              다시 불러오기
            </button>
          )}
          {map &&
            (sido
              ? map.regions
                  .filter((r) => r.sidoCode === sido)
                  .map((r) => (
                    <RegionRow
                      key={r.code}
                      region={r}
                      stats={stats.get(r.code)!}
                      selected={r.code === selected}
                      onClick={(e) => showRegion(r.code, e.currentTarget)}
                    />
                  ))
              : map.sido.map((s) => {
                  const regions = map.regions.filter((r) => r.sidoCode === s.code);
                  const guardians = regions.reduce((sum, r) => sum + stats.get(r.code)!.guardians, 0);
                  return (
                    <button
                      key={s.code}
                      type="button"
                      onClick={() => openSido(s.code)}
                      className={rowClass}
                      style={{ borderLeftColor: "#3a4566" }}
                    >
                      <span className="font-heading text-lg text-mut">{regions.length}</span>
                      <span className="grid min-w-0">
                        <b className="truncate text-[15px]">{s.name}</b>
                        <small className="truncate text-[11px] text-mut">{regions.length}곳</small>
                      </span>
                      <span className="text-xs font-bold whitespace-nowrap text-mut">지킴이 {fmt(guardians)}명</span>
                    </button>
                  );
                }))}
        </div>
      </div>
    </div>
  );
}

function RegionRow({
  region,
  stats,
  selected,
  onClick,
}: {
  region: RegionShape;
  stats: RegionStats;
  selected: boolean;
  onClick: (e: MouseEvent<HTMLButtonElement>) => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={`${rowClass} aria-pressed:outline-2 aria-pressed:-outline-offset-2 aria-pressed:outline-red`}
      style={{ borderLeftColor: "#2E6BD1" }}
    >
      <span className="font-heading text-lg text-mut">{stats.guardians ? "W" : "·"}</span>
      <span className="grid min-w-0">
        <b className="truncate text-[15px]">{region.name}</b>
        <small className="truncate text-[11px] text-mut">
          {stats.guardians ? `최고 웨이브 ${fmt(stats.best)}` : "지킴이를 기다려요"}
        </small>
      </span>
      <span className="font-heading text-lg whitespace-nowrap">{fmt(stats.guardians)}명</span>
    </button>
  );
}

function RegionCard({
  region,
  stats,
  onPick,
  onClose,
}: {
  region: RegionShape;
  stats: RegionStats;
  onPick: () => void;
  onClose: () => void;
}) {
  const pickRef = useRef<HTMLButtonElement>(null);

  // Move keyboard and screen-reader focus into the card whenever it shows a region.
  useEffect(() => {
    pickRef.current?.focus();
  }, [region.code]);

  const closeOnEscape = (e: KeyboardEvent) => {
    if (e.key === "Escape") onClose();
  };

  return (
    <section
      onKeyDown={closeOnEscape}
      aria-label={`${region.name} 지역 카드`}
      className="absolute inset-x-1 bottom-1 z-5 grid min-w-0 animate-lower-in border-t-4 border-yellow bg-[rgb(6_16_42/0.96)] wide-or-landscape:right-auto wide-or-landscape:bottom-3 wide-or-landscape:left-3 wide-or-landscape:w-[min(560px,calc(100%-24px))]"
    >
      <div className="flex min-w-0 items-stretch pr-12">
        <h2 className="min-w-0 truncate bg-yellow px-3 py-1 font-heading text-[22px] text-navy [clip-path:polygon(0_0,100%_0,calc(100%-10px)_100%,0_100%)]">
          {region.name}
        </h2>
        <span className="flex min-w-0 items-center truncate px-2.5 text-[13px] font-black">{region.sidoName}</span>
      </div>
      <p className="px-2.5 py-1.5 text-sm font-bold">
        {stats.guardians
          ? `지킴이 ${fmt(stats.guardians)}명 · 최고 웨이브 ${fmt(stats.best)} · 지금 ${fmt(stats.online)}명 지키는 중`
          : "아직 지킴이가 없어요. 첫 지킴이가 되어 볼까요?"}
      </p>
      <button ref={pickRef} type="button" onClick={onPick} className={`${broadcastButton} mx-2 mb-2 bg-yellow`}>
        여기를 지킬래요
      </button>
      <button
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
