// E2E game server (run by Playwright, node strips the types): the real server of apps/server on the fast test clock,
// plus a control port so one test can kill it hard and start it again (D57, D58). Stops the server when it stops.
import { spawn, type ChildProcess } from "node:child_process";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";

const serverDir = fileURLToPath(new URL("../../../server/", import.meta.url));
const health = `http://${process.env.HOST}:${process.env.PORT}/health`;
const controlPort = Number(process.env.CONTROL_PORT);
let child: ChildProcess | null = null;

function start() {
  child = spawn(process.execPath, ["--import", "tsx", "src/main.ts"], { cwd: serverDir, env: process.env, stdio: "inherit" });
}

async function healthy(): Promise<void> {
  for (let i = 0; i < 150; i++) {
    if (await fetch(health).then((r) => r.ok, () => false)) return;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error("game server did not come back");
}

function kill(): Promise<void> {
  return new Promise((resolve) => {
    const c = child;
    child = null;
    if (!c || c.exitCode !== null) return resolve();
    c.once("exit", () => resolve());
    c.kill("SIGKILL");
  });
}

start();

createServer((req, res) => {
  const done = (status: number) => res.writeHead(status).end();
  if (req.method !== "POST") return done(404);
  if (req.url === "/kill") return void kill().then(() => done(204));
  if (req.url === "/start") {
    if (!child) start();
    return void healthy().then(() => done(204), () => done(500));
  }
  done(404);
}).listen(controlPort, "127.0.0.1");

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    child?.kill("SIGKILL");
    process.exit(0);
  });
}
