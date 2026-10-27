"use client";

import Link from "next/link";
import type { MeBarView } from "@/lib/stage/me-store";

function Gauge({ label, pct, color }: { label: string; pct: number; color: string }) {
  return (
    <span className="grid min-w-0 grid-cols-[7.8em_minmax(0,1fr)] items-center gap-1.5 text-[10px] font-black whitespace-nowrap text-mut">
      <span>
        {label} {pct}%
      </span>
      <span className="relative block h-1.5 overflow-hidden bg-white/15">
        <i className={`absolute inset-y-0 left-0 transition-[width] duration-400 ${color}`} style={{ width: `${pct}%` }} />
      </span>
    </span>
  );
}

/** My level and upgrade gauges under the problem panel, plus the way to the national board. */
export function MeBar({ view, bump }: { view: MeBarView; bump: number }) {
  return (
    <div className="flex h-11 min-w-0 gap-1">
      {/* /me and /board are the my-guardian screen and the national board (T8). */}
      <Link
        href="/me"
        prefetch={false}
        data-slot="me-bar"
        aria-label={`내 지킴이 보기 · 레벨 ${view.level} · 타워 ${view.step}단계`}
        className="grid h-11 min-w-0 flex-auto grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 bg-navy2 px-2 focus-visible:outline-3 focus-visible:-outline-offset-3 focus-visible:outline-yellow"
      >
        <span key={bump} className={`bg-yellow px-1.5 font-heading text-base leading-[26px] whitespace-nowrap text-navy ${bump ? "animate-bump" : ""}`}>
          Lv {view.level}
        </span>
        <span className="grid min-w-0 gap-1">
          <Gauge label="레벨" pct={view.levelPct} color="bg-cyan" />
          <Gauge label="업그레이드" pct={view.upgradePct} color="bg-yellow" />
        </span>
        <span data-slot="me-step" className="font-heading text-lg whitespace-nowrap">
          {view.step}
          <small className="ml-0.5 font-sans text-[11px] font-black text-mut">단계</small>
        </span>
      </Link>
      <Link
        href="/board"
        prefetch={false}
        aria-label="전국 상황판"
        className="flex h-11 w-14 flex-none items-center justify-center bg-white font-heading text-[15px] text-navy focus-visible:outline-3 focus-visible:-outline-offset-4 focus-visible:outline-navy"
      >
        전국
      </Link>
    </div>
  );
}
