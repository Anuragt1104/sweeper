import type { FeedStatus, SupervisorStatus } from "@/lib/engine/state";

export interface PublicHealth {
  process: { ok: boolean; uptimeSeconds: number };
  database: { ready: boolean };
  supervisor: SupervisorStatus & { enabled: boolean };
  credentials: { txlineConfigured: boolean; controlKeyConfigured: boolean };
  activeFixtureId: string | null;
  upstream: {
    status: FeedStatus;
    detail: string;
    scoreStreamAccepted: boolean;
    oddsStreamAccepted: boolean;
    hydratedScore: boolean;
    hydratedOdds: boolean;
    lastScoreAtMs?: number | null;
    lastOddsAtMs?: number | null;
    scoreAgeMs?: number | null;
    oddsAgeMs?: number | null;
    reconnectCount?: number;
    sequenceGap?: { expected: number; received: number } | null;
    fatal?: boolean;
  } | null;
}

export interface WatchtowerTruth {
  viewerStream: string;
  upstream: string;
  upstreamLive: boolean;
  noActiveFixture: boolean;
}

export function projectWatchtower(
  health: PublicHealth | null,
  connection: "connecting" | "open" | "stale" | "offline",
): WatchtowerTruth {
  const viewerStream = connection === "open"
    ? "VIEWER STREAM OPEN"
    : connection === "stale"
      ? "VIEWER STREAM STALE"
      : connection === "offline"
        ? "VIEWER STREAM OFFLINE"
        : "VIEWER STREAM CONNECTING";
  const upstreamLive = Boolean(
    health?.activeFixtureId
    && health.upstream?.status === "live"
    && health.upstream.hydratedScore
    && health.upstream.hydratedOdds
    && health.upstream.scoreStreamAccepted
    && health.upstream.oddsStreamAccepted,
  );
  const noActiveFixture = !health?.activeFixtureId;
  const upstream = upstreamLive
    ? "UPSTREAM LIVE"
    : noActiveFixture
      ? "NO ACTIVE COVERED FIXTURE"
      : `UPSTREAM ${health?.upstream?.status?.toUpperCase() ?? "CONNECTING"}`;
  return { viewerStream, upstream, upstreamLive, noActiveFixture };
}
