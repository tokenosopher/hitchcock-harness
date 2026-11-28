'use client';
// "Sending it", the right part of a platform page (Release, stage 3 of 3; boards Platform and Phone). Every post is
// made by hand in this copy: the user follows Alma's steps (ByHand), pastes the post's link or says it is posted, and
// Alma records it. The page never posts: it writes the release file through the operations.
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useFilm } from '@/components/data/film';
import { useUIActions } from '@/components/data/ui';
import { Btn } from '@/components/shell/atoms';
import { IconFile } from '@/components/shell/icons';
import { cn } from '@/lib/utils';
import { appName, nextUp, platformStatus } from './derive';
import { outFile } from './outfile';
import type { Platform, ReleaseFile } from './file';
import { LINK_HOSTS, type FinalInfo } from './sendflow';
import { type Place } from './platforms';
import { placeForLink, placeNames, placePosts, placesOf } from './places';
import { ByHand } from './ByHand';
import { type useRelease } from './ui';
import { type Layout } from './layout';

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

/** The part itself: the steps by hand. */
export function PlatformSend(props: SendProps) {
  const { phone } = props;
  return (
    <section aria-label="Sending it" data-send="hand" className={cn('flex min-h-0 flex-col gap-3 p-4',
      phone ? 'w-full px-4' : props.layout === 'one' ? 'w-full border-t border-line px-5 pb-6' : 'w-[288px] flex-none overflow-y-auto border-l border-line @max-[760px]/page:w-[264px]')}>
      <div className="flex min-h-[30px] items-baseline gap-2"><h2 className="m-0 text-[14px] font-medium">Sending it</h2></div>
      <div className="flex min-h-0 flex-1 flex-col gap-3 duration-200 animate-in fade-in-0">
        <ByHand {...props} />
      </div>
    </section>
  );
}

// ---- small pieces: a copy button, the places of a platform, the link box

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

/** Where a platform posted in several places stands, for Alma: "r/aivideo posted (link …); r/aivideos
 *  still to come. Reddit is posted only when both are in." */
export function placesWords(f: ReleaseFile, pid: string): string {
  const q = f.platforms.find((x) => x.id === pid);
  if (!q || !placesOf(q.kind).length) return '';
  const ps = placePosts(q);
  const each = ps.map((x, i) => `${x.place.name} ${x.posted ? `posted${x.posted.link ? ` (${i === 0 ? 'send.posted.link' : `send.postedIn.${x.place.id}.link`})` : ', link to add'}` : 'still to come'}`).join('; ');
  const all = ps.every((x) => x.posted);
  return `${q.name} goes to ${placeNames(ps.map((x) => x.place))} every time, the same title and first comment in each. ${each}. ${all ? `${q.name} is posted.` : `${q.name} is posted only when ${ps.length > 2 ? 'all are' : 'both are'} in.`}`;
}
/** The chip of a place's post (one per place, so two can wait for the next message together). */
const placeChipId = (p: Platform, place?: Place) => `release:link:${p.id}${place ? `:${place.id}` : ''}`;

/** The post's link pasted by hand, checked to be a link to that platform. `later` adds "I posted it, link later".
 *  `place`: the box of one of the platform's places; a link naming another of them goes there. */
export function LinkField({ rel, p, later, onDone, big, place }: { rel: Rel; p: Platform; later?: boolean; onDone?: () => void; big?: boolean; place?: Place }) {
  const [v, setV] = useState('');
  const [err, setErr] = useState<string>();
  const { addChip } = useUIActions();
  const save = async () => {
    const w = place ? placeForLink(p, v, place.id) : undefined;
    const r = await rel.run({ op: 'pasteLink', platform: p.id, link: v, ...(place ? { place: place.id } : {}) });
    if (!r.ok) { setErr(r.error); return; }
    setErr(undefined);
    setV('');
    if (w && 'place' in w) {
      const first = placesOf(p.kind)[0]?.id === w.place.id;
      addChip({ id: placeChipId(p, w.place), label: `${appName(p)} ${w.place.name} link pasted`, ref: `The user pasted ${p.name}'s ${w.place.name} post link: ${v.trim()} (${first ? 'send.posted.link' : `send.postedIn.${w.place.id}.link`} in social/release.json).${w.moved ? ` They pasted it in the ${place!.name} box; it is the ${w.place.name} post, so it went there.` : ''} ${placesWords(r.file, p.id)} Record it in published-links.md at the studio root too.` });
    } else addChip({ id: `release:link:${p.id}`, label: `${appName(p)} link pasted`, ref: `The user pasted ${p.name}'s post link: ${v.trim()} (send.posted.link in social/release.json). Record it in published-links.md at the studio root too.` });
    onDone?.();
  };
  const noLink = async () => {
    const r = await rel.run({ op: 'postedNoLink', platform: p.id, ...(place ? { place: place.id } : {}) });
    if (!r.ok) { setErr(r.error); return; }
    if (place) addChip({ id: placeChipId(p, place), label: `${appName(p)} posted in ${place.name}`, ref: `The user posted ${p.name} by hand in ${place.name}; its link is still to come. ${placesWords(r.file, p.id)} Its row in published-links.md at the studio root reads "add (posted by hand)" until the link comes.` });
    else addChip({ id: `release:link:${p.id}`, label: `${appName(p)} posted by hand`, ref: `The user posted ${p.name} by hand; the link is still to come (send.posted without a link). Its row in published-links.md at the studio root reads "add (posted by hand)" until the link comes.` });
    onDone?.();
  };
  const placeOpen = place && !placePosts(p).find((x) => x.place.id === place.id)?.posted;
  return (
    <div data-link-field className="flex flex-col gap-1.5" onClick={(e) => e.stopPropagation()}>
      <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); void save(); }}>
        <input value={v} onChange={(e) => { setV(e.target.value); setErr(undefined); }} placeholder={place ? `${LINK_HOSTS[p.kind][0]}/${place.name}/…` : `${LINK_HOSTS[p.kind][0]}/…`} aria-label={place ? `The ${place.name} post's link` : 'The post\'s link'} inputMode="url"
          className={cn('min-w-0 flex-1 rounded-lg border border-edge-strong bg-black px-2.5 text-ink outline-none focus:border-ink', big ? 'h-11 text-[14px]' : 'h-8 text-[12.5px]')} />
        <Btn type="submit" data-link-save disabled={!v.trim()} className={big ? 'h-11' : undefined}>Save</Btn>
      </form>
      {err && <span role="alert" className="text-[12px] text-warn duration-200 animate-in fade-in-0">{err}</span>}
      {later && (place ? placeOpen : !p.send.posted) && (
        <span className="text-[12px] text-sub">
          <button type="button" data-link-later onClick={() => void noLink()} className={cn('inline-flex cursor-pointer items-center border-0 bg-transparent p-0 text-ink underline decoration-edge-strong underline-offset-2', big ? 'min-h-[44px]' : 'min-h-7')}>I posted it, link later</button>
          <span className="text-mute"> · shows as Posted, link to add</span>
        </span>
      )}
    </div>
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
