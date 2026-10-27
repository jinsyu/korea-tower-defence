// Dates are Korean calendar days ("YYYY-MM-DD", KST). The DB keeps days, not times, where the spec says so (D69).

export const HOUR_MS = 3_600_000;
export const DAY_MS = 24 * HOUR_MS;
const KST_OFFSET_MS = 9 * HOUR_MS;

export const kstDate = (ms: number): string => new Date(ms + KST_OFFSET_MS).toISOString().slice(0, 10);

export const addDays = (date: string, days: number): string =>
  new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);

/** Epoch ms of 00:00 KST on that day. */
export const kstMidnight = (date: string): number => Date.parse(`${date}T00:00:00Z`) - KST_OFFSET_MS;

export const daysBetween = (from: string, to: string): number =>
  Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);
