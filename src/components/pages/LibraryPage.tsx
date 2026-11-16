'use client';
// The library across films (design/boards/Library.dc.html): faces, voices, whole characters and places, each
// tagged with its film and role; search; "Use in <film>" prefills that film's composer. Its thread is the
// Library's own Alma session ("Library · across films"). Nothing here writes: the picks happen in the film.
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useFilms } from '@/components/data/films';
import { usePage, useUI } from '@/components/data/ui';
import { fmtDate } from '@/components/lib/format';
import { Header } from '@/components/shell/Header';
import { PageBody, StageTitle } from '@/components/shell/StageTitle';
import { Btn } from '@/components/shell/atoms';
import { IconChevronDown, IconSearch } from '@/components/shell/icons';
import { LibThumb, PlayButton, usePlayer } from '@/components/library/FromLibrary';
import { audioOf, fileUrl, KIND_FOLDER, useLibrary, type LibraryItem, type LibraryKind } from '@/components/library/data';
import type { FilmRef } from '@/server/types';
import { cn } from '@/lib/utils';
import { usePresence } from '@/components/shell/Reveal';

type Tab = 'faces' | 'voices' | 'characters' | 'locations';
const TABS: { t: Tab; name: string; kind: LibraryKind }[] = [
  { t: 'faces', name: 'Faces', kind: 'face' }, { t: 'voices', name: 'Voices', kind: 'voice' },
  { t: 'characters', name: 'Characters', kind: 'character' }, { t: 'locations', name: 'Locations', kind: 'location' },
];
const QUICK: Record<Tab, string[]> = {
  faces: ['Find faces like the lead of my last film', 'Which faces have I reused?'],
  voices: ['Find a voice near 150 Hz', 'Which voices have I reused?'],
  characters: ['Which characters have a video element?', 'What has the import found?'],
  locations: ['Find stone steps in a city', 'Which places have views?'],
};

const matches = (it: LibraryItem, q: string) => {
  if (!q) return true;
  const hay = [it.name, it.film.title, it.character?.id, it.character?.role, it.location?.id, it.candidate, it.note, it.voice?.source, ...it.tags, it.prompt].filter(Boolean).join(' ').toLowerCase();
  return q.toLowerCase().split(/\s+/).every((w) => hay.includes(w));
};

/** Puts a message about this entry into the film's composer (its saved draft and chips) and opens the film. */
function useInFilm() {
  const router = useRouter();
  return (film: FilmRef, it: LibraryItem) => {
    const key = `hh:ui:${film.slug}`;
    const what = it.kind === 'location' ? 'place' : it.kind;
    const chip = { id: `lib:${it.id}`, label: `library · ${it.name} · ${it.film.title}`, ref: `library/${KIND_FOLDER[it.kind]}/${it.id}` };
    const draft = `Use the library ${what} ${it.name} (${it.film.title}${it.candidate ? `, ${it.candidate}` : ''}) for `;
    try {
      const prev = JSON.parse(localStorage.getItem(key) ?? '{}') as { chips?: { id: string }[] };
      const chips = [...(prev.chips ?? []).filter((c) => c.id !== chip.id), chip];
      localStorage.setItem(key, JSON.stringify({ ...prev, chips, draft }));
    } catch { /* storage blocked: the film opens without the draft */ }
    router.push(`/films/${film.slug}`);
  };
}

function UseIn({ it, films }: { it: LibraryItem; films: FilmRef[] }) {
  const [open, setOpen] = useState(false);
  const menu = usePresence(open);
  const use = useInFilm();
  const box = useRef<HTMLDivElement>(null);
  // a click elsewhere or Escape closes the menu (it stayed open over the page)
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', away);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', away); document.removeEventListener('keydown', esc); };
  }, [open]);
  if (!films.length) return <span className="text-[12px] text-mute">No film in progress to use it in.</span>;
  if (films.length === 1) return <Btn onClick={() => use(films[0], it)}>Use in {films[0].title}</Btn>;
  return (
    <div ref={box} className="relative flex-none">
      <Btn aria-expanded={open} onClick={() => setOpen(!open)}>Use in…<IconChevronDown size={12} /></Btn>
      {menu.mounted && (
        <div role="menu" onTransitionEnd={(e) => { if (e.target === e.currentTarget) menu.done(); }}
          className={cn('absolute right-0 top-[38px] z-10 w-[280px] rounded-[10px] border border-edge-strong bg-panel p-1 shadow-[0_16px_48px_#000] transition-[opacity,transform] duration-150 ease-out motion-reduce:transition-none', menu.shown ? 'translate-y-0 opacity-100' : 'pointer-events-none -translate-y-1 opacity-0')}>
          {films.map((f) => (
            <button key={f.slug} role="menuitem" type="button" onClick={() => use(f, it)} className="flex w-full cursor-pointer flex-col gap-0.5 rounded-md px-2.5 py-2 text-left text-[13px] text-[#E4E4E7] hover:bg-raised">
              <span className="font-medium">{f.title}</span><span className="text-[12px] text-sub">prefills its composer</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function SelectionBar({ it, films }: { it: LibraryItem; films: FilmRef[] }) {
  const a = audioOf(it);
  const views = it.files.filter((f) => f.role === 'view').length;
  const parts = [
    it.character ? `${it.character.id}${it.character.role ? ` · ${it.character.role}` : ''}` : it.location?.id,
    it.candidate, it.voice?.hz ? `${it.voice.hz.toFixed(1)} Hz` : undefined,
    it.kind === 'location' ? (views ? `${views} views` : 'no views') : undefined,
    `${it.status} ${fmtDate(it.dates.picked ?? it.dates.saved)}`,
  ].filter(Boolean);
  return (
    <div className="flex flex-wrap items-center gap-2.5 rounded-[10px] border border-edge-strong bg-panel px-3 py-2.5">
      {it.thumb && <span className="w-[30px] flex-none"><LibThumb it={it} /></span>}
      <span className="min-w-0 flex-[1_1_220px] text-[13px] leading-[1.4]">
        <span className="font-medium">{it.name}</span> <span className="text-sub">· {it.film.title}</span>
        <span className="block text-[12px] text-sub">{parts.join(' · ')}</span>
        {it.voice?.voiceIdKind === 'deleted voice' && <span className="block text-[12px] text-mute">deleted from Higgsfield; the samples remain</span>}
      </span>
      {a && it.kind !== 'voice' && <audio controls preload="none" src={fileUrl(it, a.file)} className="h-8 w-[220px] max-[760px]:w-full" />}
      <UseIn it={it} films={films} />
    </div>
  );
}

export function LibraryPage() {
  const params = useSearchParams();
  const router = useRouter();
  const tab = (TABS.find((x) => x.t === params.get('tab'))?.t ?? 'faces') as Tab;
  const kind = TABS.find((x) => x.t === tab)!.kind;
  const { data, error } = useLibrary();
  const { films } = useFilms();
  const ui = useUI();
  const player = usePlayer();
  const [filmF, setFilmF] = useState('all');
  const [status, setStatus] = useState<'all' | 'picked' | 'saved'>('all');
  const [q, setQ] = useState('');
  const [sel, setSel] = useState<string>();
  const live = films.filter((f) => f.status === 'in-progress' && !f.supersededBy && f.flow === 'video-driven');
  usePage(`Library · ${tab}`, 'Ask Alma to find or reuse something…', QUICK[tab]);

  const ofKind = useMemo(() => (data?.items ?? []).filter((i) => i.kind === kind), [data, kind]);
  const filmsHere = useMemo(() => [...new Map(ofKind.map((i) => [i.film.slug, i.film.title])).entries()], [ofKind]);
  const shown = ofKind.filter((i) => (filmF === 'all' || i.film.slug === filmF) && (status === 'all' || i.status === status) && matches(i, q));
  const chosen = shown.find((i) => i.id === sel);
  const name = TABS.find((x) => x.t === tab)!.name;
  const count = (t: Tab) => data?.counts?.[t];

  const choose = (it: LibraryItem) => {
    setSel(it.id);
    ui.addChip({ id: `lib:${it.id}`, label: `library · ${it.name} · ${it.film.title}`, ref: `library/${KIND_FOLDER[it.kind]}/${it.id}` });
  };
  const setTab = (t: Tab) => {
    setSel(undefined);
    setFilmF('all');
    router.replace(`/library?tab=${t}`);
  };

  return (
    <>
      <Header crumbs={[{ label: 'Library' }, { label: name }]} meta={`Across all films · picked or saved in any film · studio/assets/library${data?.note ? ` · ${data.note}` : ''}`} phoneSub="Across all films" />
      <PageBody wide>
        <StageTitle kicker="Library · across all films" title={name}
          sub="Everything picked or saved in any film. Reuse a face, a voice or a place instead of generating it again; every pick made in the harness lands here by itself." />

        <div role="tablist" aria-label="Library sections" className="scroll flex gap-[18px] overflow-x-auto border-b border-line">
          {TABS.map((x) => (
            <button key={x.t} role="tab" type="button" aria-selected={tab === x.t} onClick={() => setTab(x.t)}
              className={cn('-mb-px h-9 flex-none cursor-pointer whitespace-nowrap border-b-2 text-[13px] font-medium', tab === x.t ? 'border-ink text-ink' : 'border-transparent text-sub hover:text-ink')}>
              {x.name} <span className="font-normal tabular-nums text-mute">{count(x.t) ?? '—'}</span>
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2.5">
          <div className="flex min-w-0 flex-[1_1_360px] flex-wrap gap-1.5" role="group" aria-label="Films">
            {[['all', 'All films'] as [string, string], ...filmsHere].map(([slug, title]) => (
              <button key={slug} type="button" aria-pressed={filmF === slug} onClick={() => setFilmF(slug)}
                className={cn('h-7 flex-none cursor-pointer whitespace-nowrap rounded-[14px] border px-2.5 text-[12px] font-medium', filmF === slug ? 'border-sub bg-raised text-ink' : 'border-edge text-sub hover:text-ink')}>
                {title}
              </button>
            ))}
          </div>
          <div className="flex flex-none items-center gap-2">
            <label className="relative">
              <span className="sr-only">Search the library</span>
              <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-mute"><IconSearch size={13} /></span>
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search" className="h-8 w-[180px] rounded-lg border border-line bg-panel pl-8 pr-2.5 text-[13px] text-ink placeholder:text-mute max-[760px]:w-[150px]" />
            </label>
            <div role="group" aria-label="Picked or saved" className="inline-flex rounded-lg border border-edge bg-well p-0.5">
              {(['all', 'picked', 'saved'] as const).map((k) => (
                <button key={k} type="button" aria-pressed={status === k} onClick={() => setStatus(k)}
                  className={cn('h-[26px] cursor-pointer rounded-md px-2.5 text-[12px] font-medium capitalize', status === k ? 'bg-raised text-ink' : 'text-sub')}>
                  {k}
                </button>
              ))}
            </div>
          </div>
        </div>

        {chosen && <SelectionBar it={chosen} films={live} />}

        {error && <div className="text-[13px] text-bad">{error}</div>}
        {!data && !error && <div className="text-[13px] text-sub">Reading the library…</div>}
        {data && !shown.length && (
          <div className="rounded-[10px] border border-dashed border-edge-strong px-4 py-6 text-[13px] leading-normal text-sub">
            {data.note === 'Studio folder missing' ? 'Studio folder missing: the library lives in it.' : ofKind.length ? 'Nothing matches.' : `No ${tab} yet. Pick or save one in a film.`}
          </div>
        )}

        {tab === 'faces' && shown.length > 0 && (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(110px,1fr))] gap-3 max-[760px]:grid-cols-3 max-[760px]:gap-2.5">
            {shown.map((it) => (
              <button key={it.id} type="button" onClick={() => choose(it)} aria-pressed={it.id === sel} aria-label={`${it.name}, ${it.film.title}`} className="flex min-w-0 cursor-pointer flex-col gap-1.5 text-left">
                <LibThumb it={it} selected={it.id === sel} />
                <span className="flex min-w-0 flex-col gap-px">
                  <span className="truncate text-[12.5px] font-medium">{it.name}</span>
                  <span className="truncate text-[11.5px] text-sub">{it.film.title}</span>
                  <span className="truncate font-mono text-[10.5px] text-mute">{[it.character?.id, it.candidate].filter(Boolean).join(' · ')}</span>
                </span>
              </button>
            ))}
          </div>
        )}

        {tab === 'voices' && shown.length > 0 && (
          <div className="overflow-hidden rounded-[10px] border border-edge bg-well">
            <div className="grid grid-cols-[36px_minmax(0,1.3fr)_72px_minmax(0,1.5fr)_56px] items-center gap-3 px-4 py-2 text-[11.5px] text-sub max-[760px]:hidden">
              <span /><span>Voice</span><span className="text-right">Pitch</span><span>Film · character</span><span className="text-right">Line</span>
            </div>
            {shown.map((it) => {
              const a = audioOf(it);
              const line = it.files.find((f) => f.role === 'element line');
              return (
                <div key={it.id} className={cn('grid grid-cols-[36px_minmax(0,1.3fr)_72px_minmax(0,1.5fr)_56px] items-center gap-3 border-t border-line px-4 py-2 max-[760px]:grid-cols-[36px_minmax(0,1fr)_auto]', it.id === sel && 'bg-raised')}>
                  {a ? <PlayButton on={player.playing === it.id} onClick={() => player.toggle(it.id, fileUrl(it, a.file))} label={`Play ${it.name}, ${it.film.title}`} /> : <span />}
                  <button type="button" onClick={() => choose(it)} aria-pressed={it.id === sel} className="flex min-w-0 cursor-pointer flex-col gap-px text-left">
                    <span className="truncate text-[13.5px] font-medium">{it.name}</span>
                    <span className="truncate text-[11.5px] text-mute">{[it.candidate, it.voice?.voiceIdKind === 'deleted voice' ? 'deleted from Higgsfield' : it.voice?.model].filter(Boolean).join(' · ')}</span>
                  </button>
                  <span className="whitespace-nowrap text-right text-[12.5px] tabular-nums text-[#D4D4D8]">{it.voice?.hz ? `${it.voice.hz.toFixed(1)} Hz` : '—'}</span>
                  <span className="truncate text-[12.5px] text-sub max-[760px]:hidden">{it.film.title}{it.character ? ` · ${it.character.id}` : ''}</span>
                  <span className="text-right font-mono text-[11.5px] text-sub max-[760px]:hidden">{line && it.voice?.seconds ? `${it.voice.seconds} s` : '—'}</span>
                </div>
              );
            })}
            <div className="border-t border-line px-4 py-3 text-[12px] text-mute">Pitch measured on the element line where there is one; “Line” is the element line cut from the voice’s preview.</div>
          </div>
        )}

        {tab === 'characters' && shown.length > 0 && (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-3 max-[760px]:grid-cols-1">
            {shown.map((it) => {
              const has = (r: string) => it.files.some((f) => f.role === r);
              const tags = [['face', 'face'], ['wardrobe', 'wardrobe'], ['sheet', 'sheet'], ['element', 'element'], ['voice', 'voice']] as const;
              return (
                <button key={it.id} type="button" onClick={() => choose(it)} aria-pressed={it.id === sel}
                  className={cn('flex min-w-0 cursor-pointer gap-3 rounded-[10px] border bg-well p-3 text-left', it.id === sel ? 'border-sub' : 'border-edge hover:border-edge-strong')}>
                  <span className="w-[64px] flex-none"><LibThumb it={it} /></span>
                  <span className="flex min-w-0 flex-col gap-1">
                    <span className="flex items-baseline gap-1.5"><span className="font-mono text-[11.5px] text-sub">{it.character?.id}</span><span className="truncate text-[13.5px] font-medium">{it.name}</span></span>
                    <span className="truncate text-[12px] text-sub">{it.film.title}</span>
                    {it.character?.role && <span className="line-clamp-2 text-[12px] leading-[1.4] text-ink-3">{it.character.role}</span>}
                    <span className="mt-0.5 flex flex-wrap gap-1">
                      {tags.map(([r, label]) => {
                        const on = r === 'voice' ? !!it.voice?.voiceId && it.voice.voiceIdKind !== 'deleted voice' : has(r);
                        return <span key={r} className={cn('rounded-[6px] border px-1.5 text-[11px]', on ? 'border-edge text-[#D4D4D8]' : 'border-dashed border-edge-strong text-mute')}>{label}</span>;
                      })}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {tab === 'locations' && shown.length > 0 && (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3 max-[760px]:grid-cols-1">
            {shown.map((it) => {
              const views = it.files.filter((f) => f.role === 'view').length;
              return (
                <button key={it.id} type="button" onClick={() => choose(it)} aria-pressed={it.id === sel} aria-label={`${it.location?.id} ${it.name}, ${it.film.title}`}
                  className={cn('flex min-w-0 cursor-pointer flex-col overflow-hidden rounded-[10px] border bg-well p-0 text-left', it.id === sel ? 'border-sub' : 'border-edge hover:border-edge-strong')}>
                  <span className="relative block">
                    <LibThumb it={it} aspect="16 / 9" className="rounded-none border-0 border-b border-line" />
                    <span className="absolute bottom-1.5 left-2 rounded-[4px] bg-black/60 px-1.5 text-[11px] text-[#D4D4D8]">{views ? `${views} views` : 'no views'}</span>
                  </span>
                  <span className="flex flex-col gap-0.5 px-3 pb-3 pt-2.5">
                    <span className="flex items-baseline gap-1.5"><span className="font-mono text-[11.5px] text-sub">{it.location?.id}</span><span className="truncate text-[13.5px] font-medium">{it.name}</span></span>
                    <span className="truncate text-[12px] text-sub">{it.film.title}</span>
                    {it.note && <span className="line-clamp-2 text-[12px] leading-[1.4] text-mute">{it.note}</span>}
                  </span>
                </button>
              );
            })}
          </div>
        )}

        <p className="m-0 text-[12.5px] leading-normal text-sub">
          “Save to the library” sits on each stage’s candidates, and every pick lands here by itself. This page is for finding and reusing: {live.length ? <>open <Link href={`/films/${live[0].slug}`} className="text-ink">{live[0].title}</Link> and use the “From the library” tab at a pick.</> : 'a film in progress takes it from its “From the library” tab.'}
        </p>
      </PageBody>
    </>
  );
}
