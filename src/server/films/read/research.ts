// The research notes of the Story stage: refs/research/*.md (place, faces, costume and props, sources).
// By file name only, with each note's first heading as its title. The Story page lists them so a note can
// be handed to Alma; what a note says stays in the note.
import type { FilmState } from '../../types';
import { abs, list, natCmp, readText, stripMd, type FilmCtx } from '../util';

export async function readResearch(ctx: FilmCtx): Promise<FilmState['research']> {
  const names = (await list(abs(ctx, 'refs/research'))).filter((e) => !e.dir && /\.md$/i.test(e.name)).map((e) => e.name).sort(natCmp);
  if (!names.length) return undefined;
  return Promise.all(names.map(async (n) => {
    const head = /^#+\s+(.+)$/m.exec((await readText(abs(ctx, `refs/research/${n}`)))?.slice(0, 600) ?? '');
    return { path: `refs/research/${n}`, title: head ? stripMd(head[1]) : n.replace(/\.md$/i, '') };
  }));
}
