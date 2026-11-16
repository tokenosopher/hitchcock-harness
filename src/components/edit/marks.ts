// The takes the user marked on the Edit page to redo at 1080p in Seedance, kept with the film in
// <film>/harness/upscale-marks.json (13 Nov 2026, the user: "I want to be able to just mark them for Seedance, but then
// talk to her"). Pure: the file's shape, its check, the rule that drops a mark, and the words Alma is given.
// A mark is the user's note, not a go: nothing reads it to spend anything.

export const MARKS_NOTE = 'Takes the user marked on the Edit page to redo at 1080p in Seedance. A mark is not a go: nothing is to be spent on it until the user says so.';

export interface MarkShot { name: string; at: string; seconds: number }
export interface SeedanceMark { src: string; take: string; scene?: string; markedAt: string; cut: string; shots: MarkShot[] }
export interface MarksFile { note: string; seedance: SeedanceMark[] }

/** Where the file is, from the film repo (Alma's folder). */
export const marksRel = (film: string): string => `assets/films/${film}/harness/upscale-marks.json`;

const str = (v: unknown): v is string => typeof v === 'string';

/** The list from a file or a POST, checked; undefined when it is not a list of marks of this film. One mark a take. */
export function cleanMarks(v: unknown, film: string): SeedanceMark[] | undefined {
  const list = Array.isArray(v) ? v : v && typeof v === 'object' && Array.isArray((v as MarksFile).seedance) ? (v as MarksFile).seedance : undefined;
  if (!list || list.length > 500) return undefined;
  const out: SeedanceMark[] = [];
  for (const m of list as unknown[]) {
    if (!m || typeof m !== 'object') return undefined;
    const x = m as Record<string, unknown>;
    if (!str(x.src) || !x.src.startsWith(`assets/films/${film}/`) || x.src.includes('..')) return undefined;
    if (!str(x.take) || (x.scene !== undefined && !str(x.scene))) return undefined;
    const shots = Array.isArray(x.shots) ? x.shots : [];
    if (!shots.every((s) => s && typeof s === 'object' && str((s as MarkShot).name) && str((s as MarkShot).at) && typeof (s as MarkShot).seconds === 'number')) return undefined;
    if (out.some((o) => o.src === x.src)) continue;
    out.push({
      src: x.src, take: x.take, ...(x.scene ? { scene: x.scene } : {}),
      markedAt: str(x.markedAt) ? x.markedAt : '', cut: str(x.cut) ? x.cut : '',
      shots: (shots as MarkShot[]).map((s) => ({ name: s.name, at: s.at, seconds: s.seconds })),
    });
  }
  return out;
}

/** A take that has its own full-size file now is done: its mark goes. `takes`: each take's own file, by its 480p. */
export const liveMarks = (list: SeedanceMark[], info: { takes: Record<string, string> } | undefined): SeedanceMark[] =>
  info ? list.filter((m) => !info.takes[m.src]) : list;

/** The bits of a take in the cut that a mark keeps (UpscaleCheck's CheckTake has them). */
export interface CutTake { src: string; name: string; shots: { from: number; len: number; at: string; scene?: string; n?: number }[] }

export const shotLabel = (s: { scene?: string; n?: number; at: string }): string =>
  (s.n ? `${s.scene ? `${s.scene} ` : ''}shot ${s.n}` : `${s.scene ? `${s.scene} ` : ''}at ${s.at}`);

/** A mark for a take as the cut shows it now. */
export function markOf(t: CutTake, version: string, fps: number, tc: (s: number) => string, markedAt: string): SeedanceMark {
  const scene = t.shots.find((s) => s.scene)?.scene;
  return {
    src: t.src, take: t.name, ...(scene ? { scene } : {}), markedAt, cut: version,
    shots: t.shots.map((s) => ({ name: shotLabel(s), at: tc(s.from / fps), seconds: Math.round((s.len / fps) * 10) / 10 })),
  };
}

/** Each mark whose take is in the cut takes the cut's shots and version; the rest stay as they were saved. */
export function refreshMarks(list: SeedanceMark[], takes: CutTake[] | undefined, version: string | undefined, fps: number, tc: (s: number) => string): SeedanceMark[] {
  if (!takes || !version) return list;
  const by = new Map(takes.map((t) => [t.src, t]));
  return list.map((m) => {
    const t = by.get(m.src);
    return t ? markOf(t, version, fps, tc, m.markedAt) : m;
  });
}

/** What Alma is given with every message while takes are marked: the note, where the file is, each take, its file
 *  and its shots with their timecodes. */
export function marksText(list: SeedanceMark[], film: string): string {
  const lines = list.map((m) => {
    const shots = m.shots.length ? m.shots.map((s) => `${s.name} at ${s.at} (${s.seconds.toFixed(1)} s)`).join(', ') : 'no shot in the cut now';
    return `- ${m.take} (${m.src})${m.cut ? `, cut ${m.cut}` : ''}: ${shots}`;
  });
  return `${MARKS_NOTE} Kept in ${marksRel(film)}.\n${lines.join('\n')}`;
}

export const marksLabel = (n: number): string => `Marked for Seedance · ${n} ${n === 1 ? 'take' : 'takes'}`;
