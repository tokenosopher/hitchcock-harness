// After the takes (stages 9 to 12), by file name only: cut/ (the edits and drafts), the 1080 masters
// (cut/*1080*, video/1080/), the caption files (subtitles/ and social/), the finished films (cut/ and social/,
// named "final" or "as-posted"), social/kit.md (the films before Film Flow v3.2) and social/release.json in brief (the
// release file: there, and the final it names). The flow board reads its Edit, Finish, Sound and Release
// nodes from it. Pieces made for the cut that are not takes (a title card, a graphic) are read from cut/cards/
// and edits/, one folder deep.
import type { PostInfo } from '../../types';
import { abs, exists, list, natCmp, readJson, statOf, VIDEO_RE, type FilmCtx } from '../util';

const RELEASE = 'social/release.json';

const FINAL = /(^|[-_ ])(final|as-posted)([-_ .]|$)/i;

export async function readPost(ctx: FilmCtx): Promise<PostInfo | undefined> {
  const files = async (dir: string, re: RegExp): Promise<string[]> =>
    (await list(abs(ctx, dir))).filter((e) => !e.dir && re.test(e.name)).map((e) => `${dir}/${e.name}`);
  const [cut, v1080, social, subs, socialSubs, kitThere, rel] = await Promise.all([
    files('cut', VIDEO_RE),
    files('video/1080', VIDEO_RE),
    files('social', VIDEO_RE),
    files('subtitles', /\.(srt|vtt)$/i),
    files('social', /\.(srt|vtt)$/i),
    exists(abs(ctx, 'social/kit.md')),
    readJson<{ final?: { path?: unknown; version?: unknown } }>(ctx, RELEASE),
  ]);
  const editDirs = (await list(abs(ctx, 'edits'))).filter((e) => e.dir).map((e) => `edits/${e.name}`);
  const pieces = (await Promise.all(['cut/cards', 'edits', ...editDirs].map((d) => files(d, VIDEO_RE)))).flat().sort(natCmp);
  const name = (p: string): string => p.split('/').pop()!;
  const isFinal = (p: string): boolean => FINAL.test(name(p));
  const isMaster = (p: string): boolean => /1080/.test(name(p));
  const finals = [...cut.filter(isFinal), ...social.filter(isFinal)].sort(natCmp);
  const out: PostInfo = {
    cuts: cut.filter((p) => !isMaster(p)).sort(natCmp),
    masters: [...cut.filter(isMaster), ...v1080].sort(natCmp),
    captions: [...subs, ...socialSubs].sort(natCmp),
    kit: kitThere ? 'social/kit.md' : undefined,
    finals: finals.length ? finals : undefined,
    pieces: pieces.length ? pieces : undefined,
  };
  if (rel && typeof rel === 'object') {
    const fp = rel.final && typeof rel.final.path === 'string' ? rel.final.path : undefined;
    out.release = { path: RELEASE, ...(fp ? { final: { path: fp, ...(typeof rel.final!.version === 'string' ? { version: rel.final!.version } : {}) } } : {}) };
  }
  const written: Record<string, string> = {};
  await Promise.all([...new Set([...out.cuts, ...finals])].map(async (p) => {
    const st = await statOf(abs(ctx, p));
    if (st) written[p] = st.mtime.toISOString();
  }));
  if (Object.keys(written).length) out.written = written;
  return out.cuts.length || out.masters.length || out.captions.length || out.kit || out.finals || out.pieces || out.release ? out : undefined;
}
