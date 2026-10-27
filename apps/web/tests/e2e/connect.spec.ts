// D77: the connection order with faked blocks (domain → IP path → this site's /rt proxy); each way must deal and mark
// problems and carry the region broadcast. D58: the server is killed and started again (runs alone, last: @restart).
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { E2E_GAME_SERVER, E2E_IP_GATE, E2E_SERVER_CONTROL, E2E_WEB } from "./env";
import { answerFirst, hudWave, newGuardian, openPlay, panel, problemId, shown } from "./live";

const DOMAIN = new URL(E2E_GAME_SERVER).host;
const IP_GATE = new URL(E2E_IP_GATE).host;

/** Requests and sockets from the page to `host` fail, as on a school network that blocks it. */
async function block(page: Page, host: string) {
  await page.route(`http://${host}/**`, (route) => route.abort("blockedbyclient"));
  await page.routeWebSocket((url) => url.host === host, (ws) => ws.close());
}

/** Where the page's socket went: its WebSocket address, or long-polling requests through /rt. */
function watchSocket(page: Page) {
  const sockets: string[] = [];
  page.on("websocket", (ws) => sockets.push(ws.url()));
  page.on("request", (req) => {
    if (req.url().startsWith(`${E2E_WEB}/rt/socket.io`)) sockets.push(req.url());
  });
  return sockets;
}

const health = async (request: APIRequestContext) => (await (await request.get(`${E2E_GAME_SERVER}/health`)).json()).sockets;

/** Problems are dealt and marked, and the region broadcast keeps coming (a resolved wave read out). */
async function playsThrough(page: Page) {
  await problemId(page);
  await page.waitForTimeout(1200);
  await answerFirst(page);
  await expect(hudWave(page)).toHaveAttribute("data-value", /^\d/);
  await expect.poll(async () => (await shown(page)).log.length, { timeout: 10_000 }).toBeGreaterThanOrEqual(2);
}

const REGION: Record<string, string> = { "mobile-360": "11040", "desktop-1440": "11050" };

test.describe("D77: connection order", () => {
  test("the domain when it answers", async ({ page, request }, info) => {
    const sockets = watchSocket(page);
    await openPlay(page, await newGuardian(request, REGION[info.project.name]!));
    await playsThrough(page);
    expect(sockets.some((u) => u.startsWith(`ws://${DOMAIN}/socket.io/`))).toBe(true);
    expect(sockets.every((u) => !u.includes(IP_GATE) && !u.includes("/rt/"))).toBe(true);
  });

  test("the IP path (/ktd/socket.io, WebSocket) when only the domain is blocked", async ({ page, request }, info) => {
    await block(page, DOMAIN);
    const sockets = watchSocket(page);
    await openPlay(page, await newGuardian(request, REGION[info.project.name]!));
    await playsThrough(page);
    expect(sockets.some((u) => u.startsWith(`ws://${IP_GATE}/ktd/socket.io/`))).toBe(true);
    expect(sockets.every((u) => !u.includes(DOMAIN))).toBe(true);
    expect((await health(request)).ip).toBeGreaterThanOrEqual(1);
  });

  test("this site's /rt proxy (long polling) when both are blocked", async ({ page, request }, info) => {
    await block(page, DOMAIN);
    await block(page, IP_GATE);
    const sockets = watchSocket(page);
    await openPlay(page, await newGuardian(request, REGION[info.project.name]!));
    await playsThrough(page);
    expect(sockets.length).toBeGreaterThan(0);
    expect(sockets.every((u) => u.startsWith(`${E2E_WEB}/rt/socket.io`) && u.includes("transport=polling"))).toBe(true);
    expect((await health(request)).proxy).toBeGreaterThanOrEqual(1);
  });
});

const control = (request: APIRequestContext, what: "kill" | "start") => request.post(`${E2E_SERVER_CONTROL}/${what}`, { timeout: 30_000 });

test("D58: the notice within 3 s and locked choices when the server goes down; the same open problem when it is back @restart", async ({
  page,
  request,
}) => {
  test.setTimeout(120_000);
  // Three new towers (power 30) hold up to wave 14: once past 11 the region stays between 10 and 15.
  const key = await newGuardian(request, "11060");
  await newGuardian(request, "11060", 2);
  await newGuardian(request, "11060", 3);
  await openPlay(page, key);
  const id = await problemId(page);
  const wave = async () => Number(((await hudWave(page).getAttribute("data-value")) ?? "0").replace(/,/g, "")) || 0;
  await expect.poll(wave, { timeout: 60_000 }).toBeGreaterThanOrEqual(12);
  const notice = page.getByText("중계 연결이 끊겼어요, 다시 잇는 중");
  await expect(notice).toBeHidden();

  expect((await control(request, "kill")).status()).toBe(204);
  const killed = Date.now();
  await expect(notice).toBeVisible({ timeout: 3000 });
  expect(Date.now() - killed).toBeLessThanOrEqual(3000);
  for (const choice of await panel(page).locator("[data-choice]").all()) await expect(choice).toBeDisabled();

  expect((await control(request, "start")).status()).toBe(204);
  await expect(notice).toBeHidden({ timeout: 15_000 });
  await expect(panel(page)).toHaveAttribute("data-problem", id);
  await expect(panel(page).locator("[data-choice='0']")).toBeEnabled();
  // The region went on from its stored time (D57): waves keep coming and the wave never went back to the start.
  const linesBefore = (await shown(page)).log.length;
  await expect.poll(async () => (await shown(page)).log.length, { timeout: 10_000 }).toBeGreaterThan(linesBefore + 1);
  const after = (await shown(page)).hud.filter((v) => /^\d/.test(v)).map(Number);
  expect(Math.min(...after.slice(after.findIndex((w) => w >= 12)))).toBeGreaterThanOrEqual(10);
  await page.waitForTimeout(1200);
  await answerFirst(page);
});
