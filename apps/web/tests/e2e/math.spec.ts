// Problems from the game server on the defence screen (T12): D32, D33, D34, D48.
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { E2E_GAME_SERVER, E2E_WEB } from "./env";

/** A fresh guardian on the test server; its device key goes into the page's storage before the app starts. */
async function newGuardian(request: APIRequestContext): Promise<string> {
  const res = await request.post(`${E2E_GAME_SERVER}/guardians`, {
    headers: { origin: E2E_WEB },
    data: { region: "11010", nick: { adj: 0, noun: 0, tag: 1 }, towerType: "splash" },
  });
  expect(res.status()).toBe(201);
  return (await res.json()).key;
}

async function openPlay(page: Page, key: string) {
  await page.addInitScript((k) => window.localStorage.setItem("ktd.v1.deviceKey", k), key);
  await page.goto("/play");
}

const panel = (page: Page) => page.locator("[data-slot=math]");
const expr = (page: Page) => page.locator("[data-slot=math-expr] > span[aria-hidden]");
const nextButton = (page: Page) => panel(page).getByRole("button", { name: "다음 문제" });
const stamp = (page: Page) => panel(page).getByText("정답!", { exact: true });

/** The open problem's id once the panel shows one. */
async function problemId(page: Page): Promise<string> {
  await expect(panel(page)).toHaveAttribute("data-problem", /.+/);
  return (await panel(page).getAttribute("data-problem"))!;
}

async function waitForNewProblem(page: Page, old: string, timeout: number) {
  await page.waitForFunction((id) => {
    const now = document.querySelector("[data-slot=math]")?.getAttribute("data-problem");
    return !!now && now !== id;
  }, old, { timeout });
}

/** Press the first choice and wait for the server's marking. */
async function answerFirst(page: Page): Promise<boolean> {
  await panel(page).locator("[data-choice='0']").click();
  const wrong = panel(page).locator("[data-slot=math-solution]");
  await expect(stamp(page).or(wrong)).toBeVisible();
  return stamp(page).isVisible();
}

const me = async (request: APIRequestContext, key: string) =>
  (await (await request.get(`${E2E_GAME_SERVER}/me`, { headers: { origin: E2E_WEB, authorization: `Bearer ${key}` } })).json()).me;

// Pressing the first choice is mostly wrong, so the guardian stays on the 36-expression levels (2·5·3·4단 or 6·7·8·9단):
// an expression comes back no sooner than 36 problems later, i.e. never within the last min(50, 36 − 1) = 35.
// The rule itself is tested on the server (apps/server/src/math.test.ts, "repeats a level of 36", "last 50").
const NO_REPEAT_WITHIN = 35;
test("D32: 100 problems in a row, each new one in time, the same one after a reload, no recent one again", async ({ page, request }) => {
  test.setTimeout(240_000);
  await openPlay(page, await newGuardian(request));
  const first = await problemId(page);
  const firstExpr = await expr(page).textContent();
  await page.reload();
  expect(await problemId(page)).toBe(first);
  await expect(expr(page)).toHaveText(firstExpr!);

  const seen: string[] = [];
  for (let n = 0; n < 100; n++) {
    const id = await problemId(page);
    const text = (await expr(page).textContent())!;
    expect(seen.slice(-NO_REPEAT_WITHIN), `problem ${n + 1} repeats a recent expression`).not.toContain(text);
    seen.push(text);
    const correct = await answerFirst(page);
    const at = Date.now();
    if (correct) {
      // Right: the next problem comes by itself after 0.8 s.
      await waitForNewProblem(page, id, 1800);
      expect(Date.now() - at).toBeGreaterThanOrEqual(700);
    } else {
      // Wrong: "다음 문제", then a new problem within 1 s.
      await nextButton(page).click();
      await waitForNewProblem(page, id, 1000);
    }
  }
  expect(seen).toHaveLength(100);
});

test("D33: problem responses carry no answer; the answer comes only with the marking", async ({ page, request }) => {
  const problems: unknown[] = [];
  const marks: Record<string, unknown>[] = [];
  page.on("response", async (res) => {
    const path = new URL(res.url()).pathname;
    if (!res.url().startsWith(E2E_GAME_SERVER) || res.request().method() === "OPTIONS") return;
    if (path === "/math/problem") problems.push(await res.json());
    if (path === "/math/answer") marks.push(await res.json());
  });
  await openPlay(page, await newGuardian(request));
  for (let n = 0; n < 5; n++) {
    const id = await problemId(page);
    if (!(await answerFirst(page))) await nextButton(page).click();
    await waitForNewProblem(page, id, 2000);
  }
  await expect.poll(() => problems.length).toBeGreaterThanOrEqual(6);
  const keysOf = (v: unknown): string[] =>
    v && typeof v === "object" ? Object.entries(v).flatMap(([k, x]) => [k, ...keysOf(x)]) : [];
  for (const body of problems) {
    for (const banned of ["answer", "solution", "values", "seed", "correct"]) expect(keysOf(body)).not.toContain(banned);
  }
  expect(marks).toHaveLength(5);
  for (const m of marks) expect(m).toHaveProperty("answer");
});

test("D34, D48: a right answer adds 10 to points and wallet and upgrades the tower; a wrong one keeps everything and its marks", async ({
  page,
  request,
}) => {
  test.setTimeout(180_000);
  const key = await newGuardian(request);
  await openPlay(page, key);
  await expect(page.locator("[data-slot=me-step]")).toContainText("1");
  let sawWrong = false;
  let sawRight = false;
  for (let tries = 0; tries < 40 && !(sawWrong && sawRight); tries++) {
    const id = await problemId(page);
    // Think for more than a second (no too-fast answer) and slow enough never to look like guessing.
    await page.waitForTimeout(3100);
    // My numbers before the press, so a wrong answer is shown to change none of them.
    const before = await me(request, key);
    if (await answerFirst(page)) {
      if (!sawRight) {
        await expect(panel(page)).toContainText("+10P");
        await expect(page.getByText("내 타워 2단계!")).toBeVisible();
        await expect(page.locator("[data-slot=me-step]")).toContainText("2");
        expect(await me(request, key)).toMatchObject({ points: "10", wallet: "0", stage: "2" });
        sawRight = true;
      }
      await waitForNewProblem(page, id, 2000);
      continue;
    }
    if (!sawWrong) {
      await expect(panel(page).getByText("✕ 내가 고른 답")).toBeVisible();
      await expect(panel(page).getByText("정답", { exact: true })).toBeVisible();
      // The marks and the solution stay until "다음 문제".
      await page.waitForTimeout(1500);
      await expect(panel(page).locator("[data-slot=math-solution]")).toBeVisible();
      await expect(panel(page).getByText("✕ 내가 고른 답")).toBeVisible();
      expect(await me(request, key)).toEqual(before);
      sawWrong = true;
    }
    await nextButton(page).click();
    await waitForNewProblem(page, id, 1000);
  }
  expect(sawRight && sawWrong).toBe(true);
});
