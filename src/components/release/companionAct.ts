'use client';
// The Release page's companions, acted on: "Cancel" on one queued or rendering (DELETE
// …/cut/render), "Make it" on the 480p preview naming no longer makes, and "Render it" on one cancelled (POST
// …/cut/render), each with the same version, kind and options the final recorded for it (final.ts buildFinal). One
// tap, no confirm. The page reads the release again after each, and follows the render from there.
import { useCallback, useState } from 'react';
import type { ReleaseFinal } from './file';
import type { CompanionStatus } from './masters';

export type CompanionAct = 'cancel' | 'make';

export function useCompanionAct(film: string, final: ReleaseFinal | undefined, reload: () => void) {
  const [busy, setBusy] = useState<CompanionStatus['key']>();
  const [said, setSaid] = useState<string>();
  const act = useCallback(async (key: CompanionStatus['key'], what: CompanionAct): Promise<void> => {
    const c = final?.companions[key];
    if (!final || !c || key === 'srt') return;
    const body = { version: final.version, kind: key === 'phone' ? 'proxy' : 'master', ...(c.options ? { options: c.options } : {}), ...(what === 'make' ? { retry: true } : {}) };
    setBusy(key);
    try {
      const r = await fetch(`/api/films/${film}/cut/render`, { method: what === 'cancel' ? 'DELETE' : 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      const j = (await r.json().catch(() => ({}))) as { error?: string; cancelled?: boolean; said?: string };
      setSaid(!r.ok ? j.error ?? `The server answered ${r.status}` : what === 'cancel' && j.cancelled === false ? j.said : undefined);
    } catch {
      setSaid(`The harness server is not answering; nothing was ${what === 'cancel' ? 'cancelled' : 'asked'}`);
    } finally {
      setBusy(undefined);
      reload();
    }
  }, [film, final, reload]);
  return { act, busy, said };
}
