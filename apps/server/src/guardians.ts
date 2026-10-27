import {
  formatRecoveryCode,
  makeRecoveryCode,
  NICK_ADJECTIVES,
  NICK_NOUNS,
  splitStats,
  statPointsOf,
  TENDENCIES,
  TOWER_TYPES,
  towerPower,
  type MathBand,
  type RecoveryCode,
  type Tendency,
  type TowerType,
} from "@ktd/core";
import { createHash, createHmac, randomBytes, randomInt } from "node:crypto";
import type { Db } from "./db";
import { addDays, kstDate } from "./dates";
import type { Regions } from "./regions";
import { INACTIVE_DAYS, regionChangeStatus, type RegionChange } from "./rules";

export const BANDS: readonly MathBand[] = ["12", "34", "56"];
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

export const isBand = (v: unknown): v is MathBand => BANDS.includes(v as MathBand);
export const isTowerType = (v: unknown): v is TowerType => TOWER_TYPES.includes(v as TowerType);

/** Device keys are 256-bit random values, so a plain SHA-256 is enough to keep only a hash (D4). */
export const hashKey = (key: string): string => createHash("sha256").update(key).digest("base64url");

export type GuardianRow = {
  id: string;
  nick_adj: number;
  nick_noun: number;
  nick_tag: number;
  band: MathBand;
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
  band: MathBand;
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
};

export const powerOf = (g: GuardianRow): bigint =>
  towerPower({ stage: BigInt(g.stage), level: BigInt(g.level), tendency: g.tendency, towerType: g.tower_type });

export function meView(g: GuardianRow, now: number): MeView {
  const nick = { adj: g.nick_adj, noun: g.nick_noun, tag: g.nick_tag };
  const stats = splitStats(statPointsOf(BigInt(g.level)), g.tendency);
  return {
    nick,
    name: nickName(nick),
    tag: nickTag(nick),
    band: g.band,
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
  };
}

export type NewGuardian = { band: MathBand; region: string; nick: Nick; towerType: TowerType };

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
    codeTaken: db.prepare<[string], { one: number }>("SELECT 1 AS one FROM guardians WHERE code_hash = ?"),
    insert: db.prepare(
      `INSERT INTO guardians (id, code_hash, nick_adj, nick_noun, nick_tag, band, region, region_picked_at, tower_type, last_seen_on)
       VALUES (@id, @code_hash, @nick_adj, @nick_noun, @nick_tag, @band, @region, @region_picked_at, @tower_type, @last_seen_on)`,
    ),
    insertKey: db.prepare("INSERT INTO guardian_keys (key_hash, guardian_id) VALUES (?, ?)"),
    setBand: db.prepare("UPDATE guardians SET band = ?, math_step = 1, right_streak = 0, wrong_streak = 0 WHERE id = ?"),
    setNick: db.prepare("UPDATE guardians SET nick_adj = ?, nick_noun = ?, nick_tag = ? WHERE id = ?"),
    setRegion: db.prepare("UPDATE guardians SET region = ?, region_changed_on = ? WHERE id = ?"),
    setCode: db.prepare("UPDATE guardians SET code_hash = ? WHERE id = ?"),
    touch: db.prepare("UPDATE guardians SET last_seen_on = ? WHERE id = ?"),
    remove: db.prepare("DELETE FROM guardians WHERE id = ?"),
    unseenSince: db.prepare<[string], GuardianRow>("SELECT * FROM guardians WHERE last_seen_on <= ?"),
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
      band: input.band,
      region: input.region,
      region_picked_at: now,
      tower_type: input.towerType,
      last_seen_on: kstDate(now),
    });
    const guardian = get(id);
    regions.shiftPower(input.region, powerOf(guardian), 1, now);
    return { key: newKey(id), code, guardian };
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

  /** Changing the band starts its first step; points, level and tower stay (D26). */
  function setBand(id: string, band: MathBand): GuardianRow {
    q.setBand.run(band, id);
    return get(id);
  }

  function setNick(id: string, nick: Nick): GuardianRow {
    q.setNick.run(nick.adj, nick.noun, nick.tag, id);
    return get(id);
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
    regions.shiftPower(g.region, -p, -1, now);
    regions.shiftPower(region, p, 1, now);
    q.setRegion.run(region, kstDate(now), id);
    return { ok: true, guardian: get(id) };
  }

  /** "새 복구 코드 만들기": the old code stops working at once. */
  function newCode(id: string): RecoveryCode {
    const { code, hash } = freshCode();
    q.setCode.run(hash, id);
    return code;
  }

  /** "내 기록 지우기" and the 365-day clean-up: the row and its keys go, the power leaves from the next wave (D8, D76). */
  function remove(id: string, now: number): void {
    const g = get(id);
    regions.shiftPower(g.region, -powerOf(g), -1, now);
    q.remove.run(id);
  }

  function purgeInactive(now: number): number {
    const gone = q.unseenSince.all(addDays(kstDate(now), -INACTIVE_DAYS));
    gone.forEach((g) => remove(g.id, now));
    return gone.length;
  }

  return { byKey, codeExists, create, restore, touch, setBand, setNick, changeRegion, newCode, remove, purgeInactive };
}
