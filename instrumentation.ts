export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.SWEEPER_AUTO_START_LIVE !== "true") return;
  // Relative path + webpackIgnore: keep Node-only supervisor/pg out of the Edge
  // instrumentation graph, while still resolving under native Node (unlike `@/…`).
  const { startSupervisorOnce } = await import(
    /* webpackIgnore: true */ "./lib/supervisor/runtime"
  );
  await startSupervisorOnce();
}
