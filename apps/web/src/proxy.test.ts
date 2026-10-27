import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { proxy } from "./proxy";

const rewriteTo = (res: Response) => res.headers.get("x-middleware-rewrite");

describe("the /rt proxy (D77)", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("passes /rt and /rt/... on to the game server", () => {
    vi.stubEnv("NEXT_PUBLIC_RT_URLS", "https://rt.example.kr,http://1.2.3.4/ktd");
    expect(rewriteTo(proxy(new NextRequest("https://site.kr/rt/socket.io?EIO=4")))).toBe("https://rt.example.kr/socket.io/?EIO=4");
    expect(rewriteTo(proxy(new NextRequest("https://site.kr/rt/health")))).toBe("https://rt.example.kr/health");
    expect(rewriteTo(proxy(new NextRequest("https://site.kr/rt")))).toBe("https://rt.example.kr/");
  });

  it.each(["/rt.json", "/rtx", "/rt@evil.com"])("answers 404 for %s", (path) => {
    vi.stubEnv("NEXT_PUBLIC_RT_URLS", "https://rt.example.kr");
    const res = proxy(new NextRequest(`https://site.kr${path}`));
    expect(res.status).toBe(404);
    expect(rewriteTo(res)).toBeNull();
  });
});
