'use client';
// The "From the library" tab of a pick (gate cards, Character, Voices): the library entries of one kind across
// films, with "Use for C01", which copies the entry in as the pick (same conventions) and tells Alma.
// design/boards/Character.dc.html, Voices.dc.html, Main.dc.html (the gate's library tab).
import { useMemo, useRef, useState } from 'react';
import { useUI } from '@/components/data/ui';
import { audioOf, fileUrl, thumbUrl, useLibrary, type LibraryItem, type LibraryKind, type PickBody } from './data';
import { PickButton } from './PickButton';
import { IconPlay } from '@/components/shell/icons';
import { cn } from '@/lib/utils';

const IconPause = ({ size = 12 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 5h4v14H7zM13 5h4v14h-4z" /></svg>
);

/** One shared player: a second play stops the first. */
export function usePlayer() {
  const audio = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState<string>();
  const toggle = (key: string, url: string) => {
    if (playing === key) {
      audio.current?.pause();
      setPlaying(undefined);
      return;
    }
    audio.current?.pause();
    const a = new Audio(url);
    audio.current = a;
    a.onended = () => setPlaying((k) => (k === key ? undefined : k));
    void a.play().catch(() => setPlaying(undefined));
    setPlaying(key);
  };
  return { playing, toggle };
}

export function PlayButton({ on, onClick, label }: { on: boolean; onClick: () => void; label: string }) {
  return (
    <button type="button" onClick={onClick} aria-label={label} aria-pressed={on}
      className={cn('flex size-8 flex-none cursor-pointer items-center justify-center rounded-full border border-edge-strong text-ink hover:bg-raised', on && 'bg-raised')}>
      {on ? <IconPause size={11} /> : <IconPlay size={10} />}
    </button>
  );
}

/** A library image at the grid's aspect, or a quiet placeholder when the entry has no picture. */
export function LibThumb({ it, aspect = '3 / 4', selected, className }: { it: LibraryItem; aspect?: string; selected?: boolean; className?: string }) {
  const src = thumbUrl(it);
  return (
    <span className={cn('relative block w-full overflow-hidden rounded-[6px] border bg-tile', selected ? 'border-sub outline outline-1 outline-offset-2 outline-ink' : 'border-line', className)} style={{ aspectRatio: aspect }}>
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element -- library thumbnails come from the harness's own file route
        <img src={src} alt="" loading="lazy" data-zoom={src} data-zoom-alt={it.name} className="absolute inset-0 size-full cursor-zoom-in object-cover" />
      ) : (
        <span className="absolute inset-0 flex items-center justify-center text-[11px] text-mute">no image</span>
      )}
    </span>
  );
}

const pickKindFor = (k: LibraryKind): PickBody['kind'] => (k === 'voice' ? 'voice' : k === 'location' ? 'location' : k === 'character' ? 'sheet' : 'face');

/** Why an entry cannot be used for a pick, when it cannot. */
function blocked(it: LibraryItem): string | undefined {
  if (it.kind === 'voice') {
    if (it.voice?.voiceIdKind === 'deleted voice') return 'This voice was deleted from Higgsfield; ask Alma to rebuild it from its samples.';
    if (it.voice?.voiceIdKind !== 'saved voice' || !it.voice.voiceId) return 'A design preview, not a saved voice: ask Alma to save it first.';
  }
  if (it.kind === 'character' && !it.files.some((f) => f.role === 'sheet')) return 'No sheet in this entry: use its face instead.';
  return undefined;
}

export function FromLibrary({ film, kind, target, targetName, from, onUsed }: {
  film: string;                 // the film the pick lands in
  kind: LibraryKind;
  target: string;               // "C01", "L01"
  targetName?: string;          // "Maren"
  from: string;                 // "the gate page", for the line to Alma
  onUsed?: () => void;
}) {
  const { data, error } = useLibrary();
  const ui = useUI();
  const player = usePlayer();
  const [filmF, setFilmF] = useState('all');
  const [sel, setSel] = useState<string>();
  const items = useMemo(() => {
    const all = (data?.items ?? []).filter((i) => i.kind === kind);
    // other films first: reusing this film's own pick is rarely what the tab is for
    return [...all.filter((i) => i.film.slug !== film), ...all.filter((i) => i.film.slug === film)];
  }, [data, kind, film]);
  const films = useMemo(() => [...new Map(items.map((i) => [i.film.slug, i.film.title])).entries()], [items]);
  const shown = items.filter((i) => filmF === 'all' || i.film.slug === filmF);
  const chosen = shown.find((i) => i.id === sel);
  const noun = kind === 'face' ? 'faces' : kind === 'voice' ? 'voices' : kind === 'location' ? 'places' : 'characters';

  if (error) return <span className="text-[12.5px] text-bad">{error}</span>;
  if (!data) return <span className="text-[12.5px] text-sub">Reading the library…</span>;
  if (data.note === 'Studio folder missing') return <span className="text-[12.5px] text-sub">Studio folder missing: the library lives in it.</span>;
  if (!items.length) return <span className="text-[12.5px] text-sub">No {noun} in the library yet. Every pick lands there; “Save to the library” adds a candidate.</span>;

  const choose = (it: LibraryItem) => {
    setSel(it.id);
    ui.addChip({ id: `lib:${target}`, label: `library · ${it.name} · ${it.film.title}`, ref: `library/${it.kind}s/${it.id}` });
  };

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Films">
        {[['all', 'All films'] as [string, string], ...films].map(([slug, title]) => (
          <button key={slug} type="button" aria-pressed={filmF === slug} onClick={() => setFilmF(slug)}
            className={cn('h-7 cursor-pointer whitespace-nowrap rounded-[14px] border px-2.5 text-[12px] font-medium', filmF === slug ? 'border-sub bg-raised text-ink' : 'border-edge text-sub hover:text-ink')}>
            {title}
          </button>
        ))}
      </div>

      {kind === 'voice' ? (
        <div className="flex flex-col overflow-hidden rounded-[10px] border border-edge bg-well">
          {shown.map((it, i) => {
            const a = audioOf(it);
            const on = it.id === sel;
            return (
              <div key={it.id} className={cn('grid grid-cols-[32px_minmax(0,1fr)_auto] items-center gap-3 px-3 py-2', i > 0 && 'border-t border-line', on && 'bg-raised')}>
                {a ? <PlayButton on={player.playing === it.id} onClick={() => player.toggle(it.id, fileUrl(it, a.file))} label={`Play ${it.name}, ${it.film.title}`} /> : <span />}
                <button type="button" onClick={() => choose(it)} aria-pressed={on} className="flex min-w-0 cursor-pointer flex-col gap-0.5 text-left">
                  <span className="truncate text-[13px] font-medium">{it.name} <span className="font-normal text-sub">· {it.film.title}{it.character ? ` · ${it.character.id}` : ''}</span></span>
                  <span className="truncate text-[11.5px] text-mute">{[it.voice?.source, it.voice?.voiceIdKind === 'deleted voice' ? 'deleted from Higgsfield' : undefined].filter(Boolean).join(' · ')}</span>
                </button>
                <span className="whitespace-nowrap font-mono text-[12px] text-ink-3">{it.voice?.hz ? `${it.voice.hz.toFixed(1)} Hz` : '—'}</span>
              </div>
            );
          })}
        </div>
      ) : (
        <div className={cn('grid gap-2.5', kind === 'location' ? 'grid-cols-[repeat(auto-fill,minmax(150px,1fr))]' : 'grid-cols-[repeat(auto-fill,minmax(84px,1fr))]')}>
          {shown.map((it) => (
            <button key={it.id} type="button" onClick={() => choose(it)} aria-pressed={it.id === sel} aria-label={`Library ${kind}, ${it.name}, ${it.film.title}`}
              className="flex min-w-0 cursor-pointer flex-col gap-1 text-left">
              <LibThumb it={it} aspect={kind === 'location' ? '16 / 9' : '3 / 4'} selected={it.id === sel} />
              <span className="truncate text-[12px] font-medium">{it.name}</span>
              <span className="truncate text-[11px] text-sub">{it.film.title}</span>
            </button>
          ))}
        </div>
      )}

      {chosen ? (
        <div className="flex flex-wrap items-center gap-2">
          <PickButton film={film}
            body={{ kind: pickKindFor(kind), target, source: 'library', libraryId: chosen.id, libraryKind: kind, from }}
            label={<>Use for <span className="font-mono">{target}</span></>}
            what={`${chosen.name} (${chosen.film.title}) for ${target}${targetName ? ` ${targetName}` : ''}`}
            disabled={!!blocked(chosen)} reason={blocked(chosen)} onPicked={onUsed} />
          <span className="text-[12px] text-sub">{chosen.candidate ? `${chosen.candidate} · ` : ''}{chosen.status === 'picked' ? 'picked' : 'saved'} in {chosen.film.title}{chosen.character?.role ? ` · ${chosen.character.role}` : ''}</span>
        </div>
      ) : (
        <span className="text-[12px] text-mute">{items.length} {noun} in the library. Choose one to use it for {target}{kind === 'voice' ? ' (a reused voice skips the design round)' : ''}.</span>
      )}
    </div>
  );
}
