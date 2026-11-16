// A file the user pasted or attached in Alma's box travels as a chip: id "upload:<thread>/<file>", the label its
// name, the ref its full path on the Mac (what Alma opens). These helpers read such a chip back for the page.
import type { Chip } from '@/server/types';

export const isUploadChip = (c: Chip): boolean => c.id.startsWith('upload:');

/** The address of an uploaded picture, for its thumbnail; undefined when the chip is not a picture. */
export function uploadImage(c: Chip): string | undefined {
  const m = /^upload:([^/]+)\/(.+)$/.exec(c.id);
  if (!m || !/\.(png|jpe?g|webp|gif)$/i.test(m[2])) return undefined;
  return `/api/films/${m[1]}/upload?f=${encodeURIComponent(m[2])}`;
}

/** What the harness kept of an attached file. */
export interface Attached { file: string; name: string; path: string; type: string; size: number }

/** The size of each part a file is sent in: the request proxy keeps only the first 10 MB of a body. */
export const UPLOAD_PART = 4 * 1024 * 1024;

const hex = (b: ArrayBuffer): string => Array.from(new Uint8Array(b), (x) => x.toString(16).padStart(2, '0')).join('');

function uploadId(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

/**
 * Sends a file to the harness in parts, in order, with its size and (where the browser can work it out) its
 * SHA-256, so the harness keeps it only when it came whole. `onProgress` gets the share sent so far, 0 to 1.
 * Resolves to the kept file or to the harness's words for why not.
 */
export async function sendUpload(film: string, f: File, onProgress?: (done: number) => void): Promise<{ ok: true; file: Attached } | { ok: false; error: string }> {
  const url = `/api/films/${film}/upload`;
  const id = uploadId();
  // crypto.subtle is there on localhost and https (the tunnel); without it the size check alone applies
  let sha256: string | undefined;
  if (f.size && globalThis.crypto?.subtle) {
    try { sha256 = hex(await crypto.subtle.digest('SHA-256', await f.arrayBuffer())); } catch { /* sent without */ }
  }
  const count = Math.max(1, Math.ceil(f.size / UPLOAD_PART));
  const fail = (error: string) => {
    if (count > 1) void fetch(`${url}?id=${id}`, { method: 'DELETE' }).catch(() => undefined);
    return { ok: false as const, error };
  };
  for (let i = 0; i < count; i++) {
    const offset = i * UPLOAD_PART;
    const body = f.slice(offset, Math.min(f.size, offset + UPLOAD_PART));
    let r: Response;
    try {
      r = await fetch(url, {
        method: 'POST',
        body,
        headers: {
          'Content-Type': f.type || 'application/octet-stream',
          'X-File-Name': encodeURIComponent(f.name),
          'X-Upload-Id': id,
          'X-Upload-Part': String(i),
          'X-Upload-Parts': String(count),
          'X-Upload-Offset': String(offset),
          'X-Upload-Size': String(f.size),
          ...(sha256 ? { 'X-Upload-Sha256': sha256 } : {}),
        },
      });
    } catch {
      return fail('The harness server is not answering');
    }
    const d = (await r.json().catch(() => ({}))) as Partial<Attached> & { error?: string };
    if (!r.ok) return fail(d.error ?? `${f.name || 'The file'} was not attached (${r.status})`);
    onProgress?.(Math.min(1, (offset + body.size) / (f.size || 1)));
    if (i === count - 1) {
      if (!d.file || !d.path) return fail(`${f.name || 'The file'} was not attached (no answer from the harness)`);
      return { ok: true, file: d as Attached };
    }
  }
  return fail(`${f.name || 'The file'} was not attached`);
}
