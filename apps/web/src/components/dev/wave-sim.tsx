"use client";

import { formatBig } from "@ktd/core";
import { useState } from "react";
import {
  DAY_CHOICES,
  FIRST_WAVES,
  START_WAVE_CHOICES,
  capacity,
  powerOf,
  simulate,
  type SimPoint,
  type SimResult,
} from "@/lib/dev/wave-sim";
import { PaceTables } from "./pace-tables";

type Choice = { mantissa: number; exponent: number; days: number; startWave: number };

const DEFAULT_CHOICE: Choice = { mantissa: 1, exponent: 6, days: 1, startWave: 1 };
const MANTISSAS = Array.from({ length: 10 }, (_, i) => i);
const EXPONENTS = Array.from({ length: 61 }, (_, i) => i);

// Rendered in the browser only (wave-sim-client.tsx), so the measured time never has to match a server render.
type Run = { result: SimResult; elapsedMs: number; days: number };

function run(c: Choice): Run {
  const t0 = performance.now();
  const result = simulate(powerOf(c.mantissa, c.exponent), c.days, BigInt(c.startWave));
  return { result, elapsedMs: performance.now() - t0, days: c.days };
}

const big = (n: bigint): string => formatBig(Number(n));

function clock(minute: number): string {
  const d = Math.floor(minute / 1440);
  const h = Math.floor((minute % 1440) / 60);
  const m = minute % 60;
  return `${d}일 ${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

const field = "grid min-w-0 gap-1 text-sm font-bold";
const select =
  "min-h-11 w-full min-w-0 border-2 border-white/30 bg-navy2 px-2 font-mono text-base text-white focus-visible:border-yellow focus-visible:outline-none";
const cell = "border-b border-white/10 px-2 py-1 text-right font-mono whitespace-nowrap";
const head = "border-b-2 border-yellow px-2 py-1 text-right font-black whitespace-nowrap";

function Graph({ points }: { points: SimPoint[] }) {
  const W = 1000;
  const H = 300;
  const lastMinute = points.at(-1)!.minute || 1;
  const maxWave = points.reduce((m, p) => (p.best > m ? p.best : p.wave > m ? p.wave : m), BigInt(1));
  const x = (minute: number) => (minute / lastMinute) * W;
  const y = (wave: bigint) => H - (Number(wave) / Number(maxWave)) * (H - 10);
  const line = (pick: (p: SimPoint) => bigint) => points.map((p) => `${x(p.minute).toFixed(1)},${y(pick(p)).toFixed(1)}`).join(" ");
  return (
    <figure className="m-0 grid min-w-0 gap-1">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        role="img"
        aria-label={`웨이브 흐름 그래프, 최고 웨이브 ${maxWave}`}
        className="block h-56 w-full bg-navy2 md:h-72"
      >
        <polyline points={line((p) => p.best)} fill="none" stroke="var(--yellow)" strokeWidth={2} vectorEffect="non-scaling-stroke" />
        <polyline points={line((p) => p.wave)} fill="none" stroke="var(--cyan)" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
      </svg>
      <figcaption className="flex flex-wrap justify-between gap-x-4 text-xs text-mut">
        <span>
          <span className="text-cyan">━ 현재 웨이브</span> · <span className="text-yellow">━ 최고 웨이브</span> (세로 최대 {String(maxWave)})
        </span>
        <span>
          0 → {clock(points.at(-1)!.minute)}, {points.length}개 지점
        </span>
      </figcaption>
    </figure>
  );
}

function Summary({ result, elapsedMs, days }: Run) {
  const { power, top, topHealth, end } = result;
  const items: [string, string][] = [
    ["화력 P", big(power)],
    ["P × 60", big(capacity(power))],
    ["막을 수 있는 최고 W", String(top)],
    ["H(W)", topHealth === null ? "없음" : big(topHealth)],
    [`${days}일 뒤 웨이브`, String(end.wave)],
    ["최고 웨이브", String(end.best)],
    ["뚫린 횟수", String(end.breaches)],
    ["계산 시간", `${elapsedMs.toFixed(2)}ms`],
  ];
  return (
    <dl className="grid min-w-0 grid-cols-2 gap-1.5 sm:grid-cols-4">
      {items.map(([k, v]) => (
        <div key={k} className="min-w-0 bg-navy2 px-2.5 py-1.5">
          <dt className="truncate text-xs text-mut">{k}</dt>
          <dd className="m-0 truncate font-mono text-lg font-black">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

function FirstWaves({ result }: { result: SimResult }) {
  return (
    <div className="max-h-[28rem] min-w-0 overflow-auto bg-navy2" tabIndex={0} aria-label={`처음 ${FIRST_WAVES}웨이브 표`}>
      <table className="w-full border-collapse text-sm">
        <thead className="sticky top-0 bg-navy2">
          <tr>
            <th scope="col" className={head}>시각</th>
            <th scope="col" className={head}>웨이브</th>
            <th scope="col" className={head}>H(w)</th>
            <th scope="col" className={head}>P × 60</th>
            <th scope="col" className={head}>결과</th>
          </tr>
        </thead>
        <tbody>
          {result.firstWaves.map((s) => (
            <tr key={String(s.startMs)}>
              <td className={cell}>{clock(Number(s.startMs / BigInt(60_000)))}</td>
              <td className={cell}>{String(s.wave)}</td>
              <td className={cell} title={String(s.health)}>{big(s.health)}</td>
              <td className={cell}>{big(capacity(s.power))}</td>
              <td className={`${cell} font-sans font-black ${s.blocked ? "text-cyan" : "text-red"}`}>{s.blocked ? "막음" : "뚫림"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function WaveSim() {
  const [choice, setChoice] = useState<Choice>(DEFAULT_CHOICE);
  const [outcome, setOutcome] = useState(() => run(DEFAULT_CHOICE));

  const bind = (key: keyof Choice) => ({
    value: choice[key],
    onChange: (e: { target: { value: string } }) => {
      const next = { ...choice, [key]: Number(e.target.value) };
      setChoice(next);
      setOutcome(run(next));
    },
  });

  return (
    <main className="flex-1 overflow-x-hidden">
      <div className="mx-auto grid w-[min(1440px,100%)] min-w-0 gap-3 px-2.5 pt-2 pb-6">
        <div className="flex h-11 min-w-0 items-stretch bg-navy2">
          <span className="inline-flex items-center bg-red px-2.5 font-heading tracking-[0.5px] whitespace-nowrap text-white">
            개발용
          </span>
          <h1 className="flex min-w-0 flex-1 items-center truncate px-2.5 font-heading text-lg font-normal">웨이브 시뮬레이터</h1>
        </div>

        <div role="group" aria-label="시뮬레이션 조건" className="grid min-w-0 grid-cols-2 items-end gap-2 sm:grid-cols-4">
          <label className={field}>
            화력 P (초당) 앞자리
            <select className={select} {...bind("mantissa")}>
              {MANTISSAS.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </label>
          <label className={field}>
            × 10의 거듭제곱
            <select className={select} {...bind("exponent")}>
              {EXPONENTS.map((e) => (
                <option key={e} value={e}>
                  10^{e}
                </option>
              ))}
            </select>
          </label>
          <label className={field}>
            기간
            <select className={select} {...bind("days")}>
              {DAY_CHOICES.map((d) => (
                <option key={d} value={d}>
                  {d}일
                </option>
              ))}
            </select>
          </label>
          <label className={field}>
            시작 웨이브
            <select className={select} {...bind("startWave")}>
              {START_WAVE_CHOICES.map((w) => (
                <option key={w} value={w}>
                  {w}
                </option>
              ))}
            </select>
          </label>
        </div>

        <Summary {...outcome} />
        <Graph points={outcome.result.points} />
        <h2 className="m-0 font-heading text-base font-normal text-yellow">처음 {FIRST_WAVES}웨이브 (한 웨이브씩 계산)</h2>
        <FirstWaves result={outcome.result} />
        <PaceTables />
      </div>
    </main>
  );
}
