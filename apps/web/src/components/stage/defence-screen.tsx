"use client";

import { boardTowers, parseStageFile, type Guardian, type StageFile } from "@ktd/core";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { broadcastButton } from "@/components/broadcast";
import { FAKE_ME, FAKE_REGION, fakeGuardians, fmtBig, type RegionHud } from "@/lib/stage/fake-region";
import { fmt, type StageEvent, type TowerInput } from "@/lib/stage/sim";
import { StageBoard, type BoardApi } from "./stage-board";

/** Test stage until the real 185 stages arrive (T15–T16). */
const STAGE_URL = "/stages/dev/32540.json";

function useStageFile() {
  const [stage, setStage] = useState<StageFile | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let alive = true;
    fetch(STAGE_URL)
      .then((res) => {
        if (!res.ok) throw new Error(`stage ${res.status}`);
        return res.json();
      })
      .then((json: unknown) => alive && setStage(parseStageFile(json)))
      .catch((err: unknown) => {
        console.error(err);
        if (alive) setFailed(true);
      });
    return () => {
      alive = false;
    };
  }, [attempt]);
  const retry = () => {
    setFailed(false);
    setAttempt((n) => n + 1);
  };
  return { stage, failed, retry };
}

/** Defence screen: scoreboard, board, (problem panel from T7), ticker. Fake region data until T13. */
export function DefenceScreen() {
  const { stage, failed, retry } = useStageFile();
  const [region, setRegion] = useState<RegionHud>(FAKE_REGION);
  const [tick, setTick] = useState(0);
  const [me, setMe] = useState<Guardian>(FAKE_ME);
  const guardians = useMemo(() => fakeGuardians(FAKE_REGION.guardians), []);
  const apiRef = useRef<BoardApi | null>(null);
  const eventsRef = useRef<StageEvent[]>([]);

  const towers = useMemo<TowerInput[]>(() => {
    if (!stage) return [];
    return boardTowers(guardians, me, stage.repSpots.length).map(({ guardian: g, me: mine, ...at }) => ({
      spot: at.spot === "rep" ? stage.repSpots[at.index]! : stage.mySpot,
      type: g.type,
      step: g.step,
      pal: g.pal,
      me: mine,
    }));
  }, [stage, guardians, me]);
  const topRep = useMemo(() => (stage ? boardTowers(guardians, me, 1)[0]?.guardian : undefined), [stage, guardians, me]);

  const onEvent = useCallback((e: StageEvent) => {
    if (process.env.NODE_ENV !== "production") eventsRef.current.push(e);
    if (e.kind === "region") {
      setRegion((r) => ({ ...r, wave: e.wave, best: e.best }));
      setTick((n) => n + 1);
    }
  }, []);
  const onReady = useCallback((api: BoardApi | null) => {
    apiRef.current = api;
  }, []);

  useDevHooks(apiRef, eventsRef, stage, guardians, me, setMe, setRegion);

  if (failed) {
    return (
      <div className="grid h-full place-items-center p-4 text-center">
        <div className="grid justify-items-center gap-3">
          <p className="text-lg font-black">방어판을 불러오지 못했어요.</p>
          <button type="button" onClick={retry} className={`${broadcastButton} bg-yellow`}>
            다시 불러오기
          </button>
        </div>
      </div>
    );
  }

  const hot = region.perSec > 100;
  const ticker = `${region.name} 생중계 · 지금 ${fmt(region.online)}명이 함께 지키는 중 · 최고 웨이브 ${fmt(region.best)} (전국 ${region.rank}위)${
    topRep ? ` · 대표 지킴이 1위 ${topRep.nick} #${topRep.tag} 타워 ${topRep.step}단계` : ""
  } · 문제를 맞힐 때마다 우리 지역 화력이 세져요`;

  return (
    <div className="relative grid h-full min-h-0 grid-cols-[minmax(0,1fr)] grid-rows-[36px_20px_minmax(0,1fr)_auto] gap-1 px-2 py-1.5 [grid-template-areas:'bug'_'strip'_'map'_'side'] wide-or-landscape:grid-cols-[minmax(0,1fr)_clamp(360px,27vw,520px)] wide-or-landscape:grid-rows-[44px_22px_minmax(0,1fr)_30px] wide-or-landscape:gap-x-3 wide-or-landscape:gap-y-1.5 wide-or-landscape:px-3 wide-or-landscape:pt-2.5 wide-or-landscape:pb-0 wide-or-landscape:[grid-template-areas:'bug_side'_'strip_side'_'map_side'_'tick_tick']">
      <h1 className="sr-only">{region.name} 방어 중계</h1>
      <div className="flex min-w-0 items-stretch bg-navy2 font-heading text-[19px] [grid-area:bug] wide-or-landscape:text-[22px]">
        <span className="hidden flex-none items-center bg-red px-2 text-[13px] text-white min-[430px]:flex">LIVE</span>
        <span className="flex min-w-0 flex-auto items-center bg-white pr-3.5 pl-2 text-[17px] text-navy [clip-path:polygon(0_0,100%_0,calc(100%-8px)_100%,0_100%)]">
          <span className="truncate">{region.name}</span>
        </span>
        <HudSeg label="W" value={fmt(region.wave)} tick={tick} className="bg-yellow text-navy" aria="지역 웨이브" />
        <HudSeg label="최고" value={fmt(region.best)} tick={tick} aria="최고 웨이브" />
        <HudSeg label="접속" value={fmt(region.online)} aria="지금 접속" className="hidden wide-or-landscape:flex" />
      </div>
      <div className="flex min-w-0 items-center gap-2.5 overflow-hidden text-xs leading-5 font-bold whitespace-nowrap text-mut [grid-area:strip] wide-or-landscape:text-[13px] wide-or-landscape:leading-[22px]">
        <span>
          화력 <b className="text-yellow">{fmtBig(region.power)}</b>
        </span>
        <span>
          적 <b className="text-white">{fmtBig(region.power * 0.97)}</b>
        </span>
        <span>
          지금 <b className="text-white">{fmt(region.online)}</b>명
        </span>
        <span>
          1초 정답 <b className={hot ? "text-red" : "text-white"}>{fmt(region.perSec)}</b>개
        </span>
        <span className="hidden min-[430px]:inline">
          지킴이 <b className="text-white">{fmt(region.guardians)}</b>명
        </span>
      </div>
      {stage ? (
        <StageBoard
          stage={stage}
          towers={towers}
          region={{ wave: region.wave, best: region.best, perSec: region.perSec }}
          onEvent={onEvent}
          onReady={onReady}
        />
      ) : (
        <div className="grid min-h-0 place-items-center bg-[#08132B] text-sm font-bold text-mut [grid-area:map]" role="status">
          방어판을 불러오는 중…
        </div>
      )}
      {/* T7: problem panel, level bar and representative list take this place. */}
      <div
        data-slot="side"
        className="grid h-[calc(244px+clamp(32px,9vw,48px)*1.1)] min-w-0 place-items-center border-t-4 border-yellow bg-navy text-sm font-bold text-mut [grid-area:side] short-phone:h-[261.6px] wide-or-landscape:h-auto wide-or-landscape:min-h-0"
      >
        문제는 곧 여기에 나와요
      </div>
      <div className="mx-[-12px] hidden h-[30px] min-w-0 bg-white text-navy [grid-area:tick] wide-or-landscape:flex">
        <span className="flex flex-none items-center bg-red px-2.5 font-heading text-sm text-white">속보</span>
        <div className="flex min-w-0 flex-1 items-center overflow-hidden" data-qa-ignore>
          <div className="inline-flex animate-crawl gap-10 pl-5 text-[13px] font-black whitespace-nowrap">
            <span>{ticker}</span>
            <span aria-hidden="true">{ticker}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function HudSeg({
  label,
  value,
  aria,
  tick,
  className = "",
}: {
  label: string;
  value: string;
  aria: string;
  tick?: number;
  className?: string;
}) {
  return (
    <span aria-label={`${aria} ${value}`} className={`flex flex-none items-center gap-1 px-2 whitespace-nowrap ${className}`}>
      <small aria-hidden="true" className="font-sans text-[11px] font-black opacity-85">
        {label}
      </small>
      <b key={tick} aria-hidden="true" className={`font-normal ${tick ? "animate-bump" : ""}`}>
        {value}
      </b>
    </span>
  );
}

type DemoName =
  | "boss"
  | "breach"
  | "record"
  | "barrage"
  | "crowd"
  | "rep"
  | "right"
  | "upgrade"
  | "newlook"
  | "material"
  | "evolve";

/**
 * Development only: `?demo=<name>` / `window.__demo(name)` play mockup B demos on the board,
 * `window.__qa()` returns layout and effect measurements. Stripped from production builds.
 */
function useDevHooks(
  apiRef: React.RefObject<BoardApi | null>,
  eventsRef: React.RefObject<StageEvent[]>,
  stage: StageFile | null,
  guardians: Guardian[],
  me: Guardian,
  setMe: (me: Guardian) => void,
  setRegion: React.Dispatch<React.SetStateAction<RegionHud>>,
) {
  const queryDemoDone = useRef(false);
  useEffect(() => {
    if (process.env.NODE_ENV === "production" || !stage) return;
    const w = window as unknown as Record<string, unknown>;
    const n = stage.repSpots.length;
    const demo = (name: DemoName) => {
      const api = apiRef.current;
      if (!api) return false;
      const { sim } = api;
      const stepTo = (to: number, kind: "up" | "look" | "mat" | "evo") => {
        sim.meFire(12);
        sim.upgrade(kind, to);
        setMe({ ...me, step: to });
      };
      switch (name) {
        case "boss":
          sim.jumpToBossWave();
          break;
        case "breach":
          sim.startBreach();
          break;
        case "record":
          sim.clearAsRecord();
          break;
        case "barrage":
          sim.setPerSec(320);
          setRegion((r) => ({ ...r, perSec: 320 }));
          api.banner("응원 포격 집중! 1초에 정답 320개", "yellow", 1500);
          setTimeout(() => {
            sim.setPerSec(FAKE_REGION.perSec);
            setRegion((r) => ({ ...r, perSec: FAKE_REGION.perSec }));
          }, 5000);
          break;
        case "crowd":
          setRegion((r) => ({ ...r, online: 3412, perSec: 140 }));
          sim.setPerSec(140);
          api.tip("지금 3,412명이 함께 지키는 중!", 2400);
          setTimeout(() => {
            sim.setPerSec(FAKE_REGION.perSec);
            setRegion((r) => ({ ...r, online: FAKE_REGION.online, perSec: FAKE_REGION.perSec }));
          }, 8000);
          break;
        case "rep": {
          const others = guardians.filter((g) => g.id !== me.id);
          const isRep = boardTowers(guardians, me, n).some((t) => t.me && t.spot === "rep");
          if (isRep) {
            api.tip("대표 자리는 10분마다 다시 뽑아요 · 내 타워는 내 자리에", 2400);
            setMe({ ...me, pts24: FAKE_ME.pts24 });
          } else {
            // Just enough points for the last representative spot.
            const last = boardTowers(others, { ...me, pts24: 0 }, n)[n - 1]?.guardian.pts24 ?? 0;
            api.banner(`속보: ${me.nick} #${me.tag} 대표 지킴이 선발!`, "red", 2000);
            setMe({ ...me, pts24: last + 1 });
          }
          break;
        }
        case "right":
          sim.meFire(12);
          break;
        case "upgrade":
          stepTo(me.step + 1, (me.step + 1) % 5 === 0 ? "look" : "up");
          break;
        case "newlook":
          stepTo(me.step + (5 - (me.step % 5)), "look");
          break;
        case "material":
          sim.upgrade("up", 49);
          stepTo(50, "mat");
          break;
        case "evolve":
          sim.upgrade("up", 99);
          stepTo(100, "evo");
          break;
        default:
          return false;
      }
      return true;
    };
    const qa = () => {
      const de = document.documentElement;
      const counts: Record<string, number> = {};
      let shakeMaxAmpPx = 0;
      let shakeMaxMs = 0;
      const shakeCauses = new Set<string>();
      for (const e of eventsRef.current) {
        counts[e.kind] = (counts[e.kind] ?? 0) + 1;
        if (e.kind === "shake") {
          shakeMaxAmpPx = Math.max(shakeMaxAmpPx, e.ampPx);
          shakeMaxMs = Math.max(shakeMaxMs, e.ms);
          shakeCauses.add(e.cause);
        }
      }
      const side = document.querySelector("[data-slot=side]")?.getBoundingClientRect();
      const small = [...document.querySelectorAll<HTMLElement>("button,a[href],[role=button]")]
        .map((el) => ({ el, r: el.getBoundingClientRect() }))
        .filter(({ r }) => r.width > 0 && r.height > 0 && (r.width < 43.5 || r.height < 43.5))
        .map(({ el, r }) => `${(el.getAttribute("aria-label") ?? el.textContent ?? "").trim().slice(0, 16)} ${Math.round(r.width)}x${Math.round(r.height)}`);
      return {
        innerWidth: window.innerWidth,
        innerHeight: window.innerHeight,
        scrollWidth: de.scrollWidth,
        clientWidth: de.clientWidth,
        horizontalOverflow: de.scrollWidth > de.clientWidth,
        verticalScroll: de.scrollHeight > de.clientHeight,
        sideRect: side ? [side.left, side.top, side.width, side.height].map(Math.round) : null,
        smallTargets: small,
        eventCounts: counts,
        shakeMaxAmpPx,
        shakeMaxMs,
        shakeCauses: [...shakeCauses],
        ...apiRef.current?.qa?.(),
      };
    };
    w.__qa = qa;
    w.__demo = demo;
    w.__qaEvents = () => eventsRef.current.slice();
    w.__qaResetEvents = () => (eventsRef.current.length = 0);
    const first = new URLSearchParams(window.location.search).get("demo") as DemoName | null;
    let id: ReturnType<typeof setTimeout> | undefined;
    if (first && !queryDemoDone.current) {
      const run = () => {
        if (demo(first)) queryDemoDone.current = true;
        else id = setTimeout(run, 100);
      };
      id = setTimeout(run, 300);
    }
    return () => {
      clearTimeout(id);
      delete w.__qa;
      delete w.__demo;
      delete w.__qaEvents;
      delete w.__qaResetEvents;
    };
  }, [apiRef, eventsRef, stage, guardians, me, setMe, setRegion]);
}
