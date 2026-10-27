// Lint config for apps/server and packages/*. apps/web has its own Next.js config.
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import { defineConfig, globalIgnores } from "eslint/config";

export default defineConfig([
  globalIgnores(["apps/web/**", "poc/**", "**/node_modules/**", "**/dist/**"]),
  js.configs.recommended,
  ...tseslint.configs.recommended,
]);
