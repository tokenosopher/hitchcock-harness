// MOCK=boards: sample films for the Release pages, all of them the sample film The Lighthouse at a moment of its
// release (14 Nov at 18:52). Server-only; nothing is written to disk.
//   sample-release-closed  no final yet: three masters (v236 the newest, v234 dialogue only at −14 LUFS, v231 out of
//                          date and without subtitles); the cut is v236
//   sample-release-open    the release at the moment of board 15, every platform by hand: Reddit and YouTube posted
//                          with links, TikTok and Instagram ready, X ready with a note from Alma, LinkedIn's text to
//                          pick with the cost not confirmed. The final is the master of v236.
//   sample-release-kit     an older film with only social/kit.md: today's Release page, read-only
//   sample-release-checked the moment of board 17 (stage 2): TikTok and Instagram both Ready and sharing three fields,
//                          TikTok's first line and tags the user's own, its credit line edited since Alma read it,
//                          two notes from her (the first line, the tags)
//   sample-release-shorts  the moment of board 18 (18:10): YouTube Shorts not out yet, its description using the days
//                          it took, not confirmed; title, tags and three thumbnails
//   sample-release-cover   one cover frame for all (18:52): YouTube Shorts, TikTok and Instagram Reels each
//                          with the same three frames, "her face" picked on all three; X with a reply (ASKS 58),
//                          posted by hand as a reply to the post
//   sample-release-empty   a final named and no platforms yet: Alma has not written the texts
// The clock: the pages take ?now=2026-11-14T18:52 outside production (src/components/release/clock.ts).
import type { FilmRef, FilmState, PictureMade, RenderState, Timeline } from '@/server/types';
import type { ReleaseFile, ReleaseFinal } from '@/components/release/file';
import { COMPANION_LABEL, finalNames, masterRows, type CompanionStatus, type MasterOption } from '@/components/release/masters';
import { parseKit, type ReleaseInfo } from '@/server/films/read/release';
import boardFilm from './boards/the-lighthouse.json';
import cutFilm from './boards/cut-the-lighthouse.json';

const lighthouse = boardFilm as unknown as FilmState;
const repo = lighthouse.film.repo;
export const SAMPLE_DAY = '2026-11-14';
/** A local time on the sample day ("18:04"), or the day after with `+1`. */
export const at = (h: string, plus = 0): string => {
  const [hh, mm] = h.split(':').map(Number);
  return new Date(2026, 10, 14 + plus, hh, mm).toISOString();
};
/** The board's clock: 14 Nov 2026, 18:52. */
export const BOARD_NOW = new Date(2026, 10, 14, 18, 52);

const ref = (slug: string, title: string, stage: FilmRef['stage']): FilmRef => ({ slug, title, folder: `${repo}/assets/films/${slug}`, repo, flow: 'video-driven', status: 'in-progress', stage, aspect: '9:16' });
export const RELEASE_SAMPLES: Record<string, FilmRef> = {
  'sample-release-closed': ref('sample-release-closed', 'Sample · no final yet', 12),
  'sample-release-open': ref('sample-release-open', 'The Lighthouse', 12),
  'sample-release-kit': ref('sample-release-kit', 'Sample · an older film with a kit', 12),
  'sample-release-checked': ref('sample-release-checked', 'Sample · after an edit, two notes', 12),
  'sample-release-shorts': ref('sample-release-shorts', 'Sample · YouTube Shorts waiting for a fact', 12),
  'sample-release-empty': ref('sample-release-empty', 'Sample · a final and no texts yet', 12),
  'sample-release-cover': ref('sample-release-cover', 'Sample · one cover frame for all', 12),
};
export const releaseSampleFilms = (): FilmRef[] => Object.values(RELEASE_SAMPLES);

const CUT_VERSION = 'v236';
const timeline = (version: string): Timeline => ({ ...(cutFilm.current as unknown as Timeline), version, renders: undefined });

/** The sample film's state: the-lighthouse's, with the film and its cut renamed. */
export function releaseSampleState(slug: string): FilmState | undefined {
  const film = RELEASE_SAMPLES[slug];
  if (!film) return undefined;
  const cur = timeline(CUT_VERSION);
  return {
    ...lighthouse, film,
    cut: { name: `cut ${CUT_VERSION}`, fps: cur.fps, source: { cut: `cut ${CUT_VERSION}`, from: [`cut/${CUT_VERSION}.json`], date: SAMPLE_DAY, label: `from cut/${CUT_VERSION}.json` }, current: cur,
      versions: [{ version: CUT_VERSION, at: at('16:20'), by: 'user' }] },
    post: slug === 'sample-release-kit' ? { cuts: [], masters: [], captions: [], kit: 'social/kit.md' } : { cuts: [], masters: [], captions: [] },
    feed: undefined,
  };
}

// ---- the masters on offer (board 14)

const picture = (base: number, cards: number, small = 0): PictureMade => ({
  sources: [...(base ? [{ kind: 'base' as const, shots: base, frames: base * 64 }] : []), ...(cards ? [{ kind: 'original' as const, shots: cards, frames: cards * 48 }] : []), ...(small ? [{ kind: 'small' as const, shots: small, frames: small * 64 }] : [])],
  shots: base + cards + small, frames: (base + small) * 64 + cards * 48, base: base ? { version: 'v236', path: 'video/1080/cut-v236-1080.mp4', label: 'Higgsfield' } : undefined,
});
const cutNow = { seconds: 69, lines: 8 };
const sound = ['Dialogue', 'Effects', 'Music'];
export const SAMPLE_MASTERS: MasterOption[] = [
  { path: 'cut/renders/v236-master-lufs-14.mp4', version: 'v236', title: 'Master of v236 · −14 LUFS', at: at('16:40'), bytes: 101_000_000, seconds: 69, current: true, still: 'cut/renders/v236-master-lufs-14.mp4',
    rows: masterRows({ picture: picture(34, 2), lines: 8, subtitlesLeft: false, sound, soundLeft: [], lufs: -14, seconds: 69, width: 1080, height: 1920, bytes: 101_000_000 }, cutNow) },
  { path: 'cut/renders/v234-master-lufs-14-without-a2.mp4', version: 'v234', title: 'Master of v234 · no A2 Music · −14 LUFS', at: at('11:05'), bytes: 96_000_000, seconds: 69.4, current: false, still: 'cut/renders/v234-master-lufs-14-without-a2.mp4',
    rows: masterRows({ picture: picture(34, 2), lines: 8, subtitlesLeft: false, sound, soundLeft: ['Effects', 'Music'], seconds: 69.4, width: 1080, height: 1920, bytes: 96_000_000 }, cutNow) },
  { path: 'cut/renders/v231-master.mp4', version: 'v231', title: 'Master of v231', at: at('22:30', -1), bytes: 99_000_000, seconds: 71, current: false, still: 'cut/renders/v231-master.mp4',
    stale: 'The master of v231 was made from the 480p scaled up; the upscaled cut now covers all 36 shots',
    rows: masterRows({ picture: picture(0, 0, 34), lines: 0, subtitlesLeft: false, sound, soundLeft: [], lufs: -14, seconds: 71, width: 1080, height: 1920, bytes: 99_000_000 }, cutNow) },
];

/** The final as the server would build it for a sample master. */
export function sampleFinal(title: string, m: MasterOption, now: Date): ReleaseFinal {
  const tag = m.path.replace(/^cut\/renders\/v\d+-master-?/, '').replace(/\.mp4$/, '');
  return {
    path: m.path, version: m.version, namedAt: now.toISOString(), name: finalNames(title).final,
    companions: {
      clean: { path: `cut/renders/${m.version}-master-${tag ? `${tag}-` : ''}without-c1.mp4`, options: { leaveOut: { tracks: ['C1'] } } },
      phone: { path: `cut/renders/${m.version}-proxy${tag ? `-${tag}` : ''}.mp4` },
      srt: { path: `cut/renders/${m.version}.srt` },
      // the file that goes out (ASKS 56): the final's smaller file, or the final when it is one already
      post: /-small\.mp4$/.test(m.path) ? { path: m.path } : { path: `cut/renders/${m.version}-master-${tag ? `${tag}-` : ''}small.mp4`, options: { small: true } },
    },
  };
}

/** The companions of a sample final: queued, then rendering, then done, a few seconds after the naming (the open
 *  sample's are done). `live`: the sample render queue's state of a companion (src/fixtures/renders.ts), when it has
 *  one: naming a final asks it for the copy without subtitles and the smaller file, and the 480p preview only on "Make
 *  it", so those follow it, a cancel included. Without one, the 480p of a final named now is "not made". */
export function sampleCompanions(final: ReleaseFinal, now: Date, live?: (kind: 'proxy' | 'master', options?: Record<string, unknown>) => RenderState | undefined): CompanionStatus[] {
  const t = (now.getTime() - Date.parse(final.namedAt)) / 1000;
  const old = t > 3600 || t < -60;
  const bytes = { clean: 98_000_000, phone: 14_000_000, srt: 3_100, post: 60_000_000 } as const;
  return (['clean', 'phone', 'srt', 'post'] as const).filter((k) => final.companions[k]).map((key, i): CompanionStatus => {
    const label = COMPANION_LABEL[key];
    const c = final.companions[key]!;
    const path = c.path;
    if (key === 'post' && path === final.path) return { key, label, path, state: 'same', bytes: 60_000_000 };
    if (key === 'srt' || old) return { key, label, path, state: 'done', bytes: bytes[key] };
    const st = live?.(key === 'phone' ? 'proxy' : 'master', c.options);
    if (st && st.state !== 'none') return st.state === 'done' ? { key, label, path, state: 'done', bytes: bytes[key] } : { key, label, path, state: st.state, percent: st.percent, error: st.error };
    if (key === 'phone') return { key, label, path, state: 'none' };
    const start = 1 + i * 2.5, end = start + 2.5;
    if (t < start) return { key, label, path, state: 'queued' };
    if (t < end) return { key, label, path, state: 'running', percent: Math.round(((t - start) / (end - start)) * 100) };
    return { key, label, path, state: 'done', bytes: bytes[key] };
  });
}

// ---- the release on the day (board 15)

const step = (id: string, text: string, done?: string) => ({ id, text, ...(done ? { done } : {}) });
const firstLine = {
  candidates: [
    { id: 'a', text: 'A lighthouse keeper finds a letter in a bottle. It asks her to flash the lamp twice.', does: 'the premise' },
    { id: 'b', text: 'A letter washes up at the lighthouse. Someone across the water is waiting.', does: 'who she is' },
    { id: 'c', text: '"Who writes to a lighthouse?"', does: 'a line from the film' },
  ],
};
const credit = {
  candidates: [
    { id: 'a', text: 'An original story. Voices and pictures made on Higgsfield.', does: 'the source' },
    { id: 'b', text: 'An original story.', does: 'shorter' },
    { id: 'c', text: 'Written for this film.', does: 'plainer' },
  ],
};
const tags = {
  candidates: [
    { id: 'a', text: '#ai #aifilm #shortfilm #lighthouse', does: 'your usual four' },
    { id: 'b', text: '#ai #aifilm #shortfilm #lighthouse #sea', does: 'one more' },
    { id: 'c', text: '#ai #aifilm #shortfilm #lighthouse #sea #letter #messageinabottle', does: 'seven' },
  ],
};
const shared = (others: string[], f: { candidates: { id: string; text: string; does: string }[] }, pick: string) => ({
  text: f.candidates.find((c) => c.id === pick)!.text, pick, candidates: f.candidates, sharedWith: others,
  readByAlma: { at: at('18:30'), text: f.candidates.find((c) => c.id === pick)!.text },
});

/** The release file at the moment of board 15. */
export function boardRelease(): ReleaseFile {
  return {
    v: 1, day: SAMPLE_DAY,
    final: {
      path: 'cut/renders/v236-master-lufs-14.mp4', version: 'v236', namedAt: at('17:02'), name: 'The Lighthouse - FINAL captioned.mp4',
      companions: {
        clean: { path: 'cut/renders/v236-master-lufs-14-without-c1.mp4', options: { loudness: { lufs: -14, truePeak: -1 }, leaveOut: { tracks: ['C1'] } } },
        phone: { path: 'cut/renders/v236-proxy-lufs-14.mp4', options: { loudness: { lufs: -14, truePeak: -1 } } },
        srt: { path: 'cut/renders/v236.srt' },
      },
    },
    facts: [
      { id: 'days', label: 'the days it took', many: true, sentence: 'Days it took ___', value: '6', confirmedAt: at('18:12') },
      { id: 'cost', label: 'the cost', sentence: 'Cost about ___ Higgsfield credits' },
    ],
    platforms: [
      {
        id: 'reddit', kind: 'reddit', name: 'Reddit', account: 'your account, r/aivideo', route: 'hand', wave: { day: 'today', about: '18:00' },
        fields: [
          { id: 'title', label: 'Title', part: 'title', text: 'A letter in a bottle reaches a lighthouse', pick: 'a', candidates: [{ id: 'a', text: 'A letter in a bottle reaches a lighthouse', does: 'plain' }, { id: 'b', text: 'I made a short film about a letter in a bottle', does: 'first person' }] },
          { id: 'comment', label: 'First comment', part: 'comment', text: 'Made alone in {days} days with Seedance 2.5 on Higgsfield. Happy to answer how.', own: true, candidates: [] },
        ],
        upload: { bufferSets: [], after: [], hand: [step('save', 'Save the video', at('17:58')), step('title', 'Copy the title', at('17:59')), step('open', 'Open r/aivideo and post', at('18:01')), step('comment', 'Copy the first comment', at('18:03')), step('link', 'Paste the post\'s link', at('18:04'))] },
        send: { posted: { at: at('18:04'), link: 'https://www.reddit.com/r/aivideo/comments/1gx4k2/a_letter_in_a_bottle_reaches_a_lighthouse/' } },
      },
      {
        id: 'youtube-shorts', kind: 'youtube-shorts', name: 'YouTube Shorts', account: 'Sample Studio', route: 'hand', wave: { day: 'today', about: '18:00' },
        fields: [
          { id: 'title', label: 'Title', part: 'title', text: 'A keeper finds a letter asking her to flash the lamp.', pick: 'a', aim: { min: 41, max: 70, words: 'aim 41 to 70' },
            candidates: [{ id: 'a', text: 'A keeper finds a letter asking her to flash the lamp.', does: 'the premise' }, { id: 'b', text: 'Someone across the water has been waiting for years.', does: 'who she is' }, { id: 'c', text: 'Who writes to a lighthouse?', does: 'a line from the film' }] },
          { id: 'description', label: 'Description', part: 'description', pick: 'a',
            text: 'A lighthouse keeper finds a letter in a bottle. It asks her to flash the lamp twice.\nMade alone in {days} days.\nAn original story.\nSeedance 2.5 and voices on Higgsfield.',
            candidates: [{ id: 'a', text: 'A lighthouse keeper finds a letter in a bottle. It asks her to flash the lamp twice.\nMade alone in {days} days.\nAn original story.\nSeedance 2.5 and voices on Higgsfield.', does: 'premise first' }, { id: 'b', text: 'An original story. Made with Seedance.', does: 'source first' }] },
          { id: 'tags', label: 'Tags', part: 'tags', tags: true, text: 'lighthouse, letter, sea, drama, short film, ai film', own: true, candidates: [] },
        ],
        upload: { bufferSets: [], after: [], hand: [step('save', 'Save the video', at('18:12')), step('open', 'Open YouTube Studio and upload it', at('18:13')), step('title', 'Copy the title', at('18:14')), step('description', 'Copy the description', at('18:15')),
          step('tags', 'Copy the tags', at('18:16')), step('settings', 'I turned on altered or synthetic content, set it public, turned off automatic captions and picked the thumbnail frame', at('18:20')), step('link', 'Paste the post\'s link', at('18:21'))] },
        send: { posted: { at: at('18:21'), link: 'https://youtube.com/shorts/Qd7xY2kLmNo' } },
      },
      {
        id: 'tiktok', kind: 'tiktok', name: 'TikTok', account: 'sample_studio', route: 'hand', wave: { day: 'today', about: '19:00' },
        fields: [
          { id: 'first', label: 'First line', ...shared(['instagram-reels'], firstLine, 'a'), aim: { max: 90, words: 'aim under 90, so the feed shows it whole' } },
          { id: 'credit', label: 'Credit line', ...shared(['instagram-reels'], credit, 'a') },
          { id: 'tags', label: 'Tags', tags: true, ...shared(['instagram-reels'], tags, 'a'), aim: { words: 'your usual tags' } },
        ],
        upload: { bufferSets: [], after: [], hand: [step('save', 'Save the video to this phone'), step('copy', 'Copy the caption'), step('open', 'Open the TikTok app'), step('before', 'In TikTok, before you post: turn on AI-generated content, turn off auto-captions'), step('link', 'Paste the post\'s link')] },
        send: {},
      },
      {
        id: 'instagram-reels', kind: 'instagram-reels', name: 'Instagram Reels', account: 'sample_studio', also: ['Facebook', 'Threads'], route: 'hand', wave: { day: 'today', about: '19:00' },
        fields: [
          { id: 'first', label: 'First line', ...shared(['tiktok'], firstLine, 'a') },
          { id: 'credit', label: 'Credit line', ...shared(['tiktok'], credit, 'a') },
          { id: 'tags', label: 'Tags', tags: true, ...shared(['tiktok'], tags, 'a') },
        ],
        upload: { bufferSets: [], after: [], hand: [step('save', 'Save the video to this phone'), step('copy', 'Copy the caption'), step('open', 'Open Instagram'),
          step('before', 'In Instagram, before you share: post it as a reel shared to the feed, turn on AI info, share to Facebook and Threads, check the cover frame'), step('link', 'Paste the post\'s link')] },
        send: {},
      },
      {
        id: 'x', kind: 'x', name: 'X', account: 'sample_x', route: 'hand', wave: { day: 'today', about: '21:00' },
        fields: [
          { id: 'text', label: 'Post', text: 'A lighthouse keeper finds a letter in a bottle.', pick: 'a', aim: { max: 120, words: 'aim under 120, room for the video card' },
            candidates: [{ id: 'a', text: 'A lighthouse keeper finds a letter in a bottle.', does: 'the premise' }, { id: 'b', text: '"Who writes to a lighthouse?" A short film.', does: 'a line from the film' }],
            notes: [{ id: 'n1', at: at('18:30'), text: 'X shows the whole post. A question at the end gets more replies here than a plain line.', proposal: 'A lighthouse keeper finds a letter in a bottle. Would you answer it?',
              actions: [
                { id: 'use', label: 'Use it on X', effect: [{ kind: 'set', field: 'text', platforms: ['x'], text: 'A lighthouse keeper finds a letter in a bottle. Would you answer it?' }] },
                { id: 'keep', label: 'Keep yours', effect: [], small: 'nothing changes' },
              ] }] },
        ],
        upload: { bufferSets: [], after: [], hand: [step('save', 'Save the video to this Mac'), step('copy', 'Copy the post'), step('open', 'Open X'), step('link', 'Paste the post\'s link')] },
        send: {},
      },
      {
        id: 'linkedin', kind: 'linkedin', name: 'LinkedIn', account: 'your account', route: 'hand', wave: { day: 'tomorrow', about: '9:00' },
        fields: [
          { id: 'text', label: 'Post', text: '', aim: { min: 400, max: 1200, words: 'aim 400 to 1,200' },
            candidates: [
              { id: 'a', text: 'I made a one-minute film alone in {days} days for about {cost} Higgsfield credits. Here is what that took.', does: 'the making' },
              { id: 'b', text: 'A lighthouse keeper finds a letter asking her to flash the lamp twice. I made it into a short film.', does: 'the story' },
              { id: 'c', text: 'What one person can make now: a short film, {days} days, about {cost} credits.', does: 'the claim' },
            ] },
          { id: 'comment', label: 'First comment', part: 'comment', text: 'The film is on YouTube too.', own: true, candidates: [] },
        ],
        upload: { bufferSets: [], after: [], hand: [step('save', 'Save the video to this Mac'), step('open', 'Open LinkedIn and start a post with the video'), step('text', 'Copy the post'), step('link', 'Paste the post\'s link'), step('comment', 'Copy the first comment and post it under the post')] },
        send: {},
      },
    ],
  };
}

// ---- stage 2: the text column's moments

/** Board 17's clock: 18:52, as board 15. Board 18's: 18:10. */
export const SHORTS_NOW = new Date(2026, 10, 14, 18, 10);
const plat = (f: ReleaseFile, id: string) => f.platforms.find((p) => p.id === id)!;
const fld = (f: ReleaseFile, pid: string, fid: string) => plat(f, pid).fields.find((x) => x.id === fid)!;

const OWN_FIRST = 'The point, at low tide. A lighthouse keeper finds a letter in a bottle, and the letter asks her to flash the lamp twice for a stranger.';
const OWN_CREDIT = 'An original story, written for this film. Voices and pictures made on Higgsfield.';
const SHORTER = 'A keeper finds a letter in a bottle. Will she answer it?';

/** After an edit (board 17): TikTok and Instagram Ready, sharing the first line, the credit line and the tags; the
 *  first line and the tags the user's own and read by Alma, with a note each; the credit line edited since. */
export function checkedRelease(): ReleaseFile {
  const f = boardRelease();
  plat(f, 'instagram-reels').send = {};
  for (const pid of ['tiktok', 'instagram-reels']) {
    Object.assign(fld(f, pid, 'first'), { text: OWN_FIRST, own: true, pick: undefined, readByAlma: { at: at('18:48'), text: OWN_FIRST } });
    Object.assign(fld(f, pid, 'credit'), { text: OWN_CREDIT, own: true, pick: undefined });
    Object.assign(fld(f, pid, 'tags'), { text: tags.candidates[2].text, own: true, pick: undefined, readByAlma: { at: at('18:48'), text: tags.candidates[2].text } });
    for (const k of ['first', 'credit', 'tags']) delete (fld(f, pid, k) as { pick?: string }).pick;
  }
  fld(f, 'tiktok', 'first').notes = [{
    id: 'first-short', at: at('18:49'), text: 'Instagram shows about 125 characters before "more", so it cuts this line after "twice for a". A shorter one:',
    proposal: SHORTER,
    actions: [
      { id: 'both', label: 'Use it on both', effect: [{ kind: 'set', field: 'first', platforms: ['tiktok', 'instagram-reels'], text: SHORTER }] },
      { id: 'ig', label: 'Only on Instagram', small: 'unlinks the first line', effect: [{ kind: 'set', field: 'first', platforms: ['instagram-reels'], text: SHORTER }] },
    ],
  }];
  fld(f, 'tiktok', 'tags').notes = [{
    id: 'tags-seven', at: at('18:49'), text: 'TikTok is fine with 7. Instagram shares this line and your usual there is 4.',
    actions: [
      { id: 'tt', label: 'Only on TikTok', small: 'unlinks the tags, Instagram keeps your usual 4', effect: [{ kind: 'set', field: 'tags', platforms: ['instagram-reels'], text: tags.candidates[0].text }] },
      { id: 'both', label: 'On both', small: 'nothing changes', effect: [] },
    ],
  }];
  return f;
}

/** YouTube Shorts before it goes out (board 18, 18:10): the days it took not confirmed, its description using them,
 *  its tags apart, three frames to pick the thumbnail from. Reddit is out (without the fact). */
export function shortsRelease(): ReleaseFile {
  const f = boardRelease();
  const days = f.facts.find((x) => x.id === 'days')!;
  delete days.value;
  delete days.confirmedAt;
  fld(f, 'reddit', 'comment').text = 'Made alone with Seedance 2.5 on Higgsfield. Happy to answer how.';
  const yt = plat(f, 'youtube-shorts');
  yt.send = {};
  yt.upload.hand = yt.upload.hand.map(({ id, text }) => ({ id, text }));
  yt.thumbnail = {
    where: 'the frame to pick in YouTube', pick: 'face',
    options: [{ id: 'face', at: 12, does: 'her face, looking up' }, { id: 'bottle', at: 31, does: 'the bottle in the weed' }, { id: 'light', at: 64, does: 'the answering light' }],
  };
  plat(f, 'instagram-reels').send = {};
  return f;
}

/** One cover frame for all, at the board's clock: the Shorts sample with the days confirmed, and TikTok and
 *  Instagram Reels given the same three frames as YouTube, "her face" picked on all three, so a pick on one reaches
 *  the others. */
export function coverRelease(): ReleaseFile {
  const f = shortsRelease();
  const days = f.facts.find((x) => x.id === 'days')!;
  days.value = '6';
  days.confirmedAt = at('18:12');
  const yt = plat(f, 'youtube-shorts').thumbnail!;
  plat(f, 'tiktok').thumbnail = { where: 'the cover frame to pick in TikTok', pick: yt.pick, options: yt.options.map((o) => ({ ...o })) };
  plat(f, 'instagram-reels').thumbnail = { where: 'the cover to pick in Instagram', pick: yt.pick, options: yt.options.map((o) => ({ ...o })) };
  // X with a reply (ASKS 58): posted by hand as a reply to the post
  plat(f, 'x').fields.push({ id: 'reply', label: 'Reply', part: 'reply', text: REPLY_TEXT, pick: 'a', aim: { max: 200, words: 'one line, who made it and with what' },
    candidates: [{ id: 'a', text: REPLY_TEXT, does: 'who made it' }, { id: 'b', text: 'Made alone, start to finish, in Hitchcock Harness.', does: 'shorter' }],
    readByAlma: { at: at('18:30'), text: REPLY_TEXT } });
  // its steps by hand (the reply's own step is the page's, after the post's)
  plat(f, 'x').upload.hand = [step('save', 'Save the video to this Mac'), step('copy', 'Copy the post'), step('open', 'Open X'), step('link', 'Paste the post\'s link')];
  return f;
}
export const REPLY_TEXT = 'Written and directed by me, and edited in Hitchcock Harness. The voices and the pictures are made on Higgsfield.';

/** The final named, no platforms yet. */
export function emptyRelease(): ReleaseFile {
  const f = boardRelease();
  return { v: 1, day: f.day, final: f.final, facts: [], platforms: [] };
}

/** Each sample's release file as seeded (the route keeps changes in memory). */
export const RELEASE_SEEDS: Record<string, () => ReleaseFile> = {
  'sample-release-open': boardRelease,
  'sample-release-checked': checkedRelease,
  'sample-release-shorts': shortsRelease,
  'sample-release-empty': emptyRelease,
  'sample-release-cover': coverRelease,
};

// ---- the older film with a kit (today's Release page, unchanged)

const KIT = `# Sample · an older film with a kit: social kit

The files: FINAL captioned, FINAL clean, FINAL captioned 480p.

## TikTok

Upload the FINAL captioned file. Turn on AI-generated content.

**Caption, pick one:**

\`\`\`
A. A ferryman counts the boats that come home.  46 characters
B. One boat is still out.  25 characters
\`\`\`

## YouTube Shorts

**Title, pick one:**

\`\`\`
A. The Ferry
B. He counts the boats
\`\`\`

## Posting order

1. 18:00 your time: YouTube Shorts
2. 19:00 your time: TikTok
`;
export function sampleKitRelease(slug: string): ReleaseInfo {
  return {
    film: slug, delivery: [], thumbs: { rounds: [], plain: [] }, kit: { path: 'social/kit.md', ...parseKit(KIT) },
    checklist: { general: [], from: 'the Release stage note', available: false }, picks: [], warnings: [],
  };
}

// ---- stage 3 (sending it): the moments of the boards Posted and Phone, each a sample film of its own, made from
// the board's release at 18:52 (boardRelease) moved on to that moment. Every post is made by hand: the test hook
// (POST …/release/alma, sample-data mode only) plays Alma's part, recording the post and its link.
//   sample-release-posted   TikTok posted by hand at 19:05 with its link, every step done
//   sample-release-hand     TikTok at step 4 of 5; Reddit posted at 18:04, link to add
Object.assign(RELEASE_SAMPLES, {
  'sample-release-posted': ref('sample-release-posted', 'Sample release · posted', 12),
  'sample-release-hand': ref('sample-release-hand', 'Sample release · by hand', 12),
});
/** The clock of each stage-3 sample's moment, as the tests pass it (?now=). */
export const SEND_NOW: Record<string, string> = {
  'sample-release-posted': '2026-11-14T19:06', 'sample-release-hand': '2026-11-14T19:04',
};
export const TIKTOK_LINK = 'https://www.tiktok.com/@sample_studio/video/7439182650123456789';

function moment(slug: string): ReleaseFile | undefined {
  const f = boardRelease();
  const tt = f.platforms.find((p) => p.id === 'tiktok')!;
  switch (slug) {
    case 'sample-release-posted':
      tt.upload.hand = [step('save', 'Save the video', at('19:01')), step('copy', 'Copy the caption', at('19:01')), step('open', 'Open TikTok', at('19:02')),
        step('checks', 'I turned on AI-generated content and turned off auto-captions', at('19:04')), step('link', 'Paste the post\'s link', at('19:05'))];
      tt.send = { posted: { at: at('19:05'), link: TIKTOK_LINK } };
      break;
    case 'sample-release-hand': {
      tt.upload.hand = [step('save', 'Save the video', at('18:58')), step('copy', 'Copy the caption', at('18:59')), step('open', 'Open TikTok', at('19:00')),
        step('checks', 'I turned on AI-generated content and turned off auto-captions'), step('link', 'Paste the post\'s link')];
      const rd = f.platforms.find((p) => p.id === 'reddit')!;
      rd.send = { posted: { at: at('18:04') } };
      rd.upload.hand = rd.upload.hand.map((s) => (s.id === 'link' ? { id: s.id, text: s.text } : s));
      break;
    }
    default: return undefined;
  }
  return f;
}
/** The release a sample film starts from (sample-data mode): the board's, or a stage-3 moment. */
export const releaseSeed = (slug: string): ReleaseFile | undefined => RELEASE_SEEDS[slug]?.() ?? moment(slug);

// ---- the Release QC: the shape of a real release as Alma writes it, and the longest content
//   sample-release-today  as a film stands at 16:33 on the day: six platforms, nothing picked but YouTube's
//                         first description line (changed since Alma read it), YouTube with five fields and nine
//                         frames for its thumbnail, Reddit by hand in six steps with comments of 600 to 700
//                         characters, LinkedIn's of nearly 800, the days it took not confirmed and used in three.
//                         The words are invented; the lengths, counts and states are a real release's.
//   sample-release-long   the same, stretched: a long caption picked, a long title, a long account name, a long link,
//                         seven tags, six notes from Alma on one field
export const TODAY_NOW = '2026-11-14T16:33';
/** Invented words of about `n` characters, cut at a word. */
const words = (n: number, seed = 0): string => {
  const src = 'The keeper walks the shore below the tower at low tide and finds a green bottle in the weed with a rolled letter inside, and the boy who rows the post out asks who would ever write to a lighthouse. That night she turns the lamp off and on twice, and far out on the water a small light blinks back. The sea is very calm and neither of them quite knows whether to laugh or to wait. '.repeat(4);
  const from = src.indexOf(' ', seed % 97) + 1;
  const s = src.charAt(from).toUpperCase() + src.slice(from + 1);
  if (s.length <= n) return s.trim();
  const cut = s.slice(0, n);
  return cut.slice(0, cut.lastIndexOf(' ')).trim() + '.';
};
const cands = (lens: number[], does: number[], seed = 0) => lens.map((n, i) => ({ id: String.fromCharCode(97 + i), text: words(n, seed + i * 13), does: words(does[i], 200 + seed + i * 7).replace(/\.$/, '').toLowerCase() }));
const read = (text: string) => ({ readByAlma: { at: at('15:58'), text } });

export function todayRelease(): ReleaseFile {
  const f = boardRelease();
  const yLine1 = cands([90, 69, 43], [54, 30, 38], 3);
  const first = cands([90, 69, 43], [54, 30, 38], 3);
  const credit = cands([59, 32], [10, 7], 21);
  const tagsC = [{ id: 'a', text: '#aifilm #drama #lighthouse #shortfilm', does: 'your usual four and one more, as last time' }, { id: 'b', text: '#aifilm #drama #lighthouse #sea #shortfilm #ai', does: 'six, with the sea and the plain tag' }];
  const sh = (others: string[], c: { id: string; text: string; does: string }[]) => ({ text: '', candidates: c, sharedWith: others, ...read('') });
  const upload = (bufferSets: { label: string; value: string }[], after: string[], hand: [string, string][] = []) => ({ bufferSets, after: after.map((t, i) => step(`after${i}`, t)), hand: hand.map(([id, t]) => step(id, t)) });
  return {
    v: 1, day: SAMPLE_DAY,
    final: { ...f.final!, path: 'cut/renders/v236-master-lufs-14.mp4', version: 'v236', namedAt: at('11:44') },
    facts: [{ id: 'days', label: 'the days it took', many: true, sentence: 'Days it took ___' }],
    platforms: [
      {
        id: 'reddit', kind: 'reddit', name: 'Reddit', account: 'your personal account, r/aivideo', route: 'hand', wave: { day: 'today', about: '18:00' },
        fields: [
          { id: 'title', label: 'Title', part: 'title', text: '', candidates: cands([36, 31, 33], [20, 40, 21], 5), aim: { max: 60, words: 'under 60 characters, so it reads whole in a feed' }, ...read('') },
          { id: 'comment', label: 'First comment', part: 'comment', text: '', candidates: [{ id: 'a', text: `Made alone in {days} days. ${words(640, 9)}`, does: 'how it was made, with the tools and the hours' }, { id: 'b', text: words(626, 31), does: 'the story first, then how it was made, in one long go' }], ...read('') },
        ],
        upload: upload([], [], [['save', 'Save the video'], ['open', 'Open r/aivideo and start a new post with video'], ['copy-title', 'Copy the title'], ['flair', 'Pick the flair "AI video" there'], ['copy-comment', 'Copy the first comment and post it under the video'], ['link', 'Paste the post\'s link']]),
        send: {},
      },
      {
        id: 'youtube-shorts', kind: 'youtube-shorts', name: 'YouTube Shorts', account: 'Sample Studio', route: 'hand', wave: { day: 'today', about: '18:00' },
        fields: [
          { id: 'title', label: 'Title', part: 'title', text: '', candidates: cands([53, 53, 52], [35, 30, 20], 11), aim: { min: 41, max: 70, words: '41 to 70 characters, the premise in the first words' }, ...read('') },
          { id: 'line1', label: 'Description, first line', part: 'description', text: yLine1[0].text, pick: 'a', candidates: yLine1, ...read('') },
          { id: 'credits', label: 'Description, credits', part: 'description', text: '', candidates: [{ id: 'a', text: `Made alone in {days} days. ${words(130, 40)}`, does: 'the days, the source and the voices in one' }], ...read('') },
          { id: 'tools', label: 'Description, tools', part: 'description', text: '', candidates: cands([159, 188], [27, 25], 50), ...read('') },
          { id: 'tags', label: 'Tags', part: 'tags', tags: true, text: '', candidates: [{ id: 'a', text: 'lighthouse, keeper, letter, bottle, sea, island, drama, short film, ai film', does: 'nine, the things first and the kind of film last' }], ...read('') },
        ],
        thumbnail: {
          where: 'the frame to pick in YouTube Studio',
          options: [12, 31, 64, 5, 44, 60, 26, 43, 63].map((t, i) => ({ id: `frame-${i + 1}`, at: t, does: words(65 + (i * 7) % 26, 300 + i * 11).replace(/\.$/, '') })),
        },
        upload: upload([], [], [['save', 'Save the video'], ['open', 'Open YouTube Studio and upload it'], ['title', 'Copy the title'], ['description', 'Copy the description'], ['tags', 'Copy the tags'],
          ['settings', 'I turned on altered or synthetic content, set it public, not made for kids, in Film & Animation'], ['captions', 'I checked automatic captions are off'], ['link', 'Paste the post\'s link']]),
        send: {},
      },
      {
        id: 'tiktok', kind: 'tiktok', name: 'TikTok', account: 'sample_studio', route: 'hand', wave: { day: 'today', about: '19:00' },
        fields: [
          { id: 'first', label: 'First line', ...sh(['instagram-reels'], first), aim: { max: 90, words: 'under 90, so the feed shows it whole' } },
          { id: 'credit', label: 'Credit line', ...sh(['instagram-reels'], credit) },
          { id: 'tags', label: 'Tags', tags: true, ...sh(['instagram-reels'], tagsC) },
        ],
        upload: upload([], [], [['save', 'Save the video to this phone'], ['copy', 'Copy the caption'], ['ai', 'Turn on AI-generated content'], ['captions-off', 'Turn off auto-captions there'], ['link', 'Paste the post\'s link']]),
        send: {},
      },
      {
        id: 'instagram-reels', kind: 'instagram-reels', name: 'Instagram Reels', account: 'sample_studio', also: ['Facebook', 'Threads'], route: 'hand', wave: { day: 'today', about: '19:00' },
        fields: [
          { id: 'first', label: 'First line', ...sh(['tiktok'], first), aim: { max: 90, words: 'under 90, so the feed shows it whole' } },
          { id: 'credit', label: 'Credit line', ...sh(['tiktok'], credit) },
          { id: 'tags', label: 'Tags', tags: true, ...sh(['tiktok'], tagsC) },
        ],
        upload: upload([], [], [['save', 'Save the video to this phone'], ['copy', 'Copy the caption'], ['before', 'In Instagram: post it as a reel shared to the feed, turn on AI info, check the cover frame'], ['link', 'Paste the post\'s link'],
          ['story', 'Share it to your story with the sticker that links to the reel, then pin it on the profile']]),
        send: {},
      },
      {
        id: 'x', kind: 'x', name: 'X', account: 'sample_x', route: 'hand', wave: { day: 'today', about: '21:00' },
        fields: [{ id: 'text', label: 'Post', text: '', candidates: cands([181, 181], [36, 28], 60), aim: { max: 240, words: 'under 240, room for the video card' }, ...read('') }],
        upload: upload([], [], [['save', 'Save the video to this Mac'], ['copy', 'Copy the post'], ['open', 'Open X'], ['ai', 'Turn on the AI-generated label'], ['link', 'Paste the post\'s link'],
          ['handles', 'Reply with the handles of the tools you used'], ['more', words(119, 70)]]),
        send: {},
      },
      {
        id: 'linkedin', kind: 'linkedin', name: 'LinkedIn', account: 'your own profile', route: 'hand', wave: { day: 'tomorrow', about: '09:00' },
        fields: [{ id: 'text', label: 'Post', text: '', candidates: [{ id: 'a', text: `I made a one-minute film alone in {days} days. ${words(720, 80)}`, does: 'the making, then the story, then a question at the end' }, { id: 'b', text: words(408, 90), does: 'the story first, shorter and plainer' }], aim: { words: 'one long post, a few short paragraphs, the question at the end, no hashtags' }, ...read('') }],
        upload: upload([], [], [['save', 'Save the video to this Mac'], ['open', 'Open LinkedIn and start a post with the video, uploaded natively, not as a link to YouTube'], ['copy', 'Copy the post'], ['link', 'Paste the post\'s link']]),
        send: {},
      },
    ],
  };
}

/** The longest content the pages must hold. */
export function longRelease(): ReleaseFile {
  const f = todayRelease();
  const p = (id: string) => f.platforms.find((x) => x.id === id)!;
  f.facts[0] = { ...f.facts[0], value: '6', confirmedAt: at('16:00') };
  // a long caption picked on TikTok and Instagram (their own text, over the aim)
  for (const id of ['tiktok', 'instagram-reels']) {
    const k = p(id).fields.find((x) => x.id === 'first')!;
    Object.assign(k, { text: words(520, 2), own: true });
    const t = p(id).fields.find((x) => x.id === 'tags')!;
    Object.assign(t, { text: '#aifilm #drama #lighthouse #sea #shortfilm #messageinabottle #lighthousekeeper', own: true });
  }
  // a long title on YouTube, seven tags
  Object.assign(p('youtube-shorts').fields[0], { text: words(98, 4), pick: undefined, own: true });
  Object.assign(p('youtube-shorts').fields[4], { text: 'lighthouse, letter, sea, drama, short film, ai film, the keeper who answered a letter in a bottle with her lamp', own: true });
  // a long account name and a long link: Reddit posted
  p('reddit').account = 'your personal account, posting to r/aivideo and r/filmmakers and r/shortfilms';
  p('reddit').fields.forEach((k) => Object.assign(k, { text: k.candidates[0].text, pick: 'a' }));
  p('reddit').send = { posted: { at: at('16:10'), link: 'https://www.reddit.com/r/aivideo/comments/1gx4k2zq9/i_made_a_one_minute_film_alone_about_a_lighthouse_keeper_who_finds_a_letter_in_a_bottle/' } };
  // six notes on X's post
  const x = p('x').fields[0];
  Object.assign(x, { text: x.candidates[0].text, pick: 'a' });
  x.notes = Array.from({ length: 6 }, (_, i) => ({
    id: `n${i + 1}`, at: at('16:20'), text: words(120 + i * 30, 10 + i * 17), ...(i % 2 ? {} : { proposal: words(150, 20 + i * 5) }),
    actions: [
      { id: 'use', label: i === 0 ? 'Use it on X and keep the line about the lamp' : 'Use it on X', effect: [{ kind: 'set' as const, field: 'text', platforms: ['x'], text: words(150, 20 + i * 5) }], small: i === 0 ? 'replaces your post with hers, the question kept at the end' : undefined },
      { id: 'keep', label: 'Keep yours', effect: [], small: 'nothing changes' },
    ],
  }));
  // LinkedIn's long post picked
  const li = p('linkedin');
  Object.assign(li.fields[0], { text: li.fields[0].candidates[1].text, pick: 'b' });
  return f;
}

Object.assign(RELEASE_SAMPLES, {
  'sample-release-today': ref('sample-release-today', 'Sample · the day of the release', 12),
  'sample-release-long': ref('sample-release-long', 'Sample · the longest texts, names and links a release can have', 12),
});
Object.assign(RELEASE_SEEDS, { 'sample-release-today': todayRelease, 'sample-release-long': longRelease });

// ---- a field's candidates as radio options with their whole text
//   sample-release-radios  the day's release as Alma writes it now: Reddit's title the user's own words with three
//                          candidates, its first comment of about 450 characters to pick from three, and TikTok's
//                          caption shared with Instagram; each field with the note that offered its candidates as two
//                          buttons ("Use it", "Use this one instead"), which the options now replace.
export const RADIO_COMMENT = 'Made with Hitchcock Harness, the app I use to make these films with one agent.\nThe story: a lighthouse keeper on a rock finds a letter in a bottle, and it is in his own handwriting.\nThe hardest part was the lamp room: Seedance kept lighting the lamp in the day, and the whole film waits for night.\nWhat would you have cut? I read every comment.';
export function radiosRelease(): ReleaseFile {
  const f = todayRelease();
  const p = (id: string) => f.platforms.find((x) => x.id === id)!;
  const plainNote = (id: string, text: string, platforms: string[], field: string, a: string, b: string) => ({
    id, at: at('16:20'), text,
    actions: [
      { id: 'a', label: 'Use it', effect: [{ kind: 'set' as const, field, platforms, text: a }], small: a.slice(0, 80) },
      { id: 'b', label: 'Use this one instead', effect: [{ kind: 'set' as const, field, platforms, text: b }], small: b.slice(0, 80) },
    ],
  });
  const title = [
    { id: 'a', text: 'A lighthouse keeper finds a letter in his own handwriting', does: 'the premise, flat' },
    { id: 'b', text: 'Maren reads the letter. Tobias says he never wrote it.', does: 'premise with a turn' },
    { id: 'c', text: 'The letter in the bottle', does: 'short' },
  ];
  const comment = [
    { id: 'a', text: RADIO_COMMENT, does: 'source, the app, the hardest part, a question (your last film’s shape)' },
    { id: 'b', text: 'Made with Hitchcock Harness.\nAn original story.\nSeedance 2.5 on Higgsfield, voices on Higgsfield.', does: 'source and the app only' },
    { id: 'c', text: 'Happy to answer how it was made.', does: 'one line' },
  ];
  const rd = p('reddit');
  rd.fields = [
    { id: 'title', label: 'Title', part: 'title', text: 'The keeper who wrote himself a letter', own: true, candidates: title, aim: { max: 60, words: 'under 60 characters, so it reads whole in a feed' },
      notes: [plainNote('n-title', 'The premise said flatly, the way your last title went.', ['reddit'], 'title', title[0].text, title[1].text)], readByAlma: { at: at('15:58'), text: '' } },
    { id: 'comment', label: 'First comment', part: 'comment', text: '', candidates: comment,
      notes: [plainNote('n-comment', 'Your last film’s comment, with this film’s source and hardest part.', ['reddit'], 'comment', comment[0].text, comment[1].text)], readByAlma: { at: at('15:58'), text: '' } },
  ];
  f.facts[0] = { ...f.facts[0], value: '6', confirmedAt: at('16:00') };
  const tt = p('tiktok').fields.find((x) => x.id === 'first')!;
  tt.notes = [plainNote('n-first', 'The premise in one line; the twist stays out.', ['tiktok', 'instagram-reels'], 'first', tt.candidates[0].text, tt.candidates[1].text)];
  return f;
}
Object.assign(RELEASE_SAMPLES, { 'sample-release-radios': ref('sample-release-radios', 'Sample · the texts to choose from', 12) });
Object.assign(RELEASE_SEEDS, { 'sample-release-radios': radiosRelease });
