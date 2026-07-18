export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.SWEEPER_AUTO_START_LIVE !== "true") return;
  // webpackIgnore: keep Node-only supervisor/pg out of the Edge instrumentation graph.
  const { startSupervisorOnce } = await import(
    /* webpackIgnore: true */ "@/lib/supervisor/runtime"
  );
  await startSupervisorOnce();
}
