// Data for the /dev/sim page: one firepower held for a number of days, from wave 1 (or a given wave).
import {
  WAVE_MS,
  WAVE_SECONDS,
  maxBlockableWave,
  newRegionWaves,
  replayStepwise,
  settle,
  waveHealth,
  type RegionWaves,
  type WaveStep,
} from "@ktd/core";

export const FIRST_WAVES = 60;
export const MAX_POINTS = 360;

const WAVES_PER_DAY = 24 * 60;

export const DAY_CHOICES = [1, 2, 3, 7, 14, 30, 60, 90, 180, 365] as const;
export const START_WAVE_CHOICES = [1, 50, 100, 300, 1000, 5000] as const;

/** Firepower picked as mantissa × 10^exponent (the page has no free-text fields, D68). */
export const powerOf = (mantissa: number, exponent: number): bigint => BigInt(mantissa) * BigInt(10) ** BigInt(exponent);

export type SimPoint = { minute: number; wave: bigint; best: bigint; breaches: bigint };

export type SimResult = {
  power: bigint;
  top: bigint;
  topHealth: bigint | null;
  firstWaves: WaveStep[];
  points: SimPoint[];
  end: RegionWaves;
};

export function simulate(power: bigint, days: number, startWave: bigint): SimResult {
  const start: RegionWaves = { ...newRegionWaves(BigInt(0), power), wave: startWave };
  const totalWaves = days * WAVES_PER_DAY;

  const firstWaves: WaveStep[] = [];
  replayStepwise(start, [], BigInt(Math.min(FIRST_WAVES, totalWaves)) * WAVE_MS, (step) => firstWaves.push(step));

  const every = Math.ceil(totalWaves / (MAX_POINTS - 1));
  const points: SimPoint[] = [{ minute: 0, wave: start.wave, best: start.best, breaches: start.breaches }];
  for (let minute = every; minute <= totalWaves; minute += every) {
    const s = settle(start, BigInt(minute) * WAVE_MS);
    points.push({ minute, wave: s.wave, best: s.best, breaches: s.breaches });
  }

  const end = settle(start, BigInt(totalWaves) * WAVE_MS);
  if (points.at(-1)!.minute !== totalWaves) points.push({ minute: totalWaves, wave: end.wave, best: end.best, breaches: end.breaches });

  const top = maxBlockableWave(power);
  return {
    power,
    top,
    topHealth: top > BigInt(0) ? waveHealth(top) : null,
    firstWaves,
    points,
    end,
  };
}

export const capacity = (power: bigint): bigint => power * WAVE_SECONDS;
