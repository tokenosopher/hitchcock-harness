'use client';
// One character, as drawn in the timeline design (Character, CharacterWaiting; ASKS 46): "Back to Characters" and the
// trail in the header, the tab row ("Waiting for you in this film", "Characters"), then the made things in the order
// the takes use them; its brief and its spend under them. Picks and saves work as before.
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useMemo, useState } from 'react';
import type { CharacterRef, Cost, FilmState, Round, SpendLine, TaskCard } from '@/server/types';
import { usePage } from '@/components/data/ui';
import { characterBrief, faceDone as faceDoneOf, faceState, lastRound, roundProgress } from '@/components/lib/derive';
import { capital, fmtCost, fmtCredits, fmtDate, fmtUsd, sumCredits } from '@/components/lib/format';
import { Header } from '@/components/shell/Header';
import { PageBody, Loading } from '@/components/shell/StageTitle';
import { QCChip } from '@/components/shell/QCChip';
import { qcEntry, qcSpec } from '@/components/lib/qc';
import { Btn, Card, Tile, type DotState } from '@/components/shell/atoms';
import { IconBookmark, IconChevronDown } from '@/components/shell/icons';
import { useFilmPage, filmPath } from './common';
import { FromLibrary } from '@/components/library/FromLibrary';
import { PickButton, SaveButton } from '@/components/library/PickButton';
import { Media } from '@/components/media/Media';
import { cn } from '@/lib/utils';
import { characterRowTest } from '@/lib/spendMatch';
import { Feed, ShownLink } from '@/components/feed/Feed';
import { CharacterView } from '@/components/characters/CharacterView';
import { flowOf, PEOPLE } from '@/components/lib/flow';
import type { FlowKey } from '@/components/lib/derive';
import { StepBar } from '@/components/flow/StepBar';
import { StepMenu } from '@/components/flow/StepMenu';
import { glyphOf, type Glyph } from '@/components/flow/FlowBoard';

export function castStatus(c: CharacterRef, tasks: TaskCard[]): { text: string; dot: DotState } {
  if (c.extra) return { text: c.sheet?.approved ? 'group sheet · done' : 'group sheet · waiting', dot: c.sheet?.approved ? 'done' : 'waiting' };
  const st = faceState(c, tasks);
  const p = roundProgress(lastRound(c.face?.rounds));
  if (c.silent && c.sheet?.approved) return { text: c.imageElement ? 'done · no lines, image element' : 'sheet approved · no lines', dot: 'done' };
  if (c.reused) return { text: c.element?.state === 'final' ? 'element done' : 'from the library', dot: 'done' };
  if (st === 'picked') return { text: c.element?.state === 'final' ? 'element done' : c.sheet?.approved ? 'sheet approved' : `face ${c.face?.pick?.candidateId}`, dot: 'done' };
  if (st === 'ready') return { text: 'face ready · your pick', dot: 'done' };
  if (st === 'running') return { text: `faces · ${p.landed} of ${p.asked}`, dot: 'running' };
  return { text: `faces · ${st}`, dot: st === 'queued' ? 'queued' : 'waiting' };
}

/** "r1-faces" → "1", "r2a" → "2a". */
const roundNo = (r: Round) => /^r(\w+?)(?:-|$)/.exec(r.id)?.[1] ?? r.id;

/** The spend rows for one character: labelled with its ID ("C01 r1-2"), or naming it. */
/** The character's rows, the same test the server uses for CharacterRef.cost (src/lib/spendMatch.ts). */
function characterSpend(s: FilmState, c: CharacterRef): SpendLine[] {
  const mine = characterRowTest(c.id, c.name, s.spend.lines.some((l) => !!l.details?.label));
  return s.spend.lines.filter((l) => mine(l.details?.label, l.what));
}

/** One round's cost: the rows labelled "C01 r1-…" (or "C01 r1"). */
function roundCost(lines: SpendLine[], c: CharacterRef, r: Round) {
  const re = new RegExp(`^${c.id} r${roundNo(r)}(?:-|$)`);
  return sumCredits(lines.filter((l) => re.test(l.details?.label ?? '')).map((l) => l.cost));
}

interface SpendGroup { key: string; title: string; n: number; cost: Cost; rate?: string; date: string; words?: string }

/** The character's rows grouped as the board shows them: one entry per round or job, "5 × 0.12 cr". */
function spendGroups(lines: SpendLine[], c: CharacterRef): SpendGroup[] {
  const out = new Map<string, SpendGroup & { costs: Cost[] }>();
  for (const l of lines) {
    const label = l.details?.label ?? '';
    const key = label ? label.replace(/-\d+[a-z]?$/, '') : l.what;
    const title = l.what.replace(/,\s*candidate[\s\S]*$/i, '').replace(/:\s*submission refused[\s\S]*$/i, '').replace(new RegExp(`^${c.name.replace(/^the /i, '')}('s)?\\s+`, 'i'), '');
    const g = out.get(key) ?? { key, title: capital(title), n: 0, cost: {}, costs: [], rate: l.details?.rate?.split(',')[0], date: l.date, words: l.userWords };
    if (l.cost.credits || l.cost.usd?.length) g.n += 1;   // the rows that were charged
    g.costs.push(l.cost);
    out.set(key, g);
  }
  return [...out.values()].map(({ costs, ...g }) => {
    const credits = sumCredits(costs);
    const usd = mergeUsd(costs);
    return { ...g, cost: { credits: credits || !usd ? credits : undefined, usd } };
  });
}

function mergeUsd(costs: Cost[]): Cost['usd'] {
  const m = new Map<string, number>();
  for (const c of costs) for (const u of c.usd ?? []) m.set(u.service, (m.get(u.service) ?? 0) + u.amount);
  return m.size ? [...m].map(([service, amount]) => ({ service, amount: Math.round(amount * 100) / 100 })) : undefined;
}

/** "This round" | "From the library" above the face candidates (design/boards/Character.dc.html). */
function FaceTabs({ tab, setTab, picked }: { tab: 'round' | 'lib'; setTab: (t: 'round' | 'lib') => void; picked?: boolean }) {
  return (
    <div role="tablist" className="flex gap-4 border-b border-line">
      {(['round', 'lib'] as const).map((t) => (
        <button key={t} role="tab" type="button" aria-selected={tab === t} onClick={() => setTab(t)}
          className={cn('-mb-px h-[30px] cursor-pointer border-b-2 text-[12.5px] font-medium', tab === t ? 'border-ink text-ink' : 'border-transparent text-sub')}>
          {t === 'round' ? (picked ? 'Your pick' : 'This round') : 'From the library'}
        </button>
      ))}
    </div>
  );
}

function FaceRounds({ c, spend, onPick }: { c: CharacterRef; spend: SpendLine[]; onPick: (text: string, chip: string) => void }) {
  const rounds = c.face?.rounds ?? [];
  const r = lastRound(rounds);
  const [sel, setSel] = useState(r?.prediction);
  const [tab, setTab] = useState<'round' | 'lib'>('round');
  const { ui, state } = useFilmPage();
  const media = (p?: string) => (p && state ? filmPath(state, p) : undefined);
  if (!r) return <span className="text-[12.5px] text-sub">No round yet.</span>;
  const landed = r.candidates.filter((k) => k.path);
  const pink = r.candidates.filter((k) => /pink/.test(k.note ?? '')).map((k) => k.id);
  const earlier = rounds.slice(0, -1).reverse();
  return (
    <>
      <div className="flex flex-col rounded-lg border border-edge">
        {[...rounds].reverse().map((x, i) => {
          const p = roundProgress(x);
          const cost = roundCost(spend, c, x);
          return (
            <div key={x.id} className={cn('grid grid-cols-[64px_minmax(0,1fr)_auto] items-center gap-2 px-3 py-2.5 text-[12.5px]', i > 0 && 'border-t border-line')}>
              <span className="font-medium">Round {roundNo(x)}</span>
              <span className="text-sub">{p.landed} of {p.asked} landed{p.refused ? ` · ${p.refused} refused` : ''}{x.date ? ` · ${fmtDate(x.date)}` : ''}</span>
              <span className="text-right tabular-nums">{fmtCredits(cost)}</span>
            </div>
          );
        })}
      </div>
      {c.face?.pick && state && <FaceTabs tab={tab} setTab={setTab} picked />}
      {c.face?.pick && state && tab === 'lib' && (
        <FromLibrary film={state.film.slug} kind="face" target={c.id} targetName={c.name} from="the Character page" />
      )}
      {c.face?.pick && tab === 'round' ? (
        <div className="flex items-center gap-3">
        {(() => {
          const pk = rounds.flatMap((x) => x.candidates).find((k) => k.id === c.face?.pick?.candidateId);
          return pk?.path ? <Media path={media(pk.path)} w={320} className="aspect-[4/5] w-[88px] flex-none rounded-[6px] border border-edge" /> : null;
        })()}
        <span className="text-[12.5px] leading-normal text-sub">
          You picked <span className="font-mono text-ink">{c.face.pick.candidateId}</span>{c.face.pick.date ? ` on ${fmtDate(c.face.pick.date)}` : ''}
          {rounds.find((x) => x.pick)?.prediction ? `; Alma had predicted ${rounds.find((x) => x.pick)!.prediction}` : ''}.
        </span>
        </div>
      ) : null}
      {c.face?.pick && tab === 'round' && (() => {
        const from = rounds.find((x) => x.pick) ?? r;
        return (
          <div className="flex flex-col gap-1.5">
            <span className="text-[12px] text-sub">Round {roundNo(from)} · the candidates you picked from</span>
            <div className="grid grid-cols-8 gap-1 max-[760px]:grid-cols-5">
              {from.candidates.map((k) => (
                <Tile key={k.id} label={k.id.split('-').pop() ?? k.id} src={media(k.path)} w={160} className="aspect-[4/5] w-full overflow-hidden text-[9.5px]" selected={k.id === c.face?.pick?.candidateId} faded={!k.path}
                  ariaLabel={`Candidate ${k.id}`} onClick={() => ui.addChip({ id: `cand:${c.id}`, label: `${c.id} · ${k.id}`, ref: k.path })} />
              ))}
            </div>
          </div>
        );
      })()}
      {c.face?.pick ? null : <>
      <FaceTabs tab={tab} setTab={setTab} />
      {tab === 'lib' ? (
        state ? <FromLibrary film={state.film.slug} kind="face" target={c.id} targetName={c.name} from="the Character page" /> : null
      ) : (
        <>
          <div className="grid grid-cols-5 gap-1.5 max-[760px]:grid-cols-4">
            {r.candidates.map((k) => (
              <Tile key={k.id} label={k.id} src={media(k.path)} className="aspect-[4/5] w-full overflow-hidden" selected={k.id === sel} alma={k.id === r.prediction} faded={!k.path}
                onClick={() => { setSel(k.id); ui.addChip({ id: `cand:${c.id}`, label: `${c.id} · ${k.id}`, ref: k.path }); }} />
            ))}
          </div>
          {r.prediction && (
            <p className="m-0 text-[12.5px] leading-normal text-ink-3">
              Alma predicts <span className="font-mono text-ink">{r.prediction}</span><span className="text-sub"> · from your earlier picks.{pink.length ? ` ${pink.join(', ').replace(/, ([^,]*)$/, ' and $1')} ${pink.length === 1 ? 'is' : 'are'} still pink.` : ''}</span>
            </p>
          )}
          {landed.length > 0 && sel && (
            <div className="flex flex-wrap items-center gap-2">
              {state ? (
                <>
                  <PickButton key={sel} film={state.film.slug} body={{ kind: 'face', target: c.id, round: r.id, candidate: sel, prediction: r.prediction, from: 'the Character page' }}
                    label={<>Pick <span className="font-mono">{sel}</span></>} what={`${sel} for ${c.id} ${c.name}`} />
                  {r.candidates.find((k) => k.id === sel)?.path && (
                    <SaveButton key={`s-${sel}`} film={state.film.slug} kind="face" refPath={r.candidates.find((k) => k.id === sel)!.path!} label={<>Save <span className="font-mono">{sel}</span> to the library</>} />
                  )}
                </>
              ) : (
                <>
                  <Btn onClick={() => onPick(`Pick ${sel} for ${c.id}`, `${c.id} · face ${sel}`)}>Pick <span className="font-mono">{sel}</span></Btn>
                  <Btn ghost onClick={() => onPick(`Save ${sel} (${c.id}) to the library`, `save ${sel}`)}><IconBookmark size={13} />Save <span className="font-mono">{sel}</span> to the library</Btn>
                </>
              )}
            </div>
          )}
          {earlier.map((x) => {
            const p = roundProgress(x);
            return (
              <div key={x.id} className="flex items-center gap-1.5 border-t border-line pt-3 text-[12.5px] text-sub">
                Round {roundNo(x)} · {p.landed} still in the running{p.refused ? ` · ${p.refused} refused` : ''}<IconChevronDown size={12} />
              </div>
            );
          })}
        </>
      )}
      </>}
    </>
  );
}

export function CharacterPage() {
  const { state, error, tasks, ui, base } = useFilmPage();
  const params = useParams<{ id?: string }>();
  const search = useSearchParams();
  const router = useRouter();
  const flow = useMemo(() => (state ? flowOf(state, tasks) : undefined), [state, tasks]);
  // the people step the character was opened from (a card's ?from=), for the way back
  const from = (PEOPLE as string[]).includes(search.get('from') ?? '') ? (search.get('from') as FlowKey) : 'faces';
  const chars = state?.characters ?? [];
  const c = chars.find((x) => x.id === params.id) ?? chars[0];
  const st = c ? castStatus(c, tasks) : undefined;
  const ready = c && faceState(c, tasks) === 'ready';
  const pred = c ? lastRound(c.face?.rounds)?.prediction : undefined;
  usePage(c && st ? `${c.id} ${c.name} · ${st.text.replace(' · your pick', '')}` : undefined, undefined,
    ready && pred ? [`Pick ${pred} for ${c.id}`, 'Show round 1 again'] : c ? [`What is ${c.name} waiting for?`] : [], c ? [`Where did ${c.name} appear?`] : []);
  if (!state || !flow) return <Loading error={error} />;
  if (!c) return <Loading error="No characters in cast/ yet" />;
  const people = PEOPLE.map((k) => glyphOf(flow.nodes[k].state));
  const peopleG: Glyph = people.every((g) => g === 'done') ? 'done' : people.includes('now') ? 'now' : people.includes('run') ? 'run' : 'todo';
  const back = `${base}?open=${from}`;

  const brief = characterBrief(state.brief?.markdown, c.id);
  const spend = characterSpend(state, c);
  const groups = spendGroups(spend, c);
  const total = c.cost ?? { credits: sumCredits(spend.map((l) => l.cost)) };
  const onPick = (text: string, chip: string) => ui.prefill(text, { id: `pick:${c.id}`, label: chip });
  const faceDone = faceDoneOf(c);

  return (
    <>
      <Header crumbs={[{ label: state.film.title, href: base }, { label: 'Characters', node: <StepMenu flow={flow} base={base} label="Characters" g={peopleG} /> }, { label: c.name }]}
        back={{ label: 'Back to Characters', href: back }}
        phoneSub={`${c.id} · ${st?.text}`}
        actions={<ShownLink places={['faces', 'clothing', 'sheet', 'voices', 'elements']} />} />
      <PageBody wide>
        <StepBar waiting={flow.waiting} step="Characters" deep back="Back to Characters" backPhoneOnly onBack={() => router.push(back)} onWaiting={() => router.push(`${base}?open=gate`)}
          right={<QCChip spec={qcSpec('sheet')} targets={{ target: c.id, label: `${c.id} sheet`, entry: qcEntry(state, 'sheet', c.id), ready: !!c.sheet?.path, waitsFor: c.sheet?.path ? `${c.id}'s sheet` : faceDone ? 'the sheet' : 'the face pick, then the sheet' }} />} />

        <div className="flex min-w-0 flex-col gap-5">
          <div className="flex min-w-0 flex-col gap-4">
            {/* the made things in the order the takes use them (ASKS 46): the video element, the sheet, the face, the voice */}
            <CharacterView s={state} c={c} base={base} onChip={(id, label, ref) => ui.addChip({ id, label, ref })}
              faceRounds={<FaceRounds key={c.id} c={c} spend={spend} onPick={onPick} />} />
            {brief.length > 0 && (
              <details className="group border-t border-line pt-3">
                <summary className="flex cursor-pointer list-none items-center gap-2 text-[12.5px] [&::-webkit-details-marker]:hidden">
                  <span className="font-medium">The brief</span><span className="text-sub">{brief.length} {brief.length === 1 ? 'line' : 'lines'}</span>
                  <IconChevronDown size={12} className="text-sub transition-transform duration-200 group-open:rotate-180" />
                </summary>
                <ul className="m-0 mt-2 flex list-none flex-col gap-1.5 p-0 duration-200 animate-in fade-in-0">
                  {brief.map((l) => <li key={l} className="flex gap-2.5 text-[13px] leading-normal text-ink-3"><span className="text-mute">–</span>{l}</li>)}
                </ul>
              </details>
            )}
          </div>

          <Card>
            <div className="flex items-center justify-between border-b border-line px-4 py-3"><span className="lbl">Spend · {c.id}</span><span className="font-mono text-[11px] text-mute">spend.md</span></div>
            <div className="scroll max-h-[620px] overflow-y-auto">
              {groups.length ? groups.map((g) => (
                <div key={g.key} className="flex flex-col gap-0.5 border-b border-line px-4 py-3 text-[12.5px]">
                  <span className="font-medium">{g.title}</span>
                  <span>{fmtCost(g.cost) || '0 cr'}{!g.cost.credits && !g.cost.usd ? ' · no charge' : ''}</span>
                  {g.n > 1 && g.rate && <span className="font-mono text-[11px] text-sub">{g.n} × {g.rate}</span>}
                  <span className="text-[11px] leading-normal text-mute">{fmtDate(g.date)}{g.words ? ` · ${g.words.replace(/^the user,\s*/, 'on ')}` : ''}</span>
                </div>
              )) : <div className="px-4 py-3 text-[12.5px] text-sub">Nothing spent on {c.id} yet.</div>}
            </div>
            <div className="flex items-center justify-between gap-2 border-t border-line px-4 py-3 text-[13px] font-semibold"><span>Total</span><span className="flex flex-wrap justify-end gap-x-2 text-right tabular-nums">{[total.credits !== undefined ? fmtCredits(total.credits) : '', ...(total.usd ?? []).map((u) => fmtUsd(u.amount, u.service))].filter(Boolean).map((p) => <span key={p} className="whitespace-nowrap">{p}</span>)}</span></div>
          </Card>
        </div>
        <Feed query={`id=${c.id}`} title={`Shown to you · ${c.name}`} note="faces, clothing, sheets, voices and elements" from={`${c.name}'s page`} />
      </PageBody>
    </>
  );
}
