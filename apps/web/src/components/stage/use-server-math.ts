"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { callAsGuardian } from "@/lib/game-server";
import type { GradeBandId } from "@/lib/grade-bands";
import { NEXT_AFTER_LEVEL_UP_MS, NEXT_AFTER_MS, REDUCED_NEXT_AFTER_MS, type PanelView } from "@/lib/stage/math-panel";
import { canAnswer, loadingView, markedView, problemView, type AnswerReply, type ProblemReply } from "@/lib/stage/server-math";

/** After a failed request the problem is asked for again this often. */
const RETRY_MS = 3000;

type Options = {
  /** Off on the dev-only `?demo=` screens, which deal their own problems. */
  enabled: boolean;
  band: GradeBandId;
  offline: boolean;
  /** A marked answer: effects, banners and my new state. */
  onAnswered: (reply: AnswerReply) => void;
  /** The game server cannot be reached for an answer. */
  onUnreachable: () => void;
  /** The server no longer knows this device's key (deleted, cleaned up): the key is already dropped. */
  onGone: () => void;
};

/**
 * The problem panel fed by the game server (D32~D34). Only the newest request may change the panel: every request
 * takes a number, and a reply whose number is no longer the newest (or that lands after the screen went away) is
 * dropped, so a late answer never overwrites a newer problem.
 */
export function useServerMath({ enabled, band, offline, onAnswered, onUnreachable, onGone }: Options) {
  const [view, setView] = useState<PanelView>(() => loadingView(band));
  const seq = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  /** The next problem was due while offline; it comes when the connection is back (D58). */
  const heldNext = useRef(false);
  const live = useRef({ offline, onAnswered, onUnreachable, onGone });
  useEffect(() => {
    live.current = { offline, onAnswered, onUnreachable, onGone };
  }, [offline, onAnswered, onUnreachable, onGone]);

  const later = useCallback((fn: () => void, ms: number) => {
    clearTimeout(timer.current);
    timer.current = setTimeout(fn, ms);
  }, []);

  // Retries and skip waits call the newest `load` through this ref.
  const loadRef = useRef<() => Promise<void>>(async () => undefined);
  const load = useCallback(async () => {
    clearTimeout(timer.current);
    const mine = ++seq.current;
    const res = await callAsGuardian<ProblemReply>("/math/problem");
    if (mine !== seq.current) return;
    if (res.status === 401) return live.current.onGone();
    if (!res.ok) return later(() => void loadRef.current(), RETRY_MS);
    setView((v) => problemView(v, res.data, Date.now()));
    if (!res.data.problem) later(() => void loadRef.current(), res.data.waitMs);
  }, [later]);
  useEffect(() => {
    loadRef.current = load;
  }, [load]);

  /** The next problem, or held until the connection is back. */
  const advance = useCallback(() => {
    if (live.current.offline) heldNext.current = true;
    else void load();
  }, [load]);

  // The first problem, and the held one once back online, are asked for from a timer: the panel changes only when
  // the reply arrives.
  useEffect(() => {
    if (!enabled) return;
    later(() => void load(), 0);
    return () => {
      // Replies that land after the screen went away change nothing.
      seq.current += 1;
      clearTimeout(timer.current);
    };
  }, [enabled, load, later]);

  useEffect(() => {
    if (!offline && heldNext.current) {
      heldNext.current = false;
      later(() => void load(), 0);
    }
  }, [offline, load, later]);

  const pick = useCallback(
    async (choice: number) => {
      const id = view.id;
      if (!enabled || offline || id === undefined || !canAnswer(view, Date.now())) return;
      const mine = ++seq.current;
      // Locked while the server marks it: a second press sends nothing.
      setView((v) => ({ ...v, id: undefined }));
      const res = await callAsGuardian<AnswerReply>("/math/answer", { method: "POST", body: { id, pick: choice } });
      if (mine !== seq.current) return;
      if (res.status === 401) return live.current.onGone();
      // Answered already (another tab): take whatever problem is open now.
      if (res.status === 409) return void load();
      if (!res.ok) {
        setView((v) => ({ ...v, id }));
        return live.current.onUnreachable();
      }
      const reply = res.data;
      setView((v) => ({ ...markedView(v, reply, choice, Date.now()), id }));
      live.current.onAnswered(reply);
      if (reply.correct) {
        const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        later(advance, reduced ? REDUCED_NEXT_AFTER_MS : reply.step === "up" ? NEXT_AFTER_LEVEL_UP_MS : NEXT_AFTER_MS);
      }
    },
    [enabled, offline, view, load, later, advance],
  );

  /** "다음 문제" after a wrong answer, or skip an open problem (the server may make the next one wait, D40). */
  const next = useCallback(async () => {
    if (!enabled || offline) return;
    if (view.answered) {
      if (!view.answered.correct) void load();
      return;
    }
    const id = view.id;
    if (id === undefined) return;
    const mine = ++seq.current;
    setView((v) => ({ ...v, id: undefined }));
    const res = await callAsGuardian<{ waitMs: number }>("/math/skip", { method: "POST", body: { id } });
    if (mine !== seq.current) return;
    if (res.status === 401) return live.current.onGone();
    if (res.status === 0) {
      setView((v) => ({ ...v, id }));
      return live.current.onUnreachable();
    }
    void load();
  }, [enabled, offline, view, load]);

  return { view, pick, next };
}
