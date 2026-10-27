// E2E stand-in for the server's Caddy IP site (run by Playwright, node strips the types): GATE_PREFIX/* goes to the
// game server with the prefix taken off, WebSocket upgrades too, so the screens' second way (D77) is real.
import { createServer, request, type IncomingMessage } from "node:http";
import { connect } from "node:net";

const target = new URL(process.env.GATE_TARGET!);
const prefix = process.env.GATE_PREFIX!;
const port = Number(process.env.GATE_PORT);

const strip = (req: IncomingMessage): string | null =>
  req.url?.startsWith(`${prefix}/`) ? req.url.slice(prefix.length) : null;

const gate = createServer((req, res) => {
  const path = strip(req);
  if (path === null) return void res.writeHead(404).end();
  const out = request({ host: target.hostname, port: target.port, method: req.method, path, headers: req.headers }, (up) => {
    res.writeHead(up.statusCode ?? 502, up.headers);
    up.pipe(res);
  });
  out.on("error", () => res.writeHead(502).end());
  req.pipe(out);
});

gate.on("upgrade", (req, socket, head) => {
  const path = strip(req);
  if (path === null) return socket.destroy();
  const up = connect(Number(target.port), target.hostname, () => {
    const lines = [`${req.method} ${path} HTTP/1.1`, ...Object.entries(req.headers).map(([k, v]) => `${k}: ${v}`)];
    up.write(`${lines.join("\r\n")}\r\n\r\n`);
    up.write(head);
    up.pipe(socket);
    socket.pipe(up);
  });
  up.on("error", () => socket.destroy());
  socket.on("error", () => up.destroy());
});

// "localhost" may be either address family in the browser.
gate.listen(port, "127.0.0.1");
createServer()
  .on("request", (req, res) => gate.emit("request", req, res))
  .on("upgrade", (req, s, h) => gate.emit("upgrade", req, s, h))
  .on("error", () => undefined)
  .listen(port, "::1");
