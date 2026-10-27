// Pace bot (spec "진행 속도 목표", D49): a child with a fixed number of correct answers a day.
// A dev tool (tests and /dev/sim), not a game rule, so plain numbers count answers and days here.
import type { MathLevel } from "../math/levels.ts";
import { lookKey } from "../looks.ts";
import { NEW_GROWTH, addPoints, answerPoints, towerPower, type Growth } from "./progress.ts";
import { maxBlockableWave } from "./waves.ts";

export type PaceBot = {
  perDay: number;
  /** Problem level the bot settles at. It starts at level 1 and climbs after 5 correct answers in a row. */
  topLevel: MathLevel;
};

/** The spec's reference child: 50 correct a day, mostly level 2 (about 600 points a day). */
export const PACE_BOT_50: PaceBot = { perDay: 50, topLevel: 2 };
/** The upper check: 300 correct a day, all the way up at level 3 (the most points a day can give). */
export const PACE_BOT_300: PaceBot = { perDay: 300, topLevel: 3 };

export const PACE_DAYS = [1, 7, 30, 90, 180, 365] as const;
/** D49 for the 50-a-day bot. */
export const PACE_FIRST_ANSWERS = { answers: 30, upgrades: 3, levelUps: 2, newLooks: 1 } as const;
export const PACE_STAGE_TARGETS: Readonly<Record<number, readonly [number, number]>> = {
  1: [8, 12],
  7: [20, 30],
  30: [40, 60],
  365: [140, 200],
};
/** D49 for the 300-a-day bot: stage at day 365 at most this. */
export const PACE_300_MAX_STAGE_365 = 400;
/** A class of children with the same growth, for the region wave column. */
export const PACE_CLASS_SIZE = 30;

export type PaceRow = {
  /** Days played, or null for the "first N answers" row. */
  days: number | null;
  answers: number;
  growth: Growth;
  upgrades: number;
  levelUps: number;
  newLooks: number;
  /** Tower power p per second (balanced tendency; type and tendency do not change it). */
  power: bigint;
  /** Highest wave this child alone blocks. */
  soloTop: bigint;
  /** Highest wave a region of PACE_CLASS_SIZE such children blocks. */
  classTop: bigint;
};

/** Problem level of the nth correct answer ever: 1~5 at level 1, 6~10 at level 2, then the bot's level. */
function levelOfAnswer(n: number, top: MathLevel): MathLevel {
  if (n <= 5) return 1;
  if (n <= 10) return top < 2 ? top : 2;
  return top;
}

/** Rows after the first `firstAnswers` correct answers and at the end of each day in `days`. */
export function runPaceBot(bot: PaceBot, days: readonly number[] = PACE_DAYS, firstAnswers = PACE_FIRST_ANSWERS.answers): PaceRow[] {
  const lastDay = Math.max(...days);
  const rows: PaceRow[] = [];
  let growth = NEW_GROWTH;
  let answers = 0;
  let upgrades = 0;
  let levelUps = 0;
  let newLooks = 0;

  const row = (dayCount: number | null): PaceRow => {
    const power = towerPower({ stage: growth.stage, level: growth.level, tendency: "balanced", towerType: "rapid" });
    return {
      days: dayCount,
      answers,
      growth,
      upgrades,
      levelUps,
      newLooks,
      power,
      soloTop: maxBlockableWave(power),
      classTop: maxBlockableWave(power * BigInt(PACE_CLASS_SIZE)),
    };
  };

  for (let day = 1; day <= lastDay; day++) {
    for (let nth = 1; nth <= bot.perDay; nth++) {
      answers++;
      const before = growth;
      growth = addPoints(growth, answerPoints(levelOfAnswer(answers, bot.topLevel), BigInt(nth)));
      upgrades += Number(growth.stage - before.stage);
      levelUps += Number(growth.level - before.level);
      if (lookKey("rapid", Number(growth.stage)) !== lookKey("rapid", Number(before.stage))) newLooks++;
      if (answers === firstAnswers) rows.push(row(null));
    }
    if (days.includes(day)) rows.push(row(day));
  }
  return rows;
}

export type PaceVerdict = { target: string; ok: boolean };

/** The D49 target a row is checked against, or null when the spec sets none for it. */
export function paceTarget(bot: PaceBot, row: PaceRow): PaceVerdict | null {
  if (bot === PACE_BOT_50 && row.days === null) {
    const { upgrades, levelUps, newLooks } = PACE_FIRST_ANSWERS;
    return {
      target: `업그레이드 ${upgrades}·레벨업 ${levelUps}·새 겉모습 ${newLooks}번 이상`,
      ok: row.upgrades >= upgrades && row.levelUps >= levelUps && row.newLooks >= newLooks,
    };
  }
  const stage = Number(row.growth.stage);
  const range = row.days === null ? undefined : PACE_STAGE_TARGETS[row.days];
  if (bot === PACE_BOT_50 && range) return { target: `${range[0]}~${range[1]}단계`, ok: stage >= range[0] && stage <= range[1] };
  if (bot === PACE_BOT_300 && row.days === 365) return { target: `${PACE_300_MAX_STAGE_365}단계 이하`, ok: stage <= PACE_300_MAX_STAGE_365 };
  return null;
}
