import { connection } from 'next/server';
import { RECIPES } from '@/server/recipes';

// GET → where the recipes live, as absolute paths (src/server/recipes.ts): "Run QC" and the Edit page's
// "Ask Alma" name them in the message to Alma, whose cwd is the film repo, not the harness.
export async function GET() {
  await connection();
  return Response.json({ recipe: RECIPES.qc, edit: RECIPES.edit });
}
