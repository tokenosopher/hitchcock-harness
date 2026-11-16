// Where the harness's recipes live, as absolute paths. Alma's cwd is the film repo, so a relative
// "recipes/edit.md" would point into the film repo; the harness root is found once, at startup, from the
// server's cwd upward (the folder whose package.json is hitchcock-harness and that holds recipes/).
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';

function findRoot(): string {
  let dir = process.cwd();
  for (;;) {
    try {
      const pkg = JSON.parse(readFileSync(path.join(dir, 'package.json'), 'utf8')) as { name?: string };
      if (pkg.name === 'hitchcock-harness' && existsSync(path.join(dir, 'recipes'))) return realpathSync(dir);
    } catch { /* no package.json here */ }
    const up = path.dirname(dir);
    if (up === dir) return process.cwd();
    dir = up;
  }
}

export const HARNESS_ROOT = findRoot();
export const RECIPES = {
  qc: path.join(HARNESS_ROOT, 'recipes', 'qc-critic.md'),
  edit: path.join(HARNESS_ROOT, 'recipes', 'edit.md'),
  show: path.join(HARNESS_ROOT, 'recipes', 'show.md'),
  dispatch: path.join(HARNESS_ROOT, 'recipes', 'dispatch.md'),
  story: path.join(HARNESS_ROOT, 'recipes', 'story.md'),
  asks: path.join(HARNESS_ROOT, 'recipes', 'harness-asks.md'),
  release: path.join(HARNESS_ROOT, 'recipes', 'release.md'),
} as const;
