// The environment of the programs the server runs itself (the studio's Python helpers, the caption cards, ps, the
// claude CLI's status checks, the release reads). Next fills process.env from .env.local, so the server holds the
// reserve API key and the remote-access key; neither goes to a program it starts. Alma's own environment is almaEnv
// (claude/reserve.ts), which drops both as well.

/** The server's secrets: the reserve API key (RESERVE_KEY_NAME in claude/reserve.ts) and the remote-access key. */
export const SERVER_SECRETS: readonly string[] = ['HARNESS_RESERVE_API_KEY', 'HARNESS_TUNNEL_TOKEN'];

/** A copy of `base` (process.env by default) without the server's secrets, with `extra` laid over it. */
export function childEnv(extra: Record<string, string | undefined> = {}, base: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...base };
  for (const k of SERVER_SECRETS) delete env[k];
  return { ...env, ...extra };
}
