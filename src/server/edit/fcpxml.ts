// FCPXML 1.10 of a timeline version, for Resolve (the colour escape hatch). The lowest video track
// is the spine (clips and gaps); every other clip is a connected clip on its lane (video above, sound below), hung on
// the spine item it starts over, with its offset in that item's own time. Picture and sound are separate here as in
// the timeline: spine clips carry srcEnable="video", sound clips srcEnable="audio". Fades and captions are not
// exported (Resolve's free edition does not read FCPXML fades; captions go as the SRT).
import { realpathSync } from 'node:fs';
import type { FilmTarget } from '../actions/film';
import type { Timeline, TimelineClip, TimelineTrack } from '../types';
import { probe } from './probe';
import { clipLength, resolveSrc, timelineLength } from './timeline';

const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');

export async function toFcpxml(film: FilmTarget, t: Timeline): Promise<string> {
  const fps = t.fps;
  const fr = (sec: number): number => Math.round(sec * fps);
  const time = (frames: number): string => (frames % fps === 0 ? `${frames / fps}s` : `${frames}/${fps}s`);
  const order = (a: TimelineTrack, b: TimelineTrack): number => Number(/\d+/.exec(a.id)?.[0] ?? 0) - Number(/\d+/.exec(b.id)?.[0] ?? 0);
  const video = t.tracks.filter((x) => x.kind === 'video').sort(order);
  const audio = t.tracks.filter((x) => x.kind === 'audio').sort(order);

  // resources: one asset per source file
  const assets = new Map<string, { id: string; xml: string }>();
  const assetOf = async (c: TimelineClip): Promise<string> => {
    const hit = assets.get((c.src ?? ''));
    if (hit) return hit.id;
    const file = resolveSrc(film, (c.src ?? ''))!;
    let real = file;
    try {
      real = realpathSync(file);
    } catch { /* missing: Resolve shows it offline */ }
    const p = await probe(file);
    const id = `r${assets.size + 2}`;
    const name = (c.src ?? '').split('/').pop()!;
    const dur = p?.duration ? time(Math.round(p.duration * fps)) : time(fr(c.out));
    const url = 'file://' + real.split('/').map(encodeURIComponent).join('/');
    assets.set((c.src ?? ''), {
      id,
      xml: `    <asset id="${id}" name="${esc(name)}" start="0s" duration="${dur}" hasVideo="${p?.video ? 1 : 0}" hasAudio="${p?.audio ? 1 : 0}"${p?.video ? ' format="r1"' : ''}${p?.audio ? ' audioSources="1" audioChannels="2"' : ''}>\n      <media-rep kind="original-media" src="${esc(url)}"/>\n    </asset>`,
    });
    return id;
  };

  interface SpineItem { at: number; n: number; start: number; open: string; children: string[]; close: string }
  const spine: SpineItem[] = [];
  const total = fr(timelineLength(t));
  const gap = (at: number, n: number): void => {
    spine.push({ at, n, start: at, open: `<gap name="Gap" offset="${time(at)}" start="${time(at)}" duration="${time(n)}">`, children: [], close: '</gap>' });
  };
  const timeMap = (c: TimelineClip, n: number): string =>
    c.speed && c.speed !== 1 ? `\n          <timeMap><timept time="0s" value="0s" interp="linear"/><timept time="${time(n)}" value="${time(Math.round(n * c.speed))}" interp="linear"/></timeMap>` : '';
  const clipXml = async (c: TimelineClip, lane: number | undefined, kind: 'video' | 'audio', offsetFr: number): Promise<{ open: string; body: string; n: number; start: number }> => {
    const n = Math.max(1, fr(c.at + clipLength(c)) - fr(c.at));
    const start = fr(c.in);
    const gain = kind === 'audio' && c.gain ? `\n          <adjust-volume amount="${c.gain}dB"/>` : '';
    const open = `<asset-clip ref="${await assetOf(c)}"${lane !== undefined ? ` lane="${lane}"` : ''} offset="${time(offsetFr)}" start="${time(start)}" duration="${time(n)}" name="${esc(c.label ?? c.id)}" srcEnable="${kind}"${c.muted ? ' enabled="0"' : ''}${kind === 'video' ? ' format="r1"' : ''}>`;
    return { open, body: `${timeMap(c, n)}${gain}`, n, start };
  };

  // the spine: the lowest video track with black gaps
  let cursor = 0;
  for (const c of video[0]?.clips ?? []) {
    const at = fr(c.at);
    if (at < cursor) continue;
    if (at > cursor) gap(cursor, at - cursor);
    const x = await clipXml(c, undefined, 'video', at);
    spine.push({ at, n: x.n, start: x.start, open: x.open + x.body, children: [], close: '</asset-clip>' });
    cursor = at + x.n;
  }
  if (cursor < total || !spine.length) gap(cursor, Math.max(1, total - cursor));

  // everything else hangs on the spine item it starts over
  const host = (at: number): SpineItem => spine.find((s) => at >= s.at && at < s.at + s.n) ?? spine[spine.length - 1];
  const attach = async (tracks: TimelineTrack[], kind: 'video' | 'audio', laneOf: (i: number) => number): Promise<void> => {
    for (const [i, tr] of tracks.entries()) {
      for (const c of tr.clips) {
        const at = fr(c.at);
        const h = host(at);
        const x = await clipXml({ ...c, muted: c.muted || tr.muted }, laneOf(i), kind, h.start + (at - h.at));
        h.children.push(`${x.open}${x.body}${x.body ? '\n        ' : ''}</asset-clip>`);
      }
    }
  };
  await attach(video.slice(1), 'video', (i) => i + 1);
  await attach(audio, 'audio', (i) => -(i + 1));
  for (const m of t.markers) {
    const at = fr(m.at);
    const h = host(at);
    h.children.push(`<marker start="${time(h.start + (at - h.at))}" duration="${time(1)}" value="${esc(m.text.slice(0, 250))}"/>`);
  }

  const body = spine.map((s) => s.children.length
    ? `        ${s.open}\n${s.children.map((c) => `          ${c}`).join('\n')}\n        ${s.close}`
    : `        ${s.open}${s.close}`).join('\n');
  const title = `${film.title} · ${t.version}`;
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE fcpxml>
<fcpxml version="1.10">
  <resources>
    <format id="r1" name="FFVideoFormat${t.width}x${t.height}p${fps}" frameDuration="1/${fps}s" width="${t.width}" height="${t.height}"/>
${[...assets.values()].map((a) => a.xml).join('\n')}
  </resources>
  <library>
    <event name="${esc(film.title)}">
      <project name="${esc(title)}">
        <sequence format="r1" duration="${time(Math.max(total, 1))}" tcStart="0s" tcFormat="NDF" audioLayout="stereo" audioRate="48k">
          <spine>
${body}
          </spine>
        </sequence>
      </project>
    </event>
  </library>
</fcpxml>
`;
}
