// GET → { "<slug>": iso }: when each film last moved up the sidebar, for the sidebar's order, newest first (src/server/films/recent.ts). Opening a film no longer moves it.
import { connection } from 'next/server';
import { readRecent } from '@/server/films/recent';

export async function GET(): Promise<Response> {
  await connection();
  return Response.json(await readRecent(), { headers: { 'cache-control': 'no-store' } });
}
