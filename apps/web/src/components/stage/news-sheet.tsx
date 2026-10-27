"use client";

import { useEffect, useRef, useState } from "react";
import { broadcastButton } from "@/components/broadcast";
import { fmt } from "@/lib/stage/sim";

export type AwayNews = {
  hours: number;
  /** Waves held while I was away. */
  held: number;
  breaches: number;
  best: number;
  bestUp: number;
  rank: number;
  /** Places climbed (negative: dropped). */
  rankUp: number;
};

/** Counts up from 0 in 0.9 s; at once under prefers-reduced-motion. */
function useCountUp(to: number): number {
  const [n, setN] = useState(0);
  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const t0 = performance.now();
    let raf = 0;
    const step = (now: number) => {
      const k = reduced ? 1 : Math.min(1, (now - t0) / 900);
      setN(to * (1 - Math.pow(1 - k, 3)));
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [to]);
  return n;
}

/** "지난 소식": what happened while I was away (fake numbers until the server sends them, T13). */
export function NewsSheet({ news, step, onClose }: { news: AwayNews; step: number; onClose: () => void }) {
  const held = useCountUp(news.held);
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => closeRef.current?.focus(), []);
  const cell = "grid min-w-0 bg-navy2 px-2.5 py-1.5 text-xs font-bold text-mut";
  const big = "truncate font-heading text-2xl font-normal text-white";
  const em = "ml-1 text-base text-yellow not-italic";
  return (
    <div
      role="dialog"
      aria-labelledby="news-title"
      data-slot="news"
      className="absolute inset-x-2 bottom-1.5 z-9 grid max-h-[calc(100%-12px)] animate-sheet-up gap-2 overflow-y-auto border-t-6 border-yellow bg-navy pb-2.5 shadow-[0_-10px_40px_rgba(0,0,0,.6)] wide-or-landscape:right-3 wide-or-landscape:bottom-10 wide-or-landscape:left-auto wide-or-landscape:w-[min(520px,calc(100%-24px))]"
    >
      <div className="flex min-w-0 items-stretch">
        <span className="flex flex-none items-center bg-red px-2.5 font-heading text-sm text-white">지난 소식</span>
        <b id="news-title" className="flex min-w-0 flex-1 items-center truncate bg-white px-2.5 font-heading text-[17px] font-normal text-navy">
          자리 비운 {news.hours}시간 동안
        </b>
      </div>
      <div className="grid grid-cols-2 gap-1 px-2.5">
        <div className={cell}>
          막아 낸 웨이브<b className={big}>{fmt(held)}</b>
        </div>
        <div className={cell}>
          방어선 재정비
          <b className={big}>
            {news.breaches}
            <em className={em}>번</em>
          </b>
        </div>
        <div className={cell}>
          최고 웨이브
          <b className={big}>
            {fmt(news.best)}
            <em className={em}>+{news.bestUp}</em>
          </b>
        </div>
        <div className={cell}>
          우리 지역 순위
          <b className={big}>
            {news.rank}위
            <em className={em}>{news.rankUp >= 0 ? `▲${news.rankUp}` : `▼${-news.rankUp}`}</em>
          </b>
        </div>
      </div>
      <p className="mx-2.5 text-[13px] font-bold text-[#dfe7ff]">
        내 타워는 그대로 {step}단계예요. 자리 비운 동안에는 포인트가 쌓이지 않아요. 문제를 풀면 다시 자라요!
      </p>
      <button ref={closeRef} type="button" onClick={onClose} className={`${broadcastButton} mx-2.5 bg-yellow`}>
        중계 보기
      </button>
    </div>
  );
}
