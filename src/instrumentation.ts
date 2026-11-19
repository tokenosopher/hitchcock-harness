// Runs once when the server starts (Next.js instrumentation): one Alma per film across a restart.
// Not awaited: ending an earlier Alma can take up to ~10 s and must not hold up the server.
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  const { onServerStart } = await import('./server/claude/process');
  void onServerStart().catch(() => undefined);
}
