'use client';
// The feed: everything Alma has shown the user, read from the film's review/cards.json and put on the page of
// the work it belongs to (GET /api/films/[film]/feed). A card that asks (a round of readings, music takes, a
// yes, the go for a quoted job) sits on top: a tap sets the answer aside and "Done picking" sends them all;
// the rest is history, one row per card, newest first, folded until opened. This is the place for every kind
// of work the pages have no panel of their own for.
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import type { FeedAsk, FeedCard, FeedMedia, FeedOption, FeedPlace } from '@/server/types';
import { useFilm } from '@/components/data/film';
import { useUI } from '@/components/data/ui';
import { fmtDate, plural, repoPath } from '@/components/lib/format';
import { Media, mediaUrl } from '@/components/media/Media';
import { PlayButton, PlayLine } from '@/components/media/Sound';
import { Badge, Btn } from '@/components/shell/atoms';
import { useJson } from '@/components/pages/postCommon';
import { cn } from '@/lib/utils';
import { Who } from './Who';
import { choose, unchoose, useChoice } from '@/components/data/choices';
import { ClearChoice } from '@/components/shell/ClearChoice';
import { Reveal } from '@/components/shell/Reveal';
import { IconFile } from '@/components/shell/icons';
import { refData } from '@/components/lib/refPick';
import { cardRefOf } from '@/components/shell/refItems';
import { SoundPicks } from './SoundPicks';
import { CutButton, sceneInCut } from './CutButton';
import { takeCutOf } from '@/components/edit/cutLink';
import { CardText, longSub } from './CardText';
import { WhyPanel } from './WhyPanel';
import { isRemovedAnswer } from '@/components/lib/remove';
import { almaFetch } from '@/components/data/almaOutbox';
import { askLayout, bodyMedia, optionMediaOf, readHref, readOf, wideBox } from './askMedia';
import { FilmButton, HearInFilm, RingPlay, useHearData, Wave, type HearHandle } from './SoundChoice';
import { momentsOf } from './hearIt';

interface FeedData { cards: FeedCard[]; total: number; warnings: string[] }
type ToRepo = (rel: string) => string;

const isOpen = (c: FeedCard): boolean => !!c.ask && !c.ask.answer;
const visual = (m: { kind?: string; path?: string }): boolean => m.kind === 'video' || m.kind === 'image';
const short = (s: string, n = 44): string => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);
/** What a message opened from a card is about, as Alma reads it beside the card's chip: its whole title and its id. */
const cardAbout = (card: FeedCard): string => `the card "${card.title}"${card.id ? ` (${card.id})` : ''}`;
const ASK_WORD: Record<FeedAsk['kind'], string> = { pick: 'Pick one', yes: 'Yes or no', go: 'Your go', why: 'Why?', debrief: 'Your answers' };
const askWord = (c: FeedCard): string => (c.sounds?.length ? 'Pick each' : ASK_WORD[c.ask!.kind]);

/** The debrief's card: how far the answers are, and the way to the page where they are given. */
function DebriefLink({ film, card }: { film: string; card: FeedCard }) {
  const d = card.debrief;
  const left = d ? d.questions - d.answered - d.skipped : 0;
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
      <Link href={`/films/${film}/debrief`} className="inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-lg bg-ink px-3 text-[13px] font-medium text-bg no-underline transition-colors duration-200 hover:bg-ink-3">
        {d && (d.answered || d.skipped) ? 'Go on with the debrief' : 'Open the debrief'}
      </Link>
      {d && <span className="text-[12.5px] tabular-nums text-sub">{d.answered} answered · {d.skipped} skipped · {left} to go</span>}
    </div>
  );
}

/** What a card that asks answers with: its sounds, a why, the debrief's page, or the options and buttons. */
function Answer({ film, card, toRepo, from, onAnswered }: { film: string; card: FeedCard; toRepo: ToRepo; from: string; onAnswered?: (option?: string) => void }) {
  if (card.sounds?.length) return <SoundPicks film={film} card={card} toRepo={toRepo} from={from} open={!card.ask?.answer} />;
  if (card.ask?.kind === 'why') return <WhyPanel film={film} card={card} from={from} />;
  if (card.ask?.kind === 'debrief') return <DebriefLink film={film} card={card} />;
  return <AskPanel film={film} card={card} toRepo={toRepo} from={from} onAnswered={onAnswered} />;
}

/** "6 clips · 2 sounds": what a folded card holds. */
function mediaLine(media: FeedMedia[]): string {
  const n = (k: FeedMedia['kind']) => media.filter((m) => m.kind === k).length;
  return [n('video') ? plural(n('video'), 'clip') : '', n('image') ? plural(n('image'), 'picture') : '', n('audio') ? plural(n('audio'), 'sound') : '', n('file') ? plural(n('file'), 'file') : '']
    .filter(Boolean).join(' · ');
}

function AudioRow({ m, toRepo, onChip }: { m: FeedMedia; toRepo: ToRepo; onChip?: () => void }) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <PlayButton path={toRepo(m.path)} label={m.label ?? m.path.split('/').pop() ?? 'sound'} />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <button type="button" onClick={onChip} title={m.path} className="min-w-0 cursor-pointer border-0 bg-transparent p-0 text-left">
          <span className="block truncate text-[12.5px] text-ink-2">{m.label ?? m.path.split('/').pop()}</span>
          {m.sub && <span className="block truncate text-[11.5px] text-mute">{m.sub}</span>}
        </button>
        <PlayLine path={toRepo(m.path)} className="max-w-[420px]" />
      </div>
    </div>
  );
}

function VisualTile({ m, toRepo, selected, onSelect }: { m: FeedMedia; toRepo: ToRepo; selected?: boolean; onSelect?: () => void }) {
  const path = toRepo(m.path);
  const box = cn('aspect-[3/4] w-full rounded-[6px] border bg-black', selected ? 'border-ink outline outline-1 outline-offset-1 outline-ink' : 'border-edge');
  return (
    <figure data-zoom-item className="m-0 flex min-w-0 flex-col gap-1.5">
      {m.kind === 'video'
        ? <Media path={path} w={320} fit="contain" play className={box} />
        : <a href={mediaUrl(path)} target="_blank" rel="noreferrer" aria-label={`Open ${m.label ?? m.path.split('/').pop()}`} className="block no-underline"><Media path={path} w={320} fit="contain" className={box} /></a>}
      {(m.label || onSelect) && (
        <figcaption className="flex min-w-0 items-start gap-1.5 text-[11.5px] leading-snug text-sub">
          {onSelect && (
            <button type="button" role="radio" aria-checked={!!selected} aria-label={`Choose ${m.label ?? m.option}`} onClick={onSelect} data-zoom-choose
              className={cn('mt-px flex size-3.5 flex-none cursor-pointer items-center justify-center rounded-full border bg-transparent p-0', selected ? 'border-ink' : 'border-mute')}>
              {selected && <span className="size-1.5 rounded-full bg-ink" />}
            </button>
          )}
          <span className={cn('line-clamp-2 min-w-0', selected && 'text-ink')} title={m.label}>{m.label}</span>
        </figcaption>
      )}
    </figure>
  );
}

/** A card's files: clips and pictures in a grid, sounds as rows with a player, other files as links. */
function MediaBlock({ media, toRepo, onChip }: { media: FeedMedia[]; toRepo: ToRepo; onChip: (m: FeedMedia) => void }) {
  const seen = media.filter(visual);
  const heard = media.filter((m) => m.kind === 'audio');
  const files = media.filter((m) => m.kind === 'file');
  if (!media.length) return null;
  return (
    <div className="flex flex-col gap-3">
      {seen.length > 0 && (
        <div data-zoom-set className="grid grid-cols-[repeat(auto-fill,minmax(128px,1fr))] gap-x-2.5 gap-y-3">
          {seen.map((m) => <VisualTile key={m.path + (m.label ?? '')} m={m} toRepo={toRepo} />)}
        </div>
      )}
      {heard.length > 0 && <div className="flex flex-col gap-2">{heard.map((m) => <AudioRow key={m.path + (m.label ?? '')} m={m} toRepo={toRepo} onChip={() => onChip(m)} />)}</div>}
      {files.length > 0 && (
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          {files.map((m) => (
            <a key={m.path} href={mediaUrl(toRepo(m.path))} target="_blank" rel="noreferrer" onClick={() => onChip(m)} className="font-mono text-[11.5px] text-sub underline decoration-edge-strong underline-offset-2 hover:text-ink">{m.label ?? m.path.split('/').pop()}</a>
          ))}
        </div>
      )}
    </div>
  );
}

/** One picture or clip of an asking card, its label under it. At full width the box takes the picture's own shape
 *  once it has loaded (askMedia.ts wideBox); in a grid, a 4:3 box. */
function AskTile({ m, toRepo, w, wide }: { m: FeedMedia; toRepo: ToRepo; w: number; wide: boolean }) {
  const [size, setSize] = useState<[number, number]>();
  const box = wideBox(size?.[0], size?.[1]);
  const onLoad = (e: React.SyntheticEvent<HTMLElement>) => {
    const t = e.target as HTMLImageElement;
    if (t.tagName === 'IMG' && t.naturalWidth && t.naturalHeight) setSize([t.naturalWidth, t.naturalHeight]);
  };
  return (
    <figure data-zoom-item onLoadCapture={wide ? onLoad : undefined} style={wide ? { maxWidth: box.maxW } : undefined} className="m-0 flex w-full min-w-0 flex-col gap-1.5">
      <div style={wide ? { aspectRatio: box.ratio } : undefined} className={cn('w-full transition-[aspect-ratio] duration-200 ease-out motion-reduce:transition-none', !wide && 'aspect-[4/3]')}>
        <Media path={toRepo(m.path)} w={w} fit="contain" play={m.kind === 'video'} alt={m.label ?? m.path.split('/').pop()}
          className="size-full rounded-[6px] border border-edge bg-black" />
      </div>
      {m.label && <figcaption className="min-w-0 text-[12px] leading-snug text-sub" title={m.path}>{m.label}{m.sub && <span className="block text-mute">{m.sub}</span>}</figcaption>}
    </figure>
  );
}

/** An asking card's files, large enough to judge on a phone: one or two pictures or clips at the card's full width,
 *  more in a grid, each with its label under it; a tap on a picture opens the full-screen view, a clip plays in place.
 *  Sounds and other files as in any card. */
function AskMediaBlock({ media, toRepo, onChip }: { media: FeedMedia[]; toRepo: ToRepo; onChip: (m: FeedMedia) => void }) {
  const seen = media.filter(visual);
  const rest = media.filter((m) => !visual(m));
  // pictures with a sound beside them (a character's element go: the sheet, the face and the line) sit as a
  // row of tiles above the sound, however few
  const { wide, w } = askLayout(seen.length, rest.some((m) => m.kind === 'audio'));
  return (
    <>
      {seen.length > 0 && (
        <div data-ask-media={wide ? 'wide' : 'grid'} data-zoom-set
          className={cn('grid gap-x-2.5 gap-y-3', wide ? 'max-w-[760px] grid-cols-1' : 'grid-cols-2 min-[761px]:grid-cols-[repeat(auto-fill,minmax(200px,1fr))]')}>
          {seen.map((m) => <AskTile key={m.path + (m.label ?? '')} m={m} toRepo={toRepo} w={w} wide={wide} />)}
        </div>
      )}
      <MediaBlock media={rest} toRepo={toRepo} onChip={onChip} />
    </>
  );
}

type Phase = { k: 'idle' } | { k: 'busy' } | { k: 'done'; text: string } | { k: 'error'; text: string };

/** The answer: a tap sets it aside (data/choices.ts) and "Done picking" at the foot of the page sends everything set
 *  aside in one press, the only confirm. No per-card confirm. */
function AskPanel({ film, card, toRepo, from, onAnswered }: { film: string; card: FeedCard; toRepo: ToRepo; from: string; onAnswered?: (option?: string) => void }) {
  const ask = card.ask!;
  const ui = useUI();
  // Nothing is preselected: Alma's prediction is shown, and only what the user taps is a choice. Another option of
  // the same card takes the old one's place; the chosen Yes or Go tapped again is taken back.
  const cid = `card:${card.key}`;
  const mine = useChoice(film, cid);
  const sel = mine?.answer?.option;
  const about = `${card.ids[0] ? `${card.ids[0]} · ` : ''}${short(card.title, 44)}`;
  // the chosen option tapped again is cleared, as the chosen Yes or Go is
  const setSel = (id: string) => sel === id ? unchoose(film, cid) : choose(film, { id: cid, label: `${about} · ${ask.options.find((o) => o.id === id)?.label || id}`, answer: { card: card.key, option: id, kind: 'pick' } });
  const setYes = () => (mine ? unchoose(film, cid) : choose(film, { id: cid, label: `${about} · ${ask.kind === 'go' ? `go${ask.cost ? ` (${short(ask.cost, 30)})` : ''}` : 'yes'}`, answer: { card: card.key, kind: ask.kind === 'go' ? 'go' : 'yes', cost: ask.cost } }));
  const [p, setP] = useState<Phase>({ k: 'idle' });
  const mediaOf = (o: FeedOption): FeedMedia | undefined => optionMediaOf(card, o);
  const withFile = ask.options.map((o) => ({ o, m: mediaOf(o) }));
  const tiles = withFile.filter((x) => x.m && visual(x.m));
  const { state } = useFilm();
  const inCut = sceneInCut(state, card.ids.find((x) => /^S\d+$/.test(x)));
  const rows = withFile.filter((x) => !x.m || !visual(x.m));
  // a pick among sounds: each heard on the card, and in the film where the card places them
  const sounds = rows.some((x) => x.m?.kind === 'audio');
  const hearData = useHearData(sounds ? film : '', card.key);
  const hearRef = useRef<HearHandle>(null);
  const moments = card.hear?.moments ?? [];
  // a card with its own yes and no words (Release, stage 3) answers at once: the card itself is the second look
  const send = async (no?: boolean) => {
    setP({ k: 'busy' });
    try {
      const r = await almaFetch(film, `/api/films/${film}/answer`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ card: card.key, option: no ? 'no' : undefined, from }) });
      const j = (await r.json().catch(() => ({}))) as { error?: string };
      if (r.ok) unchoose(film, cid);
      if (r.ok) setP({ k: 'done', text: no ? `${ask.noLabel}: sent to Alma.` : `${ask.yesLabel}: your go is given. Alma does exactly what the card shows, nothing more.` });
      else setP({ k: 'error', text: j.error ?? `The answer failed (${r.status})` });
      if (r.ok) onAnswered?.(no ? 'no' : 'yes');
    } catch {
      setP({ k: 'error', text: 'The harness server is not answering' });
    }
  };
  const elsewhere = () => ui.about({ id: `card:${card.key}`, label: `card · ${short(card.title, 32)}` }, cardAbout(card), 'Say something about this card…');
  if (p.k === 'done') return <p role="status" className="m-0 text-[12.5px] leading-normal text-ink-3">{p.text}</p>;
  const chosenMark = <span data-chosen className="inline-flex items-center gap-1.5 text-[12.5px] text-ink duration-200 animate-in fade-in-0"><span aria-hidden="true" className="size-1.5 rounded-full bg-ink" />Chosen · goes with Done picking</span>;
  return (
    <div className="flex flex-col gap-3">
      {ask.kind === 'pick' && (
        <div role="radiogroup" aria-label={`Options for ${card.title}`} className="flex flex-col gap-3">
          {tiles.length > 0 && (
            <div data-zoom-set className="grid grid-cols-[repeat(auto-fill,minmax(128px,1fr))] gap-x-2.5 gap-y-3">
              {tiles.map(({ o, m }) => {
                const tile = <VisualTile key={o.id} m={{ ...m!, label: o.label || m!.label || o.id, option: o.id }} toRepo={toRepo} selected={sel === o.id} onSelect={() => setSel(o.id)} />;
                // a take of a scene that is in the cut: tried in its shot's place on the Edit page
                const tc = inCut ? takeCutOf(m!.path) : undefined;
                return tc ? <div key={o.id} className="flex min-w-0 flex-col gap-1.5">{tile}<CutButton film={film} cut={tc} className="h-6 px-2 text-[11.5px]" /></div> : tile;
              })}
            </div>
          )}
          {rows.map(({ o, m }) => {
            const on = sel === o.id;
            if (m?.kind === 'audio') {
              const placed = momentsOf(moments, o.id).length > 0;
              return (
                <div key={o.id} data-sound-option={o.id} className={cn('flex min-w-0 items-center gap-2.5 rounded-lg border py-1.5 pl-1.5 pr-2 transition-colors duration-200', on ? 'border-sub bg-raised' : 'border-edge')}>
                  <RingPlay path={toRepo(m.path)} label={o.label || o.id} />
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <button type="button" role="radio" aria-checked={on} onClick={() => setSel(o.id)} className="flex min-h-6 min-w-0 cursor-pointer items-center gap-2.5 border-0 bg-transparent p-0 text-left text-ink">
                      <span aria-hidden="true" className={cn('flex size-3.5 flex-none items-center justify-center rounded-full border transition-colors duration-200', on ? 'border-ink' : 'border-mute')}>{on && <span className="size-1.5 rounded-full bg-ink duration-150 animate-in zoom-in-50 motion-reduce:animate-none" />}</span>
                      <span className="min-w-0 flex-1 truncate text-[13px]">{o.label || o.id}</span>
                      {o.id === ask.prediction && <span className="flex-none rounded-[4px] bg-ink px-1.5 py-px text-[10px] font-semibold text-bg">Alma</span>}
                    </button>
                    <Wave path={toRepo(m.path)} label={o.label || o.id} peaks={hearData?.peaks[m.path]} seconds={hearData?.seconds[m.path]} className="pl-6" />
                  </div>
                  {placed && <FilmButton label={o.label || o.id} onClick={() => hearRef.current?.play(o.id)} />}
                </div>
              );
            }
            return (
              <div key={o.id} className={cn('flex min-w-0 items-center gap-3 rounded-lg border px-3 py-2 transition-colors duration-200', on ? 'border-sub bg-raised' : 'border-edge')}>
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <button type="button" role="radio" aria-checked={on} onClick={() => setSel(o.id)} className="flex min-w-0 cursor-pointer items-start gap-2.5 border-0 bg-transparent p-0 text-left text-ink">
                    <span aria-hidden="true" className={cn('mt-[3px] flex size-3.5 flex-none items-center justify-center rounded-full border', on ? 'border-ink' : 'border-mute')}>{on && <span className="size-1.5 rounded-full bg-ink" />}</span>
                    <span className="min-w-0 flex-1 whitespace-pre-wrap break-words text-[13px] leading-[1.45]">{o.label || o.id}</span>
                    {o.id === ask.prediction && <span className="mt-px flex-none rounded-[4px] bg-ink px-1.5 py-px text-[10px] font-semibold text-bg">Alma</span>}
                  </button>
                </div>
              </div>
            );
          })}
          {sounds && moments.length > 0 && (
            <HearInFilm ref={hearRef} film={film} card={card.key} moments={moments} data={hearData} toRepo={toRepo} prediction={ask.prediction} chosen={sel}
              options={ask.options.filter((o) => momentsOf(moments, o.id).length).map((o) => ({ id: o.id, label: o.label || o.id }))} />
          )}
        </div>
      )}
      {ask.kind === 'go' && ask.cost && <p className="m-0 text-[13px] leading-normal"><span className="text-sub">The quote: </span>{ask.cost}</p>}
      {ask.prediction && ask.kind === 'pick' && (
        <p className="m-0 text-[12.5px] leading-normal text-ink-3">Alma predicts <span className="font-mono text-[12px] text-ink">{ask.options.find((o) => o.id === ask.prediction)?.label || ask.prediction}</span><span className="text-sub"> · said before your pick, from your earlier picks</span></p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        {p.k === 'busy' ? (
          <Btn disabled>Sending…</Btn>
        ) : ask.yesLabel ? (
          <>
            <Btn primary data-card-yes onClick={() => void send()}>{ask.yesLabel}</Btn>
            {ask.noLabel && <Btn data-card-no onClick={() => void send(true)}>{ask.noLabel}</Btn>}
          </>
        ) : ask.kind === 'pick' ? (
          <>
            {mine ? chosenMark : <span className="text-[12.5px] text-sub">Tap one to choose it.</span>}
            <ClearChoice shown={!!mine} onClear={() => unchoose(film, cid)} />
            <Btn ghost onClick={elsewhere}>Say something else</Btn>
          </>
        ) : (
          <>
            {/* the go names its quote on the button; tapped again, the chosen yes or go is taken back */}
            <Btn primary={!mine} onClick={setYes} aria-pressed={!!mine}>
              {mine ? <>{ask.kind === 'go' ? 'Go' : 'Yes'} · chosen</> : ask.kind === 'go' ? <>Go{ask.cost ? ` · ${short(ask.cost, 36)}` : ''}</> : 'Yes'}
            </Btn>
            <Btn ghost onClick={elsewhere}>Say something else</Btn>
            {mine && <span className="text-[12px] text-mute duration-200 animate-in fade-in-0">Goes with Done picking</span>}
            <ClearChoice shown={!!mine} onClear={() => unchoose(film, cid)} />
          </>
        )}
        {p.k === 'error' && <span role="alert" className="text-[12px] text-bad">{p.text}</span>}
      </div>
    </div>
  );
}

function CardBody({ card, toRepo, hideOptions }: { card: FeedCard; toRepo: ToRepo; hideOptions?: boolean }) {
  const ui = useUI();
  const film = useFilm().state?.film.slug ?? '';
  // the files that are a pick's options show inside the answer, not twice; every other file shows here (askMedia.ts)
  const media = bodyMedia(card, hideOptions);
  const onChip = (m: FeedMedia) => ui.addChip({ id: `file:${m.path}`, label: short(m.label ?? m.path.split('/').pop() ?? m.path, 32), ref: toRepo(m.path) });
  return (
    <>
      {/* the line under the title: one quiet line as written; with line breaks, a list or many words it is drawn as the
          card's text is (paragraphs, lists, folded under "Show more"), never as one unbroken paragraph */}
      {card.sub && (longSub(card.sub)
        ? <CardText text={[card.sub]} film={film} />
        : <p className="m-0 max-w-[760px] text-[12.5px] leading-normal text-sub">{card.sub}</p>)}
      {card.quote && <blockquote data-card-quote className="m-0 max-w-[760px] whitespace-pre-wrap break-words border-l-2 border-edge-strong pl-3 text-[13px] leading-[1.5] text-ink">{card.quote}</blockquote>}
      {card.fileLine && (
        <p data-card-file className="m-0 flex max-w-[760px] items-start gap-2 text-[12.5px] leading-[1.45] text-ink-3" title={card.fileLine.path}>
          <IconFile size={13} className="mt-0.5 flex-none text-sub" />
          <span className="min-w-0 break-words">{card.fileLine.name}{card.fileLine.sub && <span className="block text-sub">{card.fileLine.sub}</span>}</span>
        </p>
      )}
      {card.text?.length ? <CardText text={card.text} film={film} /> : null}
      {card.note && <p data-card-note className="m-0 max-w-[760px] rounded-lg bg-raised px-3 py-2 text-[12.5px] leading-[1.45] text-ink-2">{card.note}</p>}
      {/* the place on the cut the card is about: the Edit page opens there */}
      {card.cut && film && <CutButton film={film} cut={card.cut} />}
      {hideOptions ? <AskMediaBlock media={media} toRepo={toRepo} onChip={onChip} /> : <MediaBlock media={media} toRepo={toRepo} onChip={onChip} />}
    </>
  );
}

/** A card that waits for the user: always open, the answer inside it. Used on its page and at the gate. */
export function AskCard({ film, card, toRepo, from, where, onAnswered }: { film: string; card: FeedCard; toRepo: ToRepo; from: string; where?: React.ReactNode; onAnswered?: (option?: string) => void }) {
  const { state } = useFilm();
  const [busy, setBusy] = useState(false);
  const locked = !!card.ask?.progress;
  // a card about the story or the script: the way to read it on its page, not pasted into the card (askMedia.ts readOf);
  // left out on the Story page itself, where the story and the script are already
  const read = readOf(card);
  const onReadPage = usePathname() === `/films/${film}/story`;
  const unlock = () => {
    setBusy(true);
    void fetch(`/api/films/${film}/progress`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ card: card.key, on: false }) }).finally(() => setBusy(false));
  };
  if (locked) {
    const p = card.ask!.progress!;
    return (
      <article aria-label={`${card.title}, in progress`} {...refData(cardRefOf(card))} className="flex min-w-0 flex-col gap-3 rounded-[10px] border border-dashed border-edge bg-panel px-4 py-3.5">
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          <span aria-hidden="true" className="size-[7px] flex-none animate-pulse rounded-full bg-sub" />
          {card.id && <span className="font-mono text-[12px] text-mute">{card.id}</span>}
          <h3 className="m-0 min-w-0 text-[14px] font-medium leading-snug text-ink-2">{card.title}</h3>
          <Badge>In progress</Badge>
          <span className="ml-auto flex flex-none items-center gap-2 text-[12px] text-mute">{where}{card.date && <span>{fmtDate(card.date)}</span>}</span>
        </div>
        <p className="m-0 max-w-[760px] text-[12.5px] leading-normal text-sub">
          {p.note ?? (p.by === 'harness' ? 'You wrote to Alma about this instead of choosing. She is working on it; none of the options below was used.' : 'Alma is working on this. None of the options below was used.')}
        </p>
        <fieldset disabled aria-label="The options, locked while this is in progress" className="pointer-events-none m-0 flex min-w-0 select-none flex-col gap-3 border-0 p-0 opacity-45 grayscale">
          <CardBody card={card} toRepo={toRepo} hideOptions />
          <Answer film={film} card={card} toRepo={toRepo} from={from} />
        </fieldset>
        {p.by === 'harness' && (
          <div><Btn ghost className="-ml-2.5 h-7 text-[12.5px]" disabled={busy} onClick={unlock}>Unlock the options</Btn></div>
        )}
      </article>
    );
  }
  return (
    <article {...refData(cardRefOf(card))} className="flex min-w-0 flex-col gap-3 rounded-[10px] border border-edge-strong bg-panel px-4 py-3.5">
      <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
        <span aria-hidden="true" className="box-border size-[7px] flex-none rounded-full border-[1.5px] border-ink bg-bg" />
        {card.id && <span className="font-mono text-[12px] text-sub">{card.id}</span>}
        <h3 className="m-0 min-w-0 text-[14px] font-medium leading-snug">{card.title}</h3>
        <Badge>{askWord(card)}</Badge>
        <span className="ml-auto flex flex-none items-center gap-2 text-[12px] text-mute">{where}{card.date && <span>{fmtDate(card.date)}</span>}</span>
      </div>
      {state && <Who state={state} ids={card.ids} text={card.who} face={card.place !== 'faces'} shown={card.media.map((m) => m.path)} />}
      {/* the yes on the 1080p master shows the master it is about (ASKS 37: "I can't see where the video is") */}
      {state?.master && state.master.ask?.key === card.key && !card.media.length && (
        <div className="flex items-end gap-3">
          <Media path={toRepo(state.master.path)} w={320} t={1} play fit="contain" className="aspect-[9/16] w-[96px] flex-none rounded-[6px] border border-edge bg-black" />
          <Link href={`/films/${film}/edit`} className="text-[12.5px] text-sub no-underline transition-colors duration-200 hover:text-ink">
            See {state.master.version ? `cut ${state.master.version}` : 'it'} at full size on the timeline ›
          </Link>
        </div>
      )}
      <CardBody card={card} toRepo={toRepo} hideOptions />
      {read && !onReadPage && (
        <Link href={readHref(film, read)} data-card-read={read.what}
          className="self-start text-[12.5px] text-sub no-underline transition-colors duration-200 animate-in fade-in-0 hover:text-ink">
          Read the {read.what} ›
        </Link>
      )}
      <Answer film={film} card={card} toRepo={toRepo} from={from} onAnswered={onAnswered} />
    </article>
  );
}

function HistoryRow({ card, toRepo }: { card: FeedCard; toRepo: ToRepo }) {
  const [open, setOpen] = useState(false);
  const ui = useUI();
  const { state } = useFilm();
  const a = card.ask?.answer;
  const picked = a ? (card.ask!.options.find((o) => o.id === a.option)?.label || a.option) : undefined;
  const k = card.ask?.kind;
  const said = !a ? ''
    : card.sounds?.length ? `${card.sounds.length} sounds answered`
      : k === 'debrief' ? `answers sent${card.debrief ? ` · ${card.debrief.answered} answered` : ''}`
        : k === 'why' ? (a.option === 'skip' ? 'skipped' : 'you said why')
          : isRemovedAnswer(a.option) ? 'removed, not answered'
          : a.option === 'no' && card.ask!.noLabel ? card.ask!.noLabel.toLowerCase() : picked ? `you picked ${short(picked, 28)}` : k === 'go' ? 'go given' : 'yes given';
  const line = [mediaLine(card.media), said].filter(Boolean).join(' · ');
  return (
    <li className="border-t border-line first:border-t-0">
      <button type="button" aria-expanded={open} onClick={() => setOpen(!open)}
        className="grid w-full cursor-pointer grid-cols-[52px_minmax(0,1fr)_auto] items-baseline gap-x-3 border-0 bg-transparent px-4 py-2.5 text-left text-ink hover:bg-raised max-[760px]:grid-cols-[minmax(0,1fr)_auto]">
        <span className="whitespace-nowrap text-[11.5px] tabular-nums text-mute max-[760px]:hidden">{card.date ? fmtDate(card.date) : ''}</span>
        <span className={cn('min-w-0 text-[13px]', open ? 'font-medium' : 'truncate')}>{card.title}</span>
        <span className="flex flex-none items-center gap-2 whitespace-nowrap text-[11.5px] text-mute">
          {line}
          <svg className={cn('flex-none transition-transform', open && 'rotate-180')} width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>
        </span>
      </button>
      <Reveal open={open}>
        <div className="flex flex-col gap-3 px-4 pb-4 pt-0.5 min-[761px]:pl-[80px]">
          <CardBody card={card} toRepo={toRepo} />
          {state && card.sounds?.length ? <SoundPicks film={state.film.slug} card={card} toRepo={toRepo} from="" open={false} /> : null}
          {k === 'debrief' && state && <DebriefLink film={state.film.slug} card={card} />}
          {a?.note && <p className="m-0 text-[12.5px] text-sub">{k === 'why' ? 'Your reason' : 'Your note'}: {a.note}</p>}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <Btn ghost className="-ml-2.5 h-7 text-[12.5px]" onClick={() => ui.about({ id: `card:${card.key}`, label: `card · ${short(card.title, 32)}` }, cardAbout(card), 'Ask Alma about this card…')}>Ask Alma about this</Btn>
            <span className="truncate text-[11.5px] text-mute">{[card.section, card.group].filter(Boolean).join(' › ')}</span>
          </div>
        </div>
      </Reveal>
    </li>
  );
}

/** Clips shown on a scene that are not its takes or its previz: test takes and trials (12 Nov). They sit in the
 *  open, right under the takes, because a clip folded away under "Shown to you" was not found. `#tests` jumps here. */
export function OtherClips({ scene }: { scene: string }) {
  const { state } = useFilm();
  const film = state?.film;
  const { data } = useJson<FeedData>(film ? `/api/films/${film.slug}/feed?id=${scene}` : undefined, state?.updatedAt);
  const ref = useRef<HTMLElement>(null);
  const cards = (data?.cards ?? []).filter((c) => c.media.some((m) => m.kind === 'video' && !/^(generations|blocks|previz)\//.test(m.path)));
  const n = cards.length;
  useEffect(() => {
    if (n && window.location.hash === '#tests') ref.current?.scrollIntoView({ block: 'start' });
  }, [n]);
  if (!film || !n) return null;
  const toRepo: ToRepo = (rel) => repoPath(film.folder, film.repo, rel);
  return (
    <section ref={ref} id="tests" aria-label={`Test takes on ${scene}`} className="flex min-w-0 scroll-mt-4 flex-col gap-3">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
        <h2 className="m-0 text-[14px] font-medium">Test takes · {n}</h2>
        <span className="text-[12px] text-sub">clips made on this scene that are not takes of the film</span>
      </div>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(210px,1fr))] gap-3">
        {cards.map((c) => (
          <article key={c.key} className="flex min-w-0 flex-col gap-2 rounded-[10px] border border-edge bg-panel p-3">
            {c.media.filter((m) => m.kind === 'video').map((m) => <VisualTile key={m.path} m={{ ...m, label: undefined }} toRepo={toRepo} />)}
            <h3 className="m-0 text-[13px] font-medium leading-snug">{c.title}</h3>
            {c.sub && <p className="m-0 text-[12px] leading-normal text-sub">{c.sub}</p>}
            {(c.text ?? []).map((t, i) => <p key={i} className="m-0 text-[12.5px] leading-[1.5] text-ink-2">{t}</p>)}
          </article>
        ))}
      </div>
    </section>
  );
}

const SHOWN = 'harness:shown';

/** The header button of a page with a feed: how many cards it holds, and a jump to them. Nothing when none. */
export function ShownLink({ places }: { places: FeedPlace[] }) {
  const { state } = useFilm();
  const n = places.reduce((a, p) => a + (state?.feed?.counts[p] ?? 0), 0);
  if (!n) return null;
  return (
    <button type="button" onClick={() => window.dispatchEvent(new Event(SHOWN))} className="inline-flex h-8 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-lg border border-edge bg-transparent px-3 text-[13px] font-medium text-ink hover:bg-raised">
      Shown to you<span className="font-mono text-[11.5px] font-normal text-sub">{n}</span>
    </button>
  );
}

/** One page's part of the feed. `query` is the feed route's own: "place=sound", "id=S3", "place=scenes&shared=1". */
export function Feed({ query, title = 'Shown to you', note, startOpen, from, empty, except }: {
  query: string;
  title?: string;
  /** What these cards are, in a few words: "rounds, tests and notes on this scene". */
  note?: string;
  startOpen?: boolean;
  /** Where the answer was given, said to Alma: "the Sound page". */
  from: string;
  /** Shown when there is nothing (else the section is left out). */
  empty?: string;
  /** Asking cards the page already shows in place (the Character elements rows), not shown twice. */
  except?: string[];
}) {
  const { state } = useFilm();
  const film = state?.film;
  const { data } = useJson<FeedData>(film ? `/api/films/${film.slug}/feed?${query}` : undefined, state?.updatedAt);
  const [open, setOpen] = useState(!!startOpen);
  const [all, setAll] = useState(false);
  const ref = useRef<HTMLElement>(null);
  // the header's "Shown to you" button: open the history and bring it into view
  useEffect(() => {
    const show = () => { setOpen(true); requestAnimationFrame(() => ref.current?.scrollIntoView({ block: 'start', behavior: 'smooth' })); };
    window.addEventListener(SHOWN, show);
    return () => window.removeEventListener(SHOWN, show);
  }, []);
  if (!film || !data) return null;
  const toRepo: ToRepo = (rel) => repoPath(film.folder, film.repo, rel);
  const asks = data.cards.filter((c) => isOpen(c) && !c.ask!.progress && !except?.includes(c.key));
  const working = data.cards.filter((c) => isOpen(c) && !!c.ask!.progress);
  const rest = data.cards.filter((c) => !isOpen(c));
  if (!asks.length && !working.length && !rest.length) return empty ? <p className="m-0 text-[12.5px] leading-normal text-mute">{empty}</p> : null;
  const shown = all ? rest : rest.slice(0, 12);
  return (
    <section ref={ref} aria-label={title} className="flex min-w-0 scroll-mt-4 flex-col gap-3">
      {asks.length > 0 && (
        <div className="flex flex-col gap-2.5">
          <span className="lbl">Waiting for you · {asks.length}</span>
          {asks.map((c) => <AskCard key={c.key} film={film.slug} card={c} toRepo={toRepo} from={from} />)}
        </div>
      )}
      {working.length > 0 && (
        <div className="flex flex-col gap-2.5">
          <span className="lbl">In progress · {working.length}</span>
          {working.map((c) => <AskCard key={c.key} film={film.slug} card={c} toRepo={toRepo} from={from} />)}
        </div>
      )}
      {rest.length > 0 && (
        <div className="min-w-0 overflow-hidden rounded-[9px] border border-edge bg-panel">
          <button type="button" aria-expanded={open} onClick={() => setOpen(!open)}
            className="flex w-full cursor-pointer flex-wrap items-baseline gap-x-3 gap-y-0.5 border-0 bg-transparent px-4 py-3 text-left text-ink hover:bg-raised">
            <span className="text-[13.5px] font-medium">{title}</span>
            <span className="text-[12px] text-sub">{plural(rest.length, 'card')}{note ? ` · ${note}` : ''}</span>
            <span className="ml-auto flex items-center gap-2 text-[12px] text-mute">
              {open ? 'newest first' : 'from the review record'}
              <svg className={cn('flex-none transition-transform', open && 'rotate-180')} width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>
            </span>
          </button>
          <Reveal open={open}>
              <ul className="m-0 list-none border-t border-line p-0">
                {shown.map((c) => <HistoryRow key={c.key} card={c} toRepo={toRepo} />)}
              </ul>
              {rest.length > shown.length && (
                <button type="button" onClick={() => setAll(true)} className="w-full cursor-pointer border-0 border-t border-line bg-transparent px-4 py-2.5 text-left text-[12.5px] text-sub hover:bg-raised hover:text-ink">
                  Show the {rest.length - shown.length} earlier
                </button>
              )}
          </Reveal>
        </div>
      )}
    </section>
  );
}
