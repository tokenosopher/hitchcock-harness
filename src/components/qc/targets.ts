// The QC targets of one stage, from the film's state: one per character (sheet), location (views),
// scene (previz, prompt, take) or one for the film (script, voices, elements, cut, frames, captions, kit).
// The flow board's node pages use this; each stage page builds the same target for what it shows. A scene whose
// pick-up has its own boards or prompt check shows that check, its own kept as the earlier one.
import type { FilmState, QCStage } from '@/server/types';
import { FILM_TARGET, qcEntry } from '@/components/lib/qc';
import { cutTakeIds } from '@/components/lib/derive';
import { withPickupCheck } from '@/components/lib/pickupCheck';
import type { QCTarget } from './QCPanel';

export function qcTargets(s: FilmState, stage: QCStage): QCTarget[] {
  const film = (label: string, ready: boolean, waitsFor: string): QCTarget[] =>
    [{ target: FILM_TARGET, label, entry: qcEntry(s, stage, FILM_TARGET), ready, waitsFor }];
  switch (stage) {
    case 'script': return film('script', !!s.script, s.script ? `script ${s.script.current ?? ''}`.trim() : 'the script');
    case 'voice': {
      const cast = s.characters.filter((c) => !c.extra);
      const picked = cast.filter((c) => c.voice?.pick).length;
      return film('voices', cast.length > 0 && picked === cast.length, picked === cast.length ? 'the picked voices' : `the voice picks (${picked} of ${cast.length})`);
    }
    case 'elements': {
      const done = s.characters.filter((c) => c.element?.state === 'final').length;
      return film('elements', done > 0, done ? 'the finished elements' : 'the first element');
    }
    case 'sheet':
      return s.characters.map((c) => ({ target: c.id, label: `${c.id} sheet`, entry: qcEntry(s, stage, c.id), ready: !!c.sheet?.path, waitsFor: c.sheet?.path ? `${c.id}'s sheet` : 'the sheet' }));
    case 'views':
      return s.locations.map((l) => ({ target: l.id, label: `${l.id} views`, entry: qcEntry(s, stage, l.id), ready: !!l.master?.picked && !!l.views?.length, waitsFor: l.master?.picked ? `${l.id}'s views` : `the ${l.id} master pick` }));
    case 'previz':
      return s.scenes.map((sc) => {
        const entry = qcEntry(s, stage, sc.id);
        return withPickupCheck(s, stage, { target: sc.id, label: entry?.latest.label ?? `${sc.id} previz & boards`, entry, ready: !!sc.previzPath, waitsFor: sc.previzPath ? `${sc.id}'s previz and boards` : `${sc.id}'s previz` });
      });
    case 'prompt':
      return s.scenes.map((sc) => {
        const p = sc.promptVersions[sc.promptVersions.length - 1];
        return withPickupCheck(s, stage, { target: sc.id, label: `${sc.id} prompt${p ? ` ${p.version}` : ''}`, entry: qcEntry(s, stage, sc.id), ready: !!p, waitsFor: p ? `${sc.id} prompt ${p.version}` : `${sc.id}'s first prompt` });
      });
    case 'take':
      return s.scenes.map((sc) => {
        const ready = cutTakeIds(sc, s.cut).length > 0 || sc.takes.length > 0;
        return { target: sc.id, label: `${sc.id} take check`, entry: qcEntry(s, stage, sc.id), ready, waitsFor: ready ? `the take in the cut of ${sc.id}` : 'the first take' };
      });
    case 'cut': return film('cut', !!s.cut || !!s.post?.cuts.length, s.cut ? s.cut.name : 'the first cut');
    case 'frames': return film('1080p frames', !!s.post?.masters.length, s.post?.masters.length ? 'the 1080p master' : 'the 1080p master');
    case 'captions': return film('captions', !!s.post?.captions.length, 'the caption file');
    case 'kit': return film('kit', !!s.post?.kit, 'the social kit');
  }
}
