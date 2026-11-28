// MOCK=boards: the library's faces for the sample films. Two faces kept from an earlier sample film, so
// "From the library" has something to offer, one of C08's round already kept (its tile shows the mark), and every
// "Save to the library" pressed on the sample cast film, kept in memory only: nothing is written, and the real library
// is never read or touched. Server-only.
import path from 'node:path';
import type { LibraryMeta } from '@/server/library/store';
import { CAST_SLUG, castSampleState, drawingFor } from './cast';

const DRAWINGS = path.join(process.cwd(), 'src/fixtures/media/cast');
const EARLIER = { slug: 'sample-earlier-film', title: 'Sample · an earlier film' };

/** A face kept from an earlier film: its picture is one of the drawings. */
const kept = (id: string, cid: string, name: string, candidate: string, drawing: string, note?: string): LibraryMeta => ({
  id, kind: 'face', name, film: EARLIER, character: { id: cid, name }, status: 'saved', round: 'r1-faces', candidate,
  prompt: 'A studio portrait photograph of a real young man, head and shoulders, facing the camera (sample)',
  dates: { made: '2026-11-04', saved: '2026-11-05' },
  files: [{ role: 'face', file: drawing, source: `assets/films/${EARLIER.slug}/cast/${cid}-${name.toLowerCase()}/r1-faces/${cid}-${candidate}.png` }],
  thumb: drawing, tags: [EARLIER.title, cid, name], ...(note ? { note } : {}),
});

/** C08's neighbour-r1-4, kept during its open round: its tile shows the library's mark when the page opens. */
const neighbour4 = `cast/C08-neighbour/r1-faces/C08-neighbour-r1-4.png`;
const KEPT_HERE: LibraryMeta = {
  id: `${CAST_SLUG}-c08-neighbour-r1-4`, kind: 'face', name: 'the Neighbour', film: { slug: CAST_SLUG, title: 'Sample · the cast and the places' }, character: { id: 'C08', name: 'the Neighbour' },
  status: 'saved', round: 'r1-faces', candidate: 'neighbour-r1-4', dates: { made: '2026-11-11', saved: '2026-11-11' },
  files: [{ role: 'face', file: drawingFor(neighbour4) ?? 'face-1.png', source: `assets/films/${CAST_SLUG}/${neighbour4}` }], thumb: drawingFor(neighbour4) ?? 'face-1.png',
  tags: ['Sample · the cast and the places', 'C08', 'the Neighbour'], note: 'Too old for the Neighbour; keep for a young soldier.',
};

const FIXED: LibraryMeta[] = [
  KEPT_HERE,
  kept('sample-earlier-film-c03-tomas-r1-5', 'C03', 'Tomas', 'r1-5', 'face-5.png', 'Not right for Tomas; a good older face for another film.'),
  kept('sample-earlier-film-c01-ines-r1-2', 'C01', 'Ines', 'r1-2', 'face-6.png'),
];

const g = globalThis as unknown as { __hhMockLib?: Map<string, LibraryMeta> };
const saved = (g.__hhMockLib ??= new Map());

/** Every face of the mock library, the ones saved on the sample server first. */
export const mockLibraryItems = (): LibraryMeta[] => [...[...saved.values()].reverse(), ...FIXED.filter((i) => !saved.has(i.id))];

/** The drawing a mock entry's file stands for. */
export function mockLibraryFile(kind: string, id: string, file: string): string | undefined {
  const it = mockLibraryItems().find((i) => i.kind === kind && i.id === id);
  if (!it || (file !== it.thumb && !it.files.some((f) => f.file === file))) return undefined;
  return path.join(DRAWINGS, path.basename(file));
}

/** "Save to the faces library" on the sample cast film: kept in memory, with the user's note. */
export function mockSave(body: { film?: string; kind?: string; ref?: string; note?: string }): Response | undefined {
  if (body.film !== CAST_SLUG) return undefined;
  if (body.kind !== 'face') return Response.json({ error: 'the sample keeps faces only' }, { status: 400 });
  const st = castSampleState(CAST_SLUG)!;
  for (const c of st.characters) {
    for (const r of c.face?.rounds ?? []) {
      const k = r.candidates.find((x) => x.path === body.ref);
      if (!k?.path) continue;
      const id = `${CAST_SLUG}-${c.id}-${k.id}`.toLowerCase().replace(/[^a-z0-9]+/g, '-');
      const drawing = drawingFor(k.path) ?? 'face-1.png';
      const before = saved.get(id) ?? FIXED.find((i) => i.id === id);
      const note = body.note?.trim().replace(/\s+/g, ' ').slice(0, 400) || undefined;
      const meta: LibraryMeta = before ? { ...before, ...(note ? { note } : {}) } : {
        id, kind: 'face', name: c.name, film: { slug: CAST_SLUG, title: st.film.title }, character: { id: c.id, name: c.name },
        status: 'saved', round: r.id, candidate: k.id, dates: { made: r.date, saved: new Date().toISOString().slice(0, 10) },
        files: [{ role: 'face', file: drawing, source: `assets/films/${CAST_SLUG}/${k.path}` }], thumb: drawing,
        tags: [st.film.title, c.id, c.name], ...(note ? { note } : {}),
      };
      saved.set(id, meta);
      return Response.json({ ok: true, id, kind: 'face', created: !before, ...(before && note ? { noted: true } : {}), meta, writes: [], mock: true });
    }
  }
  return Response.json({ error: `nothing to save for face ${body.ref ?? ''}` }, { status: 404 });
}
