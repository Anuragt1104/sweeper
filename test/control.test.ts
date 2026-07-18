import assert from "node:assert/strict";
import test from "node:test";
import { authorizeControl } from "../lib/server/control";
import { mutationRateLimit } from "../lib/server/rate-limit";

test("control mutations require configured and matching X-Control-Key", () => {
  const previous = process.env.SWEEPER_CONTROL_KEY;
  try {
    delete process.env.SWEEPER_CONTROL_KEY;
    assert.deepEqual(authorizeControl(new Request("http://local")), {
      ok: false,
      status: 503,
      code: "CONTROL_NOT_CONFIGURED",
      message: "Server control key is not configured; this deployment is spectator-only.",
    });
    process.env.SWEEPER_CONTROL_KEY = "operator-secret";
    const missing = authorizeControl(new Request("http://local"));
    assert.equal(missing.ok ? 200 : missing.status, 401);
    const wrong = authorizeControl(new Request("http://local", { headers: { "X-Control-Key": "wrong" } }));
    assert.equal(wrong.ok ? 200 : wrong.status, 403);
    assert.deepEqual(
      authorizeControl(new Request("http://local", { headers: { "X-Control-Key": "operator-secret" } })),
      { ok: true },
    );
  } finally {
    if (previous === undefined) delete process.env.SWEEPER_CONTROL_KEY;
    else process.env.SWEEPER_CONTROL_KEY = previous;
  }
});

test("mutation rate limit allows ten requests per forwarded client IP", async () => {
  const request = new Request("http://local", { headers: { "x-forwarded-for": "203.0.113.77, 10.0.0.1" } });
  for (let count = 0; count < 10; count += 1) assert.equal(mutationRateLimit(request, 1_000), null);
  const rejected = mutationRateLimit(request, 1_000);
  assert.equal(rejected?.status, 429);
  assert.equal(mutationRateLimit(request, 61_001), null);
});
