"use client";

import { useEffect, useRef } from "react";

/** Page-wide numbers every `__qa()` reports: width overflow and touch targets under 44px. */
export function pageQa() {
  const de = document.documentElement;
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
    smallTargets: small,
  };
}

/**
 * Development only: `?demo=<name>` / `window.__demo(name)` play mockup B demos and `window.__qa()` returns
 * measurements. A demo returns false while the screen is not ready yet.
 */
function useDemoHooksInDev(demos: Record<string, () => boolean | void>, qa: () => object) {
  const latest = useRef({ demos, qa });
  useEffect(() => {
    latest.current = { demos, qa };
  });
  const queryDemoDone = useRef(false);
  useEffect(() => {
    const w = window as unknown as Record<string, unknown>;
    const demo = (name: string) => {
      const run = latest.current.demos[name];
      return run ? run() !== false : false;
    };
    w.__demo = demo;
    w.__demos = Object.keys(latest.current.demos);
    w.__qa = () => latest.current.qa();
    const first = new URLSearchParams(window.location.search).get("demo");
    let id: ReturnType<typeof setTimeout> | undefined;
    if (first && !queryDemoDone.current) {
      let tries = 0;
      const run = () => {
        if (demo(first)) queryDemoDone.current = true;
        else if (++tries < 50) id = setTimeout(run, 100);
      };
      id = setTimeout(run, 300);
    }
    return () => {
      clearTimeout(id);
      delete w.__demo;
      delete w.__demos;
      delete w.__qa;
    };
  }, []);
}

const noDemoHooks: typeof useDemoHooksInDev = () => {};

/** A no-op in production builds, so no refs, effects or window hooks exist there. */
export const useDemoHooks = process.env.NODE_ENV === "production" ? noDemoHooks : useDemoHooksInDev;
