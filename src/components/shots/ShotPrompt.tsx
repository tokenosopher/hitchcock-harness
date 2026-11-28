'use client';
// The prompt as sent, on the Shot details page: readable (a part a block, its notes set plainly, every name of an input
// a chip the first time in a part and underlined after) or exactly as sent (every character, the names underlined).
// The part of the shot open is lit and scrolled to. Pointing at a name lights its input and, on a desktop, shows a
// card with it; a click goes to the input; Option-click puts the name, a part or words selected in Alma's box.
import { Fragment, forwardRef, useImperativeHandle, useRef, useState } from 'react';
import { mediaUrl } from '@/components/media/Media';
import { lineKind, mentionsIn, noteWords, sentence, type Mention, type PromptSection } from '@/components/lib/shotDetails';
import { cn } from '@/lib/utils';
import { tagName, type Model, type PageShot } from './model';
import { PICK, pickProps } from './tell';

export interface PromptHandle { scrollTo: (secId: string, smooth: boolean) => void }

/** How the page reacts to a name: point at it, leave it, click it, Option-click it. `key` tells two names apart. */
export interface NameEvents {
  enter: (m: Mention, el: HTMLElement) => void;
  leave: () => void;
  click: (m: Mention, key: string) => void;
  tell: (m: Mention, sec: PromptSection) => void;
  tellPart: (sec: PromptSection) => void;
  tellWords: (words: string, sec?: PromptSection) => void;
  hot: Set<number>;
  litKey?: string;
}

const thumbOf = (m: Model, order: number, pathOf: (rel?: string) => string | undefined): string | undefined => {
  const r = m.byOrder.get(order);
  const p = r?.kind === 'AUDIO' || r?.missing ? undefined : pathOf(r?.file);
  return p ? mediaUrl(p, { w: 160, t: 1 }) : undefined;
};

function panelWords(ps: number[], lower: boolean): string {
  const run = ps.length > 1 && ps.every((n, i) => !i || n === ps[i - 1] + 1);
  const nums = run ? `${ps[0]}–${ps[ps.length - 1]}` : ps.join(', ');
  return `${lower ? 'panel' : 'Panel'}${ps.length > 1 ? 's' : ''} ${nums}`;
}

export const ShotPrompt = forwardRef<PromptHandle, {
  m: Model; on: string | undefined; shots: PageShot[]; phone: boolean; touch: boolean; ev: NameEvents;
  pathOf: (rel?: string) => string | undefined; panelImg: (n: number) => string | undefined;
  onJump: (sec: PromptSection) => void; matched: boolean;
}>(function ShotPrompt({ m, on, shots, phone, touch, ev, pathOf, panelImg, onJump, matched }, ref) {
  const [raw, setRaw] = useState(false);
  const [all, setAll] = useState(false);
  const doc = useRef<HTMLDivElement>(null);
  useImperativeHandle(ref, () => ({
    scrollTo: (id, smooth) => {
      const sec = doc.current?.querySelector<HTMLElement>(`[data-sec="${id}"]`);
      if (!sec) return;
      if (phone) { const y = sec.getBoundingClientRect().top - 120; doc.current?.closest('main')?.scrollBy({ top: y, behavior: smooth ? 'smooth' : 'auto' }); return; }
      doc.current?.scrollTo({ top: sec.offsetTop - 6, behavior: smooth ? 'smooth' : 'auto' });
    },
  }), [phone]);

  const placeOf = (sec: PromptSection) => (sec.kind === 'shot' ? m.shotSecs.indexOf(sec) + 1 : 0);

  const name = (mn: Mention, seen: Set<number>, sec: PromptSection, k: string, lineStart: boolean) => {
    if (mn.kind === 'word') {
      const w = mn.tag ? sentence(mn.tag) : mn.text;
      return <Fragment key={k}>{lineStart ? w : w.toLowerCase()}</Fragment>;
    }
    const first = mn.orders.some((o) => !seen.has(o));
    mn.orders.forEach((o) => seen.add(o));
    const hot = mn.orders.some((o) => ev.hot.has(o));
    const lit = ev.litKey === k;
    const common = {
      'data-mention': k, tabIndex: 0, role: 'button',
      onMouseEnter: (e: React.MouseEvent<HTMLElement>) => { if (!touch) ev.enter(mn, e.currentTarget); },
      onMouseLeave: () => ev.leave(),
      onClick: () => ev.click(mn, k),
      onKeyDown: (e: React.KeyboardEvent) => { if (e.key === 'Enter') ev.click(mn, k); },
      ...pickProps(() => ev.tell(mn, sec)),
    };
    let label: string;
    let pic: React.ReactNode = null;
    if (mn.kind === 'ref') {
      const r = m.byOrder.get(mn.orders[0])!;
      label = mn.tag ? tagName(r, m) : r.name;
      const th = thumbOf(m, r.order, pathOf);
      pic = th ? <img alt="" src={th} className="size-[15px] flex-none rounded-[4px] bg-black object-cover" /> : null;
      if (!first) label = mn.tag ? label : r.frame ? mn.text.toLowerCase() : label.toLowerCase();
    } else if (mn.kind === 'range') {
      const rs = mn.orders.map((o) => m.byOrder.get(o)!).filter(Boolean);
      label = rs.length ? `${rs[0].name.split(' ')[0]}s ${rs[0].n}–${rs[rs.length - 1].n}` : mn.text;
      pic = <span className="inline-flex">{rs.slice(0, 3).map((r) => { const th = thumbOf(m, r.order, pathOf); return th ? <img key={r.order} alt="" src={th} className="-mr-[3px] h-[15px] w-[11px] rounded-[3px] border border-raised bg-white object-cover last:mr-0" /> : null; })}</span>;
    } else {
      label = panelWords(mn.panels ?? [], !first);
      const img = mn.panels?.length ? panelImg(mn.panels[0]) ?? thumbOf(m, mn.orders[0], pathOf) : undefined;
      pic = img ? <img alt="" src={img} className="size-[15px] flex-none rounded-[4px] bg-black object-cover" /> : null;
    }
    if (raw) {
      return <span key={k} {...common} className={cn('cursor-pointer rounded-[3px] underline decoration-edge-strong underline-offset-[3px] transition-colors duration-150 hover:text-ink hover:decoration-ink', (hot || lit) && 'bg-ink/10 text-ink decoration-ink', PICK)}>{mn.text}</span>;
    }
    if (!first) {
      return <span key={k} {...common} className={cn('cursor-pointer rounded-[3px] text-ink underline decoration-sub decoration-1 underline-offset-[3px] transition-[background-color,text-decoration-color] duration-150 hover:bg-ink/[.06] hover:decoration-ink', (hot || lit) && 'bg-ink/[.08] decoration-ink', lit && 'bg-ink/[.12]', PICK)}>{label}</span>;
    }
    return (
      <span key={k} {...common}
        className={cn('relative -top-px mx-px inline-flex cursor-pointer items-center gap-[5px] whitespace-nowrap rounded-[6px] border border-edge-strong bg-raised py-0 pl-0.5 pr-[7px] align-baseline text-[12.5px] font-medium leading-[19px] text-ink transition-[border-color,background-color,box-shadow] duration-150 hover:border-ink-3 hover:bg-edge',
          hot && 'border-ink-3 bg-edge', lit && 'shadow-[0_0_0_2px_#fafafa]', PICK)}>
        {pic}{label}
      </span>
    );
  };

  const inline = (s: string, seen: Set<number>, sec: PromptSection, key: string) => {
    const out: React.ReactNode[] = [];
    let at = 0;
    mentionsIn(s, m.ctx).forEach((mn, j) => {
      if (mn.at > at) out.push(<Fragment key={`${key}t${j}`}>{s.slice(at, mn.at)}</Fragment>);
      out.push(name(mn, seen, sec, `${key}m${j}`, mn.at === 0));
      at = mn.at + mn.len;
    });
    if (at < s.length) out.push(<Fragment key={`${key}e`}>{s.slice(at)}</Fragment>);
    return out;
  };

  const drawLine = (l: string, seen: Set<number>, sec: PromptSection, key: string) => {
    const k = lineKind(l);
    const P = 'm-0 mb-1.5 text-[13.5px] leading-[1.72] text-ink-3 [text-wrap:pretty] last:mb-0 max-[760px]:text-[14.5px]';
    if (k.kind === 'kv') return <p key={key} className={P}><span className="text-mute">{k.key}:</span> {inline(k.text, seen, sec, key)}</p>;
    if (k.kind === 'say') return <p key={key} className={cn(P, 'rounded-r-[6px] border-l-2 border-edge-strong bg-ink/[.025] px-2.5 py-1.5 text-ink')}><span className="mr-1.5 text-[11.5px] text-sub">{sentence(k.who, m.proper)}{k.how ? ` · ${k.how}` : ''}</span>{k.text}</p>;
    if (k.kind === 'sub') return <p key={key} className="m-0 mb-0.5 mt-2.5 text-[11.5px] text-mute">{k.text}</p>;
    if (k.kind === 'cut') return <p key={key} className="m-0 mt-2 text-[11px] text-faint">{sentence(k.text.replace(/\.$/, ''))}</p>;
    if (k.kind === 'lab') return <p key={key} className={P}><span className="font-medium text-ink-2">{sentence(k.label, m.proper)}{k.how ? ` · ${/^[A-Z ]+$/.test(k.how) ? sentence(k.how) : k.how}` : ''}:</span> {inline(k.text, seen, sec, key)}</p>;
    return <p key={key} className={P}>{inline(l, seen, sec, key)}</p>;
  };

  const groups: Record<PromptSection['kind'], string> = { scene: 'The scene', shot: 'The shots', after: 'After the shots' };
  const selectedWords = (sec?: PromptSection) => {
    const sx = window.getSelection();
    const w = sx && !sx.isCollapsed && doc.current?.contains(sx.anchorNode) ? sx.toString().trim().replace(/\s+/g, ' ') : '';
    if (w) { ev.tellWords(w, sec); return true; }
    return false;
  };

  return (
    <section aria-label="The prompt as sent" className="flex min-h-0 min-w-0 flex-col max-[760px]:block">
      <div className="mb-2.5 flex flex-none flex-col gap-1.5">
        <div className="flex flex-wrap items-center gap-2.5">
          <h2 className="m-0 text-[13.5px] font-semibold">The prompt as sent</h2>
          <select aria-label="Jump to a part of the prompt" value="" onChange={(e) => { const s = m.secs.find((x) => x.id === e.target.value); if (s) { if (s.kind !== 'shot') setAll(true); onJump(s); } }}
            className="h-7 max-w-[190px] cursor-pointer rounded-[7px] border border-edge bg-bg px-2 text-[12px] text-sub transition-colors hover:border-edge-strong hover:text-ink max-[760px]:hidden">
            <option value="" disabled>Jump to…</option>
            {(['scene', 'shot', 'after'] as const).map((g) => {
              const list = m.secs.filter((s) => s.kind === g && (s.title || s.shot));
              return list.length ? (
                <optgroup key={g} label={groups[g]}>
                  {list.map((s) => <option key={s.id} value={s.id}>{s.kind === 'shot' ? `Shot ${s.shot}${s.title ? ` · ${sentence(s.title, m.proper)}` : ''}` : sentence(s.title)}</option>)}
                </optgroup>
              ) : null;
            })}
          </select>
          <span className="flex-1" />
          <div role="group" aria-label="How to show the prompt" title="Readable only changes how the prompt is drawn: tags become names, headings and notes are set plainly. Exactly as sent shows every character the model got."
            className="inline-flex gap-0.5 rounded-[8px] border border-edge p-0.5 max-[760px]:hidden">
            {[['Readable', false], ['Exactly as sent', true]].map(([l, v]) => (
              <button key={String(l)} type="button" aria-pressed={raw === v} onClick={() => setRaw(v as boolean)}
                className={cn('cursor-pointer rounded-[6px] px-2.5 py-[3px] text-[12px] transition-colors duration-200', raw === v ? 'bg-raised text-ink' : 'text-sub hover:text-ink')}>{l}</button>
            ))}
          </div>
        </div>
        <span className="text-[11.5px] text-sub">{touch ? 'Tap a name to find the input.' : 'Point at a name to see the input; click to find it. ⌥-click anything to tell Alma.'}</span>
      </div>

      <div ref={doc} data-prompt-doc=""
        className={cn('scroll relative min-h-0 flex-1 overflow-auto rounded-t-[12px] border border-b-0 border-edge bg-well pb-[40vh] pt-1',
          'max-[760px]:overflow-visible max-[760px]:rounded-[12px] max-[760px]:border-b max-[760px]:pb-1')}
        onScroll={() => ev.leave()}>
        {raw ? (
          <pre className="m-0 whitespace-pre-wrap break-words px-[18px] py-3.5 font-mono text-[11.5px] leading-[1.65] text-ink-3"
            onClickCapture={(e) => { if (e.altKey && selectedWords()) { e.preventDefault(); e.stopPropagation(); } }}>
            {inline(m.rec.prompt.text, new Set(), m.secs[0], 'raw')}
          </pre>
        ) : m.secs.map((sec) => {
          const seen = new Set<number>();
          const isOn = on === sec.id;
          const hidden = phone && !all && on !== undefined && !isOn;
          const place = placeOf(sec);
          const shot = place ? shots[place - 1] : undefined;
          const notes = sec.notes.map((n, j) => {
            const w = noteWords(n);
            if (!w.panels) return <Fragment key={j}>{w.text}</Fragment>;
            const mn = mentionsIn(w.panels, m.ctx)[0];
            return <Fragment key={j}>storyboard {mn ? name(mn, seen, sec, `${sec.id}n${j}`, false) : w.text}</Fragment>;
          });
          const title = sec.kind === 'shot' ? `Shot ${sec.shot}${sec.title ? ` · ${sentence(sec.title, m.proper)}` : ''}` : sec.title ? sentence(sec.title) : '';
          return (
            <section key={sec.id} data-sec={sec.id} {...pickProps(() => { if (!selectedWords(sec)) ev.tellPart(sec); })}
              className={cn('border-l-2 py-3.5 pl-5 pr-[22px] transition-[background-color,border-color] duration-300 [&+&]:border-t [&+&]:border-t-line max-[760px]:px-3.5 max-[760px]:py-3',
                isOn ? 'border-l-ink bg-[#111114]' : 'border-l-transparent', hidden && 'hidden', PICK)}>
              {title && (
                <div className="mb-0.5 flex items-baseline gap-2.5">
                  <h3 className={cn('m-0 flex-1 text-[13px] font-semibold', isOn ? 'text-ink' : 'text-ink-2')}>{title}</h3>
                  {sec.kind === 'shot' && matched && (
                    <span aria-hidden={!isOn} className={cn('whitespace-nowrap rounded-[5px] bg-ink px-1.5 py-px text-[10.5px] font-medium text-bg transition-[opacity,transform] duration-300', isOn ? 'translate-y-0 opacity-100' : 'translate-y-0.5 opacity-0')}>This shot</span>
                  )}
                  {sec.kind === 'shot' && shot && !isOn && !phone && (
                    <button type="button" onClick={() => onJump(sec)} className="cursor-pointer whitespace-nowrap text-[11px] text-mute opacity-0 transition-opacity hover:text-ink [section:hover_&]:opacity-100">Open shot {shot.label}</button>
                  )}
                </div>
              )}
              {notes.length > 0 && <p className="m-0 mb-2 text-[11.5px] text-mute">{notes.map((n, j) => <Fragment key={j}>{j > 0 && ' · '}{n}</Fragment>)}</p>}
              <div className={title ? 'mt-1.5' : ''}>{sec.lines.map((l, j) => drawLine(l, seen, sec, `${sec.id}l${j}`))}</div>
            </section>
          );
        })}
        {phone && !raw && !all && on !== undefined && (
          <button type="button" onClick={() => setAll(true)} className="block w-full cursor-pointer border-t border-line p-3 text-center text-[13.5px] text-sub">Show the whole prompt · {m.secs.length} parts</button>
        )}
      </div>
    </section>
  );
});
