// previz/ → the whole-film previz versions and storyboards (FilmState has no previz field yet: side channel).
import { abs, asNumber, asRecord, asString, list, natCmp, readJson, type FilmCtx } from '../util';

export interface PrevizInfo {
  film: { version: string; path: string; json?: string }[];
  storyboards: { version: string; path: string }[];
  ratio?: string;
  fps?: number;
}

export async function readPreviz(ctx: FilmCtx): Promise<PrevizInfo | undefined> {
  const root = await list(abs(ctx, 'previz'));
  if (!root.length) return undefined;
  const meta = asRecord(await readJson(ctx, 'previz/film.json'));
  const files = (await list(abs(ctx, 'previz/film'))).filter((e) => !e.dir).map((e) => e.name);
  const v = (name: string): string => /-v(\d+[a-z]?)\b/.exec(name)?.[1] ?? '';
  const film = files
    .filter((f) => /\.mp4$/i.test(f) && !/storyboard/i.test(f))
    .map((f) => {
      const json = files.find((x) => x === f.replace(/\.mp4$/i, '.json'));
      return { version: `v${v(f)}`, path: `previz/film/${f}`, json: json ? `previz/film/${json}` : undefined };
    })
    .sort((a, b) => natCmp(a.version, b.version));
  const storyboards = files
    .filter((f) => /storyboard/i.test(f) && /\.(pdf|png|jpe?g)$/i.test(f))
    .map((f) => ({ version: `v${v(f)}`, path: `previz/film/${f}` }))
    .sort((a, b) => natCmp(a.version, b.version));
  return { film, storyboards, ratio: asString(meta?.ratio), fps: asNumber(meta?.fps) };
}
