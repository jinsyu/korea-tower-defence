"use client";

import { boardTowers, type Guardian, type StageFile } from "@ktd/core";
import { useEffect, useRef } from "react";
import type { GradeBandId } from "@/lib/grade-bands";
import { FAKE_ME, FAKE_REGION, type RegionHud } from "@/lib/stage/fake-region";
import { newPanel, nextProblem, type PanelState } from "@/lib/stage/math-panel";
import { meStore, needXP, upCost } from "@/lib/stage/me-store";
import type { StageEvent } from "@/lib/stage/sim";
import type { AwayNews } from "./news-sheet";
import type { BoardApi } from "./stage-board";

export const DEMO_NAMES = [
  "boss",
  "breach",
  "record",
  "barrage",
  "crowd",
  "rep",
  "right",
  "wrong",
  "streak5",
  "down3",
  "fast",
  "guess",
  "daily",
  "upgrade",
  "newlook",
  "material",
  "evolve",
  "levelup",
  "offline",
  "away",
  "band34",
  "band56",
] as const;
type DemoName = (typeof DEMO_NAMES)[number];

/** Mockup B "지난 소식" numbers. */
const FAKE_NEWS: AwayNews = { hours: 14, held: 812, breaches: 6, best: FAKE_REGION.best, bestUp: 28, rank: FAKE_REGION.rank, rankUp: 4 };

/** What the demos may do on the screen. Read through a ref so they always see the latest state. */
export type ScreenActions = {
  panel: PanelState;
  /** Answer `pick` on panel state `s` at time `now` (Date.now()). */
  answerWith: (s: PanelState, pick: number, now: number) => void;
  setPanel: (s: PanelState) => void;
  setClock: (now: number) => void;
  setRegion: React.Dispatch<React.SetStateAction<RegionHud>>;
  setOffline: (offline: boolean) => void;
  setNews: (news: AwayNews | null) => void;
};

/**
 * Development only: `?demo=<name>` / `window.__demo(name)` play mockup B demos,
 * `window.__qa()` returns layout, panel and effect measurements. Stripped from production builds.
 */
export function useDevHooks(
  apiRef: React.RefObject<BoardApi | null>,
  eventsRef: React.RefObject<StageEvent[]>,
  actionsRef: React.RefObject<ScreenActions>,
  stage: StageFile | null,
  guardians: Guardian[],
) {
  const queryDemoDone = useRef(false);
  useEffect(() => {
    if (process.env.NODE_ENV === "production" || !stage) return;
    const w = window as unknown as Record<string, unknown>;
    const n = stage.repSpots.length;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const later = (fn: () => void, ms: number) => {
      const id = setTimeout(() => {
        timers.delete(id);
        fn();
      }, ms);
      timers.add(id);
    };

    /** Press a choice for the child: a fresh problem if this one is done; 4 s of thinking unless `fast`. */
    const clickOpt = (which: "right" | "wrong", s0?: PanelState, fast = false) => {
      const a = actionsRef.current;
      let s = s0 ?? a.panel;
      if (s.answered) s = nextProblem(s, Date.now());
      const pick = which === "right" ? s.problem.answer : (s.problem.answer + 1) % 4;
      a.answerWith(s, pick, s.shownAt + (fast ? 200 : 4000));
    };
    const fresh = (): PanelState => ({ ...actionsRef.current.panel, pausedUntil: 0, daily: false });
    const growTo = (step: number) => {
      meStore.set({ ...meStore.get(), step, wallet: upCost(step) - 5 });
      clickOpt("right", fresh());
    };
    const setBand = (band: GradeBandId) => {
      meStore.set({ ...meStore.get(), band });
      actionsRef.current.setPanel(newPanel(band, Date.now()));
    };

    const demo = (name: DemoName) => {
      const api = apiRef.current;
      if (!api) return false;
      const { sim } = api;
      const a = actionsRef.current;
      const me = meStore.get();
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
          a.setRegion((r) => ({ ...r, perSec: 320 }));
          api.banner("응원 포격 집중! 1초에 정답 320개", "yellow", 1500);
          later(() => {
            sim.setPerSec(FAKE_REGION.perSec);
            actionsRef.current.setRegion((r) => ({ ...r, perSec: FAKE_REGION.perSec }));
          }, 5000);
          break;
        case "crowd":
          a.setRegion((r) => ({ ...r, online: 3412, perSec: 140 }));
          sim.setPerSec(140);
          api.tip("지금 3,412명이 함께 지키는 중!", 2400);
          later(() => {
            sim.setPerSec(FAKE_REGION.perSec);
            actionsRef.current.setRegion((r) => ({ ...r, online: FAKE_REGION.online, perSec: FAKE_REGION.perSec }));
          }, 8000);
          break;
        case "rep": {
          const others = guardians.filter((g) => g.id !== me.id);
          const isRep = boardTowers(guardians, me, n).some((t) => t.me && t.spot === "rep");
          if (isRep) {
            api.tip("대표 자리는 10분마다 다시 뽑아요 · 내 타워는 내 자리에", 2400);
            meStore.set({ ...me, pts24: FAKE_ME.pts24 });
          } else {
            // Just enough points for the last representative spot.
            const last = boardTowers(others, { ...me, pts24: 0 }, n)[n - 1]?.guardian.pts24 ?? 0;
            api.banner(`속보: ${me.nick} #${me.tag} 대표 지킴이 선발!`, "red", 2000);
            meStore.set({ ...me, pts24: last + 1 });
          }
          break;
        }
        case "right":
          clickOpt("right");
          break;
        case "wrong":
          clickOpt("wrong");
          break;
        case "streak5": {
          const s = nextProblem({ ...a.panel, level: a.panel.level >= 3 ? 2 : a.panel.level, streak: 4 }, Date.now());
          clickOpt("right", s);
          break;
        }
        case "down3": {
          const s = nextProblem({ ...a.panel, level: a.panel.level <= 1 ? 2 : a.panel.level, wrongStreak: 2 }, Date.now());
          clickOpt("wrong", s);
          break;
        }
        case "fast":
          clickOpt("right", nextProblem(a.panel, Date.now()), true);
          break;
        case "guess": {
          const now = Date.now();
          a.setPanel(nextProblem({ ...a.panel, pausedUntil: now + 300_000 }, now));
          a.setClock(now);
          break;
        }
        case "daily":
          a.setPanel(nextProblem({ ...a.panel, daily: true, pausedUntil: 0 }, Date.now()));
          api.banner("오늘 정말 많이 풀었어요! 쉬어 가도 괜찮아요", "white", 2200);
          break;
        case "upgrade":
          growTo(me.step % 5 === 4 ? me.step + 1 : me.step);
          break;
        case "newlook":
          growTo(me.step + (4 - (me.step % 5)));
          break;
        case "material":
          growTo(49);
          break;
        case "evolve":
          growTo(99);
          break;
        case "levelup":
          meStore.set({ ...me, xp: needXP(me.level + 1) - 5 });
          clickOpt("right", fresh());
          break;
        case "offline":
          a.setOffline(true);
          later(() => {
            actionsRef.current.setOffline(false);
            apiRef.current?.tip("다시 이어졌어요 · 같은 문제부터 해요", 2000);
          }, 4500);
          break;
        case "away":
          a.setNews(FAKE_NEWS);
          break;
        case "band34":
          setBand("34");
          break;
        case "band56":
          setBand("56");
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
      const $ = (sel: string) => document.querySelector<HTMLElement>(sel);
      const shown = (el: Element) => {
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
      };
      const px = (el: Element | null) => (el ? Math.round(parseFloat(getComputedStyle(el).fontSize) * 10) / 10 : null);
      const side = $("[data-slot=side]")?.getBoundingClientRect();
      const small = [...document.querySelectorAll<HTMLElement>("button,a[href],[role=button]")]
        .map((el) => ({ el, r: el.getBoundingClientRect() }))
        .filter(({ r }) => r.width > 0 && r.height > 0 && (r.width < 43.5 || r.height < 43.5))
        .map(({ el, r }) => `${(el.getAttribute("aria-label") ?? el.textContent ?? "").trim().slice(0, 16)} ${Math.round(r.width)}x${Math.round(r.height)}`);
      const verticalScroll = de.scrollHeight > de.clientHeight;
      const math = $("[data-slot=math]");
      const mathRect = math?.getBoundingClientRect();
      const header = $("[data-slot=math-header]");
      const expr = $("[data-slot=math-expr]");
      const choices = math ? [...math.querySelectorAll<HTMLButtonElement>("[data-choice]")] : [];
      const visibleChoices = choices.filter(shown);
      const fractions = math ? [...math.querySelectorAll(".mq-expr .fr, .mq-opt .fr")] : [];
      const solutionFractions = math ? [...math.querySelectorAll(".mq-sol .fr")] : [];
      const meBar = $("[data-slot=me-bar]");
      const barStep = $("[data-slot=me-step]")?.firstChild?.textContent;
      return {
        innerWidth: window.innerWidth,
        innerHeight: window.innerHeight,
        scrollWidth: de.scrollWidth,
        clientWidth: de.clientWidth,
        horizontalOverflow: de.scrollWidth > de.clientWidth,
        verticalScroll,
        sideRect: side ? [side.left, side.top, side.width, side.height].map(Math.round) : null,
        smallTargets: small,
        eventCounts: counts,
        shakeMaxAmpPx,
        shakeMaxMs,
        shakeCauses: [...shakeCauses],
        mathPanelHeightPx: mathRect ? Math.round(mathRect.height * 10) / 10 : null,
        mathTitle: header?.textContent ?? null,
        mathTitleClipped: header ? header.scrollWidth > header.clientWidth + 1 : null,
        mathExprFontPx: px(expr),
        mathExprRowPx: expr ? Math.round(expr.getBoundingClientRect().height * 10) / 10 : null,
        mathChoiceCount: choices.length,
        mathChoiceVisible: visibleChoices.length,
        mathChoiceMinPx: visibleChoices.length ? Math.round(Math.min(...visibleChoices.map((b) => b.getBoundingClientRect().height)) * 10) / 10 : null,
        mathChoicesDisabled: choices.length > 0 && choices.every((b) => b.disabled),
        mathFractionFontPx: fractions.length ? Math.min(...fractions.map((f) => px(f)!)) : null,
        mathSolutionShown: !!$("[data-slot=math-solution]"),
        mathSolutionFractionFontPx: solutionFractions.length ? Math.min(...solutionFractions.map((f) => px(f)!)) : null,
        mathFitsNoScroll: !verticalScroll && !!mathRect && mathRect.bottom <= window.innerHeight + 0.5,
        meBarVisible: !!meBar && shown(meBar) && meBar.getBoundingClientRect().bottom <= window.innerHeight + 0.5,
        meBarHeightPx: meBar ? Math.round(meBar.getBoundingClientRect().height) : null,
        // One store: the board's my tower, the "나" row and the level bar must agree (plan memo, evolve demo).
        meStepShown: {
          store: meStore.get().step,
          board: apiRef.current?.sim.myTower()?.step ?? null,
          repRow: Number($("li[data-me]")?.dataset.step ?? NaN),
          bar: Number(barStep ?? NaN),
        },
        newsVisible: !!$("[data-slot=news]"),
        offline: !!$("[data-slot=map-offline]"),
        ...apiRef.current?.qa?.(),
      };
    };
    w.__qa = qa;
    w.__demo = demo;
    w.__demos = DEMO_NAMES;
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
      timers.forEach(clearTimeout);
      delete w.__qa;
      delete w.__demo;
      delete w.__demos;
      delete w.__qaEvents;
      delete w.__qaResetEvents;
    };
  }, [apiRef, eventsRef, actionsRef, stage, guardians]);
}
