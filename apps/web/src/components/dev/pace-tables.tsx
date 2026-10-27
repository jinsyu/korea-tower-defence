"use client";

import { PACE_BOT_300, PACE_BOT_50, PACE_CLASS_SIZE, formatBig, paceTarget, runPaceBot, type PaceBot } from "@ktd/core";
import { useState } from "react";

const cell = "border-b border-white/10 px-2 py-1 text-right font-mono whitespace-nowrap";
const head = "border-b-2 border-yellow px-2 py-1 text-right font-black whitespace-nowrap";

const BOTS: { bot: PaceBot; title: string }[] = [
  { bot: PACE_BOT_50, title: "하루 정답 50개 (2단계 위주, 기준 아이)" },
  { bot: PACE_BOT_300, title: "하루 정답 300개 (3단계, 가장 빠른 경우)" },
];

const COLUMNS = [
  "시점",
  "정답",
  "누적 포인트",
  "레벨",
  "타워 단계",
  "목표",
  "판정",
  "업그레이드",
  "레벨업",
  "새 겉모습",
  "타워 힘(초당)",
  "혼자 막는 웨이브",
  `${PACE_CLASS_SIZE}명 지역 웨이브`,
];

const big = (n: bigint): string => formatBig(Number(n));

function PaceTable({ bot, title }: { bot: PaceBot; title: string }) {
  // The bot plays a whole year (about 0.1 s), so run it once.
  const [rows] = useState(() => runPaceBot(bot));
  return (
    <section className="grid min-w-0 gap-1" aria-label={title}>
      <h3 className="m-0 text-sm font-black">{title}</h3>
      <div className="min-w-0 overflow-auto bg-navy2" tabIndex={0} aria-label={`${title} 표`}>
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr>
              {COLUMNS.map((c) => (
                <th key={c} scope="col" className={head}>
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const verdict = paceTarget(bot, r);
              return (
                <tr key={r.days ?? "first"}>
                  <th scope="row" className={`${cell} font-sans font-black`}>
                    {r.days === null ? `첫 정답 ${r.answers}개` : `${r.days}일`}
                  </th>
                  <td className={cell}>{r.answers.toLocaleString("ko-KR")}</td>
                  <td className={cell}>{big(r.growth.total)}</td>
                  <td className={cell}>{String(r.growth.level)}</td>
                  <td className={`${cell} font-black text-yellow`}>{String(r.growth.stage)}</td>
                  <td className={`${cell} font-sans`}>{verdict?.target ?? "-"}</td>
                  <td className={`${cell} font-sans font-black ${verdict ? (verdict.ok ? "text-cyan" : "text-red") : ""}`}>
                    {verdict ? (verdict.ok ? "맞음" : "벗어남") : "-"}
                  </td>
                  <td className={cell}>{r.upgrades}</td>
                  <td className={cell}>{r.levelUps}</td>
                  <td className={cell}>{r.newLooks}</td>
                  <td className={cell} title={String(r.power)}>
                    {big(r.power)}
                  </td>
                  <td className={cell}>{String(r.soloTop)}</td>
                  <td className={cell}>{String(r.classTop)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/** Pace bot results (spec "진행 속도 목표", D49). */
export function PaceTables() {
  return (
    <div className="grid min-w-0 gap-3">
      <h2 className="m-0 font-heading text-base font-normal text-yellow">진행 속도 봇</h2>
      <p className="m-0 text-xs text-mut">
        처음 정답 5개는 1단계, 다음 5개는 2단계, 그 뒤는 봇의 단계로 푼다. 하루 줄이기(150개까지 100%, 300개까지 50%, 그 뒤 10%)를 쓴다. 타워
        힘은 계열·성향과 상관없다.
      </p>
      {BOTS.map((b) => (
        <PaceTable key={b.bot.perDay} {...b} />
      ))}
    </div>
  );
}
