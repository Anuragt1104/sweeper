const base = (process.env.SWEEPER_URL ?? "http://127.0.0.1:3000").replace(/\/$/, "");
const durationMs = Number(process.env.SOAK_SECONDS ?? 600) * 1000;
const intervalMs = Math.min(30_000, Math.max(1_000, durationMs / 20));

async function main() {
  const deadline = Date.now() + durationMs;
  let samples = 0;
  let reconnectBaseline: number | null = null;
  let reconnectLatest = 0;
  while (Date.now() < deadline) {
    const response = await fetch(`${base}/api/health`, { cache: "no-store" });
    if (!response.ok) throw new Error(`Health endpoint returned ${response.status}`);
    const health = await response.json() as {
      upstream?: { status?: string; reconnectCount?: number; fatal?: boolean };
      horizon?: { ready?: boolean; missingRequiredMarket?: boolean };
    };
    if (!health.upstream || health.upstream.fatal || health.upstream.status !== "live") {
      throw new Error(`Live soak stopped: upstream status is ${health.upstream?.status ?? "missing"}`);
    }
    if (!health.horizon?.ready) throw new Error("Live soak stopped: Horizon is not ready");
    reconnectBaseline ??= health.upstream.reconnectCount ?? 0;
    reconnectLatest = health.upstream.reconnectCount ?? 0;
    samples += 1;
    console.log(`✓ soak ${samples} · live · reconnects ${health.upstream.reconnectCount ?? 0}${health.horizon.missingRequiredMarket ? " · no 1X2 (agents standing down)" : ""}`);
    await new Promise((resolve) => setTimeout(resolve, Math.min(intervalMs, Math.max(0, deadline - Date.now()))));
  }
  console.log(`Live soak passed for ${Math.round(durationMs / 1000)}s with ${samples} health samples; reconnect delta ${reconnectLatest - (reconnectBaseline ?? reconnectLatest)}.`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
