import { addDays, DAY_MS, kstDate } from "./dates";

/** Region change (spec "지역 바꾸기", Q24): one free change in the first 24 hours, then once every 30 days. */
export const FREE_CHANGE_MS = DAY_MS;
export const CHANGE_EVERY_DAYS = 30;
/** Guardians unseen this many days are removed (Q33, D76). */
export const INACTIVE_DAYS = 365;

export type RegionChange = { allowed: true; nextOn: null } | { allowed: false; nextOn: string };

/**
 * `pickedAt` is when the region was first picked; `changedOn` the day of the last change, if any.
 * After the first day the 30 days count from the last change, or from the first pick when there was none.
 */
export function regionChangeStatus(pickedAt: number, changedOn: string | null, now: number): RegionChange {
  if (changedOn === null && now - pickedAt < FREE_CHANGE_MS) return { allowed: true, nextOn: null };
  const nextOn = addDays(changedOn ?? kstDate(pickedAt), CHANGE_EVERY_DAYS);
  return kstDate(now) >= nextOn ? { allowed: true, nextOn: null } : { allowed: false, nextOn };
}
