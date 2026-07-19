export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.SWEEPER_AUTO_START_LIVE !== "true") return;
  // Keep this import inside Next's server graph so path aliases are resolved and
  // the supervisor is included in standalone output. A webpack-ignored import
  // is emitted as literal `@/lib/...`, which native Node cannot resolve.
  const { startSupervisorOnce } = await import("@/lib/supervisor/runtime");
  await startSupervisorOnce();
}
