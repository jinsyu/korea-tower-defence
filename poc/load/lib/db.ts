// Thin wrapper so the same server code runs on better-sqlite3 or Node's built-in node:sqlite.
import { createRequire } from "node:module";

export type Driver = "better" | "node";
type Param = string | number | null;

export interface Stmt {
  run(...params: Param[]): void;
  get(...params: Param[]): Record<string, unknown> | undefined;
  all(...params: Param[]): Record<string, unknown>[];
}

export interface Db {
  driver: Driver;
  exec(sql: string): void;
  prepare(sql: string): Stmt;
  transaction(fn: () => void): void;
  close(): void;
}

const require = createRequire(import.meta.url);

export function openDb(path: string, driver: Driver, synchronous: string): Db {
  const db = driver === "better" ? openBetter(path) : openNode(path);
  db.exec("PRAGMA journal_mode = WAL");
  db.exec(`PRAGMA synchronous = ${synchronous}`);
  db.exec("PRAGMA busy_timeout = 5000");
  return db;
}

function openBetter(path: string): Db {
  const Database = require("better-sqlite3") as typeof import("better-sqlite3");
  const db = new Database(path);
  return {
    driver: "better",
    exec: (sql) => void db.exec(sql),
    prepare: (sql) => db.prepare(sql) as unknown as Stmt,
    transaction: (fn) => db.transaction(fn)(),
    close: () => db.close(),
  };
}

function openNode(path: string): Db {
  const { DatabaseSync } = require("node:sqlite") as typeof import("node:sqlite");
  const db = new DatabaseSync(path);
  return {
    driver: "node",
    exec: (sql) => db.exec(sql),
    prepare: (sql) => db.prepare(sql) as unknown as Stmt,
    transaction: (fn) => {
      db.exec("BEGIN");
      try {
        fn();
        db.exec("COMMIT");
      } catch (e) {
        db.exec("ROLLBACK");
        throw e;
      }
    },
    close: () => db.close(),
  };
}

export const SCHEMA = `
CREATE TABLE IF NOT EXISTS guardians (
  id TEXT PRIMARY KEY,
  key_hash TEXT NOT NULL,
  nick INTEGER NOT NULL,
  grade INTEGER NOT NULL,
  region TEXT NOT NULL,
  points INTEGER NOT NULL,
  wallet INTEGER NOT NULL,
  level INTEGER NOT NULL,
  stage INTEGER NOT NULL,
  power INTEGER NOT NULL,
  math_step INTEGER NOT NULL,
  streak INTEGER NOT NULL,
  today_correct INTEGER NOT NULL,
  problem_seq INTEGER NOT NULL,
  last_seen INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS guardians_region ON guardians(region);
CREATE TABLE IF NOT EXISTS recent_answers (
  id INTEGER PRIMARY KEY,
  guardian_id TEXT NOT NULL,
  problem_id TEXT NOT NULL,
  expr_key TEXT NOT NULL,
  correct INTEGER NOT NULL,
  ms INTEGER NOT NULL,
  at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS recent_answers_guardian ON recent_answers(guardian_id, id);
CREATE TABLE IF NOT EXISTS open_problems (
  guardian_id TEXT PRIMARY KEY,
  problem_id TEXT NOT NULL,
  seed INTEGER NOT NULL,
  expr TEXT NOT NULL,
  choices TEXT NOT NULL,
  answer INTEGER NOT NULL,
  sent_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS regions (
  code TEXT PRIMARY KEY,
  wave INTEGER NOT NULL,
  wave_started_at INTEGER NOT NULL,
  power INTEGER NOT NULL,
  next_power INTEGER NOT NULL,
  best_wave INTEGER NOT NULL,
  best_wave_at INTEGER NOT NULL,
  guardian_count INTEGER NOT NULL,
  today_correct INTEGER NOT NULL,
  today_breaches INTEGER NOT NULL
);
`;
