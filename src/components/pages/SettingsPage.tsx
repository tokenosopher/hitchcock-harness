'use client';
// Settings: where Alma runs (the Claude Code login, account type only), her
// permission mode, the folders and the studio folder, which services she can call (key names only, never a value),
// the setup defaults (read-only for now) and the tunnel for the phone. Its thread is its own Alma session,
// keyed "settings". Nothing here changes a setting but the reserve switch: the other buttons put a message in the composer.
import { useState } from 'react';
import type { FolderFact, ServiceFact, SettingsInfo } from '@/server/settings';
import type { ReserveView } from '@/server/claude/reserve';
import { QC_LOCK_SCORE, QC_MAX_ROUNDS } from '@/server/types';
import { usePage, useUI } from '@/components/data/ui';
import { fmtDate } from '@/components/lib/format';
import { Header } from '@/components/shell/Header';
import { Loading, PageBody, StageTitle } from '@/components/shell/StageTitle';
import { Btn, Card } from '@/components/shell/atoms';
import { Reveal } from '@/components/shell/Reveal';
import { IconArrowUpRight } from '@/components/shell/icons';
import { cn } from '@/lib/utils';
import { useJson } from './postCommon';
import { IntroSettings } from '@/components/intro/IntroSettings';

const PLAN: Record<string, string> = { max: 'Max plan', pro: 'Pro plan', team: 'Team plan', enterprise: 'Enterprise plan' };

function Row({ k, children, action, className }: { k: React.ReactNode; children: React.ReactNode; action?: React.ReactNode; className?: string }) {
  return (
    <div className={cn('grid grid-cols-[160px_minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 border-t border-line px-4 py-3 max-[760px]:grid-cols-[minmax(0,1fr)_auto]', className)}>
      <span className="text-[13.5px] font-medium max-[760px]:col-span-2">{k}</span>
      <div className="min-w-0 text-[13px] leading-normal">{children}</div>
      <div className="flex-none">{action}</div>
    </div>
  );
}

function Lamp({ on, warn }: { on?: boolean; warn?: boolean }) {
  return <span aria-hidden="true" className={cn('mr-2 inline-block size-1.5 flex-none rounded-full align-middle', on ? 'bg-ok' : warn ? 'bg-bad' : 'border border-mute')} />;
}

function Section({ label, sub, children }: { label: string; sub: string; children: React.ReactNode }) {
  return (
    <Card>
      <div className="flex flex-col gap-1 px-4 py-3">
        <span className="lbl">{label}</span>
        <span className="text-[12.5px] leading-normal text-sub">{sub}</span>
      </div>
      {children}
    </Card>
  );
}

/** The reserve switch: Alma on the plan (off) or on the API key saved in .env.local (on). */
function ReserveSection({ initial }: { initial: ReserveView }) {
  const [view, setView] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  async function flip() {
    setBusy(true);
    setError(undefined);
    try {
      const r = await fetch('/api/settings/reserve', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ on: !view.on }) });
      const j = (await r.json().catch(() => ({}))) as ReserveView & { error?: string };
      if (r.ok) setView(j);
      else setError(j.error ?? `The harness answered ${r.status}.`);
    } catch {
      setError('The harness server is not answering.');
    } finally {
      setBusy(false);
    }
  }
  const blocked = !view.hasKey && !view.on;
  return (
    <Section label="Reserve: API credits" sub="Alma runs on your Claude plan. Turn this on to run her on your monthly API credits instead, for when the plan’s weekly limit is reached.">
      <Row k="API credits"
        action={
          <button type="button" role="switch" aria-checked={view.on} aria-label="Run Alma on your API credits" disabled={busy || blocked} onClick={() => void flip()}
            className={cn('relative block h-[18px] w-8 flex-none cursor-pointer rounded-full border transition-colors disabled:cursor-not-allowed disabled:opacity-50', view.on ? 'border-ink bg-ink' : 'border-edge-strong bg-panel')}>
            <span className={cn('absolute top-[2px] size-3 rounded-full transition-all', view.on ? 'left-[16px] bg-bg' : 'left-[2px] bg-sub')} />
          </button>
        }>
        <Lamp on={view.on} />{view.on ? 'On · Alma runs on your API credits' : 'Off · Alma runs on your plan'}
        {blocked && <span className="block text-[12px] text-sub">No key saved yet. Add <span className="font-mono text-[11.5px]">HARNESS_RESERVE_API_KEY</span> to <span className="font-mono text-[11.5px]">.env.local</span> in the harness folder, with an API key from your Claude Console organization.</span>}
        <Reveal open={view.on}>
          <span className="block text-[12px] text-sub">On since {fmtDate(view.since)}. Spent this month: about ${view.spentThisMonth.toFixed(2)}, by Claude Code’s own count; the Console has the exact figure.</span>
        </Reveal>
        <Reveal open={!!error}>
          <span role="alert" className="block text-[12px] text-bad">{error}</span>
        </Reveal>
      </Row>
      <Reveal open={view.on}>
        <p className="m-0 border-t border-line px-4 py-3 text-[12.5px] leading-normal text-sub">
          Connectors that come from claude.ai (Notion, Gmail, Docs) are not available to Alma while this is on.
        </p>
      </Reveal>
    </Section>
  );
}

const FOLDER_WORD: Record<FolderFact['state'], string> = { connected: 'connected', missing: 'missing', 'no answer': 'no answer', 'not set': 'not set' };
const SERVICE_ON = (s: ServiceFact) => s.state === 'connected' || s.state === 'present' || s.state === 'key present';

export function SettingsPage() {
  const ui = useUI();
  const { data: s, error } = useJson<SettingsInfo>('/api/settings');
  const t = s?.tunnel;
  usePage('Settings', 'Ask Alma to check a connection…', [t?.running ? 'Restart the tunnel' : 'Start the tunnel', 'Check the Higgsfield connection']);
  if (!s) return <Loading error={error ?? 'Reading the settings…'} />;
  const a = s.account;
  const plan = a.plan ? PLAN[a.plan] ?? `${a.plan} plan` : undefined;

  return (
    <>
      <Header crumbs={[{ label: 'Settings' }]} meta="Hitchcock Harness on this Mac · Alma, folders, services, defaults" phoneSub="Alma, folders, services, defaults" />
      <PageBody>
        <StageTitle kicker="Hitchcock Harness · this Mac" title="Settings" sub="Where Alma runs, where the files live, which services she calls, and what she does without asking." />

        <Section label="Alma runs on Claude Code" sub="Alma is a Claude Code session on this Mac, signed in with your plan. Each film keeps its own session and thread; the Library and Settings have one each.">
          <Row k="Account">
            <Lamp on={a.state === 'signed in'} warn={a.state === 'signed out'} />
            {a.state === 'signed in' ? `Signed in · ${plan ?? 'plan unknown'}` : a.state === 'signed out' ? 'Signed out: run claude in a terminal and sign in' : 'Not known'}
            {a.state === 'signed in' && <span className="text-sub">{[a.tier ? ` · ${a.tier.replace(/_/g, ' ')}` : '', a.method ? ` · ${a.method} login` : '', a.expires ? ` · renews by ${fmtDate(a.expires)}` : ''].join('')}</span>}
            {a.note && <span className="block text-[12px] text-sub">{a.note}</span>}
            <span className="block text-[11.5px] text-mute">from claude auth status, {fmtDate(a.checkedAt)}; the harness never stores or forwards the login</span>
          </Row>
          <Row k="Program">
            <Lamp on={!!s.program.version} /><span className="font-mono text-[12px]">claude</span>
            <span className="text-sub"> · {s.program.version ?? 'did not answer'}</span>
            <span className="block truncate font-mono text-[11px] text-mute" title={s.program.path}>{s.program.path.replace(/^\/Users\/[^/]+\//, '~/')}</span>
          </Row>
          <Row k="Sessions">
            One session per film · the thread is that session
            <span className="block text-[12px] text-sub">{s.sessions.threads.length ? `${s.sessions.threads.length} started: ${s.sessions.threads.join(', ')}` : 'none started yet'}</span>
          </Row>
          <Row k="Permissions" action={<Btn onClick={() => ui.command({ id: 'settings:perm', label: 'Explain · Alma’s permissions' }, 'Explain what Alma may do without asking, and what changes with HARNESS_ALMA_PERMISSIONS=ask.')}>Ask</Btn>}>
            <Lamp on={s.permissions.mode !== 'permissions off'} />{s.permissions.mode}
            <span className="font-mono text-[11.5px] text-mute"> · HARNESS_ALMA_PERMISSIONS={s.permissions.value}</span>
            <span className="block text-[12px] text-sub">{s.permissions.words}</span>
          </Row>
          {s.lastInit && (
            <Row k="Last start">
              <span>{s.lastInit.model ?? 'default model'}</span><span className="text-sub"> · {s.lastInit.permissionMode ?? '—'} · thread {s.lastInit.thread} · {fmtDate(s.lastInit.at)}</span>
            </Row>
          )}
          <p className="m-0 border-t border-line px-4 py-3 text-[12.5px] leading-normal text-sub">
            Re-check the plan terms before relying on it: the support article “Use the Claude Agent SDK with your Claude plan” and “Legal and compliance” in the Claude Code docs.
          </p>
        </Section>

        <ReserveSection initial={s.reserve} />
        <IntroSettings />

        <Section label="Folders" sub="Nothing is copied: the harness reads the folders where they are. The films live in the studio folder.">
          <Row k="Studio folder">
            <Lamp on={s.drive.connected} warn={!s.drive.connected} />
            <span className="font-mono text-[12px]">{s.drive.root}</span><span className="text-sub"> · {s.drive.connected ? 'ready' : 'missing: run ./setup.sh'}</span>
          </Row>
          {s.folders.map((f, i) => (
            <Row key={`${f.label}-${i}`} k={f.label}
              action={<Btn onClick={() => ui.about({ id: `settings:folder:${i}`, label: `Change the folder · ${f.label}` }, `Change the ${f.label.toLowerCase()} folder (now ${f.shown}). The user says to what`, 'Change it to…')}>{f.label === 'Rules' ? 'Ask' : 'Change'}</Btn>}>
              <Lamp on={f.state === 'connected'} warn={f.state === 'missing' || f.state === 'no answer'} />
              <span className="break-all font-mono text-[12px]">{f.shown}</span>
              <span className="text-sub"> · {FOLDER_WORD[f.state]}</span>
              {f.note && <span className="block text-[12px] text-sub">{f.note}</span>}
            </Row>
          ))}
        </Section>

        <Section label="Services" sub="Keys stay in the .env files; this page reads their names only, and Alma never shows a key or a signed address.">
          {s.services.map((v) => (
            <Row key={v.name} k={v.name}
              action={<Btn disabled={v.state === 'n/a'} onClick={() => ui.command({ id: `settings:svc:${v.name}`, label: `Check the connection · ${v.name}` }, `Check the ${v.name} connection.`)}>Check</Btn>}>
              <Lamp on={SERVICE_ON(v)} warn={v.state === 'failed' || v.state === 'no key' || v.state === 'missing'} />
              {v.how} · <span className={cn(v.state === 'connected' && 'text-ok')}>{v.state}</span>
              <span className="text-sub"> · {v.uses}</span>
              {v.link && <> · <a href={v.link} target="_blank" rel="noreferrer" className="text-sub underline hover:text-ink">{v.link.replace(/^https:\/\//, '')}</a></>}
              {v.detail && <span className="block font-mono text-[11.5px] text-mute">{v.detail}</span>}
            </Row>
          ))}
          {s.envFile && (
            <details className="border-t border-line px-4 py-3">
              <summary className="cursor-pointer text-[12.5px] text-sub">
                {s.envFile.names.length} names in <span className="font-mono text-[12px]">{s.envFile.shown}</span>{s.envFile.linkTo ? <> (a link to <span className="font-mono text-[12px]">{s.envFile.linkTo}</span>)</> : ''}
              </summary>
              <p className="m-0 mt-2 font-mono text-[11.5px] leading-[1.7] text-ink-3">{s.envFile.names.join(' · ')}</p>
            </details>
          )}
        </Section>

        <Section label="Defaults for a new film" sub="Taken at face value: Alma never asks for them; say so at the start of a film if anything differs. Read-only here for now.">
          {s.defaults.map((d) => <Row key={d.label} k={d.label}><span>{d.value}</span></Row>)}
          <Row k="QC"><span>Pass at {QC_LOCK_SCORE} of 10, at most {QC_MAX_ROUNDS} rounds, then it comes to you</span></Row>
          <Row k="Asking"><span>The script lock is the go for the first round of assets (places, faces, clothing, voices, previz). Video waits for your “go”: Alma quotes the credits first.</span></Row>
        </Section>

        {t && (
          <Section label="Phone access" sub={`The harness on your phone, through a cloudflared quick tunnel to port ${t.port}.`}>
            <Row k="Tunnel"
              action={t.running ? undefined : <Btn primary onClick={() => ui.command({ id: 'settings:tunnel', label: `Start the tunnel · port ${t.port}` }, `Start the cloudflared quick tunnel for the harness on port ${t.port}.`)}>Start</Btn>}>
              <Lamp on={t.running && !!t.url} />
              {t.running ? (t.url ? <a href={t.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 break-all font-mono text-[12px] text-ink no-underline hover:underline">{t.url.replace(/^https:\/\//, '')}<IconArrowUpRight size={12} /></a> : 'Running, address not readable') : 'Stopped'}
              <span className="text-sub">{t.running ? ` · cloudflared${t.pid ? ` pid ${t.pid}` : ''}` : ' · no address until you start it'}</span>
            </Row>
            <Row k="Serves"><span>This harness at <span className="font-mono text-[12px]">localhost:{t.port}</span>, every page and thread</span></Row>
            <p className="m-0 border-t border-line px-4 py-3 text-[12.5px] leading-normal text-sub">{t.note}</p>
          </Section>
        )}
      </PageBody>
    </>
  );
}
