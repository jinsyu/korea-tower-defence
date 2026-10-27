import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

export type Db = Database.Database;

// spec "서버 DB". No IP, user agent, device or minute-level visit columns (D69): the last visit is a day only.
// Keys and recovery codes are stored as hashes only (D4). Big game numbers (power) are decimal TEXT (BigInt).
// open_problems keeps the answer on the server only (D33); recent_answers keeps the last 50 per guardian (trimmed on
// insert). region_daily comes with the national board (T17). guardian_points_hourly keeps points per hour for the last 24
// hours (representatives, D21); the power log keeps every applied region power change (lazy settling replays it).
export const SCHEMA = `
CREATE TABLE IF NOT EXISTS guardians (
  id TEXT PRIMARY KEY,
  code_hash TEXT NOT NULL UNIQUE,
  nick_adj INTEGER NOT NULL,
  nick_noun INTEGER NOT NULL,
  nick_tag INTEGER NOT NULL,
  band TEXT NOT NULL,
  region TEXT NOT NULL,
  region_picked_at INTEGER NOT NULL,
  region_changed_on TEXT,
  total_points INTEGER NOT NULL DEFAULT 0,
  wallet INTEGER NOT NULL DEFAULT 0,
  level INTEGER NOT NULL DEFAULT 1,
  stage INTEGER NOT NULL DEFAULT 1,
  tendency TEXT NOT NULL DEFAULT 'balanced',
  tower_type TEXT NOT NULL,
  color INTEGER NOT NULL DEFAULT 0,
  math_step INTEGER NOT NULL DEFAULT 1,
  right_streak INTEGER NOT NULL DEFAULT 0,
  wrong_streak INTEGER NOT NULL DEFAULT 0,
  today_on TEXT,
  today_correct INTEGER NOT NULL DEFAULT 0,
  points_paused_until INTEGER NOT NULL DEFAULT 0,
  points_24h INTEGER NOT NULL DEFAULT 0,
  last_seen_on TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS guardians_region ON guardians(region);
CREATE INDEX IF NOT EXISTS guardians_last_seen ON guardians(last_seen_on);
CREATE TABLE IF NOT EXISTS guardian_keys (
  key_hash TEXT PRIMARY KEY,
  guardian_id TEXT NOT NULL REFERENCES guardians(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS guardian_keys_guardian ON guardian_keys(guardian_id);
CREATE TABLE IF NOT EXISTS regions (
  code TEXT PRIMARY KEY,
  wave INTEGER NOT NULL,
  wave_started_at INTEGER NOT NULL,
  power TEXT NOT NULL,
  next_power TEXT NOT NULL,
  best_wave INTEGER NOT NULL,
  breaches INTEGER NOT NULL,
  guardian_count INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS region_power_log (
  region TEXT NOT NULL,
  at INTEGER NOT NULL,
  power TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS region_power_log_at ON region_power_log(at);
CREATE TABLE IF NOT EXISTS open_problems (
  guardian_id TEXT PRIMARY KEY REFERENCES guardians(id) ON DELETE CASCADE,
  id TEXT NOT NULL UNIQUE,
  seed INTEGER NOT NULL,
  band TEXT NOT NULL,
  level INTEGER NOT NULL,
  answer INTEGER NOT NULL,
  sent_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS recent_answers (
  guardian_id TEXT NOT NULL REFERENCES guardians(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  outcome TEXT NOT NULL CHECK (outcome IN ('right', 'wrong', 'skip')),
  ms INTEGER NOT NULL,
  at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS recent_answers_guardian ON recent_answers(guardian_id, at);
CREATE TABLE IF NOT EXISTS guardian_points_hourly (
  guardian_id TEXT NOT NULL REFERENCES guardians(id) ON DELETE CASCADE,
  hour INTEGER NOT NULL,
  points INTEGER NOT NULL,
  PRIMARY KEY (guardian_id, hour)
);
CREATE INDEX IF NOT EXISTS guardian_points_hourly_hour ON guardian_points_hourly(hour);
`;

export function openDb(path: string): Db {
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
  const db = new Database(path);
  db.pragma("journal_mode = WAL");
  db.pragma("synchronous = FULL");
  db.pragma("busy_timeout = 5000");
  db.pragma("foreign_keys = ON");
  db.exec(SCHEMA);
  return db;
}

export type Writer = {
  /** Runs `op` inside the next batch transaction and resolves after the commit. A throwing op rolls back alone. */
  run<T>(op: () => T): Promise<T>;
  /** Commit what is queued now (shutdown, tests). */
  flush(): void;
};

type Queued = { op: () => unknown; resolve: (v: unknown) => void; reject: (e: unknown) => void };

/** Batched writes from the T1 load PoC: one transaction every `flushMs`, replies only after it is on disk (D57). */
export function createWriter(db: Db, flushMs: number): Writer {
  let queue: Queued[] = [];
  let timer: ReturnType<typeof setTimeout> | undefined;

  function flush() {
    clearTimeout(timer);
    timer = undefined;
    const batch = queue;
    queue = [];
    if (batch.length === 0) return;
    const outcomes: ({ ok: true; value: unknown } | { ok: false; error: unknown })[] = [];
    try {
      db.transaction(() => {
        for (const item of batch) {
          try {
            outcomes.push({ ok: true, value: db.transaction(item.op)() });
          } catch (error) {
            // Some SQLite errors (RAISE(ROLLBACK), disk full, ...) roll back the whole batch, not just the savepoint.
            // Then nothing before was kept and nothing after may run outside a transaction: fail the whole batch.
            if (!db.inTransaction) throw error;
            outcomes.push({ ok: false, error });
          }
        }
      })();
    } catch (error) {
      batch.forEach((item) => item.reject(error));
      return;
    }
    batch.forEach((item, i) => {
      const out = outcomes[i]!;
      if (out.ok) item.resolve(out.value);
      else item.reject(out.error);
    });
  }

  return {
    run<T>(op: () => T) {
      return new Promise<T>((resolve, reject) => {
        queue.push({ op, resolve: resolve as (v: unknown) => void, reject });
        timer ??= setTimeout(flush, flushMs);
      });
    },
    flush,
  };
}
