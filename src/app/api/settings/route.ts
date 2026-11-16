// GET → SettingsInfo (src/server/settings.ts): the login, the folders, the services by key name, the
// defaults and the tunnel. Read-only; changes go through the Settings thread with Alma.
import { connection } from 'next/server';
import { readSettings } from '@/server/settings';

export async function GET() {
  await connection();
  return Response.json(await readSettings(), { headers: { 'cache-control': 'no-store' } });
}
