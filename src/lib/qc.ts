// Shared by the QC reader (server) and the QC panel (client): no Node imports here.
import { QC_CATEGORIES, type QCCategory } from '../server/types';

/** "camera" → camera+geometry, "fluidity" → blocking+fluidity, "audio" → audio+effect … */
export function qcCategoryOf(word: string | undefined): QCCategory {
  const w = (word ?? '').toLowerCase();
  const exact = QC_CATEGORIES.find((c) => c === w);
  if (exact) return exact;
  if (/camera|geometry|framing|lens|angle|view|wide/.test(w)) return 'camera+geometry';
  if (/block|fluid|action|state|pose|continuity/.test(w)) return 'blocking+fluidity';
  if (/prop/.test(w)) return 'prop';
  if (/line|dialog|word|script|\bids?\b|timing|caption|text/.test(w)) return 'lines';
  if (/audio|sound|music|voice|effect|vfx|light/.test(w)) return 'audio+effect';
  return 'blocking+fluidity';
}

