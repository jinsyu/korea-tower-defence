import { createGameServer } from "./app";
import { configFromEnv } from "./config";

const port = Number(process.env.PORT ?? 4000);
const host = process.env.HOST ?? "127.0.0.1";

const server = createGameServer({ config: configFromEnv() });
await server.maintenance();
server.httpServer.listen(port, host, () => {
  console.log(`game server listening on http://${host}:${port}`);
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    server.close().then(
      () => process.exit(0),
      (err: unknown) => {
        console.error(err);
        process.exit(1);
      },
    );
  });
}
