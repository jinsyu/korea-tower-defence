import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";

export type Config = {
  /** The one web origin allowed to call the server (spec "허용 Origin은 웹 주소 하나"). */
  allowedOrigin: string;
  /** Pepper for recovery code hashes. Must never change, or every recovery code stops working. */
  serverSecret: string;
  /** Key for the in-memory address HMAC used only by the hourly limits. */
  ipHmacKey: string;
  dbPath: string;
  /** Writes are batched in one transaction this often, and answered after the commit (T1 PoC). */
  flushMs: number;
};

const DEFAULT_DB_PATH = fileURLToPath(new URL("../data/ktd.db", import.meta.url));

export function configFromEnv(env: NodeJS.ProcessEnv = process.env): Config {
  const allowedOrigin = env.ALLOWED_ORIGIN?.trim();
  if (!allowedOrigin) throw new Error("ALLOWED_ORIGIN is not set (the web origin, e.g. http://localhost:3129)");
  const serverSecret = env.SESSION_SECRET ?? "";
  if (serverSecret.length < 32) throw new Error("SESSION_SECRET must be set to at least 32 characters");
  return {
    allowedOrigin,
    serverSecret,
    // The address HMAC lives only in memory, so a fresh random key per process is fine when none is given.
    ipHmacKey: env.IP_HMAC_KEY || randomBytes(32).toString("base64url"),
    dbPath: env.DB_PATH || DEFAULT_DB_PATH,
    flushMs: 50,
  };
}
