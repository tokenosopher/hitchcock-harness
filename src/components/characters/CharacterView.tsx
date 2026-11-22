'use client';
// One character, the made things in the order the takes use them (ASKS 46, boards 7 and 5; the user: "put the video
// element first, the sheet underneath, the face underneath that, and the voice element underneath that … The pick
// should be the main pick"). The video element first (the sheet first while there is none), then the sheet, the face
// and the clothing side by side, the voice with the voices made. Each shows the pick as the main thing and folds its
// rounds; a part with no pick yet opens its round, where the pick is made as before.
import Link from 'next/link';
import { rememberBack } from '@/components/shell/BackLink';
import type { CharacterRef, FilmState } from '@/server/types';
import { clothingDone, faceDone, speaks, voiceDone } from '@/components/lib/derive';
import { fmtDate, repoPath } from '@/components/lib/format';
import { Media } from '@/components/media/Media';
import { PlayButton, PlayLine } from '@/components/media/Sound';
import { IconChevronDown } from '@/components/shell/icons';
import { Tile } from '@/components/shell/atoms';
import { AskCard } from '@/components/feed/Feed';
import { cn } from '@/lib/utils';
import { MakingLines, useMaking } from '@/components/flow/Making';
import { makingFor } from '@/components/lib/making';
import { castLines, facePath, MarkGlyph, pickedVoice, WholePicture, wardrobePath, type CastPart } from './Cards';

type Chip = (id: string, label: string, ref?: string) => void;
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
/** "Maren's", "Tobias'". */
const owner = (name: string) => (/s$/i.test(name) ? `${name}'` : `${name}'s`);

/** The order of the blocks: the video element leads once it exists; until then the sheet does. */
export function blockOrder(c: CharacterRef): ('element' | 'sheet' | 'face' | 'voice')[] {
  const talks = speaks(c);
  const made = c.element && c.element.state !== 'none';
  const out: ('element' | 'sheet' | 'face' | 'voice')[] = made && talks ? ['element', 'sheet'] : talks ? ['sheet', 'element'] : ['sheet'];
  if (!c.extra) out.push('face');
  if (talks) out.push('voice');
  return out;
}

function Label({ title, mark, word }: { title: string; mark: ReturnType<typeof castLines>[number]['mark']; word: string }) {
  return (
    <div className="flex flex-none flex-col gap-1 @[560px]/char:w-[110px]">
      <span className="text-[13px] font-medium">{title}</span>
      <span className={cn('flex items-center gap-1.5 text-[12px]', mark === 'done' ? 'text-sub' : mark === 'draft' ? 'text-warn' : 'text-mute')}><MarkGlyph mark={mark} />{word}</span>
    </div>
  );
}

/** A fold that opens downwards; open from the start when the part still waits for a pick. */
function Fold({ label, sub, open, children }: { label: string; sub?: string; open?: boolean; children: React.ReactNode }) {
  return (
    <details open={open} className="group min-w-0 rounded-lg border border-edge">
      <summary className="flex h-8 cursor-pointer list-none items-center gap-2 px-3 text-[12.5px] [&::-webkit-details-marker]:hidden">
        <span className="font-medium">{label}</span>{sub && <span className="text-sub">{sub}</span>}
        <IconChevronDown size={13} className="ml-auto text-sub transition-transform duration-200 group-open:rotate-180" />
      </summary>
      <div className="flex flex-col gap-3 px-3 pb-3 pt-1 duration-200 animate-in fade-in-0">{children}</div>
    </details>
  );
}

export function CharacterView({ s, c, base, onChip, faceRounds }: {
  s: FilmState; c: CharacterRef; base: string; onChip: Chip;
  /** The face rounds with their picking, as the page has always drawn them. */
  faceRounds: React.ReactNode;
}) {
  const toRepo = (rel?: string) => (rel ? repoPath(s.film.folder, s.film.repo, rel) : undefined);
  // what is being made for this character and has not landed (the loading state, lib/making.ts)
  const making = useMaking();
  const lines = castLines(c);
  const mark = (k: CastPart) => lines.find((l) => l.key === k)!.mark;
  const order = blockOrder(c);
  const where = s.scenes.filter((sc) => s.script?.lines.some((l) => l.sceneId === sc.id && (l.speaker === c.name.replace(/^the /i, '').toUpperCase()))).map((sc) => sc.id);
  const faceRoundsAll = c.face?.rounds ?? [];
  const faceCount = faceRoundsAll.reduce((n, r) => n + r.candidates.filter((k) => k.path).length, 0);
  // a later clothing round names its looks from "look-a" again (rounds r2 and r3 can each have a look-a), so a look
  // is told apart by its file, shown with its round when there is more than one, and the pick, which carries only the
  // name, is the newest round's look of that name
  const looks = (c.wardrobe?.rounds ?? []).flatMap((r) => r.candidates.filter((k) => k.path).map((k) => ({ ...k, round: r.id.replace(/-wardrobe$/, '') })));
  const lookRounds = new Set(looks.map((k) => k.round)).size;
  const pickedLook = [...(c.wardrobe?.rounds ?? [])].reverse().flatMap((r) => r.candidates).find((k) => k.id === c.wardrobe?.pick?.candidateId);
  const voiceAll = (c.voice?.rounds ?? []).flatMap((r) => r.candidates.map((k) => ({ ...k, round: r.id })));
  const v = pickedVoice(c);
  // the line the video element speaks, else the picked option: the voice as the film hears it
  const voiceFile = c.voice?.elementLine?.path ?? v?.path;
  const voiceSecs = c.voice?.elementLine?.path ? c.voice.elementLine.seconds : v?.seconds;
  // how the element was made, from its file: "Made in Seedance at 1080p."
  const res = /(\d{3,4}p)/i.exec(c.element?.path ?? '')?.[1];
  const made = c.element?.path ? `Made in Seedance${res ? ` at ${res.toLowerCase()}` : ''}.` : '';
  // a card that asks about this character's video element (its go) shows in the element's block, as drawn
  // (CharacterWaiting); it is the same card as at "Waiting for you", answered either place
  const mine = (id: string) => id === c.id || new RegExp(`^${c.id}[a-z]$`).test(id);
  const elementAsks = c.element?.state === 'final' ? [] : (s.feed?.asks ?? []).filter((a) => a.place === 'elements' && a.ids.some(mine));
  const elementWord = elementAsks.length ? 'yours to look at' : c.element?.state === 'final' ? 'done' : c.element?.state === 'draft' ? 'draft' : 'not made yet';

  const blocks: Record<string, React.ReactNode> = {
    element: (
      <section key="element" data-block="element" aria-label="Video element" className="flex min-w-0 flex-col items-start gap-2 @[560px]/char:flex-row @[560px]/char:gap-4">
        <Label title="Video element" mark={elementAsks.length ? 'draft' : mark('elements')} word={elementWord} />
        {elementAsks.length ? (
          <div data-element-asks className="flex w-full min-w-0 flex-1 flex-col gap-2.5">
            {elementAsks.map((a) => <AskCard key={a.key} film={s.film.slug} card={a} toRepo={(r) => repoPath(s.film.folder, s.film.repo, r)} from={`${owner(c.name)} page`} />)}
          </div>
        ) : c.element?.path ? (
          <>
            <Media path={toRepo(c.element.path)} w={640} t={0.5} play fit="contain" alt={`${c.name} video element`} onPlay={() => onChip(`element:${c.id}`, `E-${c.id} ${c.name}`, c.element?.path)}
              className="aspect-[16/9] w-[260px] max-w-full flex-none rounded-[8px] border border-edge bg-black" />
            <div className="flex w-full min-w-0 flex-1 flex-col gap-1.5 text-[12.5px] leading-normal">
              <span className="text-ink-3">{where.length ? <><span className="font-medium text-ink">Used in {where.length > 2 ? `${where.slice(0, -1).join(', ')} and ${where[where.length - 1]}` : where.join(' and ')}.</span> </> : ''}Face, clothes and voice in one 5 s clip. Every take of {owner(c.name)} scenes starts from it.</span>
              {c.element.state === 'draft' ? <span className="text-warn">The 480p draft. The 1080p is made on your word.</span> : made && <span className="text-sub">{made}</span>}
            </div>
          </>
        ) : (
          <div className="flex w-full min-w-0 flex-1 flex-col gap-1.5 text-[12.5px] leading-normal text-sub">
            <span>{c.sheet?.approved ? 'Made from the sheet and the picked voice, once you say go.' : 'Made after the sheet is approved and the voice is picked.'}</span>
            <Link href={`${base}/character/elements`} onClick={() => rememberBack(`${base}/character/elements`, `Back to ${c.name}`)} className="w-max text-sub underline decoration-edge-strong underline-offset-4 hover:text-ink">How a video element is made</Link>
          </div>
        )}
      </section>
    ),
    sheet: (
      <section key="sheet" data-block="sheet" aria-label="Sheet" className="flex min-w-0 flex-col items-start gap-2 @[560px]/char:flex-row @[560px]/char:gap-4">
        <Label title={c.extra ? 'Group sheet' : 'Sheet'} mark={mark('sheet')} word={c.sheet?.approved ? 'approved' : c.sheet?.path ? 'made' : 'not made yet'} />
        {c.sheet?.path ? (
          <button type="button" onClick={() => onChip(`sheet:${c.id}`, `${c.id} · sheet`, c.sheet?.path)} aria-label={`${c.id} sheet`} className="block w-[260px] max-w-full flex-none cursor-pointer rounded-[8px] border-0 bg-transparent p-0">
            <Media path={toRepo(c.sheet.path)} w={960} fit="contain" className="aspect-[16/9] w-full rounded-[8px] border border-edge bg-black" />
          </button>
        ) : <span className="text-[12.5px] text-sub">{c.extra ? 'One sheet for the group.' : 'Three views on one backdrop, from the picked face and clothing.'}</span>}
        {c.sheet?.path && (
          <span className="flex w-full min-w-0 flex-1 flex-col gap-1.5 text-[12.5px] leading-normal text-ink-3">
            <span>{c.sheet.approved ? 'Approved.' : 'Made · waiting for your yes.'}</span>
          </span>
        )}
      </section>
    ),
    face: (
      <section key="face" data-block="face" aria-label="Face and clothing" className="grid min-w-0 grid-cols-1 gap-4 @[600px]/char:grid-cols-2">
        {/* with its rounds open (to pick a face) the face takes the whole width and Clothing goes under it: side by side
            the round was crushed into a 150 px column at 1280 (QC round two); folded, the two stay side by side as drawn */}
        <div data-face-cell className="flex min-w-0 flex-col items-start gap-2 @[560px]/char:flex-row @[560px]/char:gap-4 @[600px]/char:has-[details[open]]:col-span-2">
          <Label title="Face" mark={mark('faces')} word={c.reused ? 'from the library' : c.face?.pick ? `picked${c.face.pick.date ? ` ${fmtDate(c.face.pick.date)}` : ''}` : faceDone(c) ? 'picked' : 'not picked yet'} />
          <div className="flex w-full min-w-0 flex-1 flex-col gap-2">
            {facePath(c) && <span className="block w-[72px]"><WholePicture path={toRepo(facePath(c))} alt={`${c.name}, face`} className="rounded-[6px] border border-edge" /></span>}
            <MakingLines items={faceDone(c) ? [] : makingFor(making, ['faces'], c.id)} bar />
            {faceRoundsAll.length > 0
              ? <Fold label={`${plural(faceRoundsAll.length, 'round')}, ${plural(faceCount, 'face')}`} open={!faceDone(c)}>{faceRounds}</Fold>
              : !facePath(c) && !makingFor(making, ['faces'], c.id).length && <span className="text-[12.5px] text-sub">No faces yet.</span>}
          </div>
        </div>
        <div className="flex min-w-0 flex-col items-start gap-2 @[560px]/char:flex-row @[560px]/char:gap-4">
          <Label title="Clothing" mark={mark('clothing')} word={c.wardrobe?.pick ? `picked${c.wardrobe.pick.date ? ` ${fmtDate(c.wardrobe.pick.date)}` : ''}` : clothingDone(c) ? 'done' : faceDone(c) ? 'not picked yet' : 'after the face'} />
          <div className="flex w-full min-w-0 flex-1 flex-col gap-2">
            {wardrobePath(c) && <span className="block w-[56px]"><WholePicture path={toRepo(wardrobePath(c))} alt={`${c.name}, clothing`} className="rounded-[6px] border border-edge" /></span>}
            {pickedLook?.note && <span className="text-[12.5px] leading-normal text-ink-3">{pickedLook.note}</span>}
            {looks.length > 0 ? (
              <Fold label={plural(looks.length, 'look')} open={!clothingDone(c) && faceDone(c)}>
                <div className="grid grid-cols-4 gap-1.5">
                  {looks.map((w) => (
                    <Tile key={w.path} label={lookRounds > 1 ? `${w.round} · ${w.id}` : w.id} src={toRepo(w.path)} className="aspect-[3/4] w-full overflow-hidden" selected={!!pickedLook && w.path === pickedLook.path}
                      ariaLabel={`Look ${lookRounds > 1 ? `${w.round} ` : ''}${w.id}`} onClick={() => onChip(`ward:${c.id}`, `${c.id} · ${w.id}`, w.path)} />
                  ))}
                </div>
              </Fold>
            ) : !wardrobePath(c) && <span className="text-[12.5px] text-sub">{clothingDone(c) ? 'Made with the sheet.' : 'No looks yet.'}</span>}
          </div>
        </div>
      </section>
    ),
    voice: (
      <section key="voice" data-block="voice" aria-label="Voice" className="flex min-w-0 flex-col items-start gap-2 @[560px]/char:flex-row @[560px]/char:gap-4">
        <Label title="Voice" mark={mark('voices')} word={c.voice?.pick ? `picked${c.voice.pick.date ? ` ${fmtDate(c.voice.pick.date)}` : ''}` : voiceDone(c) ? (c.reused ? 'from the library' : 'done') : faceDone(c) ? 'not picked yet' : 'after the face'} />
        <div className="flex w-full min-w-0 flex-1 flex-col gap-2">
          {c.reused && c.reusedFrom && <span data-voice-reused className="text-[12.5px] text-ink-3">Reused from the library: {c.reusedFrom.title}</span>}
          <MakingLines items={c.reused ? [] : makingFor(making, ['voices'], c.id)} bar />
          {voiceFile && (
            <span className="flex w-[300px] max-w-full items-center gap-2.5 rounded-lg border border-edge-strong px-2.5 py-1.5">
              <PlayButton path={toRepo(voiceFile)!} label={`${c.name}'s voice`} className="size-7" />
              <PlayLine path={toRepo(voiceFile)!} idle seconds={voiceSecs} className="min-w-0 flex-1" />
            </span>
          )}
          {v?.note && v.note !== voiceAll.find((k) => k.id === v.id)?.round && <span className="text-[12.5px] leading-normal text-ink-3">{v.note}</span>}
          {voiceAll.length > 0 ? (
            <Fold label={`${plural(voiceAll.length, 'voice')}, in ${plural(c.voice!.rounds.length, 'round')}`} open={!voiceDone(c)}>
              <div className="flex flex-col">
                {voiceAll.map((o) => (
                  <span key={`${o.round}:${o.id}`} className="flex items-center gap-2.5 border-t border-line py-1.5 text-[12.5px] first:border-t-0">
                    {o.path ? <PlayButton path={toRepo(o.path)!} label={/^\d+$/.test(o.id) ? `option ${o.id}` : o.id} className="size-6" /> : <span className="size-6" />}
                    <span className={cn('w-16 flex-none', o.id === c.voice?.pick?.candidateId ? 'font-medium text-ink' : 'text-ink-3')}>{/^\d+$/.test(o.id) ? `option ${o.id}` : o.id}</span>
                    <span className="min-w-0 flex-1 truncate text-sub">{o.note && o.note !== o.round ? o.note : o.round}</span>
                    <span className="flex-none font-mono text-[11px] text-mute">{o.hz !== undefined ? `${o.hz.toFixed(0)} Hz` : ''}</span>
                  </span>
                ))}
              </div>
              <Link href={`${base}/character/voices`} onClick={() => rememberBack(`${base}/character/voices`, `Back to ${c.name}`)} className="w-max text-[12.5px] text-sub underline decoration-edge-strong underline-offset-4 hover:text-ink">Pick or change it on the Voices page</Link>
            </Fold>
          ) : !voiceFile && <span className="text-[12.5px] text-sub">No voices yet.</span>}
        </div>
      </section>
    ),
  };

  return (
    <div data-character={c.id} className="@container/char flex min-w-0 flex-col">
      {order.map((k, i) => <div key={k} className={cn('py-4', i > 0 && 'border-t border-line', i === 0 && 'pt-0')}>{blocks[k]}</div>)}
    </div>
  );
}
