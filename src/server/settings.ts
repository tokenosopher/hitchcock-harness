// The Settings page's facts, all read-only: the Claude Code login (one time-limited `claude auth status`,
// account type only), Alma's permission mode, the folders and the studio folder, which service keys the
// studio's .env holds (names only, never a value), the Higgsfield connector from the last init event, the
// setup defaults, and the cloudflared tunnel for this port. Served by GET /api/settings.
import { execFile } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { harnessConfig } from './config';
import { childEnv } from './childEnv';
import { claudeConfig } from './claude/config';
import { readLastInit } from './claude/lastInit';
import { reserveView, type ReserveView } from './claude/reserve';
import { readSessions } from './claude/sessions';
import { FLOW_DIR } from './films/read/release';
import { listSlow } from './films/util';

export interface FolderFact { label: string; path: string; shown: string; state: 'connected' | 'missing' | 'no answer' | 'not set'; note?: string }
export interface ServiceFact { name: string; how: string; state: 'connected' | 'present' | 'missing' | 'key present' | 'no key' | 'failed' | 'not seen' | 'n/a' | 'not checked'; detail?: string; uses: string; link?: string }

export interface SettingsInfo {
  account: { state: 'signed in' | 'signed out' | 'unknown'; method?: string; plan?: string; tier?: string; expires?: string; checkedAt: string; note?: string };
  program: { path: string; version?: string };
  sessions: { threads: string[]; films: number };
  permissions: { value: string; mode: string; words: string };
  folders: FolderFact[];
  drive: { root: string; connected: boolean };
  services: ServiceFact[];
  envFile: { path: string; shown: string; names: string[]; linkTo?: string } | undefined;
  lastInit?: { at: string; thread: string; model?: string; permissionMode?: string };
  defaults: { label: string; value: string }[];
  tunnel: { port: number; running: boolean; url?: string; pid?: number; note: string };
  /** The reserve switch: whether a key is saved, never the key. */
  reserve: ReserveView;
}

function run(cmd: string, args: string[], ms: number, env?: NodeJS.ProcessEnv): Promise<string | undefined> {
  return new Promise((resolve) => {
    execFile(cmd, args, { signal: AbortSignal.timeout(ms), maxBuffer: 1 << 20, env: env ?? childEnv() }, (err, stdout) => resolve(err ? undefined : String(stdout)));
  });
}

const g = globalThis as unknown as { __harnessAuth?: { at: number; v: SettingsInfo['account'] } };

/** `claude auth status --json`, once per ten minutes, 15 s at most; only the account type is kept. */
async function account(bin: string): Promise<SettingsInfo['account']> {
  if (g.__harnessAuth && Date.now() - g.__harnessAuth.at < 10 * 60_000) return g.__harnessAuth.v;
  const env = childEnv();
  for (const k of Object.keys(env)) if (k === 'ANTHROPIC_API_KEY' || k === 'ANTHROPIC_AUTH_TOKEN' || k === 'CLAUDECODE' || k.startsWith('CLAUDE_CODE_')) delete env[k];
  const out = await run(bin, ['auth', 'status', '--json'], 15_000, env);
  const checkedAt = new Date().toISOString();
  let v: SettingsInfo['account'] = { state: 'unknown', checkedAt, note: 'claude auth status gave no answer within 15 s' };
  if (out) {
    try {
      const j = JSON.parse(out) as Record<string, unknown>;
      const str = (k: string) => (typeof j[k] === 'string' ? (j[k] as string) : undefined);
      v = {
        state: j.loggedIn === true ? 'signed in' : 'signed out', checkedAt,
        method: str('authMethod'), plan: str('subscriptionType'), tier: str('planTier'), expires: str('loginExpiresAt'),
      };
    } catch {
      v = { state: 'unknown', checkedAt, note: 'claude auth status did not print JSON' };
    }
  }
  g.__harnessAuth = { at: Date.now(), v };
  return v;
}

const gm = globalThis as unknown as { __harnessMcp?: { at: number; v: 'present' | 'missing' | 'unknown' } };

/** `claude mcp get higgsfield` in the studio folder (where Alma runs, so user, project and local scopes all count),
 *  once per ten minutes, 15 s at most: whether the Higgsfield MCP server is set up. Nothing about the login is kept. */
async function higgsfieldMcp(bin: string, cwd: string): Promise<'present' | 'missing' | 'unknown'> {
  if (gm.__harnessMcp && Date.now() - gm.__harnessMcp.at < 10 * 60_000) return gm.__harnessMcp.v;
  const env = childEnv();
  for (const k of Object.keys(env)) if (k === 'ANTHROPIC_API_KEY' || k === 'ANTHROPIC_AUTH_TOKEN' || k === 'CLAUDECODE' || k.startsWith('CLAUDE_CODE_')) delete env[k];
  const v = await new Promise<'present' | 'missing' | 'unknown'>((resolve) => {
    execFile(bin, ['mcp', 'get', 'higgsfield'], { cwd, env, signal: AbortSignal.timeout(15_000), maxBuffer: 1 << 20 }, (err, stdout, stderr) => {
      const text = `${stdout}${stderr}`;
      if (!err && /higgsfield/i.test(text)) return resolve('present');
      if (/no mcp server found|not found/i.test(text)) return resolve('missing');
      resolve('unknown');
    });
  });
  gm.__harnessMcp = { at: Date.now(), v };
  return v;
}

/** Variable names in an .env file; values are never read into anything returned. */
async function envNames(file: string): Promise<string[]> {
  try {
    const text = await fs.readFile(file, 'utf8');
    const names = text.split('\n').map((l) => /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/.exec(l)?.[1]).filter((x): x is string => !!x);
    return [...new Set(names)];
  } catch {
    return [];
  }
}

/** The cloudflared quick tunnel serving this port: the process from `ps`, its address from its own metrics
 *  server (/quicktunnel on the port it listens on, found with lsof). Every call has a time limit. */
async function tunnel(port: number): Promise<SettingsInfo['tunnel']> {
  const note = 'A quick tunnel gets a new random address at every start, and anyone with it can open the harness while it runs (with HARNESS_TUNNEL_TOKEN set).';
  const ps = await run('/bin/ps', ['-axo', 'pid=,command='], 4000);
  const line = ps?.split('\n').find((l) => /cloudflared\b.*\btunnel\b/.test(l) && new RegExp(`--url\\s+https?://(?:localhost|127\\.0\\.0\\.1):${port}\\b`).test(l));
  if (!line) return { port, running: false, note };
  const pid = Number(line.trim().split(/\s+/)[0]);
  const lsof = await run('/usr/sbin/lsof', ['-a', '-p', String(pid), '-iTCP', '-sTCP:LISTEN', '-P', '-Fn'], 4000);
  const ports = (lsof ?? '').split('\n').filter((l) => l.startsWith('n')).map((l) => Number(/:(\d+)$/.exec(l)?.[1])).filter(Boolean);
  for (const p of ports) {
    try {
      const r = await fetch(`http://127.0.0.1:${p}/quicktunnel`, { signal: AbortSignal.timeout(2000) });
      const j = (await r.json()) as { hostname?: string };
      if (j.hostname) return { port, running: true, pid, url: `https://${j.hostname}`, note };
    } catch {
      // not the metrics port
    }
  }
  return { port, running: true, pid, note };
}

async function folder(label: string, p: string | undefined, slow = false, note?: string): Promise<FolderFact> {
  if (!p) return { label, path: '', shown: '—', state: 'not set', note };
  const app = process.cwd().replace(/\/$/, '');
  const shown = p.startsWith(app + path.sep) ? p.slice(app.length + 1) : p.replace(/^\/(?:Users|home)\/[^/]+\//, '~/');
  if (slow) {
    const l = await listSlow(p, 4000);
    return { label, path: p, shown, state: l ? 'connected' : 'no answer', note: l ? note : 'no answer within 4 s: macOS may be waiting on a permission prompt' };
  }
  try {
    await fs.stat(p);
    return { label, path: p, shown, state: 'connected', note };
  } catch {
    return { label, path: p, shown, state: 'missing', note };
  }
}

export async function readSettings(): Promise<SettingsInfo> {
  const cfg = harnessConfig();
  const ccfg = claudeConfig();
  const driveUp = await fs.stat(cfg.driveRoot).then(() => true, () => false);
  let assetsReal: string | undefined;
  try {
    assetsReal = await fs.realpath(path.join(cfg.filmRepo, 'assets'));
  } catch {
    assetsReal = undefined;
  }

  const [acct, version, sessions, lastInit, tun, hf] = await Promise.all([
    account(ccfg.claudeBin),
    run(ccfg.claudeBin, ['--version'], 8000),
    readSessions(),
    readLastInit(),
    tunnel(cfg.port),
    higgsfieldMcp(ccfg.claudeBin, cfg.filmRepo),
  ]);

  const folders: FolderFact[] = await Promise.all([
    folder('Studio', cfg.filmRepo, false, 'every Alma runs here: its CLAUDE.md, the film skill and the MCP servers load as in the terminal'),
    folder('Assets', assetsReal ?? path.join(cfg.filmRepo, 'assets'), false, 'the films, the library and the final cuts'),
    folder('Library', cfg.library, false, 'faces, voices, characters, locations across films'),
    ...cfg.otherRepos.map((r) => folder('Other studio', r, false, 'its films are listed in the registry')),
    ...cfg.finalCuts.map((r) => folder('Final cuts', r, true, 'deliveries: copied with a time limit')),
    folder('Rules', FLOW_DIR, true, 'studio/flow: Film Flow v3.3, read per stage by the film skill'),
  ]);

  const envPath = path.join(cfg.filmRepo, '.env');
  let linkTo: string | undefined;
  try {
    linkTo = await fs.readlink(envPath);
  } catch {
    linkTo = undefined;
  }
  const names = await envNames(envPath);
  const mcp = lastInit?.mcp.find((m) => /higgsfield/i.test(m.name));
  // two services in this copy: Claude Code (Alma, on the person's own login) and Higgsfield (every paid job)
  const services: ServiceFact[] = [
    { name: 'Claude Code', how: 'your own login', uses: 'Alma and her helper agents', link: 'https://claude.com/claude-code',
      state: acct.state === 'signed in' ? 'connected' : acct.state === 'signed out' ? 'failed' : 'not checked',
      detail: acct.state === 'signed out' ? 'signed out: run claude in a terminal and sign in' : acct.state === 'signed in' ? 'signed in' : acct.note },
    { name: 'Higgsfield', how: 'the higgsfield MCP server', uses: 'images, video, elements, voices, 1080p', link: 'https://higgsfield.ai',
      state: hf === 'missing' ? 'missing' : mcp ? (mcp.status === 'connected' ? 'connected' : 'failed') : hf === 'present' ? 'present' : 'not checked',
      detail: hf === 'missing'
        ? 'not set up: run ./setup.sh again (it adds the server), then type /mcp in claude and sign in to Higgsfield'
        : mcp ? `${mcp.name} · ${mcp.status} at Alma's last start${mcp.status === 'connected' ? '' : ': type /mcp in claude and sign in to Higgsfield'}`
          : 'set up; Alma\'s first start shows whether it is signed in (if not: type /mcp in claude and sign in)' },
  ];

  const perm = process.env.HARNESS_ALMA_PERMISSIONS ?? '';
  const permissions = perm === 'ask'
    ? { value: 'ask', mode: 'acceptEdits', words: 'Edits are accepted; any other tool that would ask is refused and shows as a line in the thread.' }
    : { value: perm || 'unset', mode: 'permissions off', words: 'Alma runs without permission prompts (nobody sits at a terminal to answer one); the care rules and the spend gates in her standing prompt hold her. HARNESS_ALMA_PERMISSIONS=ask switches to accept-edits.' };

  return {
    account: acct,
    program: { path: ccfg.claudeBin, version: version?.trim().split('\n')[0] },
    sessions: { threads: Object.keys(sessions).filter((k) => k !== 'smoke-test'), films: Object.keys(sessions).filter((k) => !['smoke-test', 'library', 'settings'].includes(k)).length },
    permissions,
    folders,
    drive: { root: cfg.driveRoot, connected: driveUp },
    services,
    envFile: names.length || linkTo ? { path: envPath, shown: `${path.basename(cfg.filmRepo)}/.env`, names, linkTo: linkTo?.replace(/^\/(?:Users|home)\/[^/]+\//, '~/') } : undefined,
    lastInit: lastInit ? { at: lastInit.at, thread: lastInit.thread, model: lastInit.model, permissionMode: lastInit.permissionMode } : undefined,
    defaults: [
      { label: 'Aspect', value: '9:16' },
      { label: 'Voices', value: 'Higgsfield voices' },
      { label: 'Video elements', value: '1920×1080 side-by-side split, 5 s, a hard cut each second' },
      { label: '1080p', value: 'Seedance 2.5, per take, on your word' },
      { label: 'Budget', value: 'about 2000 credits' },
      // the 480p of the cut (14 Nov, ASKS 44): made when asked for, unless HARNESS_AUTO_480P=1 in .env.local
      { label: '480p of the cut', value: cfg.auto480p ? 'rendered after every change (HARNESS_AUTO_480P=1)' : 'rendered when asked for (HARNESS_AUTO_480P=1 renders it after every change)' },
    ],
    tunnel: tun,
    reserve: reserveView(),
  };
}
