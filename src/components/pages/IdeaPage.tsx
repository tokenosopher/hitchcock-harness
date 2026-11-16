'use client';
// Idea (stage 1, at its very start): the title, the idea as the user would tell it, and the setup line already
// filled with the defaults.
// "Start the film" runs the flow's new_film.py through POST /api/films and hands the film to its Alma.
// design/boards/Idea.dc.html (the board shows the page later in the stage; this is its first state).
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { FilmRef } from '@/server/types';
import { useFilms } from '@/components/data/films';
import { useNewFilmModel } from '@/components/data/newFilmModel';
import { Header } from '@/components/shell/Header';
import { PageBody, StageTitle } from '@/components/shell/StageTitle';
import { Badge, Card, CardHead, Dot } from '@/components/shell/atoms';
import { CODE_RE, RESERVED_SLUGS, SETUP_DEFAULTS, codeOf, slugOf, type Ratio } from '@/lib/newFilm';
import { cn } from '@/lib/utils';

interface Taken { drive: 'connected' | 'not connected'; filmsDir: boolean; slugs: string[]; codes: { code: string; film: string }[] }

/** One piece of the setup line. A click turns it into a field (Enter or leaving it keeps the change, Esc drops it). */
function Seg({ label, value, prefix, suffix, onChange, changed, kind = 'text', width = 160, title, bad }: {
  label: string; value: string; prefix?: string; suffix?: string; onChange: (v: string) => void; changed?: boolean;
  kind?: 'text' | 'number' | 'code'; width?: number; title: string; bad?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const done = (keep: boolean) => {
    setEditing(false);
    const v = draft.trim();
    if (keep && v && v !== value) onChange(v);
  };
  if (editing) {
    return (
      <span className="inline-flex h-7 items-center gap-1 rounded-[6px] border border-sub bg-well px-2 text-[13px]">
        {prefix && <span className="text-sub">{prefix}</span>}
        <input
          autoFocus
          aria-label={title}
          value={draft}
          inputMode={kind === 'number' ? 'numeric' : undefined}
          maxLength={kind === 'code' ? 6 : kind === 'number' ? 7 : 80}
          onChange={(e) => setDraft(kind === 'code' ? e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '') : kind === 'number' ? e.target.value.replace(/\D/g, '') : e.target.value)}
          onBlur={() => done(true)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); done(true); }
            if (e.key === 'Escape') { e.preventDefault(); done(false); }
          }}
          style={{ width }}
          className={cn('min-w-0 border-0 bg-transparent p-0 text-ink outline-none', kind !== 'text' && 'font-mono')}
        />
        {suffix && <span className="text-sub">{suffix}</span>}
      </span>
    );
  }
  return (
    <button type="button" title={`${title}: click to change for this film`} aria-label={`${title}: ${label}. Change`}
      onClick={() => { setDraft(value); setEditing(true); }}
      className={cn('inline-flex h-7 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-[6px] border px-2 text-[13px] text-ink hover:border-edge-strong hover:bg-raised',
        bad ? 'border-bad text-bad' : changed ? 'border-sub' : 'border-edge')}>
      {label}
      {changed && !bad && <span aria-label="changed" className="size-1 rounded-full bg-ink" />}
    </button>
  );
}

const Sep = () => <span aria-hidden="true" className="text-faint">·</span>;

export function IdeaPage() {
  const router = useRouter();
  const films = useFilms();
  const model = useNewFilmModel();
  const [title, setTitle] = useState('');
  const [idea, setIdea] = useState('');
  const [ratio, setRatio] = useState<Ratio>(SETUP_DEFAULTS.ratio);
  const [codeEdit, setCodeEdit] = useState<string>();          // set once the user changes the code by hand
  const [budget, setBudget] = useState<number | null>(SETUP_DEFAULTS.budgetCredits);
  const [voices, setVoices] = useState(SETUP_DEFAULTS.voices);
  const [elements, setElements] = useState(SETUP_DEFAULTS.elements);
  const [upscale, setUpscale] = useState(SETUP_DEFAULTS.upscale);
  const [taken, setTaken] = useState<Taken>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const titleRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let live = true;
    fetch('/api/films/new', { cache: 'no-store' })
      .then((r) => (r.ok ? (r.json() as Promise<Taken>) : undefined))
      .then((t) => { if (live && t) setTaken(t); })
      .catch(() => live && setError('The harness server is not answering'));
    return () => { live = false; };
  }, []);

  const slug = slugOf(title);
  const takenCodes = useMemo(() => new Map((taken?.codes ?? []).map((c) => [c.code, c.film])), [taken]);
  const code = codeEdit ?? (title.trim() ? codeOf(title, takenCodes.keys()) : '');
  const codeOwner = code ? takenCodes.get(code) : undefined;
  const codeBad = !!code && (!CODE_RE.test(code) || !!codeOwner);
  const folderTaken = !!slug && !!taken?.slugs.includes(slug);
  const reserved = RESERVED_SLUGS.has(slug);
  const drive = taken?.drive !== 'not connected';

  const problem =
    !drive ? 'Studio folder missing: run ./setup.sh, then reload' :
    taken && !taken.filmsDir ? 'assets/films is missing from the studio folder (run ./setup.sh)' :
    !title.trim() ? undefined :
    !slug ? 'The title needs letters or digits to make the folder name' :
    reserved ? `"${slug}" is a name the harness uses itself; give the film another title` :
    folderTaken ? `assets/films/${slug} already exists; new_film.py never overwrites a film, so give this one another title` :
    codeBad ? (codeOwner ? `The code ${code} is already ${codeOwner}'s` : 'The code must be 2 to 6 capitals or digits') :
    undefined;
  const ready = !!taken && !!title.trim() && !problem && !busy;

  async function start() {
    if (!title.trim()) { titleRef.current?.focus(); setError('Give the film its public title first'); return; }
    if (!ready) return;
    setBusy(true);
    setError(undefined);
    try {
      const r = await fetch('/api/films', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title, idea, ratio, code, budgetCredits: budget, model,
          ...(voices !== SETUP_DEFAULTS.voices ? { voices } : {}),
          ...(elements !== SETUP_DEFAULTS.elements ? { elements } : {}),
          ...(upscale !== SETUP_DEFAULTS.upscale ? { upscale } : {}),
        }),
      });
      const body = (await r.json().catch(() => ({}))) as { slug?: string; film?: FilmRef; error?: string };
      if (!r.ok || !body.slug) {
        setError(body.error ?? `The film was not started (${r.status})`);
        setBusy(false);
        return;
      }
      films.add(body.film ?? { slug: body.slug, title, folder: '', repo: '', flow: 'video-driven', status: 'in-progress', stage: 1, aspect: ratio });
      router.push(`/films/${body.slug}`);
    } catch {
      setError('The harness server is not answering');
      setBusy(false);
    }
  }

  const folder = slug ? `assets/films/${slug}` : 'assets/films/…';
  const message = error ?? problem;

  return (
    <>
      <Header crumbs={[{ label: 'Films' }, { label: 'New film' }]} meta={`${ratio} · ${folder} · made when you press Start`} phoneSub="Stage 1 · the idea" />
      <PageBody>
        <StageTitle kicker="Stage 1 · Setup and story" title="The idea"
          sub="Your idea becomes the film's setup and a brief. The Story page opens when the brief is written." />

        <Card>
          <CardHead label="The idea · as you’d tell it" right="brief.md" />
          <div className="flex flex-col gap-4 p-4">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="film-title" className="lbl">Title</label>
              <input id="film-title" ref={titleRef} autoFocus required aria-required="true" value={title} maxLength={120}
                onChange={(e) => { setTitle(e.target.value.replace(/\//g, '')); setError(undefined); }}
                placeholder="The public title"
                className="h-11 w-full rounded-lg border border-edge bg-well px-3 text-[17px] font-semibold tracking-[-0.01em] text-ink outline-none placeholder:font-normal placeholder:text-mute focus:border-edge-strong" />
              <span className="text-[12px] text-sub">It names the folder, the final-cuts folder and the Higgsfield project.</span>
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="film-idea" className="lbl">The idea</label>
              <textarea id="film-idea" value={idea} onChange={(e) => setIdea(e.target.value)} rows={9}
                onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); void start(); } }}
                placeholder="Paste the idea, a seed story or a whole script, as you’d tell it. Say here only what differs from the setup below."
                className="scroll min-h-[220px] w-full resize-y rounded-lg border border-edge bg-well px-3.5 py-3 text-[15px] leading-[1.6] text-ink outline-none placeholder:text-mute focus:border-edge-strong" />
            </div>
          </div>
        </Card>

        <Card>
          <CardHead label="Setup · taken at face value" right="never asked" />
          <div className="flex flex-col gap-3.5 p-4">
            <div className="flex flex-wrap items-center gap-x-1.5 gap-y-2" aria-label="Setup">
              <button type="button" onClick={() => setRatio(ratio === '9:16' ? '16:9' : '9:16')} title="Aspect ratio: click to change for this film"
                aria-label={`Aspect ratio ${ratio}. Change to ${ratio === '9:16' ? '16:9' : '9:16'}`}
                className={cn('inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-[6px] border px-2 font-mono text-[12.5px] text-ink hover:border-edge-strong hover:bg-raised', ratio !== SETUP_DEFAULTS.ratio ? 'border-sub' : 'border-edge')}>
                {ratio}{ratio !== SETUP_DEFAULTS.ratio && <span aria-label="changed" className="size-1 rounded-full bg-ink" />}
              </button>
              <Sep />
              <Seg title="Short code" label={`code ${code || '…'}`} prefix="code" value={code} kind="code" width={64}
                onChange={(v) => setCodeEdit(v)} changed={codeEdit !== undefined} bad={codeBad} />
              <Sep />
              <Seg title="Budget" label={budget ? `budget ${budget} credits` : 'no budget set'} prefix="budget" suffix="credits" value={String(budget ?? '')} kind="number" width={56}
                onChange={(v) => setBudget(Number(v) || null)} changed={budget !== SETUP_DEFAULTS.budgetCredits} />
              <Sep />
              <Seg title="Voices" label={voices} value={voices} onChange={setVoices} changed={voices !== SETUP_DEFAULTS.voices} width={170} />
              <Sep />
              <Seg title="Video elements" label={`elements ${elements}`} prefix="elements" value={elements} onChange={setElements} changed={elements !== SETUP_DEFAULTS.elements} width={120} />
              <Sep />
              <Seg title="1080p" label={`1080p by ${upscale}`} prefix="1080p by" value={upscale} onChange={setUpscale} changed={upscale !== SETUP_DEFAULTS.upscale} width={130} />
            </div>
            <p className="m-0 text-[12.5px] leading-normal text-sub">
              Alma never asks for these. Change one here only when this film differs; a changed one carries a dot.
            </p>
            <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5 border-t border-line pt-3.5">
              <span className="lbl">Folder</span>
              <span className={cn('font-mono text-[12.5px]', folderTaken || reserved ? 'text-bad' : slug ? 'text-ink' : 'text-mute')}>{folder}</span>
              {slug && (folderTaken || reserved ? <Badge className="border-bad text-bad">exists</Badge> : taken ? <Badge dim dashed>new</Badge> : null)}
            </div>
          </div>
        </Card>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-2.5">
          <button type="button" onClick={() => void start()} disabled={busy || (!!title.trim() && !ready)}
            className="inline-flex h-10 cursor-pointer items-center gap-2 whitespace-nowrap rounded-lg bg-ink px-4 text-[14px] font-medium text-bg hover:bg-ink-3 disabled:cursor-not-allowed disabled:opacity-50">
            {busy && <Dot state="running" />}{busy ? 'Making the folder…' : 'Start the film'}
          </button>
          <span className="min-w-0 flex-[1_1_320px] text-[12.5px] leading-normal text-sub">
            Runs the flow’s new_film.py, then Alma starts stage 1. Nothing is generated and nothing is spent until the script locks.
          </span>
        </div>
        {message && <p role="alert" className="m-0 -mt-2 text-[12.5px] leading-normal text-bad">{message}</p>}

        <Card>
          <CardHead label="What happens at Start" />
          <ul className="m-0 flex list-none flex-col p-0">
            {[
              ['new_film.py · ' + folder, 'the folder tree, brief.md, spend.md, review/cards.json, higgsfield.json; the folder is added to films.txt'],
              ['Alma › brief · stage 1', 'fills brief.md from your idea and the setup line, with the film skill'],
              ['Alma › research, then the script', 'the first draft for you to read; your lock is the go for the first round of assets'],
            ].map(([what, how], i) => (
              <li key={i} className={cn('flex items-start gap-3 px-4 py-3', i > 0 && 'border-t border-line')}>
                <Dot state="waiting" className="mt-[7px]" />
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className={cn('text-[13px] text-ink', i === 0 && 'font-mono text-[12.5px]')}>{what}</span>
                  <span className="text-[12.5px] leading-normal text-sub">{how}</span>
                </span>
              </li>
            ))}
          </ul>
        </Card>
      </PageBody>
    </>
  );
}
