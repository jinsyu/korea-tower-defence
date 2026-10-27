"use client";

import { formatBig, parseStageFile, type StageFile } from "@ktd/core";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { broadcastButton } from "@/components/broadcast";
import { FAKE_REGION, fakeGuardians, type RegionHud } from "@/lib/stage/fake-region";
import {
  advanceDelay,
  answerProblem,
  markShown,
  newPanel,
  nextProblem,
  panelHeader,
  resumeAfterReconnect,
  type PanelState,
} from "@/lib/stage/math-panel";
import { boardTowerInputs, gainPoints, levelUpText, meBarView, meStore, repRows, upgradeChange } from "@/lib/stage/me-store";
import { fmt, type StageEvent } from "@/lib/stage/sim";
import { MathPanel } from "./math-panel";
import { MeBar } from "./me-bar";
import { NewsSheet, type AwayNews } from "./news-sheet";
import { RepList } from "./rep-list";
import { StageBoard, type BoardApi } from "./stage-board";
import { useDevHooks, type ScreenActions } from "./use-dev-hooks";

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

/** Pending timers of the screen, cleared when it goes away. */
function useLater() {
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>());
  useEffect(() => {
    const set = timers.current;
    return () => set.forEach(clearTimeout);
  }, []);
  return useCallback((fn: () => void, ms: number) => {
    const id = setTimeout(() => {
      timers.current.delete(id);
      fn();
    }, ms);
    timers.current.add(id);
  }, []);
}

const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * Defence screen: scoreboard, board, problem panel, level bar, representative list and ticker.
 * Region, problems and my guardian are fake until the server sends them (T11–T13).
 */
export function DefenceScreen() {
  const { stage, failed, retry } = useStageFile();
  const [region, setRegion] = useState<RegionHud>(FAKE_REGION);
  const [tick, setTick] = useState(0);
  // My guardian: one store read by the board, the representative list and the level bar.
  const me = useSyncExternalStore(meStore.subscribe, meStore.get, meStore.get);
  // Mockup B opens on a 1~2 band problem part way through a streak.
  const [panel, setPanel] = useState<PanelState>(() => ({ ...newPanel(meStore.get().band, 0, 2), streak: 3 }));
  const [clock, setClock] = useState(0);
  const [offline, setOfflineState] = useState(false);
  const [news, setNews] = useState<AwayNews | null>(null);
  const [levelBump, setLevelBump] = useState(0);
  const guardians = useMemo(() => fakeGuardians(FAKE_REGION.guardians), []);
  const apiRef = useRef<BoardApi | null>(null);
  const eventsRef = useRef<StageEvent[]>([]);
  const later = useLater();

  const towers = useMemo(() => (stage ? boardTowerInputs(stage, guardians, me) : []), [stage, guardians, me]);
  const reps = useMemo(() => (stage ? repRows(guardians, me, stage.repSpots.length) : []), [stage, guardians, me]);
  const topRep = reps[0]?.rank === 1 ? reps[0] : undefined;

  // The first problem counts as shown from the first painted frame in the browser (until then answers are too fast).
  useEffect(() => {
    const id = requestAnimationFrame(() => setPanel((p) => (p.shownAt === 0 ? markShown(p, Date.now()) : p)));
    return () => cancelAnimationFrame(id);
  }, []);

  // Next problem after a correct answer; held while offline so the same problem stays (D58).
  useEffect(() => {
    const at = panel.advanceAt;
    const wait = advanceDelay(panel, offline, Date.now());
    if (wait === null) return;
    const id = setTimeout(() => setPanel((p) => (p.advanceAt === at ? nextProblem(p, Date.now()) : p)), wait);
    return () => clearTimeout(id);
  }, [panel, offline]);

  const setOffline = useCallback((next: boolean) => {
    setOfflineState(next);
    if (!next) setPanel((p) => resumeAfterReconnect(p, Date.now()));
  }, []);

  // The guess-pause header counts down once a second.
  useEffect(() => {
    if (panel.pausedUntil <= clock) return;
    const id = setInterval(() => setClock(Date.now()), 1000);
    return () => clearInterval(id);
  }, [panel.pausedUntil, clock]);

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

  /** Points to my guardian; steps and levels rise on their own, with the matching effect (D48). */
  const gain = useCallback((points: number) => {
    const api = apiRef.current;
    const g = gainPoints(meStore.get(), points);
    const change = upgradeChange(g.fromStep, g.me.step);
    if (change && api) {
      api.sim.upgrade(change.kind, g.me.step);
      api.banner(change.text, change.tone, change.ms);
    }
    meStore.set(g.me);
    if (g.me.level > g.fromLevel) {
      setLevelBump((n) => n + 1);
      api?.tip(levelUpText(g.me.level, g.me.stance), 2400);
    }
  }, []);

  const answerWith = useCallback(
    (s: PanelState, pick: number, now: number) => {
      if (offline || s.answered) return;
      const reduced = reducedMotion();
      const out = answerProblem(s, pick, now, reduced);
      setPanel(out.state);
      const api = apiRef.current;
      if (!out.answered.correct) {
        api?.tip(out.levelDown ? "조금 쉬운 문제로 연습해요" : "괜찮아요, 다음 문제에서 또 해 봐요", 2600);
        return;
      }
      api?.sim.meFire(out.answered.points);
      if (out.answered.points > 0) gain(out.answered.points);
      if (out.levelUp) later(() => apiRef.current?.banner("더 어려운 문제에 도전!", "yellow", 1500), reduced ? 0 : 500);
    },
    [offline, later, gain],
  );
  const onPick = (i: number) => answerWith(panel, i, Date.now());
  const onNext = () => {
    if (!offline) setPanel((p) => nextProblem(p, Date.now()));
  };

  const actionsRef = useRef<ScreenActions>(null!);
  useEffect(() => {
    actionsRef.current = { panel, answerWith, setPanel, setClock, setRegion, setOffline, setNews };
  }, [panel, answerWith, setOffline]);
  useDevHooks(apiRef, eventsRef, actionsRef, stage, guardians);

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
        <span className={`hidden flex-none items-center px-2 text-[13px] text-white min-[430px]:flex ${offline ? "bg-black" : "bg-red"}`}>
          {offline ? "연결 끊김" : "LIVE"}
        </span>
        <span className="flex min-w-0 flex-auto items-center bg-white pr-3.5 pl-2 text-[17px] text-navy [clip-path:polygon(0_0,100%_0,calc(100%-8px)_100%,0_100%)]">
          <span className="truncate">{region.name}</span>
        </span>
        <HudSeg label="W" value={fmt(region.wave)} tick={tick} className="bg-yellow text-navy" aria="지역 웨이브" />
        <HudSeg label="최고" value={fmt(region.best)} tick={tick} aria="최고 웨이브" />
        <HudSeg label="접속" value={fmt(region.online)} aria="지금 접속" className="hidden wide-or-landscape:flex" />
      </div>
      <div className="flex min-w-0 items-center gap-2.5 overflow-hidden text-xs leading-5 font-bold whitespace-nowrap text-mut [grid-area:strip] wide-or-landscape:text-[13px] wide-or-landscape:leading-[22px]">
        <span>
          화력 <b className="text-yellow">{formatBig(region.power)}</b>
        </span>
        <span>
          적 <b className="text-white">{formatBig(region.power * 0.97)}</b>
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
          offline={offline}
          onEvent={onEvent}
          onReady={onReady}
        />
      ) : (
        <div className="grid min-h-0 place-items-center bg-[#08132B] text-sm font-bold text-mut [grid-area:map]" role="status">
          방어판을 불러오는 중…
        </div>
      )}
      <div
        data-slot="side"
        className="grid min-w-0 content-start gap-1 [grid-area:side] wide-or-landscape:min-h-0 wide-or-landscape:overflow-y-auto"
      >
        <MathPanel state={panel} header={panelHeader(panel, clock)} offline={offline} onPick={onPick} onNext={onNext} />
        <MeBar view={meBarView(me)} bump={levelBump} />
        <RepList rows={reps} />
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
      {news && <NewsSheet news={news} step={me.step} onClose={() => setNews(null)} />}
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
