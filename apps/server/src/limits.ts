import { createHmac } from "node:crypto";
import { HOUR_MS } from "./dates";

// Per-address limits (spec "시도 제한"). The address is kept only as an HMAC, only in memory, and an entry is
// dropped an hour after its last event (the last attempt, which is also when any lock ends). Nothing here is
// written to disk or logs.

export const RESTORE_FAILS_PER_HOUR = 10;
export const CREATES_PER_HOUR = 60;

/** `fails` are wrong-code times from the last hour. A lock replaces them: it ends an hour after the 10th fail. */
type RestoreEntry = { fails: number[]; lockedUntil: number | null };

export type AddressLimits = ReturnType<typeof createAddressLimits>;

export function createAddressLimits(hmacKey: string, now: () => number) {
  const restores = new Map<string, RestoreEntry>();
  const creates = new Map<string, number[]>();
  const timers = new Map<string, ReturnType<typeof setTimeout>>();
  const tag = (address: string) => createHmac("sha256", hmacKey).update(address).digest("base64url");
  const recent = (times: number[], t: number) => times.filter((at) => t - at < HOUR_MS);

  /** Forget this address an hour after its newest event, by the real timer. `sweep` does the same by the clock. */
  function expireLater(key: string, map: Map<string, unknown>) {
    const id = `${map === restores ? "r" : "c"}:${key}`;
    clearTimeout(timers.get(id));
    const timer = setTimeout(() => {
      timers.delete(id);
      map.delete(key);
    }, HOUR_MS);
    timer.unref();
    timers.set(id, timer);
  }

  /** The entry as of now: old failures dropped, an ended lock gone. */
  function restoreEntry(key: string, t: number): RestoreEntry | undefined {
    const entry = restores.get(key);
    if (!entry) return undefined;
    if (entry.lockedUntil !== null) return entry.lockedUntil > t ? entry : undefined;
    const fails = recent(entry.fails, t);
    return fails.length ? { fails, lockedUntil: null } : undefined;
  }

  /** Ms left on the restore lock, 0 when not locked. */
  function restoreLockLeft(address: string): number {
    const t = now();
    const locked = restoreEntry(tag(address), t)?.lockedUntil;
    return locked ? locked - t : 0;
  }

  /** Count a wrong code. The 10th within an hour locks the address for an hour (D5). A locked address stays locked. */
  function restoreFailed(address: string): { locked: boolean; triesLeft: number } {
    const t = now();
    const key = tag(address);
    const entry = restoreEntry(key, t);
    if (entry?.lockedUntil) return { locked: true, triesLeft: 0 };
    const fails = [...(entry?.fails ?? []), t];
    const locked = fails.length >= RESTORE_FAILS_PER_HOUR;
    restores.set(key, locked ? { fails: [], lockedUntil: t + HOUR_MS } : { fails, lockedUntil: null });
    expireLater(key, restores);
    return { locked, triesLeft: Math.max(0, RESTORE_FAILS_PER_HOUR - fails.length) };
  }

  /** New guardians from one address: 60 an hour, the 61st is refused (D40). */
  function canCreate(address: string): boolean {
    return recent(creates.get(tag(address)) ?? [], now()).length < CREATES_PER_HOUR;
  }

  function created(address: string): void {
    const key = tag(address);
    creates.set(key, [...recent(creates.get(key) ?? [], now()), now()]);
    expireLater(key, creates);
  }

  /** Drop what is an hour old by the server clock (tests move the clock; the timers use real time). */
  function sweep(): void {
    const t = now();
    for (const key of restores.keys()) {
      const entry = restoreEntry(key, t);
      if (entry) restores.set(key, entry);
      else restores.delete(key);
    }
    for (const [key, times] of creates) {
      const kept = recent(times, t);
      if (kept.length) creates.set(key, kept);
      else creates.delete(key);
    }
  }

  const size = () => restores.size + creates.size;

  const close = () => {
    timers.forEach(clearTimeout);
    timers.clear();
  };

  return { restoreLockLeft, restoreFailed, canCreate, created, sweep, size, close };
}
