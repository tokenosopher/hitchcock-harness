'use client';
// A film row's mark in the sidebar (recent.ts rowMark): the glowing orb while Alma is at work, the white dot when
// something waits for the user, nothing when the film is idle and seen. One 7 px place, so a change from one to the
// other moves nothing: the old mark fades out as the new one fades in (globals.css, "The sidebar's row mark").
// Cheap by design: the
// orb's breathing is one CSS animation of its glow's opacity, run by the compositor; no JS animates anything, and a
// row's only timer is the one-off end of a fade-out.
import { useEffect, useState } from 'react';
import type { RowMarkKind } from './recent';

/** How long a mark takes to fade out (globals.css's transition, and a little more) before it leaves the page. */
const FADE_OUT_MS = 320;

export function RowMark({ mark, label }: { mark: RowMarkKind | undefined; label?: string }) {
  const [cur, setCur] = useState(mark);
  // the mark fading out, kept until its fade is over
  const [old, setOld] = useState<RowMarkKind>();
  if (cur !== mark) {
    setOld(cur ?? old);
    setCur(mark);
  }
  useEffect(() => {
    if (!old) return;
    const t = setTimeout(() => setOld(undefined), FADE_OUT_MS);
    return () => clearTimeout(t);
  }, [old]);
  if (!cur && !old) return null;
  return (
    <span className="row-mark" data-mark={cur} role={cur ? 'img' : undefined} aria-label={cur ? label : undefined} title={cur ? label : undefined} aria-hidden={cur ? undefined : true}>
      {(cur === 'working' || old === 'working') && <span className="row-orb" data-on={cur === 'working' ? '' : undefined} />}
      {(cur === 'attention' || old === 'attention') && <span className="row-dot" data-on={cur === 'attention' ? '' : undefined} />}
    </span>
  );
}
