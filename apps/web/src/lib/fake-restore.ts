import type { RecoveryCode } from "@ktd/core";

// Screen-only stand-in for the server check (T11): the one code the fake guardian has, and the
// "10 wrong tries within an hour locks for an hour" rule (spec D5). Times are epoch ms from the caller.

export const FAKE_RECOVERY_CODE: RecoveryCode = { words: ["구름", "기차", "사과", "별빛"], digits: "27" };
export const FAKE_GUARDIAN_NAME = "씩씩한 수달 #0427";
export const RESTORE_TRIES_PER_HOUR = 10;
export const RESTORE_WINDOW_MS = 60 * 60 * 1000;

export type RestoreAttempts = { failedAt: readonly number[]; lockedUntil: number | null };
export type RestoreResult = "ok" | "bad" | "locked";

export const NO_ATTEMPTS: RestoreAttempts = { failedAt: [], lockedUntil: null };

function sameCode(a: RecoveryCode, b: RecoveryCode): boolean {
  return a.digits === b.digits && a.words.every((w, i) => w === b.words[i]);
}

export function isLocked(attempts: RestoreAttempts, now: number): boolean {
  return attempts.lockedUntil !== null && now < attempts.lockedUntil;
}

/** Whole minutes until the lock ends, at least 1 while locked; 0 when not locked. */
export function lockMinutesLeft(attempts: RestoreAttempts, now: number): number {
  if (!isLocked(attempts, now) || attempts.lockedUntil === null) return 0;
  return Math.max(1, Math.ceil((attempts.lockedUntil - now) / 60000));
}

/** Failures that still count: the ones in the last hour. */
export function recentFails(attempts: RestoreAttempts, now: number): number {
  return attempts.failedAt.filter((t) => now - t < RESTORE_WINDOW_MS).length;
}

export function tryFakeRestore(
  code: RecoveryCode,
  attempts: RestoreAttempts,
  now: number,
): { result: RestoreResult; attempts: RestoreAttempts } {
  if (isLocked(attempts, now)) return { result: "locked", attempts };
  // An expired lock starts a fresh hour; otherwise only failures from the last hour count.
  const kept = attempts.lockedUntil === null ? attempts.failedAt.filter((t) => now - t < RESTORE_WINDOW_MS) : [];
  if (sameCode(code, FAKE_RECOVERY_CODE)) return { result: "ok", attempts: { failedAt: kept, lockedUntil: null } };
  const failedAt = [...kept, now];
  if (failedAt.length >= RESTORE_TRIES_PER_HOUR) {
    return { result: "locked", attempts: { failedAt, lockedUntil: now + RESTORE_WINDOW_MS } };
  }
  return { result: "bad", attempts: { failedAt, lockedUntil: null } };
}
