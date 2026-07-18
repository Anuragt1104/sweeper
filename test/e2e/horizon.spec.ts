import { expect, test } from "@playwright/test";

test("Horizon renders first and spectators cannot mutate", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "The next ten match-minutes" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Start/ })).toBeDisabled();
  await expect(page.getByText("SPECTATOR")).toBeVisible();
  const mutation = await page.request.post("/api/session", { data: { action: "start", options: { mode: "simulation" } } });
  expect(mutation.status()).toBe(401);
  expect((await mutation.json()).error.code).toBe("CONTROL_KEY_REQUIRED");
});

test("operator starts simulation and public JSON matches the deck", async ({ page }) => {
  await page.goto("/");
  await page.getByPlaceholder("shared control key").fill("e2e-control");
  await page.locator("select").filter({ has: page.locator('option[value="live"]') }).selectOption("simulation");
  await page.getByRole("button", { name: /Start/ }).click();
  await expect(page.getByTestId("horizon-deck")).toBeVisible();
  await expect(page.getByText("SIMULATION", { exact: true })).toBeVisible();
  const api = await page.request.get("/api/horizon");
  expect(api.ok()).toBeTruthy();
  const json = await api.json();
  expect(json.horizon.current.probabilities.goal_home).toBeGreaterThan(0);
  expect(Object.values(json.horizon.current.probabilities).reduce((sum: number, value) => sum + Number(value), 0)).toBeCloseTo(1, 10);
  const scoped = await page.request.get(`/api/fixtures/${json.fixture.id}/horizon`);
  expect(scoped.ok()).toBeTruthy();
  const mismatch = await page.request.get("/api/fixtures/not-active/horizon");
  expect(mismatch.status()).toBe(409);
  expect((await mismatch.json()).error.code).toBe("FIXTURE_NOT_ACTIVE");
});

test("act2 manifests the known 41 minute goal and collapse", async ({ page }) => {
  await page.goto("/?demo=act2");
  await expect(page.getByText(/ACT II public simulation/)).toBeVisible();
  await expect(page.getByText("SPECTATOR")).toBeVisible();
  await expect(page.getByTestId("horizon-deck")).toBeVisible();
  await expect(page.getByText("HOME GOAL", { exact: true })).toBeVisible({ timeout: 25_000 });
  await expect(page.getByText(/transitions/)).toContainText(/[1-9]/, { timeout: 25_000 });
});

test("replay deep link scrubs deterministically to requested minute", async ({ page }) => {
  await page.addInitScript(() => sessionStorage.setItem("sweeper-control-key", "e2e-control"));
  await page.goto("/?replay=wc26-a-md2-arg-pol&t=20&seed=9");
  await expect(page.getByText("Deterministic replay playing")).toBeVisible();
  const response = await page.request.get("/api/session");
  const state = await response.json();
  expect(state.current.minute).toBeGreaterThanOrEqual(20);
  await expect(page.getByText("REPLAY", { exact: true }).first()).toBeVisible();
});
