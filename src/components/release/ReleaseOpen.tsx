'use client';
// The Release page (14 Nov 2026). Closed until a final is named (board 14: the masters to name one from, the platforms
// dimmed below); then the film and where it goes (board 15): the final playing with its companions on the left;
// "Where it goes" with the Next bar, the platforms by wave with their state, and the facts to confirm. The page writes
// only social/release.json, one operation at a time (ops.ts), and asks the render queue for the companions.
import { outFile, outWords } from './outfile';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { usePage } from '@/components/data/ui';
import { Media } from '@/components/media/Media';
import { Header } from '@/components/shell/Header';
import { Loading } from '@/components/shell/StageTitle';
import { Btn } from '@/components/shell/atoms';
import { IconChevronRight, IconFile } from '@/components/shell/icons';
import { Reveal } from '@/components/shell/Reveal';
import { cn } from '@/lib/utils';
import { filmMeta, filmPath, useFilmPage } from '@/components/pages/common';
import { appName, captionOf, nextUp, platformStatus, postedCount, threadWords, unfilled, usersOf, waves } from './derive';
import type { Fact, Platform, ReleaseFile } from './file';
import { clock, cutNewerLine, finalNames, mb, type CompanionStatus, type MasterOption } from './masters';
import { MasterList } from './MasterList';
import { PLATFORMS } from './platforms';
import { useMinute } from './clock';
import { Mono, NowText, Pill, StateWords, TagPill, useNameFinal, type useRelease } from './ui';
import { useIsPhone } from '@/components/shell/useIsPhone';
import { PhoneReleaseList } from './PhoneRelease';
import { useTellAlma } from './useAsk';
import { NoTexts } from './AskAlma';

type Rel = ReturnType<typeof useRelease>;
const NUM = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];

/** "Copy path": the file's place on disk. */
export function CopyPath({ path, label = 'Copy path' }: { path: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => { if (!copied) return; const t = setTimeout(() => setCopied(false), 1600); return () => clearTimeout(t); }, [copied]);
  return (
    <button type="button" title={path} data-copy={path} onClick={() => { void navigator.clipboard?.writeText(path).then(() => setCopied(true), () => undefined); }}
      className="inline-flex h-7 flex-none cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap rounded-md px-2 text-[12px] text-sub transition-colors duration-150 hover:bg-raised hover:text-ink">
      <IconFile size={12} /><span key={copied ? 'y' : 'n'} className="duration-200 animate-in fade-in-0">{copied ? 'Copied' : label}</span>
    </button>
  );
}

// ---- closed: name the final (board 14)

export function ClosedRelease({ rel }: { rel: Rel }) {
  const { film, state, base } = useFilmPage();
  const nameFinal = useNameFinal(rel.run, film);
  const phone = useIsPhone();
  usePage('Release', 'Ask Alma about these masters…', ['Which master should go out?']);
  if (!state || !rel.view) return <Loading />;
  const masters = rel.view.masters ?? [];
  const plats = rel.view.file?.platforms ?? [];
  return (
    <>
      <Header crumbs={[{ label: state.film.title, href: base }, { label: 'Release' }]} meta={filmMeta(state)} phoneSub="Release · no final yet"
        crumbExtra={<Pill className="ml-1">no final yet</Pill>} />
      <section data-release-closed className={cn('box-border flex w-full max-w-[820px] flex-col gap-4 px-6 pb-12 pt-8 max-[760px]:px-4 max-[760px]:pt-5 mx-auto', phone && 'touch-targets')}>
        <div className="flex flex-col gap-1.5">
          <h1 className="m-0 text-[20px] font-semibold tracking-[-0.02em]">No final video yet</h1>
          <p className="m-0 text-[13px] text-sub">Release opens when you name the video that goes out.</p>
        </div>
        {rel.view.problems && <p role="alert" className="m-0 text-[12.5px] text-warn">social/release.json does not check out, so nothing can be changed here: {rel.view.problems.slice(0, 2).join(' ')}</p>}
        {masters.length ? (
          <MasterList masters={masters} media={(r) => filmPath(state, r)} goesOutAs={finalNames(state.film.title).final} editHref={`${base}/edit`}
            onName={async (m) => { const r = await nameFinal(m.path); return r.ok ? undefined : r.error; }} />
        ) : (
          <p className="m-0 rounded-[10px] border border-dashed border-edge px-4 py-3 text-[13px] text-sub">No master yet. Render one on the Edit page (Render master), then name it here.</p>
        )}
        <p className="m-0 text-[12.5px] text-sub">Naming it also makes the copy without subtitles, the phone copy, the subtitle file and the smaller file for posting. Nothing is spent.</p>
        <div className="flex flex-col gap-2.5 pt-2 opacity-50" aria-label="Platforms, closed">
          <span className="text-[12px] text-sub">Opens when the final is named</span>
          <div className="flex flex-wrap gap-2">
            {(plats.length ? plats.map((p) => ({ kind: p.kind, name: p.name })) : (['reddit', 'youtube-shorts', 'tiktok', 'instagram-reels', 'x', 'linkedin'] as const).map((k) => ({ kind: k, name: PLATFORMS[k].name })))
              .map((p) => (
                <span key={p.name} className="inline-flex h-9 items-center gap-2 rounded-[9px] border border-dashed border-edge pl-1.5 pr-3 text-[12.5px] text-ink-3"><Mono kind={p.kind} className="size-6" />{p.name}</span>
              ))}
          </div>
        </div>
      </section>
    </>
  );
}

// ---- open: the film and where it goes (board 15)

export function OpenRelease({ rel }: { rel: Rel }) {
  const { film, state, base } = useFilmPage();
  const now = useMinute();
  const phone = useIsPhone();
  const file = rel.view?.file;
  usePage('Release', 'Tell Alma what to change in the text…', ['What is next?']);
  if (!state || !rel.view || !file?.final) return <Loading />;
  if (phone) return <PhoneReleaseList rel={rel} file={file} now={now} state={state} base={base} />;
  const posted = postedCount(file);
  return (
    // laid out by the page's own width (container queries): the film beside the list from 760 px; below, the list
    // first (its Next bar is the page's main button) and the film under it
    <div className="@container/rel flex w-full flex-1 flex-col">
      <Header crumbs={[{ label: state.film.title, href: base }, { label: 'Release' }]} meta={filmMeta(state)} phoneSub={`Release · ${posted.words}`}
        crumbExtra={<Pill className="ml-1 @max-[820px]/rel:hidden" data-final-pill>final: master of {file.final.version}</Pill>}
        actions={<Pill data-posted-count className="h-8">{posted.words}</Pill>} />
      <div data-release-open className="flex w-full flex-1 @max-[759px]/rel:flex-col">
        <FinalColumn rel={rel} file={file} />
        <div data-where className="@container/list flex min-w-0 flex-1 flex-col gap-4 px-5 pb-12 pt-4 @max-[759px]/rel:px-4">
          {rel.view.problems && <p role="alert" className="m-0 text-[12.5px] text-warn">social/release.json does not check out, so nothing can be changed here: {rel.view.problems.slice(0, 2).join(' ')}</p>}
          <div className="flex min-h-[30px] flex-wrap items-baseline gap-x-2.5 gap-y-0.5">
            <h2 className="m-0 text-[14px] font-medium">Where it goes</h2>
            {file.platforms.length > 0 && <span className="text-[12px] text-sub">{NUM[file.platforms.length] ?? file.platforms.length} {file.platforms.length === 1 ? 'platform' : 'platforms'}, in the order they go out</span>}
          </div>
          <NextBar file={file} now={now} base={base} />
          {waves(file, now).map((w) => (
            <section key={w.key} data-wave={w.key} className="flex flex-col gap-2">
              <h3 className="m-0 flex items-baseline gap-2 text-[12.5px] font-medium">{w.label}<span className="font-normal text-sub">{w.posted ? `${w.posted} posted` : w.next ? 'next' : ''}</span></h3>
              {w.ids.map((id) => <Row key={id} file={file} p={file.platforms.find((x) => x.id === id)!} now={now} href={`${base}/release/${id}`} rel={rel} />)}
            </section>
          ))}
          {!file.platforms.length && <NoTexts film={film} final={file.final} />}
          <Facts file={file} run={rel.run} />
        </div>
      </div>
    </div>
  );
}

function NextBar({ file, now, base }: { file: ReleaseFile; now: Date; base: string }) {
  const n = nextUp(file, now);
  if (!n) return null;
  return (
    <div data-next className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-[10px] border border-edge bg-panel py-2 pl-4 pr-2 text-[13px] duration-200 animate-in fade-in-0">
      <span className="min-w-[180px] flex-1"><span data-next-words className="font-medium">{n.words}</span> <NowText className="text-ink-3" /></span>
      <Link href={`${base}/release/${n.platform.id}`} data-next-go className="inline-flex h-8 flex-none items-center rounded-lg bg-ink px-3 text-[13px] font-medium text-bg no-underline transition-colors duration-150 hover:bg-ink-3">Go to {appName(n.platform)}</Link>
    </div>
  );
}

/** A platform's row: pressable to its page. */
function Row({ file, p, now, href, rel }: { file: ReleaseFile; p: Platform; now: Date; href: string; rel: Rel }) {
  const st = platformStatus(file, p.id, now);
  // what it posts, said only when it is more than one post (X with a reply, ASKS 58): "through Buffer, post and reply"
  const thread = threadWords(file, p.id);
  const route = `${p.route === 'hand' ? 'by hand' : 'through Buffer'}${thread ? `, ${thread}` : ''}`;
  const who = [p.account, p.also?.length ? `also to ${p.also.join(' and ')}` : ''].filter(Boolean).join(', ');
  const first = captionOf(file, p.id).split('\n')[0];
  const empty = p.fields.find(unfilled);
  const line = empty ? `${empty.candidates.length} ${empty.candidates.length === 1 ? 'candidate' : 'candidates'} to pick from` : first;
  const link = p.send.posted?.link;
  // stage 3: a scheduled row can be unscheduled from here; a post without its link says where to add it
  const unschedule = st.state === 'scheduled' && !p.send.requested?.unschedule;
  // the tags, the post's link or "Add the link": a line of their own, so a long one never pushes the row wider
  const extra = st.tags.length > 0 || !!link || (!!p.send.posted && !link);
  return (
    <div className="relative">
    <Link href={href} data-platform={p.id} data-row-state={st.state}
      className="group grid grid-cols-[28px_minmax(0,1fr)_auto_14px] items-center gap-x-3 gap-y-0.5 rounded-[10px] border border-edge px-3 py-2.5 text-ink no-underline transition-colors duration-150 hover:border-edge-strong hover:bg-raised/40">
      <Mono kind={p.kind} className={extra ? 'row-span-3 self-start mt-0.5' : 'row-span-2'} />
      <span className="flex min-w-0 items-baseline gap-2.5">
        <b className="flex-none text-[13px] font-medium" title={p.name}>{p.name}</b>
        <span className="min-w-0 truncate text-[12px] text-sub @max-[420px]/list:hidden" title={`${who} · ${route}`}>{who} · {route}</span>
      </span>
      <span className="flex min-w-0 max-w-[220px] items-center justify-end">
        <StateWords st={st} tags={false} className="min-w-0" />
      </span>
      <IconChevronRight size={14} className={cn('flex-none text-sub transition-transform duration-150 group-hover:translate-x-0.5', extra ? 'row-span-3' : 'row-span-2')} />
      <span className={cn('col-span-2 col-start-2 truncate text-[12.5px]', empty ? 'text-sub' : 'text-ink-3', unschedule && !extra && 'pr-[100px]')}>{line}</span>
      {extra && (
        <span data-row-extra className={cn('col-span-2 col-start-2 flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1', unschedule && 'pr-[100px]')}>
          {st.tags.map((t) => <TagPill key={t.text} t={t} />)}
          {link && <span data-link className="min-w-0 max-w-full truncate text-[12px] text-ink-3" title={link}>{link.replace(/^https?:\/\/(www\.)?/, '')}</span>}
          {p.send.posted && !link && <span data-add-link className="text-[12px] text-ink underline decoration-edge-strong underline-offset-2">Add the link</span>}
        </span>
      )}
    </Link>
    {unschedule && <RowUnschedule rel={rel} p={p} time={st.time} />}
    </div>
  );
}

/** "Unschedule" on a scheduled row: recorded, and asked of Alma as the user's own words (she takes it out of Buffer). */
function RowUnschedule({ rel, p, time }: { rel: Rel; p: Platform; time?: string }) {
  const tell = useTellAlma(rel.view?.film ?? '');
  const [err, setErr] = useState<string>();
  const go = async () => {
    const r = await rel.run({ op: 'request', platform: p.id, what: 'unschedule' });
    if (!r.ok) { setErr(r.error); return; }
    await tell(`Unschedule ${appName(p)}`, { id: `release:unschedule:${p.id}`, label: `Unschedule ${appName(p)} (${time ?? ''})`, ref: `The user asks you to unschedule ${p.name} (scheduled for ${time}, Buffer post ${p.send.scheduled?.bufferPostId ?? 'id not recorded'}). Take it out of Buffer, then remove send.scheduled, send.go, send.asked and send.requested in social/release.json; it is Ready again. Say if it had already gone out.` });
  };
  return (
    <span className="absolute bottom-2 right-9 flex items-center gap-2">
      {err && <span role="alert" className="text-[11.5px] text-warn">{err}</span>}
      <Btn data-row-unschedule onClick={() => void go()} className="h-7 px-2 text-[12px]">Unschedule</Btn>
    </span>
  );
}

/** "To confirm before these appear in any text": one field per fact, the one value every text uses. */
export function Facts({ file, run }: { file: ReleaseFile; run: Rel['run'] }) {
  if (!file.facts.length) return null;
  return (
    <section data-facts className="flex flex-col gap-3 rounded-[10px] border border-edge px-4 py-3.5">
      <h3 className="m-0 text-[13px] font-medium">To confirm before these appear in any text</h3>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(min(260px,100%),1fr))] gap-x-6 gap-y-3">
        {file.facts.map((f) => <FactField key={f.id} f={f} file={file} run={run} />)}
      </div>
    </section>
  );
}

export function FactField({ f, file, run }: { f: Fact; file: ReleaseFile; run: Rel['run'] }) {
  const [text, setText] = useState(f.value ?? '');
  const [held, setHeld] = useState(f.value);
  const [said, setSaid] = useState<string>();
  // Alma or another tab changed the value: take it, unless the user is typing
  if (held !== f.value) { setHeld(f.value); setText(f.value ?? ''); }
  const [before, after] = f.sentence.split('___');
  const users = usersOf(file, f.id).map((u) => appName(u.platform));
  const save = async () => {
    if (!text.trim() || (text.trim() === f.value && f.confirmedAt)) return;
    const r = await run({ op: 'confirm', fact: f.id, value: text });
    setSaid(r.ok ? undefined : r.error);
    if (!r.ok) setText(f.value ?? '');
  };
  return (
    <div data-fact={f.id} data-confirmed={f.confirmedAt ? '' : undefined} className="flex flex-col gap-1">
      <label className="flex flex-wrap items-center gap-2 text-[12.5px] text-ink-3">
        {before.trim() && <span>{before.trim()}</span>}
        <input value={text} onChange={(e) => setText(e.target.value)} onBlur={() => void save()} onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
          placeholder="?" aria-label={f.label}
          className={cn('h-8 w-16 rounded-lg border bg-black px-2.5 text-[13px] text-ink outline-none transition-colors duration-150 focus:border-ink',
            f.confirmedAt ? 'border-edge-strong' : 'border-warn/70')} />
        {after.trim() && <span>{after.trim()}</span>}
      </label>
      <span className="text-[11.5px]">
        {f.confirmedAt
          ? <span className="text-sub">confirmed at {new Date(f.confirmedAt).getHours().toString().padStart(2, '0')}:{new Date(f.confirmedAt).getMinutes().toString().padStart(2, '0')}</span>
          : <span className="text-warn">{users.length ? `used in ${users.join(' and ')}` : 'not used yet'}</span>}
      </span>
      {said && <span role="alert" className="text-[11.5px] text-warn duration-200 animate-in fade-in-0">{said}</span>}
    </div>
  );
}

// ---- the left column: the final and its files

function FinalColumn({ rel, file }: { rel: Rel; file: ReleaseFile }) {
  const { film, state, base } = useFilmPage();
  const nameFinal = useNameFinal(rel.run, film);
  const [change, setChange] = useState(false);
  const [masters, setMasters] = useState<MasterOption[]>();
  useEffect(() => {
    if (!change || masters) return;
    let live = true;
    void fetch(`/api/films/${film}/release?masters=1`, { cache: 'no-store' }).then((r) => r.json()).then((j: { masters?: MasterOption[] }) => { if (live) setMasters(j.masters ?? []); }, () => undefined);
    return () => { live = false; };
  }, [change, masters, film]);
  if (!state) return null;
  const final = file.final!;
  const out = file.platforms.filter((p) => p.send.posted).map((p) => appName(p));
  const ff = rel.view?.finalFile;
  const newer = cutNewerLine(final.version, rel.view?.cut);
  // the file that goes out (outfile.ts, ASKS 56): said only for a final with a smaller file asked for
  const goes = final.companions.post ? outFile(file, rel.view?.companions, ff?.bytes) : undefined;
  const goesOut = !goes ? undefined : goes.making || goes.why ? (outWords(goes).note ?? '').replace(/^\w/, (c) => c.toUpperCase()) : goes.small && goes.path !== final.path ? `Goes out as the smaller file${goes.bytes !== undefined ? `, ${mb(goes.bytes)}` : ''}.` : goes.small ? 'Goes out as it is: it is a smaller file.' : undefined;
  const abs = (r: string) => `${state.film.folder}/${r}`;
  return (
    <aside data-final-column className="flex w-[300px] flex-none flex-col gap-3 border-r border-line p-4 @max-[759px]/rel:order-2 @max-[759px]/rel:grid @max-[759px]/rel:w-full @max-[759px]/rel:grid-cols-[112px_minmax(0,1fr)] @max-[759px]/rel:content-start @max-[759px]/rel:gap-x-4 @max-[759px]/rel:border-t @max-[759px]/rel:border-r-0 @max-[759px]/rel:px-4 [&>*]:@max-[759px]/rel:col-start-2">
      <Media path={filmPath(state, final.path)} w={640} t={8} play fit="cover" className="aspect-[9/16] w-full rounded-[12px] border border-edge bg-black @max-[759px]/rel:col-start-1! @max-[759px]/rel:row-span-5 @max-[759px]/rel:self-start" />
      <div className="flex items-start gap-2">
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <b data-final-name className="break-words text-[13px] font-semibold leading-[1.35]">{final.name}</b>
          <span className="text-[12px] text-sub" data-final-facts>{[clock(ff?.seconds), ff?.width ? `${ff.width} × ${ff.height}` : '', mb(ff?.bytes), ff?.fromBytes && ff.bytes !== undefined ? `from ${mb(ff.fromBytes)}` : ''].filter(Boolean).join(', ')}</span>
          {goesOut && <span key={goesOut} data-final-out className="text-[12px] leading-[1.45] text-sub duration-200 animate-in fade-in-0">{goesOut}</span>}
        </div>
        {!out.length && <Btn ghost onClick={() => setChange(!change)} aria-expanded={change} data-change-final className="h-7 px-1.5 text-[12px]">Change…</Btn>}
      </div>
      {out.length > 0 && <p data-final-locked className="m-0 text-[12.5px] leading-[1.45] text-sub">{out.length > 1 ? `${out.slice(0, -1).join(', ')} and ${out[out.length - 1]} already have` : `${out[0]} already has`} this file.</p>}
      {/* what changed since the final, in words, none when the content is the same; the two version names on hover (ASKS 49) */}
      {newer && <p data-cut-newer title={newer.title} className="m-0 text-[12.5px] leading-[1.45] text-warn">{newer.text}</p>}
      <div className="empty:hidden">
      <Reveal open={change && !out.length}>
        <div className="flex flex-col gap-2 pb-1">
          {!masters ? <span className="text-[12px] text-sub">Reading the masters…</span>
            : <MasterList masters={masters} media={(r) => filmPath(state, r)} goesOutAs={final.name} editHref={`${base}/edit`} current={final.path}
                onName={async (m) => { const r = await nameFinal(m.path); if (r.ok) setChange(false); return r.ok ? undefined : r.error; }} />}
        </div>
      </Reveal>
      </div>
      <ul className="m-0 flex list-none flex-col p-0">
        {(rel.view?.companions ?? []).map((c) => <CompanionRow key={c.key} c={c} abs={abs} />)}
      </ul>
      {rel.view?.kit && (
        <div data-icloud className="flex items-center gap-2 border-t border-line pt-2.5 text-[12.5px]">
          <IconFile size={13} className="flex-none text-sub" />
          <span className="min-w-0 flex-1 truncate text-sub" title={rel.view.kit.shown}>In the final-cuts folder: <span className="text-ink">Social kit</span></span>
          <CopyPath path={rel.view.kit.folder} />
        </div>
      )}
    </aside>
  );
}

function CompanionRow({ c, abs }: { c: CompanionStatus; abs: (rel: string) => string }) {
  const right = c.state === 'done' || c.state === 'same' ? mb(c.bytes) || (c.bytes ? `${Math.round(c.bytes / 1000)} KB` : '')
    : c.state === 'running' ? `rendering ${Math.round(c.percent ?? 0)}%` : c.state === 'queued' ? 'waiting to render' : c.state === 'failed' ? 'did not render' : 'not made';
  const small = c.bytes !== undefined && c.bytes < 1e6 ? `${Math.max(1, Math.round(c.bytes / 1000))} KB` : right;
  return (
    <li data-companion={c.key} data-companion-state={c.state} className="flex items-center gap-2 border-b border-line py-1.5 text-[12.5px] last:border-b-0">
      <span className="min-w-0 flex-1 truncate">{c.label}{c.state === 'same' && <span className="text-sub"> · the final itself</span>}</span>
      <span key={c.state} className={cn('flex-none text-[12px] tabular-nums duration-200 animate-in fade-in-0', c.state === 'failed' ? 'text-warn' : 'text-sub')} title={c.error}>{small}</span>
      {(c.state === 'done' || c.state === 'same') && c.path ? <CopyPath path={abs(c.path)} /> : <span className="w-[92px] flex-none" />}
    </li>
  );
}
