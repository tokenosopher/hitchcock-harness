'use client';
// Subtitle lines on the Edit page (14 Nov 2026, ASKS 40): the line under the playhead drawn over the picture, the
// field a line is retyped in, the request "Create subtitles" puts in Alma's box, and a track saved as an .srt file.
// The look over the picture follows the render's caption cards (scripts/caption-cards.py) as far as plain CSS goes:
// Poppins Medium, champagne gold with a thin dark outline and a soft shadow, centred, the block's bottom edge at 79%
// of the frame's height, 46 px at 1080 wide (scaled with the frame), at most 84% of the width.
import { useEffect, useMemo, useRef, useState } from 'react';
import { Poppins } from 'next/font/google';
import type { Chip, FilmState, Timeline, TimelineClip, TimelineTrack } from '@/server/types';
import { smpte } from '@/components/lib/format';
import { endF, startF } from './model';
import { isLine, isSrtClip, lineAt, linesToSrt, shownLines, srtClipCues, type Shown } from './subs';

const poppins = Poppins({ weight: '500', subsets: ['latin'], display: 'swap' });

// ---- the words of the .srt clips in the cut, read once per file (GET …/files?srt=)
const srtTexts = new Map<string, string>();
/** The words of an .srt file of the film, fetched once and kept for the page's visit. */
export async function fetchSrt(film: string, src: string): Promise<string> {
  const had = srtTexts.get(src);
  if (had !== undefined) return had;
  const r = await fetch(`/api/films/${encodeURIComponent(film)}/files?srt=${encodeURIComponent(src)}`, { cache: 'no-store' });
  const j = (await r.json().catch(() => ({}))) as { text?: string; error?: string };
  if (!r.ok || typeof j.text !== 'string') throw new Error(j.error ?? `the server answered ${r.status}`);
  srtTexts.set(src, j.text);
  return j.text;
}

/** The cues of the .srt clips the player shows (unmuted, on unmuted captions tracks), on the film's clock. */
function useSrtLines(film: string, tl: Timeline): Shown[] {
  const clips = useMemo(() => tl.tracks.filter((t) => t.kind === 'captions' && !t.muted).flatMap((t) => t.clips.filter((c) => isSrtClip(c) && !c.muted)), [tl]);
  const [, setGot] = useState(0);
  const want = clips.map((c) => c.src!).filter((s) => !srtTexts.has(s)).join('\n');
  useEffect(() => {
    if (!want) return;
    let live = true;
    void Promise.all(want.split('\n').map((s) => fetchSrt(film, s).catch(() => { srtTexts.set(s, ''); }))).then(() => { if (live) setGot((n) => n + 1); });
    return () => { live = false; };
  }, [film, want]);
  const fps = tl.fps;
  return clips.flatMap((c) => srtClipCues(c, srtTexts.get(c.src!) ?? '').map((q, i) => ({ id: `${c.id}#${i}`, from: Math.round(q.a * fps), to: Math.round(q.b * fps), text: q.lines.join('\n') })));
}

/**
 * The line under the playhead over the picture, in the 480p and the 1080p view. Found by halving a list made once per
 * cut, so it costs nothing per frame; a line comes in and goes out with a short fade. Always drawn over the live player
 * (14 Nov); `burnt`: the phone plays the version's 480p file, which has the lines in its picture, so nothing is drawn.
 */
export function SubtitleOverlay({ film, tl, frame, burnt }: { film: string; tl: Timeline; frame: number; burnt?: boolean }) {
  const own = useMemo(() => shownLines(tl), [tl]);
  const fromSrt = useSrtLines(film, tl);
  const lines = useMemo(() => (fromSrt.length ? [...own, ...fromSrt].sort((a, b) => a.from - b.from) : own), [own, fromSrt]);
  const now = burnt ? undefined : lineAt(lines, frame);
  // the line shown and the one before it, kept while it fades out (state set while drawing, the way React allows)
  const [shown, setShown] = useState<{ cur?: Shown; was?: Shown }>({});
  if (now?.id !== shown.cur?.id || (now && now.text !== shown.cur?.text)) setShown({ cur: now, was: shown.cur && shown.cur.id !== now?.id ? shown.cur : shown.was });
  const W = tl.width, H = tl.height;
  return (
    <span aria-hidden="true" data-subs-overlay="" className={`pointer-events-none absolute inset-0 z-[4] flex items-center justify-center [container-type:size] ${poppins.className}`}>
      <span className="relative [container-type:inline-size]" style={{ width: `min(100cqw, calc(100cqh * ${W} / ${H}))`, aspectRatio: `${W} / ${H}` }}>
        {shown.was && shown.was.id !== shown.cur?.id && <Words key={`was:${shown.was.id}`} line={shown.was} out />}
        {shown.cur && <Words key={`${shown.cur.id}:${shown.cur.text}`} line={shown.cur} />}
      </span>
    </span>
  );
}

function Words({ line, out }: { line: Shown; out?: boolean }) {
  return (
    <span data-subs-line={out ? undefined : line.id}
      className={`absolute inset-x-0 mx-auto w-[84%] text-center whitespace-pre-line [text-wrap:balance] duration-200 ${out ? 'animate-out fade-out-0 fill-mode-forwards' : 'animate-in fade-in-0'}`}
      style={{
        bottom: '21%', fontSize: 'calc(46 / 1080 * 100cqw)', lineHeight: 1.22, color: 'rgb(246 214 128)', paintOrder: 'stroke fill',
        WebkitTextStroke: 'calc(6 / 1080 * 100cqw) rgb(20 14 8)', textShadow: '0 calc(3 / 1080 * 100cqw) calc(8 / 1080 * 100cqw) rgb(0 0 0 / 0.6)',
      }}>
      {line.text}
    </span>
  );
}

/**
 * The field a line is retyped in, over its block: two rows at most. Enter saves, Shift-Enter starts the second row,
 * Escape leaves the words as they were; a click elsewhere saves.
 */
export function LineField({ text, label, left, width, onDone }: { text: string; label: string; left: number; width: number; onDone: (text: string | undefined) => void }) {
  const [v, setV] = useState(text);
  const done = useRef(false);
  const finish = (t: string | undefined) => { if (done.current) return; done.current = true; onDone(t); };
  return (
    // a small panel over the block, covering it: the hint above, the words below where the block was
    <span className="absolute bottom-[2px] z-[9] flex flex-col gap-1 rounded-[8px] border border-edge-strong bg-hdr p-1.5 shadow-[0_8px_28px_rgba(0,0,0,0.7)] duration-150 animate-in fade-in-0 zoom-in-95" style={{ left, width }} data-line-field="">
      <span className="px-0.5 text-[10.5px] leading-4 text-mute">Enter saves · ⇧Enter second row · Esc cancels</span>
      <textarea autoFocus value={v} rows={2} aria-label={label} spellCheck={false}
        onFocus={(e) => { const el = e.currentTarget; el.setSelectionRange(el.value.length, el.value.length); }}
        onChange={(e) => setV(e.target.value.split('\n').slice(0, 2).join('\n'))}
        onPointerDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); finish(v); }
          else if (e.key === 'Enter' && v.includes('\n')) e.preventDefault();          // two rows at most
          else if (e.key === 'Escape') { e.preventDefault(); finish(undefined); }
        }}
        onBlur={() => finish(v)}
        className="block w-full resize-none rounded-[6px] border border-sub bg-bg px-2 py-1 text-[12px] leading-[1.35] text-ink outline-none" />
    </span>
  );
}

// ---- asking Alma

/** The dialogue the page knows, for "Create subtitles": each clip of the dialogue tracks with its timecodes and take,
 *  and the script's lines of each scene where the film has them. */
function dialogueList(tl: Timeline, state: FilmState | undefined, sceneOf: (c: TimelineClip) => string | undefined, takeOf: (c: TimelineClip) => string): string[] {
  const fps = tl.fps;
  const main = tl.tracks.find((t) => t.id === 'A1') ?? tl.tracks.find((t) => t.kind === 'audio');
  if (!main) return [];
  const dlg: TimelineTrack[] = [main, ...tl.tracks.filter((t) => t.kind === 'audio' && t.id !== main.id && t.name.startsWith(`${main.name} `) && /^\d+$/.test(t.name.slice(main.name.length + 1)))];
  const clips = dlg.flatMap((t) => t.muted ? [] : t.clips.filter((c) => !c.muted).map((c) => ({ t, c }))).sort((a, b) => a.c.at - b.c.at);
  const said = new Set<string>();
  const out: string[] = [];
  for (const { t, c } of clips) {
    const sc = sceneOf(c);
    out.push(`- ${smpte(startF(c, fps) / fps, fps)} to ${smpte(endF(c, fps) / fps, fps)} on ${t.id}: ${takeOf(c)}`);
    const lines = sc && !said.has(sc) ? state?.script?.lines.filter((l) => l.sceneId === sc) ?? [] : [];
    if (sc) said.add(sc);
    if (lines.length) out.push(`  the script's lines for ${sc}: ${lines.map((l) => `${l.speaker}: “${l.text}”`).join(' · ')}`);
  }
  return out;
}

/** The request "Create subtitles" (and "Create subtitles again…") puts in Alma's box. Nothing is sent or spent by
 *  the page: the user reads it and sends it, as with every other "ask Alma" button here. */
export function subtitlesAsk(o: { tl: Timeline; recipe: string; state?: FilmState; again?: boolean; sceneOf: (c: TimelineClip) => string | undefined; takeOf: (c: TimelineClip) => string }): { text: string; chip: Chip } {
  const { tl } = o;
  const present = tl.tracks.filter((t) => t.kind === 'captions').flatMap((t) => t.clips.filter(isLine).map(() => t));
  const where = present.length ? [...new Set(present.map((t) => `${t.id} ${t.name}`))].join(' and ') : '';
  const list = dialogueList(tl, o.state, o.sceneOf, o.takeOf);
  // a saved version by its name; the working cut (stage 2: edits not saved as a version) as "the cut"
  const name = /^v\d+$/.test(tl.version) ? `cut ${tl.version}` : 'the cut';
  const text = [
    `${o.again ? 'Create the subtitles again' : 'Create subtitles'} for ${name}, with the recipe at ${o.recipe} ("Subtitle lines"). The cut to read is cut/working.json. Change the cut with a drop, as recipes/edit.md says: text lines on the track {"id": "C1", "kind": "captions", "name": "Subtitles"}. How they are worded, broken into lines and timed: the stage notes say how.`,
    ...(o.again && present.length ? [`The ${present.length} ${present.length === 1 ? 'line' : 'lines'} on ${where} now are to be replaced.`] : []),
    list.length ? `The dialogue in ${name}, as the page knows it:\n${list.join('\n')}` : `The page knows no dialogue clips in ${name}.`,
  ].join('\n\n');
  return { text, chip: { id: `subs:${tl.version}`, label: `Subtitles · ${name}` } };
}

/** The track's lines as an .srt file, downloaded to this device; nothing is written in the film. */
export function downloadSrt(name: string, t: TimelineTrack, fps: number): number {
  const lines = t.clips.filter((c) => isLine(c) && !c.muted);
  if (!lines.length) return 0;
  const url = URL.createObjectURL(new Blob([linesToSrt(lines, fps)], { type: 'application/x-subrip' }));
  const a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
  return lines.length;
}
