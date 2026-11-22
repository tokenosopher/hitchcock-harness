// Which painted view of the location stands behind each shot (Flow v3.3 - 4 Locations and props, step 16,
// and 6 Scene prompts, step 3): the prompt names the view behind a shot by its [TAG] in the shot's Placement line, and
// the media list gives that tag's file as a VIEW line. Read from the scene's newest prompt that has a media list.
import type { ShotView } from '../../types';
import { asNumber, asRecord, asString } from '../util';

/** One view in a media list: its tag, its file and its number among the image references. */
interface ViewRef { tag: string; file: string; n?: number }

/** The views of a media list (`{media: [{kind, tag, file, view, n}]}`): every VIEW line, and every image the list marks
 *  as a view. `n` is its IMAGE REFERENCE number: the list's own, else its place among the images. */
export function viewsOfMedia(list: unknown): ViewRef[] {
  const media = asRecord(list)?.media;
  if (!Array.isArray(media)) return [];
  const out: ViewRef[] = [];
  let images = 0;
  for (const v of media) {
    const m = asRecord(v);
    if (!m) continue;
    const kind = (asString(m.kind) ?? '').toUpperCase();
    const isImage = kind === 'IMAGE' || kind === 'VIEW';
    if (isImage) images++;
    const tag = asString(m.tag)?.trim();
    const file = asString(m.file);
    if (!tag || !file || !(kind === 'VIEW' || (kind === 'IMAGE' && m.view === true))) continue;
    out.push({ tag, file, n: asNumber(m.n) ?? images });
  }
  return out;
}

/** The text of each shot of a prompt, by its number: from a line "SHOT 4: …" or "SHOT 4 (…)" to the next. */
export function shotBlocks(prompt: string): Map<number, string> {
  const out = new Map<number, string>();
  const heads = [...prompt.matchAll(/^[ \t]*SHOT[ \t]+(\d+)\b/gm)];
  heads.forEach((h, i) => {
    const n = Number(h[1]);
    const end = i + 1 < heads.length ? heads[i + 1].index : prompt.length;
    // a shot block ends at the next shot, or at the next section heading in capitals ("AUDIO", "DIALOGUE ORDER")
    let text = prompt.slice(h.index, end);
    const sec = /\n[ \t]*\n[ \t]*[A-Z][A-Z ,&/-]{3,}\n/.exec(text);
    if (sec) text = text.slice(0, sec.index);
    if (!out.has(n)) out.set(n, text);
  });
  return out;
}

const norm = (s: string) => s.trim().replace(/[\s_]+/g, ' ').toUpperCase();

/** The view behind each shot: in the shot's Placement line first, else anywhere in the shot's text, the first [TAG]
 *  that is a view of the media list, or the first "IMAGE REFERENCE <n>" that is one. A shot that names no view is left
 *  out: the app says nothing for it. */
export function shotViewsOf(prompt: string, list: unknown, from?: string): ShotView[] {
  const views = viewsOfMedia(list);
  if (!views.length) return [];
  const byTag = new Map(views.map((v) => [norm(v.tag), v]));
  const byNum = new Map(views.filter((v) => v.n !== undefined).map((v) => [v.n!, v]));
  const find = (text: string): ViewRef | undefined => {
    const hits: { at: number; v: ViewRef }[] = [];
    for (const m of text.matchAll(/\[([^\]\n]+)\]/g)) { const v = byTag.get(norm(m[1])); if (v) hits.push({ at: m.index, v }); }
    for (const m of text.matchAll(/IMAGE REFERENCE (\d+)\b/g)) { const v = byNum.get(Number(m[1])); if (v) hits.push({ at: m.index, v }); }
    return hits.sort((a, b) => a.at - b.at)[0]?.v;
  };
  const out: ShotView[] = [];
  for (const [shot, text] of shotBlocks(prompt)) {
    const placement = /^[ \t]*Placement:.*$/m.exec(text)?.[0];
    const v = (placement && find(placement)) || find(text);
    if (v) out.push({ shot, tag: v.tag, path: v.file, ...(from ? { from } : {}) });
  }
  return out.sort((a, b) => a.shot - b.shot);
}
