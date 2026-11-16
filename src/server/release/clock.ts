// The clock the release rules read on the server: the real one, or in sample-data mode the ?now= a test passes
// (src/components/release/clock.ts sends it with each request).
import { isMock } from '@/fixtures/mock';

export function clockOf(req: Request): Date {
  // sample-data mode only: on a real film the rules always read the real clock, even on a dev server
  if (process.env.NODE_ENV !== 'production' && isMock()) {
    const raw = new URL(req.url).searchParams.get('now');
    const t = raw ? Date.parse(raw) : NaN;
    if (!Number.isNaN(t)) return new Date(t);
  }
  return new Date();
}
