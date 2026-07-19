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
  await expect(page.locator('.lab-rail--analysis .chart-timeframe button[aria-pressed="true"]')).toHaveText("15m");
  await expect(page.locator('.lab-rail--strategy .chart-timeframe button[aria-pressed="true"]')).toHaveText("15m");

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
  const started = await page.request.get("/api/session");
  expect((await started.json()).provenance).toBe("simulation");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("heading", { name: "Waiting for the next covered fixture" })).toBeVisible();
  await page.getByRole("button", { name: "Demo" }).click();
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

test("rail detail drawers are linkable, keyboard-dismissible, and exclusive with Advanced", async ({ page }) => {
  await page.goto("/?demo=act2&contract=match_1x2&rail=observe&advanced=proofs");

  await expect(page.getByRole("dialog", { name: "Observe details" })).toBeVisible({ timeout: 15_000 });
  await expect(page).toHaveURL(/rail=observe/);
  await expect(page).not.toHaveURL(/advanced=/);
  await expect(page.locator(".advanced-drawer:not(.rail-detail-drawer)")).not.toHaveClass(/is-open/);
  await expect(page.getByRole("heading", { name: "Market movement" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Full tick diagnostics" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Change ledger" })).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(page).not.toHaveURL(/rail=/);

  await page.getByRole("button", { name: "Expand Interpret details" }).click();
  const interpret = page.getByRole("dialog", { name: "Interpret details" });
  await expect(interpret).toBeVisible();
  await expect(page).toHaveURL(/rail=interpret/);
  await expect(interpret.getByRole("heading", { name: "Strategy pretext" })).toBeVisible();
  await expect(interpret.getByRole("heading", { name: "Contract-wise analysis" })).toBeVisible();
  await expect(interpret.getByRole("heading", { name: "Selected contract path" })).toBeVisible();
  await expect(interpret.getByRole("heading", { name: "Driver decomposition" })).toBeVisible();
  await expect(interpret.getByRole("tab")).toHaveCount(0);
  await expect(interpret.getByRole("button", { name: "15m", exact: true }).first()).toHaveAttribute("aria-pressed", "true");
  await expect(page).toHaveURL(/contract=match_1x2/);

  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Expand Act details" }).click();
  await expect(page.getByRole("dialog", { name: "Act details" })).toBeVisible();
  await expect(page).toHaveURL(/rail=act/);
  await expect(page.getByRole("heading", { name: "Decision board" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Fill tape" })).toBeVisible();

  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Advanced" }).click();
  await expect(page).toHaveURL(/advanced=proofs/);
  await expect(page).not.toHaveURL(/rail=/);

  await page.goto("/?rail=interpret");
  await page.getByRole("button", { name: "Close Interpret details" }).click();
  await expect(page.locator(".strategy-lab-shell")).toBeVisible();
  await expect(page).toHaveURL(/lab=live/);
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

test("Live Watchtower separates viewer connectivity from upstream fixture flow", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /Waiting for the next covered fixture|Preparing fixture/ })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText(/VIEWER STREAM (OPEN|CONNECTING)/)).toBeVisible();
  await expect(page.getByText(/NO ACTIVE COVERED FIXTURE|UPSTREAM (CONNECTING|DEGRADED|OFFLINE)/)).toBeVisible();
});

test("judge director opens deterministic scenes and a proof-complete Decision Receipt", async ({ page }) => {
  await page.goto("/?demo=act2&present=judge&scene=post_goal&contract=match_1x2");
  await expect(page.locator(".presenter-bar")).toBeVisible();
  await expect(page.locator(".scoreline")).toContainText("1–0", { timeout: 15_000 });
  await page.locator(".stance-row").filter({ hasText: "Collapse Fade" }).click();
  await page.getByRole("button", { name: "Open Decision Receipt" }).click();
  await expect(page).toHaveURL(/advanced=evidence/);
  await expect(page.getByText("SWEEPER DECISION PROOF", { exact: true })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("TXLINE SETTLEMENT GUARD", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Verify decision proof" }).click();
  await expect(page.getByText("VERIFIED OFFLINE PATH", { exact: true })).toBeVisible();
  await page.keyboard.press("1");
  await expect(page).toHaveURL(/scene=overview/);
});
