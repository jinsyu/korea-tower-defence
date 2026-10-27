// /rt passes requests on to the game server for schools that block both its domain and its IP address (the third
// way of the connection order, src/lib/rt-route.ts, D77). Vercel rewrites without WebSocket, so the socket stays on
// long polling here. Same-origin polling sends no Origin, but it is this site's, so it is set for the server's check.
// The client address for the server's hourly limits and a shared secret header come with deployment (T20).
import { type NextRequest, NextResponse } from "next/server";
import { PROXY_PATH } from "@/lib/rt-route";

export function proxy(request: NextRequest) {
  const target = (process.env.NEXT_PUBLIC_RT_URLS ?? "").split(",")[0]?.trim().replace(/\/+$/, "");
  const rest = request.nextUrl.pathname.slice(PROXY_PATH.length);
  // Only /rt itself and paths under it: "/rt@evil.com" would otherwise change the host of the target URL.
  if (!target || (rest !== "" && !rest.startsWith("/"))) return new NextResponse(null, { status: 404 });
  // The socket path has no trailing slash on this side (Next.js would redirect it away); the server wants one.
  const url = new URL(`${target}${rest === "/socket.io" ? "/socket.io/" : rest}${request.nextUrl.search}`);
  const headers = new Headers(request.headers);
  if (!headers.has("origin")) headers.set("origin", request.nextUrl.origin);
  return NextResponse.rewrite(url, { request: { headers } });
}

export const config = { matcher: "/rt/:path*" };
