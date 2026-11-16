// Scenes in either layout: blocks/S<n>/ (older films) or generations/S<n>/ (newer films).
// Length and shots come from the scene file (S<n>-scene.md, then S<n>-shots.json), never from the plan;
// the plan's numbers ride along so the UI can grey them as "superseded". Takes come from *.jobid files
// and the take videos; pick-ups (FIX-<what>/) join the scene they fix.
import type { CutSource, SceneRef, TakeRef } from '../../types';
import type { ReviewMiss } from './review';
import type { SpendLineX } from './spend';
import { abs, isoDay, list, natCmp, readJson, readText, statOf, tables, VIDEO_RE, asRecord, asNumber, type FilmCtx } from '../util';

export interface TakeExtra {
  folder: string;                 // the scene or pick-up folder the take lives in
  variants: string[];             // derived videos of the same take ("…-aivoice2-480p.mp4", "-stamped")
  resolution?: string;            // "480p" | "1080p"
  spendLines: number[];           // spend.md line numbers that paid for it
}
export type TakeRefX = TakeRef & { more: TakeExtra };

export interface PickupInfo {
  folder: string;                 // blocks/FIX-lamp-S3
  name: string;                   // FIX-lamp-S3
  sceneGuess: boolean;            // true when the scene came from a mention count, not the folder name
  scenes?: string[];              // every scene the folder name names, when more than one ("FIX-S2S3-reel" → S2, S3)
  promptVersions: SceneRef['promptVersions'];
}

export interface SceneExtra {
  file?: string;                  // the scene file read
  locationIds: string[];
  locationName?: string;
  characters?: string[];
  props: string[];                // P01 … named in the scene file
  linesNote?: string;             // "word for word from script v4 (LOCKED)."
  lengthNote?: string;            // the scene file's Length text
  planSuperseded?: boolean;       // the plan's length or shots differ from the scene file
  inserts: { id: string; file: string; seconds?: number; shots?: number }[];
  legacyPrompts: string[];        // older prompt files outside prompt/ ("S1-prompt-take2.txt")
  pickups: PickupInfo[];
  /** Pick-ups that also cover this scene and whose takes sit under another one ("FIX-S2S3-reel", under S2). */
  sharedPickups?: { name: string; folder: string; under: string }[];
  previzTakes?: number;
  cutSource?: CutSource;          // how inCut was derived (read/cut.ts)
}
export type SceneRefX = Omit<SceneRef, 'takes'> & { takes: TakeRefX[]; more: SceneExtra };

const SCENE_DIR = /^S(\d+)$/;
const FIX_DIR = /^FIX-.+$/;

function field(md: string, key: string): string | undefined {
  const m = new RegExp(`^\\*\\*${key}:\\*\\*\\s*(.+?)\\s*$`, 'mi').exec(md);
  return m?.[1];
}
const num = (s: string | undefined): number | undefined => {
  const m = /(\d+(?:\.\d+)?)/.exec(s ?? '');
  return m ? Number(m[1]) : undefined;
};

/** The scene file's header: title, length, shots, location, characters. */
async function readSceneFile(ctx: FilmCtx, rel: string) {
  const md = await readText(abs(ctx, rel));
  if (md === undefined) return undefined;
  const title = /^#\s+S\d+[\w-]*\s*·\s*(.+)$/m.exec(md)?.[1]?.trim();
  const length = field(md, 'Length');
  const shots = field(md, 'Shots');
  const location = field(md, 'Location');
  const chars = field(md, 'Characters');
  const seconds = /(\d+(?:\.\d+)?)\s*s\b/.exec(length ?? '')?.[1];
  const locationIds = [...new Set((location ?? '').match(/\bL\d+\b/g) ?? [])];
  const locationName = location ? /^L\d+\s+(.+?)(?::|,|;| then | through |$)/.exec(location)?.[1]?.trim() : undefined;
  return {
    md,
    title,
    seconds: seconds ? Number(seconds) : undefined,
    shots: num(shots),
    lengthNote: length,
    locationIds,
    locationName,
    characters: chars ? chars.replace(/\(.*?\)/g, '').split(/,\s*/).map((s) => s.trim()).filter(Boolean) : undefined,
    linesNote: field(md, 'Lines'),
    props: [...new Set(md.match(/\bP\d{2}\b/g) ?? [])].sort(natCmp),
  };
}

/** The prompt versions in a folder: <prefix>-prompt-vN.txt with -check-vN.txt and -media-vN.json beside them. */
async function promptVersions(ctx: FilmCtx, rel: string, prefix: string): Promise<SceneRef['promptVersions']> {
  const files = (await list(abs(ctx, rel))).filter((f) => !f.dir).map((f) => f.name);
  const esc = prefix.replace(/[-]/g, '\\-');
  const out: SceneRef['promptVersions'] = [];
  for (const f of files) {
    const m = new RegExp(`^${esc}-prompt-(v\\d+(?:-[\\w-]+)?)\\.txt$`).exec(f);
    if (!m) continue;
    const v = m[1];
    const check = files.find((x) => x === `${prefix}-check-${v}.txt`);
    const media = files.find((x) => x === `${prefix}-media-${v}.json` || x === `${prefix}-take-medias-${v}.json`);
    // the check file ends with its verdict: the last PASS line, or check.py's "<n> STOP(S): do not submit" (a FAIL)
    const text = check ? await readText(abs(ctx, `${rel}/${check}`)) : undefined;
    const verdict = text ? [...text.matchAll(/^\s*(PASS|FAIL|\d+\s+STOP\(S\))/gm)].pop()?.[1].replace(/^\d+\s+STOP\(S\)$/, 'FAIL') : undefined;
    out.push({
      version: v, path: `${rel}/${f}`, checkPath: check ? `${rel}/${check}` : undefined, mediaPath: media ? `${rel}/${media}` : undefined,
      checkPassed: verdict ? verdict === 'PASS' : undefined,
    });
  }
  return out.sort((a, b) => natCmp(a.version, b.version));
}

/** A take's findings.md in one line: the verdict and its reason. A line "Verdict: redo|usable|good" decides when
 *  it is there; else the first sentences are read ("This take needs a redo: …", "Usable with one trim…", or a note
 *  that opens straight on "What holds:"). */
export function readFinding(md: string): { verdict?: 'redo' | 'usable' | 'good'; finding?: string } {
  const said = /^\s*verdict:\s*(redo|usable|good)\b[\s:.,-]*(.*)$/im.exec(md);
  const para = md.split(/\n\s*\n/).map((p) => p.trim()).find((p) => p && !p.startsWith('#') && !/^verdict:/i.test(p)) ?? '';
  // "Take 2, 18 s, 54 credits (take 1 was blocked and cost nothing). " says nothing about the take's quality
  const body = para.replace(/^Take\s+\w+,[^.]*?credits?(?:\s*\([^)]*\))?\.\s*/i, '');
  const [head, holds = ''] = body.split(/\s*What holds:\s*/i);
  const first = (t: string): string => (/^(.{20,260}?[.!?])(\s|$)/.exec(t)?.[1] ?? t.slice(0, 260)).trim();
  const tidy = (t: string): string => { const x = t.replace(/^[\s:;,-]+/, '').replace(/[.\s]+$/, ''); return x ? x[0].toUpperCase() + x.slice(1) : ''; };
  let verdict: 'redo' | 'usable' | 'good' | undefined = said ? (said[1].toLowerCase() as 'redo' | 'usable' | 'good') : undefined;
  let finding = said?.[2]?.trim() ? tidy(said[2]) : '';
  if (head.trim()) {
    const h = first(head);
    verdict ??= /needs? a (redo|new take|retake)|must be redone|failed/i.test(h) ? 'redo' : /usable|can be (used|kept)|holds|good|works/i.test(h) ? 'usable' : undefined;
    finding ||= tidy(h.replace(/^This take\s+(needs a redo|is usable|holds)\b/i, '').replace(/^Usable\b/i, ''));
  } else if (holds.trim()) {
    verdict ??= 'good';
    finding ||= tidy(first(holds).split(';')[0]);
  }
  return { verdict, finding: finding || undefined };
}

/** Takes in a scene or pick-up folder: *.jobid (root and takes/) plus take videos in takes/. */
async function readTakes(
  ctx: FilmCtx,
  rel: string,
  prefix: string,
  kind: TakeRef['kind'],
  spendByJob: (id: string) => SpendLineX[],
  misses: ReviewMiss[],
): Promise<TakeRefX[]> {
  const root = await list(abs(ctx, rel));
  const takesDir = root.some((e) => e.dir && e.name === 'takes') ? await list(abs(ctx, `${rel}/takes`)) : [];
  // where each file sits under takes/: flat (blocks/S1/takes/S1-take1-480p.mp4) or in a folder per take
  // (generations/S1/takes/take1/S1-take1-480p.mp4, newer films)
  const under = new Map<string, string>();
  for (const e of takesDir) if (!e.dir) under.set(e.name, e.name);
  const subJobs: string[] = [];
  // a take the service refused or failed: Alma leaves blocked.txt or failed.txt in the take's folder (12 Nov)
  const stoppedIn = new Map<string, { how: 'blocked' | 'failed'; file: string }>();
  for (const d of takesDir.filter((e) => e.dir && /^(?:(?:grey|seedance|genjutsu)-)?take\w*$/.test(e.name))) {
    for (const f of await list(abs(ctx, `${rel}/takes/${d.name}`))) {
      if (!f.dir && /^(blocked|failed)\.txt$/.test(f.name)) stoppedIn.set(d.name, { how: f.name.startsWith('blocked') ? 'blocked' : 'failed', file: `${rel}/takes/${d.name}/${f.name}` });
      if (f.dir || under.has(f.name)) continue;
      under.set(f.name, `${d.name}/${f.name}`);
      if (f.name.endsWith('.jobid')) subJobs.push(`${rel}/takes/${d.name}/${f.name}`);
    }
  }
  const jobFiles = [
    ...root.filter((e) => !e.dir && e.name.endsWith('.jobid')).map((e) => `${rel}/${e.name}`),
    ...takesDir.filter((e) => !e.dir && e.name.endsWith('.jobid')).map((e) => `${rel}/takes/${e.name}`),
    ...subJobs,
  ];
  const videos = [...under.keys()].filter((n) => VIDEO_RE.test(n));
  const ids = new Map<string, string | undefined>(); // take id → jobid file
  const ownPrefix = new RegExp(`^${prefix.replace(/-/g, '\\-')}-`);
  for (const jf of jobFiles) ids.set(jf.split('/').pop()!.replace(/\.jobid$/, '').replace(ownPrefix, ''), jf);
  // takes with a video and no job file ("S1-take3A-480p.mp4" when take3A.jobid is missing)
  for (const v of videos) {
    const m = new RegExp(`^${prefix.replace(/-/g, '\\-')}-((?:(?:grey|seedance|genjutsu)-)?take\\w*?)-(\\d{3,4}p)\\.\\w+$`).exec(v);
    // "seedance-take1" is the video of take1.jobid when that exists
    if (m && !ids.has(m[1]) && !ids.has(m[1].replace(/^(?:seedance|genjutsu)-/, ''))) ids.set(m[1], undefined);
  }
  const out: TakeRefX[] = [];
  for (const [id, jf] of [...ids].sort((a, b) => natCmp(a[0], b[0]))) {
    const exact = (res: string): string | undefined => videos.find((v) => v === `${prefix}-${id}-${res}.mp4`);
    const loose = (res: string): string | undefined => videos.find((v) => new RegExp(`(^|-)${id}-${res}\\.mp4$`).test(v));
    const main = exact('480p') ?? exact('1080p') ?? exact('720p') ?? loose('480p') ?? loose('1080p');
    const own = kind === 'pickup' ? new RegExp(`^${prefix.replace(/-/g, '\\-')}-(?:[a-z]+-)?${id}-`) : new RegExp(`^${prefix}-${id}-`);
    const variants = videos.filter((v) => v !== main && own.test(v));
    let jobId: string | undefined;
    if (jf) jobId = (await readText(abs(ctx, jf)))?.trim().split(/\s+/)[0]?.toLowerCase() || undefined;
    if (jobId && !/^[0-9a-f-]{8,}$/.test(jobId)) {
      ctx.warn.add(jf!, 'not a job id');
      jobId = undefined;
    }
    const paid = jobId ? spendByJob(jobId) : [];
    const first = paid[0];
    const st = await statOf(abs(ctx, main ? `${rel}/takes/${under.get(main)}` : jf ?? rel));
    const num = /take(\d+[A-Z]?)$/.exec(id)?.[1];
    const plain = `take${num ?? ''}`;
    const takeMisses = misses.filter((m) => m.take === id || (m.take === plain && !ids.has(plain) && id.endsWith(plain))).flatMap((m) => m.misses);
    const stop = main ? undefined : stoppedIn.get(jf ? jf.split('/').slice(-2)[0] : id);
    const stopWhy = stop ? (await readText(abs(ctx, stop.file)))?.trim().split('\n')[0]?.replace(/^status:\s*/i, '').slice(0, 200) : undefined;
    // the take's own check, when its folder holds one
    const dir = main && under.get(main)!.includes('/') ? under.get(main)!.split('/')[0] : undefined;
    const md = dir ? await readText(abs(ctx, `${rel}/takes/${dir}/findings.md`)) : undefined;
    const found = md ? readFinding(md) : {};
    out.push({
      verdict: found.verdict,
      finding: found.finding,
      stopped: stop?.how,
      stoppedWhy: stopWhy || undefined,
      id: kind === 'pickup' ? `${prefix} · ${id.replace(/take(\d)/, 'take $1').replace(/-/g, ' ')}` : id,
      path: main ? `${rel}/takes/${under.get(main)}` : undefined,
      seconds: first?.more.seconds,
      date: first?.date ?? (st ? isoDay(st.mtime) : undefined),
      jobId,
      cost: first ? first.cost : undefined,
      misses: takeMisses.length ? [...new Set(takeMisses)] : undefined,
      kind,
      more: {
        folder: rel,
        variants: variants.map((v) => `${rel}/takes/${under.get(v)}`),
        resolution: /(\d{3,4}p)\.\w+$/.exec(main ?? '')?.[1],
        spendLines: paid.map((p) => p.more.line),
      },
    });
  }
  return out;
}

export async function readScenes(
  ctx: FilmCtx,
  spend: SpendLineX[],
  reviewMisses: ReviewMiss[],
): Promise<{ scenes: SceneRefX[]; layout?: 'blocks' | 'generations'; unassignedPickups: PickupInfo[] }> {
  const spendByJob = (id: string): SpendLineX[] => spend.filter((l) => l.jobId && (id.startsWith(l.jobId) || l.jobId.startsWith(id.slice(0, 8))));
  const layouts = ['generations', 'blocks'] as const;
  const scenes: SceneRefX[] = [];
  const unassigned: PickupInfo[] = [];
  let layout: 'blocks' | 'generations' | undefined;
  for (const lay of layouts) {
    const entries = await list(abs(ctx, lay));
    if (!entries.length) continue;
    layout ??= lay;

    // the plan: blocks/scene-plan.md's table (length "24 s (24)", shots "9")
    const plan = new Map<string, { seconds?: number; shots?: number }>();
    const planMd = await readText(abs(ctx, `${lay}/scene-plan.md`));
    for (const t of planMd ? tables(planMd) : []) {
      const iId = t.header.findIndex((h) => /^(block|generation|scene)$/.test(h));
      const iLen = t.header.findIndex((h) => /^length/.test(h));
      const iShots = t.header.findIndex((h) => /^shots$/.test(h));
      if (iId < 0) continue;
      for (const r of t.rows) {
        const id = /^S\d+$/.exec(r[iId] ?? '')?.[0];
        if (id) plan.set(id, { seconds: iLen >= 0 ? num(r[iLen]) : undefined, shots: iShots >= 0 ? num(r[iShots]) : undefined });
      }
    }

    const sceneDirs = entries.filter((e) => e.dir && SCENE_DIR.test(e.name)).sort((a, b) => natCmp(a.name, b.name));
    for (const d of sceneDirs) {
      const sid = d.name;
      const rel = `${lay}/${sid}`;
      const files = await list(abs(ctx, rel));
      const sf = await readSceneFile(ctx, `${rel}/${sid}-scene.md`);
      if (!sf) ctx.warn.add(`${rel}/${sid}-scene.md`, 'missing: length and shots fall back to the shots file');
      let seconds = sf?.seconds;
      let shots = sf?.shots;
      if (seconds === undefined || shots === undefined) {
        const sj = asRecord(await readJson(ctx, `${rel}/${sid}-shots.json`));
        if (sj) {
          seconds ??= asNumber(sj.duration);
          if (shots === undefined && Array.isArray(sj.shots)) shots = sj.shots.length;
        }
      }
      if (sf && sf.seconds === undefined) ctx.warn.add(`${rel}/${sid}-scene.md`, 'no "**Length:** N s" line');
      if (sf && sf.shots === undefined) ctx.warn.add(`${rel}/${sid}-scene.md`, 'no "**Shots:** N" line');
      const inserts: SceneExtra['inserts'] = [];
      for (const f of files.filter((x) => !x.dir && new RegExp(`^${sid}-(.+)-scene\\.md$`).test(x.name))) {
        const name = new RegExp(`^${sid}-(.+)-scene\\.md$`).exec(f.name)![1];
        if (/engine|\d+[a-z]{3}/i.test(name)) continue; // dated working notes ("S1-scene-27oct-engine.md" has another shape)
        const i = await readSceneFile(ctx, `${rel}/${f.name}`);
        inserts.push({ id: `${sid}-${name}`, file: `${rel}/${f.name}`, seconds: i?.seconds, shots: i?.shots });
      }
      const p = plan.get(sid);
      const takes = await readTakes(ctx, rel, sid, 'take', spendByJob, reviewMisses.filter((m) => m.scene === sid && !m.pickup));
      const legacyPrompts = files.filter((f) => !f.dir && new RegExp(`^${sid}-prompt[-.]`).test(f.name)).map((f) => `${rel}/${f.name}`);
      const previzDir = await list(abs(ctx, `previz/${sid}`));
      const previzFiles = previzDir.filter((f) => /-previz-take-\d+\.mp4$/.test(f.name)).map((f) => f.name).sort(natCmp);
      const previzTakes = previzFiles.length || undefined;
      scenes.push({
        id: sid,
        title: sf?.title ?? sid,
        folder: rel,
        seconds,
        shots,
        sceneFile: sf ? `${rel}/${sid}-scene.md` : undefined,
        planSeconds: p?.seconds,
        planShots: p?.shots,
        promptVersions: await promptVersions(ctx, `${rel}/prompt`, sid),
        takes,
        previzPath: previzFiles.length ? `previz/${sid}/${previzFiles[previzFiles.length - 1]}` : undefined,
        more: {
          file: sf ? `${rel}/${sid}-scene.md` : undefined,
          locationIds: sf?.locationIds ?? [],
          locationName: sf?.locationName,
          characters: sf?.characters,
          props: sf?.props ?? [],
          linesNote: sf?.linesNote,
          lengthNote: sf?.lengthNote,
          planSuperseded: p ? (p.seconds !== undefined && p.seconds !== seconds) || (p.shots !== undefined && p.shots !== shots) : undefined,
          inserts,
          legacyPrompts,
          pickups: [],
          previzTakes,
        },
      });
    }

    // pick-ups: FIX-<what>/ joins the scene its name names (FIX-lamp-S3, FIX-name-S2a, FIX-S3-laugh); one that
    // names two (FIX-S2S3-reel) joins the first and is listed under the other; one that names none joins the
    // scene its files and spend rows name most
    for (const d of entries.filter((e) => e.dir && FIX_DIR.test(e.name))) {
      const rel = `${lay}/${d.name}`;
      const named = [...new Set(d.name.split('-').flatMap((part) => (/^(?:S\d+)+[a-z]?$/.test(part) ? [...part.matchAll(/S(\d+)/g)].map((m) => `S${m[1]}`) : [])))];
      let sid: string | undefined = named[0];
      let guess = false;
      if (!sid) {
        const counts = new Map<string, number>();
        const bump = (s: string, w = 1): void => void counts.set(s, (counts.get(s) ?? 0) + w);
        const walkNames = async (r: string, depth: number): Promise<void> => {
          for (const e of await list(abs(ctx, r))) {
            for (const m of e.name.matchAll(/\bS(\d+)\b/g)) bump(`S${m[1]}`);
            if (e.dir && depth < 1) await walkNames(`${r}/${e.name}`, depth + 1);
            else if (!e.dir && /\.(txt|md)$/.test(e.name)) for (const m of ((await readText(abs(ctx, `${r}/${e.name}`))) ?? '').matchAll(/\bS(\d+)\b/g)) bump(`S${m[1]}`);
          }
        };
        await walkNames(rel, 0);
        const jobIds = (await Promise.all((await list(abs(ctx, rel))).filter((e) => e.name.endsWith('.jobid')).map((e) => readText(abs(ctx, `${rel}/${e.name}`))))).map((t) => (t ?? '').trim());
        for (const j of jobIds) for (const l of spendByJob(j)) for (const m of `${l.what} ${l.more.stage ?? ''}`.matchAll(/\bS(\d+)\b/g)) bump(`S${m[1]}`, 5);
        sid = [...counts].sort((a, b) => b[1] - a[1])[0]?.[0];
        guess = true;
      }
      const info: PickupInfo = { folder: rel, name: d.name, sceneGuess: guess, scenes: named.length > 1 ? named : undefined, promptVersions: await promptVersions(ctx, rel, d.name) };
      const scene = scenes.find((s) => s.id === sid && s.folder.startsWith(lay));
      if (!scene) {
        unassigned.push(info);
        ctx.warn.add(rel, 'a pick-up whose scene could not be told');
        continue;
      }
      if (guess) ctx.warn.add(rel, `pick-up placed under ${sid} by the scene its files and spend rows name most (no -S<n> in the folder name)`);
      scene.more.pickups.push(info);
      for (const other of named.slice(1)) {
        const o = scenes.find((x) => x.id === other && x.folder.startsWith(lay));
        if (o) (o.more.sharedPickups ??= []).push({ name: d.name, folder: rel, under: scene.id });
      }
      const takes = await readTakes(ctx, rel, d.name, 'pickup', spendByJob, reviewMisses.filter((m) => m.pickup === d.name));
      scene.takes.push(...takes);
    }
  }
  return { scenes, layout, unassignedPickups: unassigned };
}
