import { expect, test } from "@playwright/test";

test("Strategy Lab renders the complete mental model for a spectator", async ({ page }) => {
  await page.goto("/?demo=act2&contract=match_1x2");
  await expect(page.getByRole("heading", { name: "What happened?" })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("heading", { name: "What does the desk infer?" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "What will each strategy do?" })).toBeVisible();
  await expect(page.getByText("REPLAY", { exact: true })).toBeVisible();
  await expect(page.getByText("SIMULATED", { exact: true })).toBeVisible();
  await expect(page.getByText(/^Spectator$/i)).toBeVisible();
  await expect(page.locator(".stance-row")).toHaveCount(7);

  const mutation = await page.request.post("/api/session", { data: { action: "start", options: { mode: "simulation" } } });
  expect(mutation.status()).toBe(401);
  expect((await mutation.json()).error.code).toBe("CONTROL_KEY_REQUIRED");
});

test("operator can start simulation from the linkable Advanced workspace", async ({ page }) => {
  await page.goto("/?advanced=operator");
  await expect(page.locator(".advanced-drawer")).toHaveClass(/is-open/);
  await page.getByPlaceholder("shared control key").fill("e2e-control");
  await page.locator("select").filter({ has: page.locator('option[value="live"]') }).selectOption("simulation");
  await page.getByRole("button", { name: /Start/ }).click();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("heading", { name: "What happened?" })).toBeVisible({ timeout: 15_000 });

  const api = await page.request.get("/api/horizon");
  expect(api.ok()).toBeTruthy();
  const json = await api.json();
  expect(Object.values(json.horizon.current.probabilities).reduce((sum: number, value) => sum + Number(value), 0)).toBeCloseTo(1, 10);
  const scoped = await page.request.get(`/api/fixtures/${json.fixture.id}/horizon`);
  expect(scoped.ok()).toBeTruthy();
  const mismatch = await page.request.get("/api/fixtures/not-active/horizon");
  expect(mismatch.status()).toBe(409);
});

test("Act II shows the goal through Observation, Analysis collapse, and Arena PnL", async ({ page }) => {
  await page.goto("/?demo=act2&contract=match_1x2");
  await expect(page.locator(".scoreline")).toContainText("1–0", { timeout: 25_000 });
  await expect(page.locator(".collapse-manifest")).toBeVisible({ timeout: 25_000 });
  await expect(page.locator(".arena-row").filter({ hasText: /[+-]\d/ }).first()).toBeVisible();
  await expect(page.locator(".event-pulse").filter({ hasText: /Goal/ }).first()).toBeVisible();
});

test("contract focus and Advanced state persist in the URL and support keyboard operation", async ({ page }) => {
  await page.goto("/?demo=act2&contract=match_1x2");
  const selected = page.getByRole("tab", { name: /Match 1X2/ });
  await selected.focus();
  await page.keyboard.press("ArrowRight");
  await expect(page).toHaveURL(/contract=ou_25/);
  await expect(page.getByRole("tab", { name: /O\/U 2.5/ })).toHaveAttribute("aria-selected", "true");

  await page.getByRole("button", { name: "Advanced" }).click();
  await page.getByRole("tab", { name: "Proofs" }).click();
  await expect(page).toHaveURL(/advanced=proofs/);
  await page.keyboard.press("Escape");
  await expect(page).not.toHaveURL(/advanced=/);
});

test("mobile is spectator-first without horizontal page overflow", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/?demo=act2&contract=match_1x2");
  const dimensions = await page.evaluate(() => ({ body: document.body.scrollWidth, viewport: window.innerWidth }));
  expect(dimensions.body).toBe(dimensions.viewport);
  await expect(page.getByRole("heading", { name: "What happened?" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "What does the desk infer?" })).toBeAttached();
  await expect(page.getByRole("heading", { name: "What will each strategy do?" })).toBeAttached();
});
