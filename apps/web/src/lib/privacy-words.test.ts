import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// D2: the region picker never asks where the child lives, and no screen reads the device location.
const srcDir = fileURLToPath(new URL("..", import.meta.url));

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx)$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [path] : [];
  });
}

describe("screen sources (D2)", () => {
  const files = sourceFiles(srcDir);

  it("finds the screen sources", () => {
    expect(files.some((f) => f.endsWith(join("start", "region", "page.tsx")))).toBe(true);
  });

  it.each(["주소", "사는 곳", "사는곳", "geolocation"])("never contain %s", (word) => {
    const hits = files.filter((f) => readFileSync(f, "utf8").includes(word));
    expect(hits).toEqual([]);
  });
});
