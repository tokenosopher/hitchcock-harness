// MOCK=boards: the sample film's files that can go on the timeline by hand, so the Edit page's file list can be used
// and tested without a real film (sample-data mode). `GET /api/films/<film>/files` answers this in sample-data mode, and
// `POST …/files` answers a made-up place in the film's folder for an attached file without writing anything.
// The files do not exist: a sound does not play and a poster does not load, but every length is given, so a placed
// clip has its whole length and a trim stops at its end. Pure, no randomness.
import type { FilmFile, FilmFiles } from '@/server/edit/files';

const F = 'assets/films/the-lighthouse';
const sound = (group: string, file: string, seconds: number, size = 400_000): FilmFile => ({ src: `${F}/${group}/${file}`, name: file.replace(/\.[^.]+$/, ''), kind: 'sound', group, seconds, size });
const picture = (group: string, file: string, seconds: number, audio: boolean): FilmFile => ({ src: `${F}/${group}/${file}`, name: file.replace(/\.[^.]+$/, ''), kind: 'picture', group, seconds, audio, width: 480, height: 854, size: 900_000 });
const subtitles = (group: string, file: string, seconds: number, cues: number): FilmFile => ({ src: `${F}/${group}/${file}`, name: file.replace(/\.[^.]+$/, ''), kind: 'subtitles', group, seconds, cues, size: 900 });
const attached = (file: string, seconds: number, kind: 'sound' | 'picture' = 'sound'): FilmFile => {
  const plain = file.replace(/^\d{8}-\d{6}(?:-\d+)?-/, '');
  return { src: `${F}/${kind === 'sound' ? 'audio' : 'edits'}/added/${plain}`, name: plain.replace(/\.[^.]+$/, ''), kind, group: 'attached', seconds, size: 1_200_000, upload: file, ...(kind === 'picture' ? { audio: true, width: 480, height: 854 } : {}) };
};

const FILES: Record<string, FilmFile[]> = {
  'the-lighthouse': [
    sound('audio/sfx', 'title-boom-9.wav', 1.375),
    sound('audio/sfx/cork', 'cork-pop-try1.wav', 2.4),
    sound('audio/sfx/cork', 'cork-pop-try2.wav', 3.1),
    sound('audio/sfx/waves', 'waves-on-rocks-try1.mp3', 8.25),
    sound('audio/music', 'tide-theme.wav', 96.5, 18_000_000),
    sound('audio/music', 'lamp-sting.mp3', 6.2),
    sound('voices/names', 'island-v3.wav', 0.9),
    picture('edits/island-card', 'island-card-480x854.mp4', 3, true),
    picture('cut/cards', 'title-card-the-lighthouse.mp4', 2.5, false),
    subtitles('subtitles', 'the-lighthouse-en.srt', 68.5, 6),
    attached('20261113-101500-rain-loop.wav', 12),
    attached('20261113-102200-ship-bell.mp3', 4.5),
  ],
};

export const mockFiles = (film: string): FilmFiles => ({ files: FILES[film] ?? [], waiting: 0 });

/** The words of the sample .srt files, for "Split into lines to edit": cues over the sample's dialogue, a
 *  two-row one, one with a tag, and one that runs into the next (the split shortens it). */
const SRT: Record<string, string> = {
  [`${F}/subtitles/the-lighthouse-en.srt`]: [
    '1', '00:00:08,000 --> 00:00:11,000', 'Post, Miss Holt!', '',
    '2', '00:00:19,000 --> 00:00:21,500', 'Who writes', 'to a lighthouse?', '',
    '3', '00:00:30,000 --> 00:00:34,000', '<i>To whoever keeps the light on the point.</i>', '',
    '4', '00:00:40,000 --> 00:00:42,500', 'It could be years old.', '',
    '5', '00:00:42,000 --> 00:00:45,000', 'Then she has been waiting years.', '',
    '6', '00:01:03,000 --> 00:01:05,000', 'Someone’s there.', '',
  ].join('\n'),
};
export const mockSrt = (src: string): string | undefined => SRT[src];

/** The place an attached file would get in the film's folder; nothing is written. */
export function mockAdopt(film: string, upload: string): { src: string; name: string; reused: boolean } | undefined {
  const f = (FILES[film] ?? []).find((x) => x.upload === upload);
  return f ? { src: f.src, name: f.name, reused: false } : undefined;
}

/** A small grey PNG (54×96, the film's shape) standing for the frame at the playhead. */
export const MOCK_FRAME = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAADYAAABgCAIAAADZ8BZgAAAACXBIWXMAAAABAAAAAQBPJcTWAAAAf0lEQVR4nO3OQQ3AIAAAMUiwNV741zQJ+1zCHq2Czv2c8W/rduCbYkGxoFhQLCgWFAuKBcWCYkGxoFhQLCgWFAuKBcWCYkGxoFhQLCgWFAuKBcWCYkGxoFhQLCgWFAuKBcWCYkGxoFhQLCgWFAuKBcWCYkGxoFhQLCgWFAuKhRd2sQI9XgOzFwAAAABJRU5ErkJggg==',
  'base64',
);
