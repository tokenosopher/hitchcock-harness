'use client';
// Characters as one view (ASKS 46, boards 4 and 6; the user: "It should just be characters. We shouldn't have any
// tab"). One card per character, the same cards for every people step on the flow (Faces, Clothing, Sheet, Voices,
// Character elements), with that step's part to the fore: its picture, and its line in bold in the card's list. The cards
// fill in as picks are made. A face is shown whole, in a box of the portrait's own shape; a group picture whole on
// black. A press opens the character.
import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { CharacterRef, FilmState } from '@/server/types';
import type { Flow } from '@/components/lib/flow';
import type { FlowKey } from '@/components/lib/derive';
import { clothingDone, faceDone, needsNewElement, speaks, voiceDone, type Part } from '@/components/lib/derive';
import { fmtDate, repoPath } from '@/components/lib/format';
import { Media, mediaUrl } from '@/components/media/Media';
import { PlayButton, PlayLine } from '@/components/media/Sound';
import { IconCheck } from '@/components/shell/icons';
import { cn } from '@/lib/utils';
import { refData } from '@/components/lib/refPick';
import type { InlineRef } from '@/lib/refs';

export type CastPart = 'faces' | 'clothing' | 'sheet' | 'voices' | 'elements';
export const CAST_PARTS: CastPart[] = ['faces', 'clothing', 'sheet', 'voices', 'elements'];
export const PART_NAME: Record<CastPart, string> = { faces: 'Faces', clothing: 'Clothing', sheet: 'Sheet', voices: 'Voices', elements: 'Character elements' };

type Mark = 'done' | 'draft' | 'none' | 'todo';
export interface CastLine { key: CastPart; label: string; mark: Mark }

/** A group: extras sharing a group sheet, or a cast entry with a picture of several and no face of its own. */
export const isGroup = (c: CharacterRef) => !!c.extra || (!c.face && !c.reused);

/** Who the Characters view shows: everyone in cast/, the people first and then the group pictures (those with a
 *  picked group picture first), as drawn; on a delivered film, not a character with no files. */
export function castAll(s: FilmState): CharacterRef[] {
  const all = s.film.status !== 'delivered' ? s.characters
    : s.characters.filter((c) => c.extra || c.face?.rounds.length || c.sheet?.path || c.voice?.rounds.length || c.voice?.elementLine || (c.element && c.element.state !== 'none'));
  const rank = (c: CharacterRef) => (!isGroup(c) ? 0 : castLines(c)[0].mark === 'done' ? 1 : 2);
  return all.map((c, i) => ({ c, i })).sort((a, b) => rank(a.c) - rank(b.c) || a.i - b.i).map((x) => x.c);
}

/** A character's five parts, each done, not yet, or not needed (a group has no face of its own, no lines no voice). */
export function castLines(c: CharacterRef): CastLine[] {
  const talks = speaks(c);
  return [
    { key: 'faces', label: 'Face', mark: c.extra ? 'none' : faceDone(c) ? 'done' : 'todo' },
    { key: 'clothing', label: 'Clothing', mark: clothingDone(c) || (c.extra && c.sheet?.approved) ? 'done' : 'todo' },
    { key: 'sheet', label: 'Sheet', mark: c.sheet?.approved ? 'done' : 'todo' },
    { key: 'voices', label: 'Voice', mark: !talks ? 'none' : voiceDone(c) ? 'done' : 'todo' },
    { key: 'elements', label: 'Video element', mark: !talks ? 'none' : c.element?.state === 'final' ? 'done' : c.element?.state === 'draft' ? 'draft' : 'todo' },
  ];
}

/** A character as a reference for the message's words: its id and name, and its picked face. */
export function characterRefOf(s: FilmState, c: CharacterRef): InlineRef {
  const f = facePath(c);
  const face = f ? repoPath(s.film.folder, s.film.repo, f) : undefined;
  return { kind: 'character', label: `${c.id} · ${c.name}`, character: c.id, title: c.name, ...(face ? { file: face } : {}) };
}

/** The picked face's file: the candidate the pick names, else the pick file itself (a character from the library). */
export function facePath(c: CharacterRef): string | undefined {
  const id = c.face?.pick?.candidateId;
  return (id ? c.face?.rounds.flatMap((r) => r.candidates).find((k) => k.id === id)?.path : undefined) ?? c.picks?.face;
}
export function wardrobePath(c: CharacterRef): string | undefined {
  const id = c.wardrobe?.pick?.candidateId;
  // the pick carries only the look's name, and a later round reuses the names: the newest round's look of that name
  return (id ? [...(c.wardrobe?.rounds ?? [])].reverse().flatMap((r) => r.candidates).find((k) => k.id === id)?.path : undefined) ?? c.picks?.wardrobe;
}
/** The picked voice option, with its words. */
export function pickedVoice(c: CharacterRef) {
  const id = c.voice?.pick?.candidateId;
  return id ? c.voice?.rounds.flatMap((r) => r.candidates).find((k) => k.id === id) : undefined;
}

/** "picked 11 Nov", "from the library", "a group picture": the line on a face. */
function faceCaption(c: CharacterRef): string {
  if (isGroup(c)) return 'a group picture';
  if (c.reused) return 'from the library';
  const p = c.face?.pick;
  if (!p) {
    if (faceDone(c)) return 'picked';
    const last = c.face?.rounds[c.face.rounds.length - 1];
    const landed = last?.candidates.filter((k) => k.path).length ?? 0;
    return last ? `round ${last.id.replace(/^r(\d+).*$/, '$1')} · ${landed} to pick from` : 'no faces yet';
  }
  const r = c.face?.rounds.find((x) => x.candidates.some((k) => k.id === p.candidateId));
  const day = p.date ?? r?.date;
  return `picked${day ? ` ${fmtDate(day)}` : ''}`;
}

export function MarkGlyph({ mark }: { mark: Mark }) {
  if (mark === 'done') return <IconCheck size={11} className="flex-none text-ok" />;
  if (mark === 'none') return <span aria-hidden="true" className="flex w-[11px] flex-none justify-center text-mute">–</span>;
  if (mark === 'draft') return <span aria-hidden="true" className="flex size-[11px] flex-none items-center justify-center"><span className="size-[6px] rounded-full bg-warn" /></span>;
  return <span aria-hidden="true" className="flex size-[11px] flex-none items-center justify-center"><span className="size-[7px] rounded-full border border-dashed border-mute" /></span>;
}
const MARK_WORD: Record<Mark, string> = { done: 'done', draft: 'draft', none: 'not needed', todo: 'not yet' };

/** A still picture shown whole: its box takes the picture's own shape once it is known (4:5 until then). */
export function WholePicture({ path, alt, className, children }: { path?: string; alt: string; className?: string; children?: React.ReactNode }) {
  const [ratio, setRatio] = useState<{ path?: string; r: number }>();
  useEffect(() => {
    if (!path) return;
    let live = true;
    const img = new Image();
    img.onload = () => { if (live && img.naturalWidth && img.naturalHeight) setRatio({ path, r: img.naturalWidth / img.naturalHeight }); };
    img.src = mediaUrl(path, { w: 640 });
    return () => { live = false; };
  }, [path]);
  const r = ratio && ratio.path === path ? ratio.r : undefined;
  return (
    <span data-whole data-ratio={r ? r.toFixed(3) : undefined} className={cn('relative block w-full overflow-hidden bg-black transition-[aspect-ratio] duration-200', className)} style={{ aspectRatio: r ?? 0.8 }}>
      <Media path={path} w={640} fit="contain" alt={alt} missingLabel="" className="absolute inset-0 size-full bg-black" />
      {children}
    </span>
  );
}

function Caption({ children, className }: { children: React.ReactNode; className?: string }) {
  // cut with an ellipsis on a narrow card: the whole words on hover (QC round two)
  return <span title={typeof children === 'string' ? children : undefined} className={cn(className, "absolute bottom-1.5 left-1.5 z-[1] max-w-[calc(100%-12px)] truncate rounded-[4px] bg-black/75 px-1.5 py-0.5 text-[11px] text-ink-3")}>{children}</span>;
}

/** The card's picture for the part in front. */
function Picture({ s, c, part, line }: { s: FilmState; c: CharacterRef; part: CastPart; line?: string }) {
  const toRepo = (rel?: string) => (rel ? repoPath(s.film.folder, s.film.repo, rel) : undefined);
  const group = isGroup(c);
  if (part === 'faces' || part === 'clothing') {
    const p = part === 'faces' ? (group ? c.sheet?.path : facePath(c)) : wardrobePath(c) ?? facePath(c) ?? c.sheet?.path;
    if (group || (part === 'clothing' && !wardrobePath(c) && !facePath(c)))
      return (
        <span data-group-picture className="relative block aspect-[4/5] w-full bg-black">
          <Media path={toRepo(p)} w={640} fit="contain" alt={`${c.name}, a group picture`} missingLabel={p ? undefined : 'not made yet'} className="absolute inset-0 size-full bg-black" />
          <Caption>{part === 'faces' ? faceCaption(c) : c.sheet?.approved ? 'the group sheet' : 'not made yet'}</Caption>
        </span>
      );
    return (
      <WholePicture path={toRepo(p)} alt={`${c.name}, ${part === 'faces' ? 'face' : 'clothing'}`}>
        <Caption>{part === 'faces' ? faceCaption(c) : c.wardrobe?.pick ? `picked${c.wardrobe.pick.date ? ` ${fmtDate(c.wardrobe.pick.date)}` : ''}` : clothingDone(c) ? 'done' : 'not picked yet'}</Caption>
      </WholePicture>
    );
  }
  if (part === 'sheet')
    return (
      <span className="relative block aspect-[16/9] w-full bg-black">
        <Media path={toRepo(c.sheet?.path)} w={640} fit="contain" alt={`${c.name} sheet`} missingLabel={c.sheet?.path ? undefined : 'no sheet yet'} className="absolute inset-0 size-full bg-black" />
        <Caption>{c.sheet?.approved ? 'approved' : c.sheet?.path ? 'made · waiting for your yes' : 'not made yet'}</Caption>
      </span>
    );
  if (part === 'elements') {
    // one line per character saying what it has; only a video element shows a player
    if (!speaks(c)) return <span key={line} data-element-line className="line-in flex aspect-[16/9] w-full items-center px-3 text-[12px] text-sub">{line ?? 'Image element only · no lines, no video element needed'}</span>;
    return (
      <span className="relative block aspect-[16/9] w-full bg-black">
        <Media path={toRepo(c.element?.path)} w={640} t={0.5} play fit="contain" alt={`${c.name} video element`} missingLabel={c.element?.path ? undefined : line ? '' : 'not made yet'} className="absolute inset-0 size-full bg-black" />
        {line && <Caption key={line} className="line-in">{line}</Caption>}
      </span>
    );
  }
  // voices: the picked voice, to play, with its words
  if (!speaks(c)) return <span className="flex h-[88px] items-center px-3 text-[12px] text-sub">No lines</span>;
  const v = pickedVoice(c);
  // the line the video element speaks, else the picked option (as the character's page plays it)
  const file = c.voice?.elementLine?.path ?? v?.path;
  const secs = c.voice?.elementLine?.path ? c.voice.elementLine.seconds : v?.seconds;
  return (
    <span className="flex h-[88px] flex-col justify-center gap-1.5 px-3">
      {file ? (
        <span className="flex items-center gap-2">
          <PlayButton path={toRepo(file)!} label={`${c.name}'s voice`} className="size-7" />
          <PlayLine path={toRepo(file)!} idle seconds={secs} className="min-w-0 flex-1" />
        </span>
      ) : <span className="text-[12px] text-sub">{c.voice?.rounds.length ? 'not picked yet' : 'no voices made yet'}</span>}
      <span className="line-clamp-2 text-[12px] leading-snug text-ink-3">{v?.note && v.note !== c.voice?.rounds.find((r) => r.candidates.includes(v))?.id ? v.note : v ? `option ${v.id}` : c.voice?.pick ? `option ${c.voice.pick.candidateId.replace(/^option-/, '')}` : c.voice?.elementLine ? (c.reused ? 'brought with the character' : 'the element line') : ''}</span>
    </span>
  );
}

/** The line beside the chips: "5 picked, 1 group · press a card to open the character". */
export function castLine(s: FilmState, part: CastPart): string {
  const all = castAll(s);
  const press = 'press a card to open the character';
  if (!all.length) return 'No characters in cast/ yet.';
  if (part === 'faces') return `${facesWords(all)} · ${press}`;
  return `${partWords(all, part)} · ${press}`;
}

const doneOf = (all: CharacterRef[], k: CastPart) => all.filter((c) => castLines(c).find((l) => l.key === k)?.mark === 'done').length;
/** "5 picked, 1 group": the people's faces picked, and the groups whose group picture stands for a face. */
function facesWords(all: CharacterRef[]): string {
  const people = all.filter((c) => !isGroup(c));
  const groups = all.filter((c) => isGroup(c) && castLines(c)[0].mark === 'done').length;
  return `${people.filter(faceDone).length} picked${groups ? `, ${groups} ${groups === 1 ? 'group' : 'groups'}` : ''}`;
}
function partWords(all: CharacterRef[], part: CastPart): string {
  const done = (k: CastPart) => doneOf(all, k);
  if (part === 'voices') { const quiet = all.filter((c) => !speaks(c)).length; return `${done('voices')} picked${quiet ? `, ${quiet} ${quiet === 1 ? 'has' : 'have'} no lines` : ''}`; }
  // the new video elements only: the ones from the library are done already, the silent and the extras need none
  if (part === 'elements') {
    const need = all.filter(needsNewElement);
    const lib = all.filter((c) => speaks(c) && !needsNewElement(c)).length;
    return `${need.filter((c) => c.element?.state === 'final').length} of ${need.length} done${lib ? `, ${lib} from the library` : ''}`;
  }
  return `${done(part)} of ${all.length} ${part === 'sheet' ? 'done' : 'picked'}`;
}

const BOX_PART: [FlowKey, CastPart][] = [['faces', 'faces'], ['clothing', 'clothing'], ['sheet', 'sheet'], ['voices', 'voices'], ['elements', 'elements']];
/** The people boxes' lines on the board, in the cards' own words ("5 picked, 1 group", "8 of 8 picked", "4 picked",
 *  "4 of 4 done") once the step is done; while it is not, the box keeps the flow's own words (a round, a pick). */
export function castBoxLines(s: FilmState, flow: Flow): Partial<Record<FlowKey, string>> {
  const all = castAll(s);
  if (!all.length) return {};
  const out: Partial<Record<FlowKey, string>> = {};
  for (const [k, part] of BOX_PART) {
    const n = flow.nodes[k];
    if (n.state !== 'done' || n.aims.length) continue;
    out[k] = part === 'faces' ? facesWords(all) : part === 'voices' ? `${doneOf(all, 'voices')} picked` : partWords(all, part);
  }
  return out;
}

export function CharacterCards({ s, part, base, onChip, parts }: { s: FilmState; part: CastPart; base: string; onChip?: (id: string, label: string, ref?: string) => void; /** the step's rows, for their lines (Character elements) */ parts?: Part[] }) {
  const all = castAll(s);
  if (!all.length) return <p className="m-0 text-[13px] text-sub">No characters in cast/ yet.</p>;
  const wide = part === 'sheet' || part === 'elements' || part === 'voices';
  return (
    <div data-cast-cards={part} className={cn('grid gap-2.5', wide ? 'grid-cols-[repeat(auto-fill,minmax(220px,1fr))]' : 'grid-cols-[repeat(auto-fill,minmax(132px,1fr))]')}>
      {all.map((c) => {
        const lines = castLines(c);
        return (
          <article key={c.id} data-cast-card={c.id} {...refData(characterRefOf(s, c))} className="flex min-w-0 flex-col overflow-hidden rounded-[10px] border border-edge bg-panel">
            <Picture s={s} c={c} part={part} line={parts?.find((p) => p.id === c.id)?.line} />
            <Link href={`${base}/character/${encodeURIComponent(c.id)}?from=${part}`} onClick={() => onChip?.(`char:${c.id}`, `${c.id} · ${c.name}`)} aria-label={`Open ${c.name}`}
              className="flex min-w-0 flex-1 flex-col gap-1 border-t border-line px-2.5 pb-2.5 pt-2 text-ink no-underline transition-colors duration-150 hover:bg-raised/60">
              <span className="truncate text-[13px] font-medium">{c.name}</span>
              <span className="flex flex-wrap gap-x-2.5 gap-y-0.5">
                {lines.map((l) => (
                  <span key={l.key} data-cast-line={l.key} data-mark={l.mark} title={`${l.label}: ${MARK_WORD[l.mark]}`}
                    className={cn('inline-flex items-center gap-1 whitespace-nowrap text-[11.5px]', l.key === part ? 'font-medium text-ink' : 'text-sub')}>
                    <MarkGlyph mark={l.mark} />{l.label}
                  </span>
                ))}
              </span>
            </Link>
          </article>
        );
      })}
    </div>
  );
}
