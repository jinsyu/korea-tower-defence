import {
  formatRecoveryCode,
  makeRecoveryCode,
  NICK_ADJECTIVES,
  NICK_NOUNS,
  COLOR_COUNT,
  openColorCount,
  splitStats,
  statPointsOf,
  TENDENCIES,
  TOWER_TYPES,
  towerPower,
  type RecoveryCode,
  type Tendency,
  type TowerType,
} from "@ktd/core";
import { createHash, createHmac, randomBytes, randomInt } from "node:crypto";
import type { Db } from "./db";
import { addDays, kstDate } from "./dates";
import type { Regions, RegionTruth } from "./regions";
import { INACTIVE_DAYS, regionChangeStatus, type RegionChange } from "./rules";

export const TAG_COUNT = 10_000;

/** Nickname number: adjective index, noun index and a 4-digit tag (spec "별명"). */
export type Nick = { adj: number; noun: number; tag: number };

const inRange = (v: unknown, n: number): v is number => Number.isInteger(v) && (v as number) >= 0 && (v as number) < n;

export function isNick(v: unknown): v is Nick {
  if (typeof v !== "object" || v === null) return false;
  const n = v as Record<string, unknown>;
  return inRange(n.adj, NICK_ADJECTIVES.length) && inRange(n.noun, NICK_NOUNS.length) && inRange(n.tag, TAG_COUNT);
}

export const nickName = (n: Nick): string => `${NICK_ADJECTIVES[n.adj]} ${NICK_NOUNS[n.noun]}`;
export const nickTag = (n: Nick): string => String(n.tag).padStart(4, "0");

/** Three random nicknames from the word lists; "다시 뽑기" asks again. */
export function nickCandidates(): Nick[] {
  return [0, 1, 2].map(() => ({
    adj: randomInt(NICK_ADJECTIVES.length),
    noun: randomInt(NICK_NOUNS.length),
    tag: randomInt(TAG_COUNT),
  }));
}

export const isTowerType = (v: unknown): v is TowerType => TOWER_TYPES.includes(v as TowerType);
export const isTendency = (v: unknown): v is Tendency => TENDENCIES.includes(v as Tendency);

/** Device keys are 256-bit random values, so a plain SHA-256 is enough to keep only a hash (D4). */
export const hashKey = (key: string): string => createHash("sha256").update(key).digest("base64url");

export type GuardianRow = {
  id: string;
  nick_adj: number;
  nick_noun: number;
  nick_tag: number;
  region: string;
  region_picked_at: number;
  region_changed_on: string | null;
  total_points: number;
  wallet: number;
  level: number;
  stage: number;
  tendency: Tendency;
  tower_type: TowerType;
  color: number;
  last_seen_on: string;
};

/** What the screens get about me. Big numbers are decimal strings (BigInt on the server). */
export type MeView = {
  nick: Nick;
  name: string;
  tag: string;
  region: string;
  regionChange: RegionChange;
  towerType: TowerType;
  tendency: Tendency;
  color: number;
  level: string;
  points: string;
  wallet: string;
  stage: string;
  power: string;
  stats: Record<string, string>;
  /** My tower's public id in the region broadcast (representatives), so the screen finds itself there. */
  rid: string;
  /** Points I earned in the last 24 hours (representatives, D21). */
  points24h: number;
};

/** Public tower id: a hash of the private guardian id, never the id itself. */
export const publicId = (id: string): string => createHash("sha256").update(`rid:${id}`).digest("base64url").slice(0, 12);

export const powerOf = (g: Pick<GuardianRow, "stage" | "level" | "tendency" | "tower_type">): bigint =>
  towerPower({ stage: BigInt(g.stage), level: BigInt(g.level), tendency: g.tendency, towerType: g.tower_type });

export function meView(g: GuardianRow, now: number, points24h: number): MeView {
  const nick = { adj: g.nick_adj, noun: g.nick_noun, tag: g.nick_tag };
  const stats = splitStats(statPointsOf(BigInt(g.level)), g.tendency);
  return {
    nick,
    name: nickName(nick),
    tag: nickTag(nick),
    region: g.region,
    regionChange: regionChangeStatus(g.region_picked_at, g.region_changed_on, now),
    towerType: g.tower_type,
    tendency: TENDENCIES.includes(g.tendency) ? g.tendency : "balanced",
    color: g.color,
    level: String(g.level),
    points: String(g.total_points),
    wallet: String(g.wallet),
    stage: String(g.stage),
    power: powerOf(g).toString(),
    stats: Object.fromEntries(Object.entries(stats).map(([k, v]) => [k, v.toString()])),
    rid: publicId(g.id),
    points24h,
  };
}

/** What the my-tower screen may change. Each given field replaces the saved one. */
export type LookChange = { towerType?: TowerType; tendency?: Tendency; color?: number };

/**
 * Reads only towerType, tendency and colour; anything else in the body (level, points, ids) is ignored (D54).
 * Null when nothing is given or a given field is out of range. Whether the colour is open is checked later
 * against the saved level.
 */
export function toLookChange(body: Record<string, unknown>): LookChange | null {
  const { towerType, tendency, color } = body;
  if (towerType === undefined && tendency === undefined && color === undefined) return null;
  if (towerType !== undefined && !isTowerType(towerType)) return null;
  if (tendency !== undefined && !isTendency(tendency)) return null;
  if (color !== undefined && !inRange(color, Number(COLOR_COUNT))) return null;
  return { towerType, tendency, color } as LookChange;
}

export type NewGuardian = { region: string; nick: Nick; towerType: TowerType };

export type Guardians = ReturnType<typeof createGuardians>;

/** Guardian rows. Every function runs synchronously inside the caller's (batched) transaction. */
export function createGuardians(db: Db, regions: Regions, serverSecret: string) {
  // Recovery codes carry about 46 bits, so the hash is keyed with a server secret (a plain hash could be brute-forced).
  const hashCode = (code: RecoveryCode) => createHmac("sha256", serverSecret).update(formatRecoveryCode(code)).digest("base64url");

  const q = {
    byId: db.prepare<[string], GuardianRow>("SELECT * FROM guardians WHERE id = ?"),
    byKey: db.prepare<[string], GuardianRow>(
      "SELECT g.* FROM guardian_keys k JOIN guardians g ON g.id = k.guardian_id WHERE k.key_hash = ?",
    ),
    byCode: db.prepare<[string], GuardianRow>("SELECT * FROM guardians WHERE code_hash = ?"),
    keyCount: db.prepare<[string], { n: number }>("SELECT COUNT(*) AS n FROM guardian_keys WHERE guardian_id = ?"),
    codeTaken: db.prepare<[string], { one: number }>("SELECT 1 AS one FROM guardians WHERE code_hash = ?"),
    insert: db.prepare(
      `INSERT INTO guardians (id, code_hash, nick_adj, nick_noun, nick_tag, region, region_picked_at, tower_type, last_seen_on)
       VALUES (@id, @code_hash, @nick_adj, @nick_noun, @nick_tag, @region, @region_picked_at, @tower_type, @last_seen_on)`,
    ),
    insertKey: db.prepare("INSERT INTO guardian_keys (key_hash, guardian_id) VALUES (?, ?)"),
    setNick: db.prepare("UPDATE guardians SET nick_adj = ?, nick_noun = ?, nick_tag = ? WHERE id = ?"),
    setLook: db.prepare("UPDATE guardians SET tower_type = ?, tendency = ?, color = ? WHERE id = ?"),
    setRegion: db.prepare("UPDATE guardians SET region = ?, region_changed_on = ? WHERE id = ?"),
    setCode: db.prepare("UPDATE guardians SET code_hash = ? WHERE id = ?"),
    touch: db.prepare("UPDATE guardians SET last_seen_on = ? WHERE id = ?"),
    remove: db.prepare("DELETE FROM guardians WHERE id = ?"),
    unseenSince: db.prepare<[string], GuardianRow>("SELECT * FROM guardians WHERE last_seen_on <= ?"),
    towers: db.prepare<[], Pick<GuardianRow, "region" | "stage" | "level" | "tendency" | "tower_type">>(
      "SELECT region, stage, level, tendency, tower_type FROM guardians",
    ),
  };

  const newKey = (id: string): string => {
    const key = randomBytes(32).toString("base64url");
    q.insertKey.run(hashKey(key), id);
    return key;
  };

  function freshCode(): { code: RecoveryCode; hash: string } {
    for (;;) {
      const code = makeRecoveryCode(randomInt);
      const hash = hashCode(code);
      if (!q.codeTaken.get(hash)) return { code, hash };
    }
  }

  const get = (id: string): GuardianRow => {
    const row = q.byId.get(id);
    if (!row) throw new Error("guardian vanished inside its own transaction");
    return row;
  };

  /** The guardian a device key belongs to; undefined for unknown, deleted or made-up keys. */
  const byKey = (key: string): GuardianRow | undefined => q.byKey.get(hashKey(key));

  function create(input: NewGuardian, now: number): { key: string; code: RecoveryCode; guardian: GuardianRow } {
    const id = randomBytes(16).toString("base64url");
    const { code, hash } = freshCode();
    q.insert.run({
      id,
      code_hash: hash,
      nick_adj: input.nick.adj,
      nick_noun: input.nick.noun,
      nick_tag: input.nick.tag,
      region: input.region,
      region_picked_at: now,
      tower_type: input.towerType,
      last_seen_on: kstDate(now),
    });
    const guardian = get(id);
    const key = newKey(id);
    regions.shiftPower(input.region, powerOf(guardian), 1);
    return { key, code, guardian };
  }

  const codeExists = (code: RecoveryCode): boolean => q.codeTaken.get(hashCode(code)) !== undefined;

  /** A right code gives this device its own new key; other devices keep theirs. */
  function restore(code: RecoveryCode, now: number): { key: string; guardian: GuardianRow } | null {
    const found = q.byCode.get(hashCode(code));
    if (!found) return null;
    q.touch.run(kstDate(now), found.id);
    return { key: newKey(found.id), guardian: get(found.id) };
  }

  function touch(id: string, now: number): void {
    q.touch.run(kstDate(now), id);
  }

  function setNick(id: string, nick: Nick): GuardianRow {
    q.setNick.run(nick.adj, nick.noun, nick.tag, id);
    return get(id);
  }

  /**
   * Tower type, tendency and colour change the picture only: the stats are re-split from the level on every read
   * and their sum stays, so the power and the region sums do not move (D46, D47). A colour opens with the saved level.
   */
  function setLook(id: string, change: LookChange): { ok: true; guardian: GuardianRow } | { ok: false; reason: "color_locked" } {
    const g = get(id);
    if (change.color !== undefined && BigInt(change.color) >= openColorCount(BigInt(g.level))) return { ok: false, reason: "color_locked" };
    q.setLook.run(change.towerType ?? g.tower_type, change.tendency ?? g.tendency, change.color ?? g.color, id);
    return { ok: true, guardian: get(id) };
  }

  /** My record moves with me; my power leaves the old region and joins the new one from the next wave (D7). */
  function changeRegion(
    id: string,
    region: string,
    now: number,
  ): { ok: true; guardian: GuardianRow } | { ok: false; reason: "same" } | { ok: false; reason: "locked"; nextOn: string } {
    const g = get(id);
    if (g.region === region) return { ok: false, reason: "same" };
    const status = regionChangeStatus(g.region_picked_at, g.region_changed_on, now);
    if (!status.allowed) return { ok: false, reason: "locked", nextOn: status.nextOn };
    const p = powerOf(g);
    q.setRegion.run(region, kstDate(now), id);
    regions.shiftPower(g.region, -p, -1);
    regions.shiftPower(region, p, 1);
    return { ok: true, guardian: get(id) };
  }

  /** "새 복구 코드 만들기": the old code stops working at once. */
  function newCode(id: string): RecoveryCode {
    const { code, hash } = freshCode();
    q.setCode.run(hash, id);
    return code;
  }

  /** "내 기록 지우기" and the 365-day clean-up: the row and its keys go, the power leaves from the next wave (D8, D76). */
  function remove(id: string): void {
    const g = get(id);
    q.remove.run(id);
    regions.shiftPower(g.region, -powerOf(g), -1);
  }

  /**
   * "뒤로 가서 다시 만들기": the guardian this device made before goes, but only while its code was never used.
   * Keys come only from making (one) and from restoring with the code (one more each), so a single key means the code
   * has never been used. Returns the removed guardian's id.
   */
  function removeUnusedByKey(key: string): string | undefined {
    const g = byKey(key);
    if (!g || q.keyCount.get(g.id)!.n !== 1) return undefined;
    remove(g.id);
    return g.id;
  }

  function purgeInactive(now: number): number {
    const gone = q.unseenSince.all(addDays(kstDate(now), -INACTIVE_DAYS));
    gone.forEach((g) => remove(g.id));
    return gone.length;
  }

  /** Every region's power and guardian count from the guardian rows (the truth the pooled sums must match). */
  function regionTruth(): RegionTruth {
    const truth: RegionTruth = new Map();
    for (const g of q.towers.iterate()) {
      const t = truth.get(g.region) ?? { power: BigInt(0), guardians: 0 };
      t.power += powerOf(g);
      t.guardians += 1;
      truth.set(g.region, t);
    }
    return truth;
  }

  return { regionTruth, byKey, codeExists, create, restore, touch, setNick, setLook, changeRegion, newCode, remove, removeUnusedByKey, purgeInactive };
}
