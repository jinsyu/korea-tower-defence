import { afterEach, describe, expect, it, vi } from "vitest";
import { readDeviceKey, saveDeviceKey } from "./device-key";
import { callAsGuardian, dayLabel, nickName, nickTag, type ServerMe } from "./game-server";
import { regionName } from "./region-names";
import { meFromServer } from "./stage/me-store";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

/** A localStorage stand-in and a fetch whose answer the test releases. */
function fakeBrowser() {
  const store = new Map<string, string>();
  vi.stubGlobal("window", {
    localStorage: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    },
  });
  // The request leaves after the connection order is known: an answer given before it is kept until it leaves.
  let reply: Promise<Response> | null = null;
  let answer: (res: Response) => void = () => undefined;
  const replied = new Promise<Response>((resolve) => (answer = resolve));
  vi.stubGlobal("fetch", () => (reply ??= replied));
  return { answer: (status: number) => answer(new Response(JSON.stringify({ error: "no_guardian" }), { status })) };
}

describe("requests as my guardian (D6)", () => {
  it("drops the key the server no longer knows", async () => {
    const browser = fakeBrowser();
    saveDeviceKey("old-key");
    const call = callAsGuardian("/me");
    browser.answer(401);
    expect((await call).status).toBe(401);
    expect(readDeviceKey()).toBeNull();
  });

  it("keeps a newer key stored while an old key's request was on its way", async () => {
    const browser = fakeBrowser();
    saveDeviceKey("old-key");
    const call = callAsGuardian("/me");
    // Restore or a new guardian stores another key before the late 401 arrives.
    saveDeviceKey("new-key");
    browser.answer(401);
    await call;
    expect(readDeviceKey()).toBe("new-key");
  });
});

describe("game server client", () => {
  it("shows nickname numbers as list words and a 4-digit tag", () => {
    expect(nickName({ adj: 0, noun: 0, tag: 427 })).toBe("씩씩한 수달");
    expect(nickTag({ adj: 0, noun: 0, tag: 7 })).toBe("0007");
  });

  it("shows the next region change day as month and day (D7)", () => {
    expect(dayLabel("2026-11-26")).toBe("11월 26일");
    expect(dayLabel("2027-01-05")).toBe("1월 5일");
    expect(regionName("11010")).toBe("종로구");
  });
});

describe("my guardian from the server", () => {
  it("fills the one store with the server's values", () => {
    const server: ServerMe = {
      nick: { adj: 0, noun: 0, tag: 427 },
      name: "씩씩한 수달",
      tag: "0427",
      band: "34",
      region: "11010",
      regionChange: { allowed: true, nextOn: null },
      towerType: "splash",
      tendency: "luck",
      color: 2,
      level: "6",
      points: "1234",
      wallet: "7",
      stage: "12",
      power: "20",
      rid: "AbCdEfGhIjKl",
      points24h: 36,
    };
    expect(meFromServer(server)).toMatchObject({
      id: "AbCdEfGhIjKl",
      pts24: 36,
      nick: "씩씩한 수달",
      tag: "0427",
      band: "34",
      region: "11010",
      type: "splash",
      stance: "luck",
      pal: 2,
      level: 6,
      xp: 1234,
      wallet: 7,
      step: 12,
    });
  });
});
