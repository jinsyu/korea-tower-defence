// Points earned in the last 24 hours, for picking the representatives (spec "대표 자리", D21).
// Kept per guardian in hourly buckets, so the window is the current hour and the 23 before it (a point drops out
// 23~24 hours after it was earned). Numbers only; the buckets go with the guardian (ON DELETE CASCADE).
import type { Db } from "./db";
import { HOUR_MS } from "./dates";

export const WINDOW_HOURS = 24;

export type Candidate = {
  id: string;
  nick_adj: number;
  nick_noun: number;
  nick_tag: number;
  tower_type: string;
  stage: number;
  color: number;
  pts24: number;
};

const hourOf = (ms: number) => Math.floor(ms / HOUR_MS);

export type Points24 = ReturnType<typeof createPoints24>;

export function createPoints24(db: Db) {
  const q = {
    add: db.prepare(
      `INSERT INTO guardian_points_hourly (guardian_id, hour, points) VALUES (?, ?, ?)
       ON CONFLICT(guardian_id, hour) DO UPDATE SET points = points + excluded.points`,
    ),
    sum: db.prepare<[string, number], { p: number | null }>(
      "SELECT SUM(points) AS p FROM guardian_points_hourly WHERE guardian_id = ? AND hour > ?",
    ),
    // Join order: who picked a region first, then who was made first.
    candidates: db.prepare<[string, number], Candidate>(
      `SELECT g.id, g.nick_adj, g.nick_noun, g.nick_tag, g.tower_type, g.stage, g.color, SUM(h.points) AS pts24
       FROM guardians g JOIN guardian_points_hourly h ON h.guardian_id = g.id
       WHERE g.region = ? AND h.hour > ?
       GROUP BY g.id HAVING pts24 > 0
       ORDER BY g.region_picked_at, g.rowid`,
    ),
    trim: db.prepare("DELETE FROM guardian_points_hourly WHERE hour <= ?"),
  };
  const oldest = (now: number) => hourOf(now) - WINDOW_HOURS;

  return {
    /** Runs inside the answer's transaction. */
    add: (guardianId: string, at: number, points: number) => void (points > 0 && q.add.run(guardianId, hourOf(at), points)),
    of: (guardianId: string, now: number): number => q.sum.get(guardianId, oldest(now))?.p ?? 0,
    /** Guardians of the region with points in the window, in join order. */
    candidates: (region: string, now: number): Candidate[] => q.candidates.all(region, oldest(now)),
    trim: (now: number) => void q.trim.run(oldest(now)),
  };
}
