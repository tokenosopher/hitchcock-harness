// The address of the Shot details page (/films/[film]/shots/[take]?shot=<n>): one take, opened at one of its shots, with
// everything that was fed to the model for it. Pure: the Edit page's menus, the Shots page and the page itself use it.
//
// [take] is the take's file, relative to the film folder, its "/" written "~" so it stays one part of the address:
// "generations~FIX-S5~takes~take1~FIX-S5-take1-480p.mp4". `shot` is the shot's place in the take, 1, 2, 3 … (Shot.i in
// components/edit/shots.ts), not the scene's number of it: a pick-up that redoes shot 6 is that take's shot 1. Without
// it the page opens on the whole take.

/** The take's file relative to its film folder: a TakeShots.src ("assets/films/<slug>/generations/…") loses its
 *  "assets/films/<slug>/" (whichever film's: the samples play another film's files); a path already relative stays. */
export function filmRel(takeSrc: string): string {
  const s = takeSrc.replace(/^\/+/, '');
  const m = /^assets\/films\/[^/]+\/(.+)$/.exec(s);
  return m ? m[1] : s;
}

/** The [take] part of the address for a take's file. */
export function takeParam(takeSrc: string): string {
  return filmRel(takeSrc).split('/').map((seg) => encodeURIComponent(seg).replace(/~/g, '%7E')).join('~');
}

/** The take's file, relative to the film folder, from the [take] part of the address (as the router hands it, decoded
 *  or not). Undefined for anything that is not a plain relative path. */
export function takeFromParam(raw: string): string | undefined {
  let s = raw;
  try { if (/%[0-9A-Fa-f]{2}/.test(s)) s = decodeURIComponent(s); } catch { return undefined; }
  const rel = s.split('~').join('/');
  if (!rel || rel.startsWith('/') || rel.split('/').some((p) => !p || p === '..' || p === '.') || rel.includes('\0')) return undefined;
  return rel;
}

/** The Shot details page of a take (`takeSrc`: its file, as TakeShots.src gives it), at its `shot`-th shot (1-based
 *  place in the take), or at the whole take. */
export function shotDetailsHref(film: string, takeSrc: string, shot?: number): string {
  const q = shot !== undefined && Number.isInteger(shot) && shot >= 1 ? `?shot=${shot}` : '';
  return `/films/${encodeURIComponent(film)}/shots/${takeParam(takeSrc)}${q}`;
}
