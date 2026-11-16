// The story of a film, before it is a script: prose with the dialogue inside it, the way the user would tell it.
// It lives in story/v<n>.md, one file per version; nothing is ever written over. story/by.json says which
// versions the user saved by hand on the Story page (the rest are Alma's), and story/settled.json which version
// the user settled, the one the script is written from.
import { promises as fs } from 'node:fs';
import type { StoryInfo } from '../../types';
import { abs, list, natCmp, readText, type FilmCtx } from '../util';

export const STORY_FILE = /^v(\d+)\.md$/;

export async function readStory(ctx: FilmCtx): Promise<StoryInfo | undefined> {
  const names = (await list(abs(ctx, 'story'))).filter((e) => !e.dir && STORY_FILE.test(e.name)).map((e) => e.name).sort(natCmp);
  if (!names.length) return undefined;
  let by: Record<string, string> = {};
  let settled: StoryInfo['settled'];
  try { by = JSON.parse((await readText(abs(ctx, 'story/by.json'))) ?? '{}') as Record<string, string>; } catch { ctx.warn.add('story/by.json', 'not readable as JSON') ; }
  try {
    const s = JSON.parse((await readText(abs(ctx, 'story/settled.json'))) ?? 'null') as { version?: string; at?: string } | null;
    if (s?.version && names.includes(`${s.version}.md`)) settled = { version: s.version, at: s.at };
  } catch { ctx.warn.add('story/settled.json', 'not readable as JSON'); }
  const versions = await Promise.all(names.map(async (n) => {
    const version = n.replace(/\.md$/, '');
    let date: string | undefined;
    try { date = (await fs.stat(abs(ctx, `story/${n}`))).mtime.toISOString(); } catch { /* listed a moment ago */ }
    return { version, path: `story/${n}`, date, by: by[version] === 'you' ? ('you' as const) : ('alma' as const) };
  }));
  const current = versions[versions.length - 1].version;
  return { versions, current, text: (await readText(abs(ctx, `story/${current}.md`))) ?? '', settled };
}
