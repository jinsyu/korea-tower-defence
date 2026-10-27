"use client";

import { TowerCanvas } from "@/components/art/painted-canvas";
import type { RepRow } from "@/lib/stage/me-store";
import { fmt } from "@/lib/stage/sim";

/** "오늘의 대표 지킴이" (wide screens): the towers on the board, with my row marked. */
export function RepList({ rows }: { rows: RepRow[] }) {
  return (
    <section aria-labelledby="reps-title" className="hidden min-h-0 content-start gap-[3px] wide-or-landscape:grid">
      <h2 id="reps-title" className="mt-1 mb-0.5 font-heading text-[17px] font-normal text-yellow">
        오늘의 대표 지킴이
      </h2>
      <ol className="grid gap-[3px]">
        {rows.map((r) => (
          <li
            key={r.id}
            data-me={r.me || undefined}
            data-step={r.step}
            className={`grid min-h-10 min-w-0 grid-cols-[1.8em_40px_minmax(0,1fr)_auto] items-center gap-2 px-2 py-0.5 text-[13px] font-black ${
              r.me ? "bg-navy3 outline-2 -outline-offset-2 outline-yellow" : "bg-navy2"
            }`}
          >
            <span className="font-heading text-[15px] font-normal text-mut">{r.rank ?? "나"}</span>
            <TowerCanvas type={r.type} step={r.step} pal={r.pal} badge={false} className="block size-10" />
            <span className="min-w-0 truncate">
              {r.nick} #{r.tag}
              {r.me && r.rank !== null ? " · 나" : ""}
              <small className="block text-[11px] text-mut">
                {r.me && r.rank === null ? "내 자리 · " : ""}타워 {r.step}단계
              </small>
            </span>
            <span className="font-heading text-[15px] font-normal whitespace-nowrap text-yellow">{fmt(r.pts24)}P</span>
          </li>
        ))}
      </ol>
    </section>
  );
}
