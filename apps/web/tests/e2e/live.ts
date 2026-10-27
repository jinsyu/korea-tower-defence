// Helpers for the region E2E (D23, D58, D77): a guardian on the test server, the play screen, and what the page showed.
import { expect, type APIRequestContext, type Page } from "@playwright/test";
import { E2E_GAME_SERVER, E2E_WEB } from "./env";

/** A fresh guardian of `region` on the test server; returns its device key. */
export async function newGuardian(request: APIRequestContext, region: string, tag = 1): Promise<string> {
  const res = await request.post(`${E2E_GAME_SERVER}/guardians`, {
    headers: { origin: E2E_WEB },
    data: { region, nick: { adj: 0, noun: 0, tag }, towerType: "splash" },
  });
  expect(res.status()).toBe(201);
  return (await res.json()).key;
}

export type Shown = { log: { start: number; text: string }[]; hud: string[] };

/**
 * Opens /play with the key, recording from the first paint every wave read-out line (with its wave start) and every
 * scoreboard wave value, so nothing the page showed between two looks is missed.
 */
export async function openPlay(page: Page, key: string) {
  await page.addInitScript((k) => {
    window.localStorage.setItem("ktd.v1.deviceKey", k);
    const shown = { log: [] as { start: number; text: string }[], hud: [] as string[] };
    (window as unknown as { __shown: typeof shown }).__shown = shown;
    new MutationObserver((records) => {
      for (const r of records) {
        r.addedNodes.forEach((n) => {
          if (n instanceof HTMLElement && n.parentElement?.dataset.slot === "wave-log") {
            shown.log.push({ start: Number(n.dataset.start), text: n.textContent ?? "" });
          }
        });
      }
      const hud = document.querySelector("[data-slot=hud-wave]")?.getAttribute("data-value");
      if (hud && hud !== shown.hud.at(-1)) shown.hud.push(hud);
    }).observe(document, { subtree: true, childList: true, attributes: true, attributeFilter: ["data-value"] });
  }, key);
  await page.goto("/play");
}

export const shown = (page: Page): Promise<Shown> => page.evaluate(() => (window as unknown as { __shown: Shown }).__shown);

export const hudWave = (page: Page) => page.locator("[data-slot=hud-wave]");
export const panel = (page: Page) => page.locator("[data-slot=math]");

/** The open problem's id once the panel shows one. */
export async function problemId(page: Page): Promise<string> {
  await expect(panel(page)).toHaveAttribute("data-problem", /.+/);
  return (await panel(page).getAttribute("data-problem"))!;
}

/** Press the first choice and see the server's marking ("정답!" or the solution). */
export async function answerFirst(page: Page) {
  await panel(page).locator("[data-choice='0']").click();
  await expect(panel(page).getByText("정답!", { exact: true }).or(panel(page).locator("[data-slot=math-solution]"))).toBeVisible();
}

/** "웨이브 12 막음" → { wave: 12, held: true } */
export function parseLine(text: string): { wave: number; held: boolean } {
  const m = text.match(/^웨이브 ([\d,]+) (막음|뚫림)/);
  if (!m) throw new Error(`not a wave line: ${text}`);
  return { wave: Number(m[1]!.replace(/,/g, "")), held: m[2] === "막음" };
}
