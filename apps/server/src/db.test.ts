import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createWriter, openDb, type Db } from "./db";

let dir: string;
let db: Db;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "ktd-db-test-"));
  db = openDb(join(dir, "t.db"));
  db.exec("CREATE TABLE t (v INTEGER)");
});

afterEach(() => {
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

const values = () => (db.prepare("SELECT v FROM t ORDER BY v").all() as { v: number }[]).map((r) => r.v);
const insert = (v: number) => () => void db.prepare("INSERT INTO t (v) VALUES (?)").run(v);

describe("batched writer", () => {
  it("commits a batch in one go and answers after the commit", async () => {
    const writer = createWriter(db, 5);
    await Promise.all([writer.run(insert(1)), writer.run(insert(2)), writer.run(() => 7)]);
    expect(values()).toEqual([1, 2]);
  });

  it("rolls back only the op that failed; the rest of the batch is kept", async () => {
    const writer = createWriter(db, 5);
    const results = await Promise.allSettled([
      writer.run(insert(1)),
      writer.run(() => {
        insert(2)();
        throw new Error("op failed");
      }),
      writer.run(insert(3)),
    ]);
    expect(results.map((r) => r.status)).toEqual(["fulfilled", "rejected", "fulfilled"]);
    expect(values()).toEqual([1, 3]);
  });

  it("fails the whole batch when SQLite rolled back the whole transaction, and writes nothing after it", async () => {
    db.exec("CREATE TRIGGER no_99 BEFORE INSERT ON t WHEN NEW.v = 99 BEGIN SELECT RAISE(ROLLBACK, 'boom'); END");
    const writer = createWriter(db, 5);
    const results = await Promise.allSettled([writer.run(insert(1)), writer.run(insert(99)), writer.run(insert(3))]);
    expect(results.map((r) => r.status)).toEqual(["rejected", "rejected", "rejected"]);
    expect(values()).toEqual([]);
    expect(db.inTransaction).toBe(false);
    // The writer keeps working afterwards.
    await writer.run(insert(4));
    expect(values()).toEqual([4]);
  });
});
