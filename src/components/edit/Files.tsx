'use client';
// The film's files, to put one on the timeline by hand (14 Nov 2026: the owner comes from DaVinci Resolve, where a
// file is dragged from the media pool onto a track; on the last film every sound effect, every music lay and every
// file attached in the chat went through Alma). The list opens under the timeline's bar, so the timeline and the
// player stay in sight and a row can be dragged onto a lane. Sounds play in a plain <audio>, pictures show a poster;
// "Add" puts the whole file at the playhead. In "replace" mode it lists the sounds only, and a pick swaps the file
// of the sound clip the menu was opened on. The list comes from GET /api/films/<film>/files (src/server/edit/files.ts).
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Timeline } from '@/server/types';
import type { FilmFile } from '@/server/edit/files';
import { mediaUrl } from '@/components/media/Media';
import { IconPlay, IconX } from '@/components/shell/icons';
import { cn } from '@/lib/utils';

export type { FilmFile };

/** The list while `on`: asked again every 20 s, and every 3 s while lengths are still being measured. */
export function useFilmFiles(film: string, on: boolean): { files?: FilmFile[]; waiting: number; error?: string } {
  const [got, setGot] = useState<{ files?: FilmFile[]; waiting: number; error?: string }>({ waiting: 0 });
  useEffect(() => {
    if (!on) return;
    let live = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const load = async () => {
      let again = 20000;
      try {
        const r = await fetch(`/api/films/${encodeURIComponent(film)}/files`, { cache: 'no-store' });
        const j = (await r.json().catch(() => ({}))) as { files?: FilmFile[]; waiting?: number; error?: string };
        if (!live) return;
        if (!r.ok) setGot((cur) => ({ ...cur, error: j.error ?? `the server answered ${r.status}` }));
        else {
          const next = { files: j.files ?? [], waiting: j.waiting ?? 0 };
          setGot((cur) => (JSON.stringify(cur) === JSON.stringify(next) ? cur : next));
          if (next.waiting) again = 3000;
        }
      } catch (e) {
        if (live) setGot((cur) => ({ ...cur, error: e instanceof Error ? e.message : String(e) }));
      }
      if (live) timer = setTimeout(() => void load(), again);
    };
    void load();
    return () => { live = false; if (timer) clearTimeout(timer); };
  }, [film, on]);
  return got;
}

/** A file attached in the chat, copied into the film's folder so a clip can play it ({src}); or why not. */
export async function adoptUpload(film: string, upload: string): Promise<{ src?: string; error?: string }> {
  try {
    const r = await fetch(`/api/films/${encodeURIComponent(film)}/files`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ upload }) });
    const j = (await r.json().catch(() => ({}))) as { src?: string; error?: string };
    return r.ok && j.src ? { src: j.src } : { error: j.error ?? `the server answered ${r.status}` };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

type Show = 'all' | 'sound' | 'picture';
const secs = (s?: number) => (s === undefined ? 'length not read yet' : s < 60 ? `${s.toFixed(1)} s` : `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')} min`);
const groupName = (g: string) => (g === 'attached' ? 'Attached in the chat' : g);

export function FilesPanel({ open, film, mode, data, tl, target, replacing, busy, readOnly, onAdd, onReplace, onClose, onDrag }: {
  open: boolean;
  film: string;
  mode: 'add' | 'replace';
  data: { files?: FilmFile[]; waiting: number; error?: string };
  tl: Timeline;
  /** Where "Add" puts a file: "at the playhead (00:00:12:00): a sound on A2 Music, a picture on V2 Inserts". */
  target: string;
  /** The clip whose file a pick replaces (replace mode). */
  replacing?: string;
  /** Something is being written: the buttons wait. */
  busy?: boolean;
  readOnly?: boolean;
  onAdd: (f: FilmFile) => void;
  onReplace: (f: FilmFile) => void;
  onClose: () => void;
  /** A row is being dragged (to a lane of the timeline), or the drag ended. */
  onDrag: (f: FilmFile | undefined) => void;
}) {
  const [q, setQ] = useState('');
  const [show, setShow] = useState<Show>('all');
  const [hear, setHear] = useState<string>();
  const audio = useRef<HTMLAudioElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const box = useRef<HTMLElement>(null);
  const kind: Show = mode === 'replace' ? 'sound' : show;

  // opened: the search takes the keys, and the panel scrolls into view under the timeline
  useEffect(() => {
    if (!open) return;
    search.current?.focus({ preventScroll: true });
    // up and down only: scrollIntoView would also slide a page that is wider than its column sideways
    const t = setTimeout(() => {
      const el = box.current;
      let sc = el?.parentElement ?? null;
      while (sc && !(sc.scrollHeight > sc.clientHeight + 1 && /auto|scroll/.test(getComputedStyle(sc).overflowY))) sc = sc.parentElement;
      if (!el || !sc) return;
      const r = el.getBoundingClientRect(), v = sc.getBoundingClientRect();
      const below = r.bottom - Math.min(v.bottom, window.innerHeight) + 12;
      if (below > 0) sc.scrollBy({ top: Math.min(below, r.top - v.top - 80), behavior: 'smooth' });
    }, 220);
    return () => clearTimeout(t);
  }, [open, mode]);
  // closed: what was playing stops
  useEffect(() => { if (!open) audio.current?.pause(); }, [open]);

  // how many times the cut uses each file: pictures on picture tracks, sounds on sound tracks
  const uses = useMemo(() => {
    const m = new Map<string, number>();
    for (const t of tl.tracks) {
      for (const c of t.clips) if (c.src) m.set(`${t.kind}:${c.src}`, (m.get(`${t.kind}:${c.src}`) ?? 0) + 1);
    }
    return m;
  }, [tl]);
  const usesOf = (f: FilmFile) => uses.get(`${f.kind === 'sound' ? 'audio' : f.kind === 'subtitles' ? 'captions' : 'video'}:${f.src}`) ?? 0;

  const all = data.files;
  const needle = q.trim().toLowerCase();
  const shown = (all ?? []).filter((f) => (kind === 'all' || f.kind === kind) && (!needle || f.name.toLowerCase().includes(needle)));
  const groups = useMemo(() => {
    const m = new Map<string, FilmFile[]>();
    for (const f of shown) m.set(f.group, [...(m.get(f.group) ?? []), f]);
    // the files attached in the chat first: the owner attached them to use them
    return [...m].sort(([a], [b]) => (a === 'attached' ? -1 : b === 'attached' ? 1 : a.localeCompare(b, undefined, { numeric: true })));
  }, [shown]);
  const count = (k: Show) => (all ?? []).filter((f) => k === 'all' || f.kind === k).length;

  // what is heard follows the player's own events, so closing the list (which pauses it) or a file ending shows right
  const want = useRef<string | undefined>(undefined);
  const play = (f: FilmFile) => {
    const el = audio.current;
    if (!el) return;
    if (hear === f.src && !el.paused) { el.pause(); return; }
    want.current = f.src;
    el.src = f.upload ? `/api/films/${encodeURIComponent(film)}/upload?f=${encodeURIComponent(f.upload)}` : mediaUrl(f.src);
    void el.play().catch(() => undefined);
  };

  const empty = !all ? (data.error ? `The film's files could not be read: ${data.error}` : 'Reading the film’s files…')
    : needle && !shown.length ? `Nothing named “${q.trim()}”.`
      : !shown.length ? (kind === 'sound' ? 'No sound files in this film yet. Files you attach in the chat appear here.'
        : kind === 'picture' ? 'No title cards or other made pictures in this film yet. Video files you attach in the chat appear here.'
          : 'No sound or picture files in this film yet. Files you attach in the chat appear here.')
        : undefined;

  return (
    // opens and closes by sliding its height and fading; closed it is out of the keyboard's way
    <div className={cn('grid transition-[grid-template-rows,opacity] duration-200 ease-out motion-reduce:transition-none', open ? 'grid-rows-[1fr] opacity-100' : 'pointer-events-none grid-rows-[0fr] opacity-0')}
      inert={!open} aria-hidden={!open}>
      <div className="min-h-0 overflow-hidden">
        <section ref={box} aria-label={mode === 'replace' ? 'Replace the file of this sound' : 'Add a file to the timeline'} data-files-panel={mode}
          onKeyDown={(e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onClose(); } }}
          className="flex flex-col gap-2.5 rounded-[10px] border border-line bg-hdr p-3">
          <header className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5 pl-0.5">
            <span className="flex min-w-[min(100%,260px)] flex-[1_1_260px] flex-col">
              <span className="truncate text-[13.5px] font-medium">{mode === 'replace' ? `Replace the sound of “${replacing ?? 'this clip'}”` : 'Add a file'}</span>
              <span className="text-[12px] text-sub">
                {mode === 'replace' ? 'Pick a sound: it takes the clip’s place, at the same level and fades. ⌘Z goes back.' : `Add puts the whole file ${target}. Or drag a row onto a track.`}
              </span>
            </span>
            {mode === 'add' && (
              <div className="flex flex-none rounded-lg border border-edge p-0.5" role="group" aria-label="Which files">
                {(['all', 'sound', 'picture'] as const).map((k) => (
                  <button key={k} type="button" aria-pressed={show === k} onClick={() => setShow(k)}
                    className={cn('inline-flex h-6 cursor-pointer items-center gap-1 rounded-md px-2 text-[12px] transition-colors duration-150', show === k ? 'bg-raised text-ink' : 'text-sub hover:text-ink')}>
                    {k === 'all' ? 'All' : k === 'sound' ? 'Sounds' : 'Pictures'}{all && <span className="text-[11px] text-mute">{count(k)}</span>}
                  </button>
                ))}
              </div>
            )}
            <input ref={search} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find by name" aria-label="Find a file by name" type="search"
              className="h-7 w-[160px] flex-none rounded-lg border border-edge bg-bg px-2.5 text-[12.5px] text-ink outline-none transition-colors duration-150 placeholder:text-mute focus:border-sub" />
            <button type="button" onClick={onClose} aria-label="Close the list" title="Close (Esc)"
              className="flex size-7 flex-none cursor-pointer items-center justify-center rounded-lg text-sub transition-colors duration-150 hover:bg-raised hover:text-ink"><IconX size={12} /></button>
          </header>
          {empty ? (
            <p className="m-0 px-1 py-3 text-[12.5px] text-sub" role="status">{empty}</p>
          ) : (
            <div className="scroll flex max-h-[320px] flex-col gap-3 overflow-y-auto pr-1" role="list" aria-label="Files">
              {groups.map(([g, fs]) => (
                <div key={g} className="flex flex-col gap-1.5">
                  <span className="truncate pl-0.5 font-mono text-[11px] text-mute" title={g === 'attached' ? 'Copied into the film’s folder (audio/added or edits/added) when placed' : g}>{groupName(g)}</span>
                  {fs.map((f) => {
                    const n = usesOf(f);
                    const playing = hear === f.src;
                    const can = !readOnly && !busy && !!f.seconds;
                    const what = f.kind === 'sound' ? 'Sound' : f.kind === 'subtitles' ? `Subtitles${f.cues !== undefined ? `, ${f.cues} ${f.cues === 1 ? 'cue' : 'cues'}` : ''}` : f.audio ? 'Picture with sound' : 'Picture';
                    return (
                      <div key={`${f.group}:${f.src}:${f.upload ?? ''}`} role="listitem" data-file={f.src} draggable={mode === 'add' && can}
                        onDragStart={(e) => { e.dataTransfer.effectAllowed = 'copy'; e.dataTransfer.setData('text/plain', f.name); onDrag(f); }}
                        onDragEnd={() => onDrag(undefined)}
                        title={mode === 'add' && can ? 'Drag onto a track, or Add' : undefined}
                        className={cn('grid grid-cols-[40px_minmax(0,1fr)_auto] items-center gap-x-3 rounded-[9px] border px-2.5 py-1.5 transition-colors duration-200',
                          playing ? 'border-edge-strong bg-raised/50' : 'border-line hover:border-edge-strong hover:bg-raised/40', mode === 'add' && can && 'cursor-grab active:cursor-grabbing')}>
                        {f.kind === 'sound' ? (
                          <button type="button" onClick={() => play(f)} aria-label={playing ? `Stop ${f.name}` : `Play ${f.name}`} title={playing ? 'Stop' : 'Hear it'}
                            className={cn('flex size-[30px] cursor-pointer items-center justify-center justify-self-center rounded-full transition-colors duration-200', playing ? 'bg-ink text-bg' : 'border border-edge-strong text-sub hover:text-ink')}>
                            {playing ? <span className="flex gap-[2px]"><span className="h-2.5 w-[2px] bg-bg" /><span className="h-2.5 w-[2px] bg-bg" /></span> : <IconPlay size={10} />}
                          </button>
                        ) : f.kind === 'subtitles' ? (
                          // an .srt (14 Nov): it goes on the subtitles track, from the start of the film
                          <span aria-hidden="true" className="flex h-[30px] w-[34px] items-center justify-center justify-self-center rounded-[5px] border border-edge bg-[#26262b] font-mono text-[9.5px] font-medium text-ink-3">SRT</span>
                        ) : (
                          <span className="relative block h-[52px] w-[30px] justify-self-center overflow-hidden rounded-[5px] border border-edge bg-black">
                            {!f.upload && (
                              // eslint-disable-next-line @next/next/no-img-element -- a poster from /api/media at half a second in
                              <img alt="" src={mediaUrl(f.src, { w: 160, t: Math.min(0.5, (f.seconds ?? 1) / 2) })} draggable={false} loading="lazy"
                                onError={(e) => { e.currentTarget.style.opacity = '0'; }} className="absolute inset-0 size-full object-cover transition-opacity duration-200" />
                            )}
                          </span>
                        )}
                        <span className="flex min-w-0 flex-col">
                          <span className="truncate text-[13px] font-medium" title={f.src}>{f.name}</span>
                          <span className="truncate text-[11.5px] text-mute">
                            {what} · {secs(f.seconds)}{f.width && f.height ? ` · ${f.width}×${f.height}` : ''} · <span className={n ? 'text-ink-3' : undefined}>{n ? `in the cut${n > 1 ? ` ${n} times` : ''}` : 'not in the cut'}</span>
                          </span>
                        </span>
                        <button type="button" disabled={!can} onClick={() => (mode === 'replace' ? onReplace(f) : onAdd(f))}
                          title={!f.seconds ? 'Its length is still being read' : mode === 'replace' ? 'Put it in the clip’s place' : f.kind === 'subtitles' ? 'Add it on the subtitles track from the start of the film (its times are the film’s)' : `Add it ${target.replace(/: .*/, '')}`}
                          className="inline-flex h-7 flex-none cursor-pointer items-center rounded-lg border border-edge-strong px-2.5 text-[12px] text-ink transition-colors duration-150 hover:bg-raised disabled:cursor-not-allowed disabled:opacity-40">
                          {mode === 'replace' ? 'Use this' : 'Add'}
                        </button>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          )}
          {data.waiting > 0 && <span className="pl-0.5 text-[11.5px] text-mute" role="status">Measuring the length of {data.waiting} {data.waiting === 1 ? 'file' : 'files'}…</span>}
          <audio ref={audio} preload="none" onPlay={() => setHear(want.current)} onPause={() => setHear(undefined)} onEnded={() => setHear(undefined)} onError={() => setHear(undefined)} className="hidden" />
        </section>
      </div>
    </div>
  );
}
