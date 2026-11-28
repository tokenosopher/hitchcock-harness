'use client';
// The voices to pick, heard in the card itself: a voice shown in What's next can be played there. Each option of a character's newest voice round has its own play button,
// the app's one sound player (media/Sound.tsx, as on the Voices page and the character view): one sound at a time, a
// line that fills while it plays. A tap on an option chooses it at once, set aside for Done picking with every other
// choice; play and pause only play.
import type { FilmState, Round } from '@/server/types';
import { repoPath } from '@/components/lib/format';
import { voiceParts } from '@/components/lib/derive';
import { PlayButton, PlayLine } from '@/components/media/Sound';
import { choosePick, pickChoiceId } from '@/components/library/PickButton';
import { unchoose, useChoice } from '@/components/data/choices';
import { ClearChoice } from '@/components/shell/ClearChoice';
import { cn } from '@/lib/utils';
import { facePath, WholePicture } from '@/components/characters/Cards';
import { refData } from '@/components/lib/refPick';
import { voiceRefOf } from '@/components/shell/refItems';

/** A voice option's name: "3" and "option-3" both read "option 3" (the Voices page's words). */
const optName = (id: string) => (/^\d+$/.test(id) ? `option ${id}` : id.replace('option-', 'option '));

/** Every character whose voice round has landed and waits for a pick: its options, each one to hear and choose.
 *  `only`: just these characters (What's next leaves out those Alma's own card asks about). */
export function VoiceRounds({ s, from, only }: { s: FilmState; from: string; only?: string[] }) {
  // the same reading as the gate's Voices card (derive.ts voiceParts): a round landed, the face picked, no voice yet
  const ready = voiceParts(s, []).filter((p) => p.state === 'ready' && p.round && (!only || only.includes(p.id)));
  if (!ready.length) return null;
  return (
    <div data-voice-rounds className="flex flex-col gap-4">
      {ready.map((p) => <VoiceRound key={p.id} s={s} id={p.id} name={p.name} r={p.round!} from={from} />)}
    </div>
  );
}

function VoiceRound({ s, id, name, r, from }: { s: FilmState; id: string; name: string; r: Round; from: string }) {
  const body = (candidate: string) => ({ kind: 'voice' as const, target: id, round: r.id, candidate, prediction: r.prediction, from });
  const cid = pickChoiceId({ kind: 'voice', target: id });
  const sel = useChoice(s.film.slug, cid)?.pick?.candidate;
  const toRepo = (rel: string) => repoPath(s.film.folder, s.film.repo, rel);
  const options = r.candidates.filter((o) => !!o.path);
  // the picked face first, so the voice is chosen for someone seen
  const c = s.characters.find((x) => x.id === id);
  const face = c ? facePath(c) : undefined;
  return (
    <div data-voice-round={id} role="radiogroup" aria-label={`${id} ${name}: the voices of round ${r.id.replace(/^r/, '')}`} className="flex flex-col gap-2">
      <span className="flex items-center gap-3">
        {face && <span data-voice-face className="block w-[64px] flex-none"><WholePicture path={toRepo(face)} alt={`${name}, the picked face`} className="rounded-[6px] border border-edge" /></span>}
        <span className="text-[12.5px] text-sub"><span className="font-mono text-[12px]">{id}</span> <span className="text-ink">{name}</span> · round {r.id.replace(/^r/, '')} · {options.length} voices</span>
      </span>
      {options.map((o) => {
        const on = sel === o.id;
        const label = `${optName(o.id)}${o.note && o.note !== r.id ? ` · ${o.note}` : ''}`;
        return (
          <div key={o.id} data-voice-option={o.id} {...refData(voiceRefOf(s, id, r.id, o.id, optName(o.id), o.path))} className={cn('flex min-w-0 items-center gap-3 rounded-lg border px-3 py-2 transition-colors duration-200', on ? 'border-sub bg-raised' : 'border-edge')}>
            <PlayButton path={toRepo(o.path!)} label={`${id} ${optName(o.id)}`} />
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <button type="button" role="radio" aria-checked={on} onClick={() => (on ? unchoose(s.film.slug, cid) : choosePick(s.film.slug, body(o.id), `${optName(o.id)} for ${id} ${name}`))} className="flex min-w-0 cursor-pointer items-center gap-2.5 border-0 bg-transparent p-0 text-left text-ink">
                <span aria-hidden="true" className={cn('flex size-3.5 flex-none items-center justify-center rounded-full border', on ? 'border-ink' : 'border-mute')}>{on && <span className="size-1.5 rounded-full bg-ink" />}</span>
                <span className="min-w-0 truncate text-[13px] max-[760px]:line-clamp-2 max-[760px]:whitespace-normal" title={label}>{label}</span>
                {o.hz !== undefined && <span className="flex-none font-mono text-[11px] text-sub">{Math.round(o.hz)} Hz</span>}
                {o.id === r.prediction && <span className="flex-none rounded-[4px] bg-ink px-1.5 py-px text-[10px] font-semibold text-bg">Alma</span>}
              </button>
              <PlayLine path={toRepo(o.path!)} idle seconds={o.seconds} className="max-w-[420px] pl-6" />
            </div>
          </div>
        );
      })}
      <span className="flex flex-wrap items-center gap-2 empty:hidden">
        {sel && <span data-chosen className="text-[12px] text-mute duration-200 animate-in fade-in-0">Chosen: {optName(sel)} · goes with Done picking</span>}
        <ClearChoice shown={!!sel} onClear={() => unchoose(s.film.slug, cid)} />
      </span>
    </div>
  );
}
