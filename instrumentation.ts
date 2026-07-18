export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.SWEEPER_AUTO_START_LIVE !== "true") return;
  const { startSupervisorOnce } = await import("@/lib/supervisor/runtime");
  await startSupervisorOnce();
}
