// How this browser reaches the game server (spec "서버와 호스팅", D77). Some school networks block the server's
// domain but not its IP address, where Caddy serves this server under /ktd (WebSocket too). When both are blocked the
// screens go through this site's /rt (src/proxy.ts), which passes requests on without WebSocket, so the socket stays on
// long polling there; that path is billed by Vercel, so it is the last resort. Same order as gojang's rt client.

export type RouteName = "domain" | "ip" | "proxy";
export type RtRoute = { name: RouteName; http: string; socketUrl: string; socketPath: string; pollingOnly: boolean };

/** The local game server of `pnpm dev:server`. */
export const DEV_SERVER = "http://127.0.0.1:4000";
export const PROXY_PATH = "/rt";
export const PROBE_TIMEOUT_MS = 3000;

/**
 * NEXT_PUBLIC_RT_URLS, inlined at build time: "<domain>,<IP path>", e.g.
 * "https://korea-tower-defence-rt.gyosil.app,https://13.124.90.119/ktd". With one address (development) the screens
 * use it as it is.
 */
export function rtAddresses(): { domain: string; ip: string | null } {
  const [domain, ip] = (process.env.NEXT_PUBLIC_RT_URLS ?? "").split(",").map((u) => u.trim().replace(/\/+$/, ""));
  return { domain: domain || DEV_SERVER, ip: ip || null };
}

/** HTTP base and socket.io address for a base URL that may carry a path prefix (/ktd, /rt). */
export function routeTo(name: RouteName, base: string): RtRoute {
  const url = new URL(base);
  const prefix = url.pathname.replace(/\/+$/, "");
  return { name, http: `${url.origin}${prefix}`, socketUrl: url.origin, socketPath: `${prefix}/socket.io`, pollingOnly: name === "proxy" };
}

/** Whether `base` answers /health in time (any answer, even an opaque one). */
function answers(base: string): Promise<boolean> {
  return fetch(`${base}/health`, { mode: "no-cors", cache: "no-store", signal: AbortSignal.timeout(PROBE_TIMEOUT_MS) }).then(
    () => true,
    () => false,
  );
}

/** Both addresses are asked at once (one after the other would be 6 s at worst); the domain wins, then the IP path. */
export async function chooseRoute(domain: string, ip: string, origin: string, reach = answers): Promise<RtRoute> {
  const direct = reach(domain);
  const byIp = reach(ip);
  if (await direct) return routeTo("domain", domain);
  if (await byIp) return routeTo("ip", ip);
  return routeTo("proxy", `${origin}${PROXY_PATH}`);
}

let looked: Promise<RtRoute> | null = null;

/** One look per page load; every request and socket of the page then goes the same way. */
export function rtRoute(): Promise<RtRoute> {
  const { domain, ip } = rtAddresses();
  if (!ip || typeof window === "undefined") return Promise.resolve(routeTo("domain", domain));
  looked ??= chooseRoute(domain, ip, window.location.origin);
  return looked;
}

/** Tests: look again. */
export const forgetRoute = () => void (looked = null);
