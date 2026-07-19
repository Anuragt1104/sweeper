export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.SWEEPER_AUTO_START_LIVE !== "true") return;
  // Keep this import inside Next's server graph so path aliases are resolved and
  // the supervisor is included in standalone output. A webpack-ignored import is
  // emitted literally and is not copied into the standalone artifact.
  const { startSupervisorOnce } = await import("@/lib/supervisor/runtime");
  await startSupervisorOnce();
}
