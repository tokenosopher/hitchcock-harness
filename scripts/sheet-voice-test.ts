// npx tsx scripts/sheet-voice-test.ts
// The voice beside a sheet: a character's own picked voice and element line; a form speaks with its character's.
import assert from 'node:assert/strict';
import type { CharacterRef } from '../src/server/types';
import { sheetVoice } from '../src/components/lib/sheetVoice';

const ch = (id: string, name: string, voice?: CharacterRef['voice']): CharacterRef => ({ id, name, ...(voice ? { voice } : {}) } as CharacterRef);
const rounds = [{ id: 'r1', candidates: [{ id: '1', path: 'voices/options/C01-r1-1.mp3' }, { id: '2', path: 'voices/options/C01-r1-2.mp3', seconds: 6 }] }];
const cast = [
  ch('C01', 'Maren', { rounds, pick: { candidateId: '2' }, elementLine: { path: 'cast/C01-maren/voice/element-line-5s.mp3', seconds: 5 } } as CharacterRef['voice']),
  ch('C01a', 'Maren Night1'),
  ch('C02', 'Tobias', { rounds } as CharacterRef['voice']),
  ch('C02a', 'Tobias Night1'),
  ch('C03', 'Osk', { rounds: [], elementLine: { path: 'cast/C03-osk/voice/element-line-5s.mp3' } } as CharacterRef['voice']),
];
const own = sheetVoice(cast, 'C01');
assert.equal(own?.owner.id, 'C01');
assert.deepEqual(own?.picked, { path: 'voices/options/C01-r1-2.mp3', seconds: 6, option: '2' });
assert.equal(own?.line?.path, 'cast/C01-maren/voice/element-line-5s.mp3');
const form = sheetVoice(cast, 'C01a');
assert.equal(form?.owner.id, 'C01', 'a form speaks with its character\'s voice');
assert.equal(form?.picked?.option, '2');
assert.equal(sheetVoice(cast, 'C02'), undefined, 'options but no pick: no voice yet');
assert.equal(sheetVoice(cast, 'C02a'), undefined);
assert.equal(sheetVoice(cast, 'C03')?.picked, undefined);
assert.equal(sheetVoice(cast, 'C03')?.line?.path, 'cast/C03-osk/voice/element-line-5s.mp3');
assert.equal(sheetVoice(cast, 'C09'), undefined);
console.log('ok: the voice beside a sheet, a form with its character\'s');
