"use client";

import { boardTowers, formatBig, parseStageFile, placeTowers, type Guardian, type StageFile } from "@ktd/core";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { broadcastButton } from "@/components/broadcast";
import { isDevDemo } from "@/components/use-my-guardian";
import { OFFLINE_TEXT } from "@/lib/game-server";
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
  type PanelView,
} from "@/lib/stage/math-panel";
import { gainPoints, levelUpText, meBarView, meFromServer, meStore, placedRepRows, placedTowerInputs, upgradeChange } from "@/lib/stage/me-store";
import {
  hudOf,
  isStale,
  newsSince,
  rememberSeen,
  repGuardians,
  waitingHud,
  waveLine,
  type RegionMessage,
  type RepsMessage,
} from "@/lib/stage/region-live";
import { wrongTip, type AnswerReply } from "@/lib/stage/server-math";
import { regionName } from "@/lib/region-names";
import { fmt, type StageEvent } from "@/lib/stage/sim";
import { MathPanel } from "./math-panel";
import { MeBar } from "./me-bar";
import { NewsSheet, type AwayNews } from "./news-sheet";
import { RepList } from "./rep-list";
import { StageBoard, type BoardApi } from "./stage-board";
import { useDevHooks, type ScreenActions } from "./use-dev-hooks";
import { useRegionLive } from "./use-region-live";
import { useServerMath } from "./use-server-math";

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

/** Read-out lines kept for the wave log (screen readers and the E2E watch every one as it is added). */
const WAVE_LOG_KEPT = 6;

/**
 * Defence screen: scoreboard, board, problem panel, level bar, representative list and ticker.
 * Problems, points and my tower come from the game server (T12); my region's waves, representatives and numbers come
 * from its room (T13). The dev-only `?demo=` screens deal problems and play the region here without a server.
 */
export function DefenceScreen() {
  const { stage, failed, retry } = useStageFile();
  const router = useRouter();
  // Fixed for the screen's life: the gate shows this screen only after it knows (client side) which it is.
  const [demo] = useState(isDevDemo);
  const [region, setRegion] = useState<RegionHud>(() => {
    const name = regionName(meStore.get().region);
    return isDevDemo() ? { ...FAKE_REGION, name } : waitingHud(name);
  });
  const [tick, setTick] = useState(0);
  // My guardian: one store read by the board, the representative list and the level bar.
  const me = useSyncExternalStore(meStore.subscribe, meStore.get, meStore.get);
  // Mockup B opens on a level 2 problem part way through a streak.
  const [panel, setPanel] = useState<PanelState>(() => ({ ...newPanel(0, 2), streak: 3 }));
  const [clock, setClock] = useState(0);
  // Demos switch the connection notice by hand; the server's room switches it for real.
  const [demoOffline, setOfflineState] = useState(false);
  const [news, setNews] = useState<AwayNews | null>(null);
  const [levelBump, setLevelBump] = useState(0);
  const guardians = useMemo(() => (demo ? fakeGuardians(FAKE_REGION.guardians) : []), [demo]);
  // The server's representatives in its order (picked every 10 minutes, D21).
  const [serverReps, setServerReps] = useState<Guardian[]>([]);
  const [waveLog, setWaveLog] = useState<{ key: number; text: string }[]>([]);
  const apiRef = useRef<BoardApi | null>(null);
  const eventsRef = useRef<StageEvent[]>([]);
  /** The newest region message applied, and the first wave this visit saw (older ended waves are not read out). */
  const shownRef = useRef<RegionMessage | null>(null);
  const firstStartRef = useRef<number | null>(null);
  const later = useLater();

  const placed = useMemo(() => {
    if (!stage) return [];
    const n = stage.repSpots.length;
    return demo ? boardTowers(guardians, me, n) : placeTowers(serverReps, me, n);
  }, [stage, demo, guardians, serverReps, me]);
  const towers = useMemo(() => (stage ? placedTowerInputs(stage, placed) : []), [stage, placed]);
  const reps = useMemo(() => placedRepRows(placed), [placed]);
  const topRep = reps[0]?.rank === 1 ? reps[0] : undefined;

  // The first problem counts as shown from the first painted frame in the browser (until then answers are too fast).
  useEffect(() => {
    const id = requestAnimationFrame(() => setPanel((p) => (p.shownAt === 0 ? markShown(p, Date.now()) : p)));
    return () => cancelAnimationFrame(id);
  }, []);

  /** A region message: scoreboard, read-out of every resolved wave, the board, and "지난 소식" on the first one (D23, D24). */
  const onRegion = useCallback((m: RegionMessage) => {
    const prev = shownRef.current;
    if (m.code !== meStore.get().region || isStale(m, prev)) return;
    shownRef.current = m;
    if (!prev) {
      firstStartRef.current = m.waveStartMs;
      const away = newsSince(m);
      if (away) setNews(away);
    }
    rememberSeen(m);
    const from = Math.max(firstStartRef.current ?? m.waveStartMs, prev ? prev.waveStartMs : -Infinity);
    const ended = m.ended.filter((e) => e.startMs >= from);
    if (ended.length > 0) {
      setWaveLog((log) => [...log, ...ended.map((e) => ({ key: e.startMs, text: waveLine(e) }))].slice(-WAVE_LOG_KEPT));
    }
    setRegion(hudOf(m, regionName(m.code)));
    if (!prev || prev.wave !== m.wave) setTick((n) => n + 1);
    const api = apiRef.current;
    if (api) {
      api.sim.setPerSec(m.perSec);
      api.sim.follow({ wave: m.wave, best: m.best, breach: !m.held, ended: ended.at(-1)?.held ?? null });
    }
  }, []);
  const onReps = useCallback((m: RepsMessage) => {
    if (m.code === meStore.get().region) setServerReps(repGuardians(m.list));
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

  /** The server marked my answer: the right-answer shot, upgrade and level effects follow its numbers (D48). */
  const onServerAnswer = useCallback(
    (reply: AnswerReply) => {
      const api = apiRef.current;
      const before = meStore.get();
      const after = meFromServer(reply.me);
      if (reply.correct) api?.sim.meFire(reply.points);
      const change = upgradeChange(before.step, after.step);
      if (change && api) {
        api.sim.upgrade(change.kind, after.step);
        api.banner(change.text, change.tone, change.ms);
      }
      meStore.set(after);
      if (after.level > before.level) {
        setLevelBump((n) => n + 1);
        api?.tip(levelUpText(after.level, after.stance), 2400);
      }
      const reduced = reducedMotion();
      if (!reply.correct) api?.tip(wrongTip(reply), 2600);
      else if (reply.step === "up") later(() => apiRef.current?.banner("더 어려운 문제에 도전!", "yellow", 1500), reduced ? 0 : 500);
      if (reply.restHint) later(() => apiRef.current?.banner("오늘 정말 많이 풀었어요! 쉬어 가도 괜찮아요", "white", 2200), 2000);
    },
    [later],
  );
  const onGone = useCallback(() => router.replace("/"), [router]);
  const link = useRegionLive({ enabled: !demo, onRegion, onReps, onGone });
  const offline = demoOffline || link.offline;

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


  const onEvent = useCallback(
    (e: StageEvent) => {
      if (process.env.NODE_ENV !== "production") eventsRef.current.push(e);
      // Demos play the region on the board's own clock; with the server the scoreboard follows the server only.
      if (demo && e.kind === "region") {
        setRegion((r) => ({ ...r, wave: e.wave, best: e.best }));
        setTick((n) => n + 1);
      }
    },
    [demo],
  );
  const onReady = useCallback((api: BoardApi | null) => {
    apiRef.current = api;
    const m = shownRef.current;
    if (api && m) {
      api.sim.setPerSec(m.perSec);
      api.sim.follow({ wave: m.wave, best: m.best, breach: !m.held, ended: null });
    }
  }, []);

  const onUnreachable = useCallback(() => apiRef.current?.tip(OFFLINE_TEXT, 2600), []);
  const server = useServerMath({ enabled: !demo, offline, onAnswered: onServerAnswer, onUnreachable, onGone });
  const view: PanelView = demo ? panel : server.view;

  // The guess-pause and skip-wait headers count down once a second.
  const countdownUntil = Math.max(view.pausedUntil, view.waitUntil ?? 0);
  useEffect(() => {
    if (countdownUntil <= clock) return;
    const tick = () => setClock(Date.now());
    const first = setTimeout(tick, 0);
    const id = setInterval(tick, 1000);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, [countdownUntil, clock]);

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
  const onPick = (i: number) => (demo ? answerWith(panel, i, Date.now()) : void server.pick(i));
  const onNext = () => {
    if (!demo) void server.next();
    else if (!offline) setPanel((p) => nextProblem(p, Date.now()));
  };
  // Server problems lock their choices while loading, marking, skipping or waiting.
  const locked = !demo && view.answered === null && view.id === undefined;

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
  const ticker = `${region.name} 생중계 · 지금 ${fmt(region.online)}명이 함께 지키는 중 · 최고 웨이브 ${fmt(region.best)}${region.rank > 0 ? ` (전국 ${region.rank}위)` : ""}${
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
        <HudSeg
          label="W"
          value={region.wave > 0 ? fmt(region.wave) : "–"}
          tick={tick}
          className="bg-yellow text-navy"
          aria="지역 웨이브"
          slot="hud-wave"
        />
        <HudSeg label="최고" value={fmt(region.best)} tick={tick} aria="최고 웨이브" />
        <HudSeg label="접속" value={fmt(region.online)} aria="지금 접속" className="hidden wide-or-landscape:flex" />
      </div>
      <div className="flex min-w-0 items-center gap-2.5 overflow-hidden text-xs leading-5 font-bold whitespace-nowrap text-mut [grid-area:strip] wide-or-landscape:text-[13px] wide-or-landscape:leading-[22px]">
        <span>
          화력 <b className="text-yellow">{formatBig(region.power)}</b>
        </span>
        <span>
          적 <b className="text-white">{formatBig(region.enemy)}</b>
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
          region={{ wave: Math.max(1, region.wave), best: region.best, perSec: region.perSec }}
          offline={offline}
          external={!demo}
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
        <MathPanel state={view} header={panelHeader(view, clock)} offline={offline || locked} onPick={onPick} onNext={onNext} />
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
      <div role="log" aria-live="polite" aria-label="웨이브 결과" data-slot="wave-log" className="sr-only">
        {waveLog.map((l) => (
          <p key={l.key} data-start={l.key}>
            {l.text}
          </p>
        ))}
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
  slot,
  className = "",
}: {
  label: string;
  value: string;
  aria: string;
  tick?: number;
  slot?: string;
  className?: string;
}) {
  return (
    <span data-slot={slot} data-value={value} aria-label={`${aria} ${value}`} className={`flex flex-none items-center gap-1 px-2 whitespace-nowrap ${className}`}>
      <small aria-hidden="true" className="font-sans text-[11px] font-black opacity-85">
        {label}
      </small>
      <b key={tick} aria-hidden="true" className={`font-normal ${tick ? "animate-bump" : ""}`}>
        {value}
      </b>
    </span>
  );
}
