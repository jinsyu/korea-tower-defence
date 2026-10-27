import type { AddressInfo } from "node:net";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { io as connect, type Socket } from "socket.io-client";
import { createGameServer, type GameServer } from "./app";

describe("game server skeleton", () => {
  let server: GameServer;
  let baseUrl: string;
  let client: Socket | undefined;

  beforeEach(async () => {
    server = createGameServer();
    await new Promise<void>((resolve) => server.httpServer.listen(0, "127.0.0.1", resolve));
    const { port } = server.httpServer.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${port}`;
  });

  afterEach(async () => {
    client?.disconnect();
    await server.close();
  });

  it("answers /health with 200 and ok status", async () => {
    const res = await fetch(`${baseUrl}/health`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it("answers unknown paths with 404", async () => {
    const res = await fetch(`${baseUrl}/nope`);
    expect(res.status).toBe(404);
  });

  it("accepts a socket.io websocket connection", async () => {
    client = connect(baseUrl, { transports: ["websocket"] });
    await new Promise<void>((resolve, reject) => {
      client!.on("connect", resolve);
      client!.on("connect_error", reject);
    });
    expect(client.connected).toBe(true);
  });
});
