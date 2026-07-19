import assert from "node:assert/strict";
import test from "node:test";
import { projectWatchtower, type PublicHealth } from "@/lib/health/public-health";

const standby: PublicHealth = {
  process: { ok: true, uptimeSeconds: 12 },
  database: { ready: true },
  supervisor: {
    enabled: false,
    state: "booting",
    detail: "Supervisor has not started",
    activeFixtureId: null,
    nextFixtureId: "18257739",
    competitionId: null,
    updatedAtMs: 1,
  },
  credentials: { txlineConfigured: true, controlKeyConfigured: true },
  activeFixtureId: null,
  upstream: null,
};

test("an accepted viewer EventSource is never presented as upstream live", () => {
  const view = projectWatchtower(standby, "open");
  assert.equal(view.viewerStream, "VIEWER STREAM OPEN");
  assert.equal(view.upstream, "NO ACTIVE COVERED FIXTURE");
  assert.equal(view.upstreamLive, false);
});

test("upstream live requires hydration and both accepted upstream streams", () => {
  const partial: PublicHealth = {
    ...standby,
    activeFixtureId: "fixture",
    upstream: {
      status: "connecting",
      detail: "accepted request",
      hydratedScore: true,
      hydratedOdds: false,
      scoreStreamAccepted: true,
      oddsStreamAccepted: true,
    },
  };
  assert.equal(projectWatchtower(partial, "open").upstreamLive, false);
  const live = {
    ...partial,
    upstream: { ...partial.upstream!, status: "live" as const, hydratedOdds: true },
  };
  assert.equal(projectWatchtower(live, "open").upstreamLive, true);
  assert.equal(projectWatchtower(live, "open").upstream, "UPSTREAM LIVE");
});
