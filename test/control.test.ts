import assert from "node:assert/strict";
import test from "node:test";
import { authorizeControl } from "../lib/server/control";

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
