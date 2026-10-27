import { afterEach, describe, expect, it, vi } from "vitest";
import { chooseRoute, DEV_SERVER, forgetRoute, routeTo, rtAddresses, rtRoute } from "./rt-route";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  forgetRoute();
});

const DOMAIN = "https://korea-tower-defence-rt.gyosil.app";
const IP = "https://13.124.90.119/ktd";
const SITE = "https://korea-tower-defence.vercel.app";

describe("connection order (D77)", () => {
  it("reads the domain and the IP path from NEXT_PUBLIC_RT_URLS, or the local dev server", () => {
    vi.stubEnv("NEXT_PUBLIC_RT_URLS", ` ${DOMAIN}/ , ${IP}`);
    expect(rtAddresses()).toEqual({ domain: DOMAIN, ip: IP });
    vi.stubEnv("NEXT_PUBLIC_RT_URLS", "");
    expect(rtAddresses()).toEqual({ domain: DEV_SERVER, ip: null });
  });

  it("puts the socket under the IP path and the proxy path", () => {
    expect(routeTo("domain", DOMAIN)).toEqual({ name: "domain", http: DOMAIN, socketUrl: DOMAIN, socketPath: "/socket.io", pollingOnly: false });
    expect(routeTo("ip", IP)).toEqual({ name: "ip", http: IP, socketUrl: "https://13.124.90.119", socketPath: "/ktd/socket.io", pollingOnly: false });
    expect(routeTo("proxy", `${SITE}/rt`)).toMatchObject({ socketUrl: SITE, socketPath: "/rt/socket.io", pollingOnly: true });
  });

  it("takes the domain when it answers, the IP path when only the domain is blocked, else the proxy", async () => {
    const reach = (ok: string[]) => (base: string) => Promise.resolve(ok.includes(base));
    expect((await chooseRoute(DOMAIN, IP, SITE, reach([DOMAIN, IP]))).name).toBe("domain");
    expect((await chooseRoute(DOMAIN, IP, SITE, reach([IP]))).name).toBe("ip");
    expect(await chooseRoute(DOMAIN, IP, SITE, reach([]))).toMatchObject({ name: "proxy", http: `${SITE}/rt` });
  });

  it("asks both addresses at once, not one after the other", async () => {
    const asked: string[] = [];
    let release: (ok: boolean) => void = () => undefined;
    const pending = chooseRoute(DOMAIN, IP, SITE, (base) => {
      asked.push(base);
      return base === DOMAIN ? new Promise((r) => (release = r)) : Promise.resolve(true);
    });
    expect(asked).toEqual([DOMAIN, IP]);
    release(false);
    expect((await pending).name).toBe("ip");
  });

  it("looks once per page load, and not at all with one address", async () => {
    vi.stubEnv("NEXT_PUBLIC_RT_URLS", `${DOMAIN},${IP}`);
    vi.stubGlobal("window", { location: { origin: SITE } });
    const fetches = vi.fn(() => Promise.reject(new Error("blocked")));
    vi.stubGlobal("fetch", fetches);
    expect((await rtRoute()).name).toBe("proxy");
    expect((await rtRoute()).name).toBe("proxy");
    expect(fetches).toHaveBeenCalledTimes(2);
    forgetRoute();
    vi.stubEnv("NEXT_PUBLIC_RT_URLS", DOMAIN);
    expect((await rtRoute()).name).toBe("domain");
    expect(fetches).toHaveBeenCalledTimes(2);
  });
});
