'use client';
// "Sending it", the right part of a platform page (Release, stage 3 of 3; boards Platform, Go, Sent, Posted, Failed).
// It follows the platform's state: Ready (the route switch, the file, what Buffer sets, Post now and Schedule…),
// Waiting for your go (what was asked, Alma's card, Cancel the ask), Scheduled (Unschedule), Sending (her steps, how
// long so far, whether it can still be stopped), Posted (the link, the steps left in the app), Needs you (a failure:
// her reason, what she checked, her fix, Try again, Post it by hand; or a send past 20 minutes), and by hand (ByHand).
// The page never posts: it writes the release file through the operations and sends the user's own words to Alma
// when a button says it asks her.
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useFilm } from '@/components/data/film';
import { useUIActions } from '@/components/data/ui';
import { AskCard } from '@/components/feed/Feed';
import { repoPath } from '@/components/lib/format';
import { useJson } from '@/components/pages/postCommon';
import { Btn } from '@/components/shell/atoms';
import { IconArrowUpRight, IconCheck, IconFile } from '@/components/shell/icons';
import { Reveal } from '@/components/shell/Reveal';
import { cn } from '@/lib/utils';
import type { FeedCard } from '@/server/types';
import { appName, blanks, goCheck, hm, nextUp, platformStatus, type Status } from './derive';
import { outFile, outWords } from './outfile';
import type { Platform, ReleaseFile } from './file';
import { factsOf } from './platforms';
import { LINK_HOSTS, WAIT_DROPPED, stoppable, askRef, askWords, bufferSets, elapsedWords, fileWords, localInput, maybeAlive, scheduleDefault, sendSteps, whenWords, type FinalInfo } from './sendflow';
import { clockOffset } from './clock';
import { FactField } from './ReleaseOpen';
import { ByHand } from './ByHand';
import { Glyph, type useRelease } from './ui';
import { useTellAlma } from './useAsk';
import { DockSlot, JumpTo, type Layout } from './layout';

type Rel = ReturnType<typeof useRelease>;
export interface SendProps { rel: Rel; file: ReleaseFile; p: Platform; now: Date; final: FinalInfo; base: string; phone?: boolean; layout?: Layout }

/** The file that goes out as the page names it (outfile.ts outFile, ASKS 56: the final's smaller file once made, else
 *  the final; for `pid`, the file its ask kept): its path, plain name, size and length (GET …/release finalFile). */
export function useFinalInfo(rel: Rel, file: ReleaseFile, pid?: string): FinalInfo {
  const { state } = useFilm();
  const ff = rel.view?.finalFile;
  const f = file.final!;
  const out = outFile(file, rel.view?.companions, ff?.bytes, pid);
  const path = out?.path ?? f.path;
  return { path, abs: state ? `${state.film.folder}/${path}` : undefined, name: f.name, bytes: out ? out.bytes : ff?.bytes, seconds: ff?.seconds, width: ff?.width, height: ff?.height, out };
}

/** What the platform page puts in place of stage 1's empty "Sending it" part. */
export function SendingIt(props: Omit<SendProps, 'final'>) {
  const final = useFinalInfo(props.rel, props.file, props.p.id);
  return <PlatformSend {...props} final={final} />;
}

/** The part itself. */
export function PlatformSend(props: SendProps) {
  const { file, p, now, phone } = props;
  const st = platformStatus(file, p.id, now);
  const failed = st.state === 'needs' && st.reason === 'it did not go out';
  const stuck = st.state === 'needs' && !!st.since;
  const hand = p.route === 'hand';
  // the ask lives here, above the views: an ask taken back (it did not reach Alma) says so on the Ready it returns to
  const flow = useAskFlow(props);
  const view = hand ? 'hand' : st.state === 'posted' ? 'posted' : failed ? 'failed' : st.state === 'sending' || stuck ? 'sending' : st.state === 'scheduled' ? 'scheduled' : st.state === 'waiting' ? 'waiting' : 'ready';
  return (
    <section aria-label="Sending it" data-send={view} className={cn('flex min-h-0 flex-col gap-3 p-4',
      phone ? 'w-full px-4' : props.layout === 'one' ? 'w-full border-t border-line px-5 pb-6' : 'w-[288px] flex-none overflow-y-auto border-l border-line @max-[760px]/page:w-[264px]')}>
      <div className="flex min-h-[30px] items-baseline gap-2"><h2 className="m-0 text-[14px] font-medium">Sending it</h2></div>
      <div key={view} className="flex min-h-0 flex-1 flex-col gap-3 duration-200 animate-in fade-in-0">
        {view === 'hand' ? <ByHand {...props} />
          : view === 'posted' ? <Posted {...props} st={st} />
            : view === 'failed' ? <Failed {...props} flow={flow} />
              : view === 'sending' ? <Sending {...props} st={st} />
                : view === 'scheduled' ? <Scheduled {...props} st={st} />
                  : view === 'waiting' ? <Waiting {...props} />
                    : <Ready {...props} flow={flow} />}
      </div>
    </section>
  );
}

// ---- small pieces

/** "From / File / Planned". */
function Facts({ p, final, planned }: { p: Platform; final: FinalInfo; planned?: string }) {
  return (
    <dl data-send-facts className="m-0 grid grid-cols-[70px_minmax(0,1fr)] gap-x-2 gap-y-1.5 text-[12.5px]">
      <dt className="text-sub">From</dt><dd className="m-0 truncate" title={p.account}>{p.account}</dd>
      <dt className="text-sub">File</dt>
      <dd data-send-file data-send-file-small={final.out?.small ? '' : undefined} className="m-0 break-words" title={[outWords(final.out).title, final.path].filter(Boolean).join(' · ')}>
        {fileWords(final)}
        {outWords(final.out).note && <span data-send-file-note className="block text-[12px] leading-[1.45] text-sub duration-200 animate-in fade-in-0">{outWords(final.out).note}</span>}
      </dd>
      {planned && <><dt className="text-sub">Planned</dt><dd className="m-0">{planned}</dd></>}
    </dl>
  );
}

function Lock() {
  return <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true" className="flex-none text-sub"><rect x="3" y="7" width="10" height="7" rx="1.5" /><path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" /></svg>;
}

/** "At upload, Buffer sets", read-only, and the amber "Do in TikTok right after it posts". */
function Upload({ p, after = true }: { p: Platform; after?: boolean }) {
  const sets = bufferSets(p);
  const left = p.upload.after;
  return (
    <>
      <div data-buffer-sets className="flex flex-col gap-1.5">
        <span className="text-[12px] text-sub">At upload, Buffer sets</span>
        {sets.map((s) => (
          <span key={s.label} className="flex items-start gap-2 text-[12.5px] text-ink-3"><span className="mt-[3px]"><Lock /></span>
            <span className="min-w-0">{s.value ? `${s.label}: ${s.value}` : s.label}{s.about && <span className="text-mute"> · about: what Buffer can set, not read for this post</span>}</span></span>
        ))}
      </div>
      {after && left.length > 0 && (
        <div data-after-box className="flex flex-col gap-1 rounded-[9px] border border-warn/60 px-3 py-2.5 text-[12.5px] text-warn">
          <span className="font-medium">Do in {appName(p)} right after it posts</span>
          {left.map((s) => <span key={s.id}>{s.text}</span>)}
        </div>
      )}
    </>
  );
}

/** The "Through Buffer / By hand" switch, or "Always by hand" for a platform Buffer has no channel for. */
export function RouteSwitch({ rel, p, disabledWhy }: { rel: Rel; p: Platform; disabledWhy?: string }) {
  const { addChip } = useUIActions();
  const [err, setErr] = useState<string>();
  if (!factsOf(p.kind).buffer.channel) return <p data-always-hand className="m-0 text-[12.5px] text-sub">Always by hand. Buffer has no {appName(p)} channel.</p>;
  const set = async (route: 'buffer' | 'hand') => {
    if (route === p.route) return;
    const r = await rel.run({ op: 'setRoute', platform: p.id, route });
    setErr(r.ok ? undefined : r.error);
    if (r.ok) addChip(routeChip(p, route));
  };
  return (
    <div className="flex flex-col gap-1.5">
      <div role="radiogroup" aria-label="How it goes out" data-route-switch className="relative grid grid-cols-2 rounded-[9px] border border-edge-strong p-[3px] text-[12.5px]">
        <span aria-hidden="true" className={cn('absolute inset-y-[3px] left-[3px] w-[calc(50%-3px)] rounded-[6px] bg-raised transition-transform duration-200 ease-out', p.route === 'hand' && 'translate-x-full')} />
        {(['buffer', 'hand'] as const).map((r) => (
          <button key={r} type="button" role="radio" aria-checked={p.route === r} disabled={!!disabledWhy} onClick={() => void set(r)} data-route={r}
            className={cn('relative h-7 cursor-pointer rounded-[6px] border-0 bg-transparent transition-colors duration-150 disabled:cursor-not-allowed', p.route === r ? 'text-ink' : 'text-sub hover:text-ink')}>
            {r === 'buffer' ? 'Through Buffer' : 'By hand'}
          </button>
        ))}
      </div>
      {(err || disabledWhy) && <span role="alert" className="text-[12px] text-warn duration-200 animate-in fade-in-0">{err ?? disabledWhy}</span>}
    </div>
  );
}
/** The chip that tells Alma the route changed, so Buffer never also posts it. */
export const routeChip = (p: Platform, route: 'buffer' | 'hand') => ({
  id: `release:route:${p.id}`,
  label: route === 'hand' ? `${appName(p)} moved to by hand` : `${appName(p)} back through Buffer`,
  ref: route === 'hand'
    ? `The user moved ${p.name} to by hand (routeBy in social/release.json). Buffer must not post it: if anything of it is in Buffer, take it out and say so. The user posts it with the steps in upload.hand.`
    : `The user moved ${p.name} back through Buffer (routeBy in social/release.json). It goes out through Buffer after their go, as before.`,
});

/** How long it has been sending: the one thing on the page that moves every second. */
function Elapsed({ since }: { since: string }) {
  const [t, setT] = useState(() => Date.now() + clockOffset());
  useEffect(() => { const id = setInterval(() => setT(Date.now() + clockOffset()), 1000); return () => clearInterval(id); }, []);
  return <span data-elapsed className="tabular-nums">{elapsedWords(t - Date.parse(since))} so far</span>;
}

/** An ask's outcome line: an error from the operation, or the ask recorded without reaching Alma. */
function Said({ text }: { text?: string }) {
  return <Reveal open={!!text}><p role="alert" className="m-0 text-[12px] leading-[1.45] text-warn">{text}</p></Reveal>;
}

/** Records an ask and sends it to Alma as the user's own words with the chip of exactly what is asked. */
function useAskFlow({ rel, p, final }: SendProps) {
  const tell = useTellAlma(rel.view?.film ?? '');
  const [said, setSaid] = useState<string>();
  const [busy, setBusy] = useState(false);
  const ask = async (when: 'now' | string, again?: string) => {
    if (busy) return;
    setBusy(true);
    setSaid(undefined);
    const t = new Date(Date.now() + clockOffset());
    const r = await rel.run({ op: 'ask', platform: p.id, when, file: final.path });
    if (!r.ok) { setSaid(r.error); setBusy(false); return; }
    const words = askWords(p, when, t);
    const ok = await tell(words, { id: `release:ask:${p.id}`, label: `Asked: ${words}`, ref: askRef(r.file, p.id, when, final, t, again) });
    // an ask Alma never got is taken back at once: no platform waits for a go with no ask in her thread
    if (!ok) {
      const back = await rel.run({ op: 'cancelAsk', platform: p.id });
      setSaid(back.ok ? 'The ask did not reach Alma, so it was taken back. Try again.' : `The ask did not reach Alma, and taking it back failed: ${back.error} Cancel the ask.`);
    }
    setBusy(false);
  };
  return { ask, said, busy };
}

// ---- Ready

type Flow = ReturnType<typeof useAskFlow>;

function Ready(props: SendProps & { flow: Flow }) {
  const { rel, file, p, now, final, flow } = props;
  const g = goCheck(file, p.id, now, final.out);
  const [sched, setSched] = useState(false);
  const def = scheduleDefault(file, p, now);
  const [time, setTime] = useState(() => localInput(def));
  const tooEarly = Date.parse(time) <= now.getTime();
  const missing = blanks(file, p);
  return (
    <>
      <RouteSwitch rel={rel} p={p} />
      <Facts p={p} final={final} planned={`${p.wave.day}, about ${p.wave.about}`} />
      <Upload p={p} />
      {!g.ok && missing.length > 0 && <div data-go-facts className="flex flex-col gap-2 rounded-[10px] border border-warn/40 px-3 py-2.5">{missing.map((f) => <FactField key={f.id} f={f} file={file} run={rel.run} />)}</div>}
      <DockSlot>
        {!g.ok ? (
          <>
            <button type="button" disabled data-post-now className="h-10 w-full flex-none cursor-not-allowed rounded-[9px] bg-ink text-[13.5px] font-medium text-bg opacity-40">Post now</button>
            <p data-go-why className="m-0 text-[12px] leading-[1.45] text-warn">{g.why}</p>
          </>
        ) : (
          <>
            <Reveal open={sched}>
              <div data-schedule className="flex flex-col gap-2 pb-1">
                <label className="flex items-center gap-2 text-[12.5px] text-sub">When
                  <input type="datetime-local" value={time} min={localInput(now)} onChange={(e) => setTime(e.target.value)} aria-label="When it goes out"
                    className="h-8 min-w-0 flex-1 rounded-lg border border-edge-strong bg-black px-2 text-[12.5px] text-ink outline-none [color-scheme:dark] focus:border-ink" />
                </label>
                {tooEarly && <span className="text-[12px] text-warn">That time has passed. Pick a later one.</span>}
                <Btn data-schedule-ask disabled={tooEarly || flow.busy} onClick={() => void flow.ask(new Date(time).toISOString())} className="h-auto min-h-8 justify-center whitespace-normal py-1 text-center">
                  Ask Alma to schedule it for {whenWords(new Date(time).toISOString(), now)}
                </Btn>
              </div>
            </Reveal>
            <div className="flex gap-2">
              <button type="button" data-post-now disabled={flow.busy} onClick={() => void flow.ask('now')}
                className="h-10 min-w-0 flex-1 cursor-pointer rounded-[9px] bg-ink text-[13.5px] font-medium text-bg transition-colors duration-150 hover:bg-ink-3 disabled:opacity-50">Post now</button>
              <button type="button" data-schedule-open aria-expanded={sched} onClick={() => setSched(!sched)}
                className="h-10 min-w-0 flex-1 cursor-pointer whitespace-nowrap rounded-[9px] border border-edge-strong bg-transparent text-[13.5px] text-ink transition-colors duration-150 hover:bg-raised">{sched ? 'Not now' : 'Schedule…'}</button>
            </div>
            <p className="m-0 text-[12px] leading-[1.45] text-sub">Either way, Alma shows you the exact text and file first. Nothing goes out without your go.</p>
          </>
        )}
        <Said text={flow.said} />
      </DockSlot>
    </>
  );
}

// ---- Waiting for your go

/** Alma's go card for this platform: the newest card about it that asks, written since the ask. */
function useGoCard(film: string, p: Platform): { open?: FeedCard; answered?: FeedCard } {
  const { state } = useFilm();
  const { data } = useJson<{ cards: FeedCard[] }>(film ? `/api/films/${film}/feed?id=${encodeURIComponent(p.id)}` : undefined, `${state?.updatedAt ?? ''}:${p.send.asked?.at ?? ''}`);
  const since = p.send.asked?.at ?? '';
  const mine = (data?.cards ?? []).filter((c) => c.place === 'release' && c.ask && (c.date ?? '') >= since.slice(0, 16));
  return { open: mine.find((c) => !c.ask!.answer && !c.ask!.progress), answered: mine.find((c) => c.ask!.answer) };
}

function Waiting(props: SendProps) {
  const { rel, p, now, final } = props;
  const film = rel.view?.film ?? '';
  const tell = useTellAlma(film);
  const { state } = useFilm();
  const asked = p.send.asked!;
  const card = useGoCard(film, p);
  const [said, setSaid] = useState<string>();
  const cancel = async () => {
    const r = await rel.run({ op: 'cancelAsk', platform: p.id });
    if (!r.ok) { setSaid(r.error); return; }
    await tell(`Cancel the ask for ${appName(p)}`, { id: `release:cancel:${p.id}`, label: `Cancelled: ${askWords(p, asked.when, now)}`, ref: `The user cancelled the ask "${askWords(p, asked.when, now)}" on the platform page; send.asked is gone from social/release.json. Close your go card for ${p.name} with "answer": {"option": "no", "note": "cancelled on the page"}. Do not post it.` });
  };
  // her card's buttons: the yes records the go here (the go operation checks the text is the one asked); the no
  // takes the ask back. She is told by the card's own answer.
  const answered = async (option?: string) => {
    const r = await rel.run(option === 'no' ? { op: 'cancelAsk', platform: p.id } : { op: 'go', platform: p.id });
    if (!r.ok) setSaid(r.error);
  };
  const mins = Math.floor((now.getTime() - Date.parse(asked.at)) / 60_000);
  const how = `${asked.when === 'now' ? 'post now' : `schedule it for ${whenWords(asked.when, now)}`}, through Buffer, from ${p.account}`;
  const line = card.open ? 'Alma\'s card is below. Give your go there, or tell her go.'
    : card.answered && card.answered.ask?.answer?.option !== 'no' ? 'You gave your go on her card. It is being recorded.'
      : mins >= 5 ? `No card from Alma after ${mins} minutes. She may be busy with something else: look in her column, or cancel the ask.`
        : 'Alma is writing her card with the exact text and file.';
  const toRepo = (r: string) => (state ? repoPath(state.film.folder, state.film.repo, r) : r);
  return (
    <>
      <div data-waiting className="flex flex-col gap-2 rounded-[10px] border border-edge-strong bg-panel px-3.5 py-3">
        <span className="flex items-center gap-2 text-[13.5px] font-medium text-warn"><Glyph state="waiting" size={13} />Waiting for your go</span>
        <p className="m-0 text-[12.5px] leading-[1.5] text-ink-3">You asked to {how} at {hm(asked.at)}.</p>
        <p data-card-line className="m-0 text-[12.5px] leading-[1.5] text-sub">{line}</p>
        <div><Btn data-cancel-ask onClick={() => void cancel()} className="h-7 px-2.5 text-[12.5px]">Cancel the ask</Btn></div>
      </div>
      <Said text={said} />
      {card.open && <DockSlot dockOnly><JumpTo target="[data-go-card]">Her card: give your go there</JumpTo></DockSlot>}
      {card.open && (
        <div data-go-card className="duration-200 animate-in fade-in-0 slide-in-from-bottom-1">
          <AskCard film={film} card={card.open} toRepo={toRepo} from={`the ${p.name} page`} onAnswered={(o) => void answered(o)} />
        </div>
      )}
      <Facts p={p} final={final} planned={asked.when === 'now' ? `now, instead of about ${p.wave.about}` : whenWords(asked.when, now)} />
      <Upload p={p} />
    </>
  );
}

// ---- Scheduled

function Scheduled({ rel, p, now, final, st }: SendProps & { st: Status }) {
  const tell = useTellAlma(rel.view?.film ?? '');
  const [said, setSaid] = useState<string>();
  const asked = !!p.send.requested?.unschedule;
  const when = p.send.scheduled?.for ?? p.send.asked!.when;
  const unschedule = async () => {
    const r = await rel.run({ op: 'request', platform: p.id, what: 'unschedule' });
    if (!r.ok) { setSaid(r.error); return; }
    await tell(`Unschedule ${appName(p)}`, { id: `release:unschedule:${p.id}`, label: `Unschedule ${appName(p)} (${st.time})`, ref: `The user asks you to unschedule ${p.name} (scheduled for ${st.time}, Buffer post ${p.send.scheduled?.bufferPostId ?? 'id not recorded'}). Take it out of Buffer, then remove send.scheduled, send.go, send.asked and send.requested in social/release.json; it is Ready again. Say if it had already gone out.` });
  };
  return (
    <>
      <div data-scheduled className="flex flex-col gap-2 rounded-[10px] border border-edge-strong bg-panel px-3.5 py-3">
        <span className="flex items-center gap-2 text-[13.5px] font-medium"><Glyph state="scheduled" size={13} />Scheduled for {st.time}</span>
        <p className="m-0 text-[12.5px] leading-[1.5] text-sub">From {p.account}. {p.send.scheduled ? `It goes out by itself at ${whenWords(when, now)}.` : `Alma is putting it in Buffer for ${whenWords(when, now)}.`}</p>
        {asked
          ? <p data-unscheduling className="m-0 text-[12.5px] text-ink-3 duration-200 animate-in fade-in-0">Unscheduling… Alma takes it out of Buffer. It is Ready again once she confirms.</p>
          : <div><Btn data-unschedule onClick={() => void unschedule()} className="h-7 px-2.5 text-[12.5px]">Unschedule</Btn></div>}
      </div>
      <Said text={said} />
      <Facts p={p} final={final} />
      <Upload p={p} />
      {!asked && <DockSlot dockOnly><JumpTo target="[data-scheduled]">Unschedule or check the time</JumpTo></DockSlot>}
    </>
  );
}

// ---- Sending, and a send past 20 minutes

function StepGlyph({ s }: { s: 'done' | 'current' | 'to-come' }) {
  if (s === 'done') return <span className="grid size-[14px] flex-none place-items-center rounded-full bg-ink text-bg"><IconCheck size={9} /></span>;
  if (s === 'current') return <Glyph state="sending" size={14} />;
  return <span className="size-[14px] flex-none rounded-full border-[1.5px] border-mute" />;
}

function Sending({ rel, p, final, st }: SendProps & { st: Status }) {
  const [said, setSaid] = useState<string>();
  const stuck = st.state === 'needs';
  const can = stoppable(p);
  const tell = useTellAlma(rel.view?.film ?? '');
  const [askedStop, setAskedStop] = useState<string>();
  // her record says neither: the page asks her, it never guesses
  const askStoppable = async () => {
    const ok = await tell(`Can ${appName(p)} still be stopped?`, { id: `release:stoppable:${p.id}`, label: `Can ${appName(p)} still be stopped?`, ref: `The user asks whether ${p.name} can still be stopped. Look in Buffer: if Buffer still holds it, write send.sending.inBuffer (a time); if ${appName(p)} already has it, write send.sending.platformHas. Do not stop it unless they ask.` });
    if (ok) setAskedStop(hm(new Date(Date.now() + clockOffset())));
  };
  const req = p.send.requested ?? {};
  const steps = sendSteps(p);
  const request = async (what: 'stop' | 'check') => {
    const r = await rel.run({ op: 'request', platform: p.id, what });
    if (!r.ok) { setSaid(r.error); return; }
    if (what === 'stop') await tell(`Stop sending ${appName(p)}`, { id: `release:stop:${p.id}`, label: `Stop sending ${appName(p)}`, ref: `The user asks you to stop ${p.name} while Buffer still holds it (send.sending has no platformHas yet). Take it out of Buffer if it is still there, then remove send.sending, send.go, send.asked and send.requested; if ${appName(p)} already has it, write send.sending.platformHas and say so: then it can only be deleted in ${appName(p)} once it is up.` });
    else await tell(`Check Buffer for ${appName(p)}: still not posted after 20 minutes`, { id: `release:check:${p.id}`, label: `Check Buffer for ${appName(p)}`, ref: `${p.name} has been sending since ${hm(st.since!)} and is not posted. Look in Buffer and on ${appName(p)} (${p.account}): write send.posted with the link if it is up, send.failed with the reason and what you checked if it did not go, or a new send.sending.since with where it is. Do not post it again without the user's go.` });
  };
  return (
    <>
      <div data-sending className={cn('flex flex-col gap-2.5 rounded-[10px] border bg-panel px-3.5 py-3', stuck ? 'border-warn/60' : 'border-edge-strong')}>
        <span className="flex items-center gap-2 text-[13.5px] font-medium">
          {stuck ? <><Glyph state="needs" size={13} /><span className="text-warn">Needs you:</span><span className="font-normal text-warn">still not posted after 20 minutes</span></>
            : <><Glyph state="sending" size={13} />Sending<span className="ml-auto text-[12px] font-normal text-sub"><Elapsed since={st.since!} /></span></>}
        </span>
        <ol data-send-steps className="m-0 flex list-none flex-col gap-1.5 p-0">
          {steps.map((s, i) => (
            <li key={i} data-step-state={s.state} className="flex items-center gap-2.5 text-[12.5px]">
              <StepGlyph s={s.state} /><span className={cn('min-w-0 flex-1', s.state === 'to-come' ? 'text-sub' : 'text-ink')}>{s.label}</span>
              <span className="flex-none text-[11.5px] tabular-nums text-sub">{s.state === 'done' ? hm(s.at!) : s.state === 'current' ? 'now' : 'to come'}</span>
            </li>
          ))}
        </ol>
        {can === 'no'
          ? <p data-too-late className="m-0 text-[12px] leading-[1.45] text-sub">Too late to stop it. To remove it, delete it in {appName(p)} once it is up.</p>
          : req.stop
            ? <p data-stopping className="m-0 text-[12px] leading-[1.45] text-ink-3">Stopping… Alma takes it out of Buffer if Buffer still holds it.</p>
            : can === 'yes'
              ? <div className="flex flex-col gap-1"><div><Btn data-stop onClick={() => void request('stop')} className="h-7 px-2.5 text-[12.5px]">Stop sending</Btn></div><span className="text-[11.5px] text-mute">Alma saw Buffer still holding it at {hm(p.send.sending!.inBuffer!)}. This asks her to take it out.</span></div>
              : askedStop
                ? <p data-stoppable-asked className="m-0 text-[12px] leading-[1.45] text-ink-3">You asked Alma at {askedStop} whether it can still be stopped.</p>
                : <button type="button" data-ask-stoppable onClick={() => void askStoppable()} className="inline-flex min-h-7 w-fit cursor-pointer items-center border-0 bg-transparent p-0 text-left text-[12px] text-sub underline decoration-edge-strong underline-offset-2 transition-colors duration-150 hover:text-ink">Ask Alma whether it can still be stopped</button>}
        {stuck && req.check && <p data-checking className="m-0 text-[12px] text-ink-3">You asked Alma to check at {hm(req.check)}.</p>}
      </div>
      {stuck && !req.check && <DockSlot className="static mt-0 pt-0"><button type="button" data-check onClick={() => void request('check')} className="h-10 w-full cursor-pointer rounded-[9px] bg-ink text-[13px] font-medium text-bg transition-colors duration-150 hover:bg-ink-3">Ask Alma to check Buffer</button></DockSlot>}
      <Said text={said} />
      <p data-link-to-come className="m-0 rounded-[10px] border border-dashed border-edge px-3 py-2.5 text-[12.5px] leading-[1.45] text-sub">The link appears here when {appName(p)} posts it.</p>
      <Upload p={p} />
      <Facts p={p} final={final} />
    </>
  );
}

// ---- Posted

/** Copy a text, the button saying Copied for a moment. */
export function CopyBtn({ text, label, again, className, data }: { text: string; label: string; again?: string; className?: string; data?: string }) {
  const [copied, setCopied] = useState(false);
  const [once, setOnce] = useState(false);
  useEffect(() => { if (!copied) return; const t = setTimeout(() => setCopied(false), 1600); return () => clearTimeout(t); }, [copied]);
  return (
    <button type="button" data-copy-btn={data} onClick={() => { void navigator.clipboard?.writeText(text).then(() => { setCopied(true); setOnce(true); }, () => undefined); }}
      className={cn('inline-flex h-7 flex-none cursor-pointer items-center gap-1.5 rounded-md border border-edge-strong bg-transparent px-2.5 text-[12px] text-ink transition-colors duration-150 hover:bg-raised', className)}>
      <IconFile size={11} /><span key={copied ? 'y' : 'n'} className="duration-200 animate-in fade-in-0">{copied ? 'Copied' : once && again ? again : label}</span>
    </button>
  );
}

/** The post's link pasted by hand, checked to be a link to that platform. `later` adds "I posted it, link later". */
export function LinkField({ rel, p, later, onDone, big }: { rel: Rel; p: Platform; later?: boolean; onDone?: () => void; big?: boolean }) {
  const [v, setV] = useState('');
  const [err, setErr] = useState<string>();
  const { addChip } = useUIActions();
  const save = async () => {
    const r = await rel.run({ op: 'pasteLink', platform: p.id, link: v });
    if (!r.ok) { setErr(r.error); return; }
    setErr(undefined);
    addChip({ id: `release:link:${p.id}`, label: `${appName(p)} link pasted`, ref: `The user pasted ${p.name}'s post link: ${v.trim()} (send.posted.link in social/release.json).` });
    onDone?.();
  };
  const noLink = async () => {
    const r = await rel.run({ op: 'postedNoLink', platform: p.id });
    if (!r.ok) { setErr(r.error); return; }
    addChip({ id: `release:link:${p.id}`, label: `${appName(p)} posted by hand`, ref: `The user posted ${p.name} by hand; the link is still to come (send.posted without a link).` });
    onDone?.();
  };
  return (
    <div data-link-field className="flex flex-col gap-1.5" onClick={(e) => e.stopPropagation()}>
      <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); void save(); }}>
        <input value={v} onChange={(e) => { setV(e.target.value); setErr(undefined); }} placeholder={`${LINK_HOSTS[p.kind][0]}/…`} aria-label="The post's link" inputMode="url"
          className={cn('min-w-0 flex-1 rounded-lg border border-edge-strong bg-black px-2.5 text-ink outline-none focus:border-ink', big ? 'h-11 text-[14px]' : 'h-8 text-[12.5px]')} />
        <Btn type="submit" data-link-save disabled={!v.trim()} className={big ? 'h-11' : undefined}>Save</Btn>
      </form>
      {err && <span role="alert" className="text-[12px] text-warn duration-200 animate-in fade-in-0">{err}</span>}
      {later && !p.send.posted && (
        <span className="text-[12px] text-sub">
          <button type="button" data-link-later onClick={() => void noLink()} className={cn('inline-flex cursor-pointer items-center border-0 bg-transparent p-0 text-ink underline decoration-edge-strong underline-offset-2', big ? 'min-h-[44px]' : 'min-h-7')}>I posted it, link later</button>
          <span className="text-mute"> · shows as Posted, link to add</span>
        </span>
      )}
    </div>
  );
}

function Posted({ rel, p, final, st }: SendProps & { st: Status }) {
  const posted = p.send.posted!;
  const left = p.upload.after.filter((s) => !s.done).length;
  const tick = (id: string, done: boolean) => void rel.run({ op: 'tick', platform: p.id, list: 'after', step: id, done });
  const link = posted.link;
  const href = link && (/^https?:\/\//.test(link) ? link : `https://${link}`);
  return (
    <>
      <div data-posted className="flex flex-col gap-2 rounded-[10px] border border-edge-strong bg-panel px-3.5 py-3">
        <span className="flex items-center gap-2 text-[13.5px] font-medium text-ok"><Glyph state="posted" size={13} />Posted<span className="font-normal tabular-nums text-sub">{st.time}</span></span>
        {link ? (
          <>
            <span data-post-link className="truncate text-[12.5px]" title={link}>{link.replace(/^https?:\/\/(www\.)?/, '')}</span>
            <div className="flex flex-wrap gap-2">
              <CopyBtn text={link} label="Copy link" data="link" />
              <a href={href} target="_blank" rel="noreferrer" data-open-post className="inline-flex h-7 items-center gap-1.5 rounded-md border border-edge-strong px-2.5 text-[12px] text-ink no-underline transition-colors duration-150 hover:bg-raised"><IconArrowUpRight size={11} />Open it on {appName(p)}</a>
            </div>
            <span className="text-[12px] text-sub">The link is on the Release page.</span>
          </>
        ) : (
          <>
            <span className="text-[12.5px] text-warn">Posted, link to add</span>
            <LinkField rel={rel} p={p} />
          </>
        )}
      </div>
      {p.upload.after.length > 0 && (
        <div data-after className="flex flex-col gap-2">
          <Reveal open={left > 0}><span data-left className="text-[12.5px] text-warn">{left} {left === 1 ? 'thing' : 'things'} left in {appName(p)}</span></Reveal>
          {p.upload.after.map((s) => (
            <label key={s.id} data-after-step={s.id} className="flex min-h-[36px] cursor-pointer items-center gap-2.5 rounded-[9px] border border-edge-strong px-3 py-2 text-[12.5px] transition-colors duration-150 hover:bg-raised/50">
              <input type="checkbox" checked={!!s.done} onChange={(e) => tick(s.id, e.target.checked)} className="size-4 flex-none cursor-pointer accent-white" />
              <span className={cn('transition-colors duration-200', s.done ? 'text-sub line-through decoration-edge-strong' : 'text-ink')}>{s.text}</span>
            </label>
          ))}
        </div>
      )}
      <p className="m-0 text-[12px] text-sub">To remove the post, delete it in {appName(p)}.</p>
      <Facts p={p} final={final} />
    </>
  );
}

// ---- Failed

function Failed(props: SendProps & { flow: Flow }) {
  const { rel, p, final, flow } = props;
  const f = p.send.failed!;
  const tell = useTellAlma(rel.view?.film ?? '');
  const { addChip } = useUIActions();
  const [said, setSaid] = useState<string>();
  const alive = maybeAlive(p);
  // the same wait for a new ask: Buffer may still hold the failed post
  const waitDrop = !f.cleared;
  const action = f.fixAction;
  const byHand = async () => {
    const r = await rel.run({ op: 'setRoute', platform: p.id, route: 'hand' });
    if (!r.ok) { setSaid(r.error); return; }
    addChip(routeChip(p, 'hand'));
  };
  return (
    <>
      <div data-failed className="flex flex-col gap-2.5 rounded-[10px] border border-warn/60 bg-panel px-3.5 py-3">
        <span className="flex items-center gap-2 text-[13.5px] font-medium"><Glyph state="needs" size={13} /><span className="text-warn">Needs you:</span><span className="font-normal text-warn">it did not go out</span></span>
        <p data-fail-reason className="m-0 text-[12.5px] leading-[1.5] text-ink">{f.reason}</p>
        {f.checked && <p data-fail-checked className="m-0 text-[12.5px] leading-[1.5] text-sub">{/\b\d{1,2}:\d{2}\b/.test(f.checked.text) ? f.checked.text : `${f.checked.text} (checked at ${hm(f.checked.at)})`}</p>}
        {f.fix && <p data-fail-fix className="m-0 flex gap-2 text-[12.5px] leading-[1.5] text-ink-3"><span aria-hidden="true" className="mt-px grid size-4 flex-none place-items-center rounded-full border border-edge-strong text-[9px] text-sub">A</span>{f.fix}</p>}
      </div>
      {/* her fix, Try again and by hand: the slot at the column's foot, or the dock */}
      <DockSlot>
        <div data-fail-actions className="flex flex-col gap-2">
        {action && (action.href
          ? <a href={action.href} target="_blank" rel="noreferrer" data-fix className="inline-flex min-h-10 items-center justify-center rounded-[9px] bg-ink px-3 py-1.5 text-center text-[13px] font-medium text-bg no-underline transition-colors duration-150 hover:bg-ink-3">{action.label}</a>
          : <button type="button" data-fix onClick={() => void tell(action.ask!, { id: `release:fix:${p.id}`, label: action.label, ref: `The user pressed your suggested fix "${action.label}" for ${p.name}, which failed: ${f.reason}` })}
              className="min-h-10 cursor-pointer rounded-[9px] bg-ink px-3 py-1.5 text-[13px] font-medium text-bg transition-colors duration-150 hover:bg-ink-3">{action.label}</button>)}
        <div className="flex gap-2">
          <div className="flex min-w-0 flex-1 flex-col items-stretch gap-1">
            <button type="button" data-try-again disabled={flow.busy || waitDrop} onClick={() => void flow.ask('now', f.reason)}
              className={cn('h-9 cursor-pointer rounded-[9px] text-[13px] font-medium transition-colors duration-150 disabled:opacity-50', action ? 'border border-edge-strong bg-transparent text-ink hover:bg-raised' : 'bg-ink text-bg hover:bg-ink-3')}>Try again</button>
          </div>
          <button type="button" data-post-by-hand disabled={alive} onClick={() => void byHand()} className="h-9 min-w-0 flex-1 cursor-pointer whitespace-nowrap rounded-[9px] border border-edge-strong bg-transparent px-2 text-[13px] text-ink transition-colors duration-150 hover:bg-raised disabled:cursor-not-allowed disabled:opacity-50">Post it by hand</button>
        </div>
        <span data-hand-wait={alive ? '' : undefined} className="text-[11.5px] leading-[1.45] text-mute">{waitDrop || alive ? WAIT_DROPPED : 'Try again asks for your go again.'}</span>
        </div>
      </DockSlot>
      <Said text={said ?? flow.said} />
      <Facts p={p} final={final} />
    </>
  );
}

// ---- the bar under the state line while it sends, and once it is posted

/** "While it sends: Instagram Reels is Scheduled 19:10" / "Next: Instagram Reels, scheduled for 19:10" with "Go to". */
export function SendBar({ file, p, now, base }: { file: ReleaseFile; p: Platform; now: Date; base: string }) {
  const st = platformStatus(file, p.id, now);
  const sending = st.state === 'sending' || (st.state === 'needs' && !!st.since);
  if (!sending && st.state !== 'posted') return null;
  const n = nextUp(file, now);
  if (!n || n.platform.id === p.id) return null;
  const qs = typeof window === 'undefined' ? '' : window.location.search;
  const words = sending ? `While it sends: ${n.platform.name} is ${n.status.word}${n.status.time ? ` ${n.status.time}` : ''}` : n.words.replace(/\.$/, '');
  return (
    <div data-send-bar className="flex h-[46px] flex-none items-center gap-3 border-b border-line bg-panel px-5 text-[13px] duration-200 animate-in fade-in-0 slide-in-from-top-1">
      <span data-send-bar-words className="min-w-0 flex-1 truncate font-medium">{words}</span>
      <Link href={`${base}/release/${n.platform.id}${qs}`} data-send-bar-go
        className={cn('inline-flex h-8 flex-none items-center rounded-lg px-3 text-[13px] font-medium no-underline transition-colors duration-150', sending ? 'border border-edge-strong text-ink hover:bg-raised' : 'bg-ink text-bg hover:bg-ink-3')}>Go to {appName(n.platform)}</Link>
    </div>
  );
}
