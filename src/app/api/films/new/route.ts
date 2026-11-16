import { connection } from 'next/server';
import { takenNames } from '@/server/actions/newFilm';
import { claudeCodeDefaultModel } from '@/server/claude/model';

// GET → what the Idea page checks a new film against: the folders under assets/films and the short codes
// earlier films use ({drive, filmsDir, slugs, codes: [{code, film}]}), and defaultModel, what the thread's model picker means by "Default".
export async function GET() {
  await connection();
  return Response.json({ ...(await takenNames()), defaultModel: await claudeCodeDefaultModel() }, { headers: { 'cache-control': 'no-store' } });
}
