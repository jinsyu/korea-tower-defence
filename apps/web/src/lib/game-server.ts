// The game server API (apps/server). Screens call it with the device key; the server keeps everything else.
import { clearDeviceKeyIfStill, readDeviceKey } from "@/lib/device-key";
import { NICK_ADJECTIVES, NICK_NOUNS, type MathBand, type RecoveryCode, type Tendency, type TowerType } from "@ktd/core";

/** Nickname number from the server: adjective, noun and a 4-digit tag. */
export type Nick = { adj: number; noun: number; tag: number };

export type RegionChange = { allowed: true; nextOn: null } | { allowed: false; nextOn: string };

/** My guardian as the server sends it. Big numbers are decimal strings. */
export type ServerMe = {
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
};

export type Created = { key: string; code: RecoveryCode; me: ServerMe };

const DEV_SERVER = "http://127.0.0.1:4000";

/** First game server address. The full domain → IP → proxy order comes with deployment (T20). */
export function gameServerUrl(): string {
  const listed = (process.env.NEXT_PUBLIC_RT_URLS ?? "").split(",").map((u) => u.trim());
  return listed.find(Boolean) ?? DEV_SERVER;
}

export type ServerReply<T> =
  | { ok: true; status: number; data: T }
  /** status 0: the server could not be reached. */
  | { ok: false; status: number; data: Record<string, unknown> };

export async function callServer<T>(
  path: string,
  { method = "GET", body, key }: { method?: string; body?: unknown; key?: string | null } = {},
): Promise<ServerReply<T>> {
  const headers: Record<string, string> = {};
  if (key) headers.authorization = `Bearer ${key}`;
  if (body !== undefined) headers["content-type"] = "application/json";
  let res: Response;
  try {
    res = await fetch(gameServerUrl() + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  } catch {
    return { ok: false, status: 0, data: {} };
  }
  const text = await res.text().catch(() => "");
  let data: unknown = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = {};
  }
  return res.ok ? { ok: true, status: res.status, data: data as T } : { ok: false, status: res.status, data: data as Record<string, unknown> };
}

/**
 * A request as my guardian, with this device's key. Every screen that acts as me goes through here: a 401 means the
 * server no longer knows the key (deleted on another device, cleaned up, made up), so the key is dropped (D6).
 * No key at all answers the same 401. Recovery-code tries are not sent through here: their 401 is a wrong code.
 */
export async function callAsGuardian<T>(path: string, opts: { method?: string; body?: unknown } = {}): Promise<ServerReply<T>> {
  const key = readDeviceKey();
  if (!key) return { ok: false, status: 401, data: { error: "no_guardian" } };
  const res = await callServer<T>(path, { ...opts, key });
  // Restore or a new guardian may have stored another key while this request was on its way.
  if (res.status === 401) clearDeviceKeyIfStill(key);
  return res;
}

export const NO_GUARDIAN_TEXT = "이 기기에는 지킴이가 없어요. 처음 하기나 복구 코드로 이어 하기를 먼저 해 주세요.";

export const nickName = (n: Nick): string => `${NICK_ADJECTIVES[n.adj] ?? ""} ${NICK_NOUNS[n.noun] ?? ""}`;
export const nickTag = (n: Nick): string => String(n.tag).padStart(4, "0");

/** "2026-11-26" → "11월 26일" */
export function dayLabel(date: string): string {
  const [, m, d] = date.split("-");
  return `${Number(m)}월 ${Number(d)}일`;
}

export const OFFLINE_TEXT = "게임 서버에 닿지 않아요. 잠시 뒤에 다시 해요.";
