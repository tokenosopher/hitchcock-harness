'use client';
// A field's options under its box: Alma's candidates one under the other as radio
// options, the way the pick cards in "Waiting for you" draw theirs (Feed.tsx): the radio mark, what the candidate is
// going for (`does`), the "Alma" mark on the one she recommends, and the whole text, never cut, its line breaks kept.
// Her note's words sit under the option they recommend (choices.ts).
//
// A tap puts the option's text in the box (on every platform sharing the field: `pick`, ops.ts) and selects it; the box
// stays editable, and what is typed there is saved as the box saves it, as an edit of the selected option. While the
// box differs from the option, the option says so and offers "Save to this option" (`saveOption`), and a tap on another
// option asks first, here at the options: Save (the edit becomes the old option, then the switch), Discard (the switch
// only) or Cancel. Without changes a tap switches at once. The user's own words that are no option's are one more
// option, "Your text" (`setText` with `mine` brings them back). A refusal puts the selection back and says why.
import { Fragment, useState } from 'react';
import { Btn } from '@/components/shell/atoms';
import { Reveal } from '@/components/shell/Reveal';
import { cn } from '@/lib/utils';
import { changedFrom, chosenOf, noteReasons, OWN, ownOption, typedField } from './choices';
import { appName, factPieces, nameList } from './derive';
import type { Field } from './file';
import type { ReleaseOp } from './ops';
import { Pieces, type BoxCtx } from './TextBox';
import { refData } from '@/components/lib/refPick';
import { optionRef } from './refs';

/** `text`: the words in the box now, when the box is this one field (typing counts before it is saved). `label`: the
 *  field's name, for a box of several fields. */
export function Candidates({ ctx, f, text, label }: { ctx: BoxCtx; f: Field; text?: string; label?: boolean }) {
  const { file, p, run } = ctx;
  const [pending, setPending] = useState<string>();
  const [asking, setAsking] = useState<string>();
  const [said, setSaid] = useState<string>();
  const live = typedField(f, text);
  const own = ownOption(live);
  if (!f.candidates.length) return null;
  const chosen = chosenOf(live);
  const changed = changedFrom(live);
  const on = pending ?? chosen;
  const { reasons } = noteReasons(p, f);
  const others = (f.sharedWith ?? []).map((id) => file.platforms.find((q) => q.id === id)).filter((q) => !!q).map((q) => appName(q));
  const also = others.length ? ` This also changes it on ${nameList(others)}.` : '';

  const go = async (id: string, ops: ReleaseOp[]) => {
    setAsking(undefined);
    setPending(id);
    setSaid(undefined);
    for (const op of ops) {
      const r = await run(op);
      if (!r.ok) { setSaid(r.error); break; }
    }
    setPending(undefined);
  };
  const switchOp = (id: string): ReleaseOp => (id === OWN
    ? { op: 'setText', platform: p.id, field: f.id, text: own ?? '', mine: true }
    : { op: 'pick', platform: p.id, field: f.id, candidate: id });
  const tap = (id: string) => {
    if (pending) return;
    if (id === chosen) { setAsking(undefined); return; }
    if (changed) { setAsking(id); return; }
    void go(id, [switchOp(id)]);
  };
  const save = (to?: string) => {
    if (!changed) return;
    if (to === undefined) return void go(changed, [{ op: 'saveOption', platform: p.id, field: f.id, candidate: changed }]);
    if (to === OWN) return void go(to, [{ op: 'saveOption', platform: p.id, field: f.id, candidate: changed }, switchOp(OWN)]);
    void go(to, [{ op: 'saveOption', platform: p.id, field: f.id, candidate: changed, switchTo: to }]);
  };

  const opts = [
    ...f.candidates.map((c) => ({ id: c.id, does: c.does, text: c.text, alma: !!reasons[c.id], why: reasons[c.id] ?? [], edited: !!c.edited })),
    ...(own !== undefined ? [{ id: OWN, does: 'Your text', text: own, alma: false, why: [] as string[], edited: false }] : []),
  ];
  return (
    <div data-choices={f.id} className="flex flex-col gap-1.5">
      {label && <span className="text-[11.5px] text-sub">{f.label}</span>}
      <div role="radiogroup" aria-label={`${f.label}: the texts to choose from`} className="flex flex-col gap-3">
        {opts.map((o) => {
          const sel = on === o.id;
          const diff = sel && !pending && changed === o.id;
          return (
            <Fragment key={o.id}>
              <div data-choice-row={o.id} {...refData(optionRef(p, f, o, f.candidates))} className={cn('flex min-w-0 flex-col gap-1.5 rounded-lg border px-3 py-2 transition-colors duration-200', sel ? 'border-sub bg-raised' : 'border-edge hover:border-edge-strong')}>
                <button type="button" role="radio" aria-checked={sel} data-choice={o.id} data-chosen={sel ? '' : undefined} onClick={() => tap(o.id)}
                  className="flex w-full min-w-0 cursor-pointer items-start gap-2.5 border-0 bg-transparent p-0 text-left text-ink">
                  <span aria-hidden="true" className={cn('mt-[3px] flex size-3.5 flex-none items-center justify-center rounded-full border transition-colors duration-200', sel ? 'border-ink' : 'border-mute')}>
                    {sel && <span className="size-1.5 rounded-full bg-ink duration-200 animate-in fade-in-0" />}
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="flex min-w-0 items-start gap-2">
                      <span data-choice-does className={cn('min-w-0 flex-1 text-[12px] leading-[1.45] transition-colors duration-200', sel ? 'text-ink-3' : 'text-sub')}>
                        {o.does}{o.edited && <span className="text-mute"> · your words</span>}
                      </span>
                      {o.alma && <span className="mt-px flex-none rounded-[4px] bg-ink px-1.5 py-px text-[10px] font-semibold text-bg">Alma</span>}
                    </span>
                    <span data-choice-text className="min-w-0 whitespace-pre-wrap break-words text-[13px] leading-[1.45]">
                      {o.text ? <Pieces pieces={factPieces(file, o.text)} plain /> : <span className="text-mute">No text</span>}
                    </span>
                    {o.why.map((w, i) => <span key={i} data-choice-why className="text-[11.5px] leading-[1.45] text-sub">{w}</span>)}
                  </span>
                </button>
                {diff && (
                  <div data-choice-changed className="flex min-h-7 flex-wrap items-center gap-x-2 pl-6 text-[11.5px] leading-[1.4] text-warn duration-200 animate-in fade-in-0">
                    <span className="min-w-0">Changed in the box</span>
                    <button type="button" data-save-option onClick={() => save()}
                      className="ml-auto inline-flex h-7 flex-none cursor-pointer items-center whitespace-nowrap border-l border-edge-strong pl-[7px] text-[11.5px] text-ink underline decoration-faint underline-offset-2 transition-colors duration-150 hover:decoration-ink">Save to this option</button>
                  </div>
                )}
              </div>
              <Reveal open={asking === o.id && !!changed}>
                <div data-switch-ask={o.id} role="alertdialog" aria-label="Keep the changes before switching" className="flex flex-col gap-2 rounded-[10px] border border-warn/40 bg-warn/5 px-3 py-2.5 text-[12.5px] leading-[1.45] text-ink-2">
                  <p className="m-0">You changed this text. Save your changes to this option (“{f.candidates.find((c) => c.id === changed)?.does}”) before switching?{also}</p>
                  <div className="flex flex-wrap gap-1.5">
                    <Btn primary data-switch-save onClick={() => save(o.id)} className="h-7 px-2.5 text-[12px]">Save</Btn>
                    <Btn data-switch-discard onClick={() => void go(o.id, [switchOp(o.id)])} className="h-7 px-2.5 text-[12px] font-normal">Discard</Btn>
                    <Btn ghost data-switch-cancel onClick={() => setAsking(undefined)} className="h-7 px-2 text-[12px] font-normal">Cancel</Btn>
                  </div>
                </div>
              </Reveal>
            </Fragment>
          );
        })}
      </div>
      <Reveal open={!!said}><p role="alert" data-choice-said className="m-0 text-[11.5px] leading-[1.45] text-warn">{said}</p></Reveal>
    </div>
  );
}
