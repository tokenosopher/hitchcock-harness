'use client';
// What the flow's Edit step shows under the board. (The Shots step opens its own page since
// components/shots/ShotsPage.tsx.)
// Edit: the Edit page's "What's next" list (left.ts, LeftTab), worked out from the same files and routes as the Edit
// page does it, with the way to the timeline. A press on a row goes where that row leads on the Edit page.
import { useRouter } from 'next/navigation';
import { useCallback, useMemo } from 'react';
import type { FilmState } from '@/server/types';
import type { LeftDo } from '@/components/edit/left';
import { goTakesAsk } from '@/components/edit/early';
import { useSendAsUser } from '@/components/release/AskAlma';
import { NO_CUT, useLeftReads } from './useWhatsNext';
import { LeftTab } from '@/components/edit/LeftTab';
import { rememberBack } from '@/components/shell/BackLink';
import { freshCount, newTakes } from '@/components/edit/openAt';
import { notNew, useBeginSeen, useSeenTakes } from '@/components/edit/seenTakes';

/** Board 16: the Edit page's "What's next" list, from what the Edit page reads (the working cut, the version it is, its
 *  renders, the full-size pictures, the Seedance marks and the left route), built by the same leftInputOf. */
export function EditNext({ s, base }: { s: FilmState; base: string }) {
  const router = useRouter();
  // the same reads as the board's Edit box (useWhatsNext.ts useLeftReads), the early steps included
  const { film, cut, cutError, leftTl, input, left, shots } = useLeftReads(s);
  // the takes landed after the cut's, not looked at yet (seenTakes.ts, the same on every device): "Go and
  // check" opens the first in place
  const seenT = useSeenTakes(film);
  const { looked } = seenT;
  useBeginSeen(seenT, leftTl, shots);
  const fresh = useMemo(() => (leftTl ? newTakes(leftTl, shots.by, shots.takes, looked.seen, notNew(looked)) : undefined), [leftTl, shots.by, shots.takes, looked]);
  const firstFresh = fresh ? [...fresh.values()][0] : undefined;
  const sendAs = useSendAsUser(film);
  // every press but Release and a page of the film goes to the Edit page, where the row's own action is
  const onDo = useCallback((d: LeftDo) => {
    // nothing is ticked here: the list on this page sends a tick to the Edit page's step
    if (d.kind === 'go-takes') { void sendAs(goTakesAsk(d.n, d.scenes)); return; }
    // the page a row opens shows "Back to Edit" (BackLink.tsx), back to this list where it was scrolled; a tick is made on
    // the Edit page, at its step, and the new takes are checked there, the first in its place
    const take = (p: NonNullable<typeof firstFresh>['pick']) => `${base}/edit?tab=next&step=approved&take=${encodeURIComponent(p.src)}&shot=${encodeURIComponent(`${p.scene}:${p.tag ?? p.n}`)}`;
    const to = d.kind === 'release' ? `${base}/release` : d.kind === 'page' ? `${base}/${d.page}`
      : d.kind === 'on-edit' ? `${base}/edit?tab=next&step=${d.step}`
      : d.kind === 'check' ? (firstFresh ? take(firstFresh.pick) : `${base}/edit?tab=next&step=approved`) : `${base}/edit`;
    rememberBack(to, 'Back to Edit');
    router.push(to);
  }, [router, base, sendAs, firstFresh]);
  if (!cut && !cutError) return <p className="m-0 text-[13px] text-sub duration-200 animate-in fade-in-0">Reading the cut…</p>;
  if (!input) return <p className="m-0 text-[13px] text-sub">No cut yet: the list starts with the first version of the timeline.</p>;
  return (
    <div data-edit-next className="flex flex-col gap-3">
      <LeftTab film={film} tl={leftTl ?? NO_CUT} input={input} onDo={onDo} error={left.error} from="What's next on the film's board" fresh={freshCount(fresh)} board />
    </div>
  );
}
