import { createServer, type Server as HttpServer } from "node:http";
import { Server as SocketServer } from "socket.io";

export type GameServer = {
  httpServer: HttpServer;
  io: SocketServer;
  close: () => Promise<void>;
};

export function createGameServer(): GameServer {
  const httpServer = createServer((req, res) => {
    if (req.method === "GET" && req.url === "/health") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: true }));
      return;
    }
    res.writeHead(404).end();
  });
  const io = new SocketServer(httpServer);

  const close = () =>
    new Promise<void>((resolve, reject) => {
      io.close((err) => (err ? reject(err) : resolve()));
    });

  return { httpServer, io, close };
}
