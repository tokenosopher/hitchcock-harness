"""Render a harness cut version (cut/v<n>.json) at 480p: full quality, with or without the music (Flow v3.3 - 11 Sound and
music, step 29: the dialogue the music is mixed against).

  .venv/bin/python tools/finish/cut_render.py "$FILM" cut/v<n>.json OUT.mp4 [--no-music] [--tracks IDS] [--size 480x854] [--crf 12]

The filter graph is the app's own (src/server/edit/render.ts in the Hitchcock Harness folder): V1 is a concat of its clips
with black in the gaps, upper video tracks are overlaid, every sound clip is trimmed, retimed, levelled, faded and
delayed to its place, then mixed without normalising. --no-music leaves out every sound clip whose file sits under
audio/music/; --tracks keeps only the named audio tracks; --no-cards leaves out the title cards' sound; --sound-only
writes the mix alone as a WAV (the stems of a cut are made this way). Captions tracks are not drawn. Prints the frame count and what was left out.
"""
import argparse
import json
import os
import subprocess
import sys
import tempfile


def frame_of(t, fps):
    return int(round(t * fps))


def clip_len(c):
    sp = c.get('speed') or 1
    return (c['out'] - c['in']) / sp


def atempo(speed):
    out = []
    s = speed
    while s > 2.0:
        out.append('atempo=2.0')
        s /= 2.0
    while s < 0.5:
        out.append('atempo=0.5')
        s /= 0.5
    if abs(s - 1) > 1e-6:
        out.append('atempo=%.6f' % s)
    return out


def has_audio(path):
    r = subprocess.run(['ffprobe', '-v', 'error', '-select_streams', 'a', '-show_entries', 'stream=index', '-of', 'csv=p=0', path],
                       stdout=subprocess.PIPE, universal_newlines=True)
    return bool(r.stdout.strip())


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('film')
    ap.add_argument('cut')
    ap.add_argument('out')
    ap.add_argument('--no-music', action='store_true')
    ap.add_argument('--cards-only', action='store_true', help='only the title cards\' sound')
    ap.add_argument('--music-only', action='store_true', help='only the sound clips under audio/music/')
    ap.add_argument('--tracks', help='sound from these audio track ids only, e.g. A1,A5')
    ap.add_argument('--no-cards', action='store_true', help='leave out sound clips whose label starts with "Title card"')
    ap.add_argument('--sound-only', action='store_true', help='write the mix alone as a 48 kHz WAV')
    ap.add_argument('--size', default='480x854')
    ap.add_argument('--crf', default='12')
    a = ap.parse_args()
    film = os.path.abspath(a.film)
    repo = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))   # the studio folder: clip paths are relative to it
    t = json.load(open(a.cut if os.path.isabs(a.cut) else os.path.join(film, a.cut)))
    fps = t['fps']
    w, h = [int(x) for x in a.size.split('x')]
    if os.path.exists(a.out):
        sys.exit('exists, not overwritten: ' + a.out)

    def src(c):
        p = c['src']
        return p if os.path.isabs(p) else os.path.join(repo, p)

    tracks = [tr for tr in t['tracks'] if not tr.get('muted')]
    solo = [tr for tr in tracks if tr.get('solo')]
    video = [tr for tr in tracks if tr['kind'] == 'video']
    audio = [tr for tr in (solo if any(s['kind'] == 'audio' for s in solo) else tracks) if tr['kind'] == 'audio']
    total = max(c['at'] + clip_len(c) for tr in t['tracks'] for c in tr['clips'])
    frames = max(1, frame_of(total, fps))
    T = frames / float(fps)
    inputs, filters = [], []
    fit = 'scale=%d:%d:force_original_aspect_ratio=decrease:flags=lanczos,pad=%d:%d:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1' % (w, h, w, h)

    def add(path):
        inputs.extend(['-i', path])
        return len(inputs) // 2 - 1

    def picture(c, label, alpha):
        sp = c.get('speed') or 1
        n = max(1, frame_of(c['at'] + clip_len(c), fps) - frame_of(c['at'], fps))
        i = add(src(c))
        chain = ['trim=start=%.6f' % max(0, c['in'] - 0.5 / fps), 'setpts=(PTS-STARTPTS)/%s' % sp, 'fps=%d' % fps,
                 'tpad=stop_mode=clone:stop=%d' % n, 'trim=end_frame=%d' % n, 'setpts=PTS-STARTPTS', fit,
                 'format=yuva420p' if alpha else 'format=yuv420p']
        ln = n / float(fps)
        if c.get('fadeIn'):
            chain.append('fade=t=in:st=0:d=%.3f%s' % (c['fadeIn'], ':alpha=1' if alpha else ''))
        if c.get('fadeOut'):
            chain.append('fade=t=out:st=%.3f:d=%.3f%s' % (max(0, ln - c['fadeOut']), c['fadeOut'], ':alpha=1' if alpha else ''))
        filters.append('[%d:v]%s[%s]' % (i, ','.join(chain), label))
        return n

    segs, cursor, gaps = [], 0, 0
    base = video[0] if video else {'clips': []}
    for k, c in enumerate([c for c in sorted(base['clips'], key=lambda c: c['at']) if not c.get('muted')]):
        start = frame_of(c['at'], fps)
        if start < cursor:
            continue
        if start > cursor:
            filters.append('color=c=black:s=%dx%d:r=%d:d=%.3f,trim=end_frame=%d,setsar=1,format=yuv420p[g%d]' % (w, h, fps, (start - cursor) / float(fps) + 1, start - cursor, gaps))
            segs.append('[g%d]' % gaps)
            gaps += 1
        n = picture(c, 'b%d' % k, False)
        segs.append('[b%d]' % k)
        cursor = start + n
    if cursor < frames:
        filters.append('color=c=black:s=%dx%d:r=%d:d=%.3f,trim=end_frame=%d,setsar=1,format=yuv420p[g%d]' % (w, h, fps, (frames - cursor) / float(fps) + 1, frames - cursor, gaps))
        segs.append('[g%d]' % gaps)
        gaps += 1
    filters.append('%sconcat=n=%d:v=1:a=0[vb0]' % (''.join(segs), len(segs)))
    v, ov = 'vb0', 0
    for tr in video[1:]:
        for c in [c for c in tr['clips'] if not c.get('muted')]:
            l = 'o%d' % ov
            picture(c, l + 'p', True)
            filters.append('[%sp]setpts=PTS+%.3f/TB[%s]' % (l, frame_of(c['at'], fps) / float(fps), l))
            filters.append('[%s][%s]overlay=eof_action=pass:repeatlast=0:format=auto[v%d]' % (v, l, ov + 1))
            v = 'v%d' % (ov + 1)
            ov += 1
    filters.append('[%s]trim=end_frame=%d,setpts=PTS-STARTPTS,format=yuv420p[vout]' % (v, frames))

    mix, left_out = [], []
    only = set(a.tracks.split(',')) if a.tracks else None
    for tr in audio:
        if only is not None and tr['id'] not in only:
            continue
        for c in [c for c in tr['clips'] if not c.get('muted')]:
            if a.music_only and '/audio/music/' not in c['src']:
                continue
            if a.cards_only and not c.get('label', '').startswith('Title card'):
                continue
            if (a.no_music and '/audio/music/' in c['src']) or (a.no_cards and c.get('label', '').startswith('Title card')):
                left_out.append('%s %s' % (tr['id'], c.get('label', c['id'])))
                continue
            f = src(c)
            if not has_audio(f):
                continue
            sp = c.get('speed') or 1
            ln = clip_len(c)
            i = add(f)
            chain = ['atrim=start=%.6f:end=%.6f' % (c['in'], c['out']), 'asetpts=PTS-STARTPTS', 'aresample=48000',
                     'aformat=sample_fmts=fltp:channel_layouts=stereo'] + atempo(sp) + ['atrim=end=%.3f' % ln]
            if c.get('gain'):
                chain.append('volume=%sdB' % c['gain'])
            if c.get('fadeIn'):
                chain.append('afade=t=in:st=0:d=%.3f' % c['fadeIn'])
            if c.get('fadeOut'):
                chain.append('afade=t=out:st=%.3f:d=%.3f' % (max(0, ln - c['fadeOut']), c['fadeOut']))
            ms = int(round(c['at'] * 1000))
            if ms > 0:
                chain.append('adelay=%d:all=1' % ms)
            filters.append('[%d:a]%s[a%d]' % (i, ','.join(chain), len(mix)))
            mix.append('[a%d]' % len(mix))
    # a silent bed from 0 to the end: without it a mix whose first clip starts late comes out shifted to that clip's start
    filters.append('anullsrc=r=48000:cl=stereo,atrim=end=%.3f[a%d]' % (T, len(mix)))
    mix.insert(0, '[a%d]' % len(mix))  # first: amix takes its time origin from its first input
    tail = 'apad=whole_dur=%.3f,atrim=end=%.3f[aout]' % (T, T)
    if not mix:
        filters.append('anullsrc=r=48000:cl=stereo,' + tail)
    elif len(mix) == 1:
        filters.append(mix[0] + tail)
    else:
        filters.append('%samix=inputs=%d:normalize=0:duration=longest:dropout_transition=0,%s' % (''.join(mix), len(mix), tail))

    if a.sound_only:  # the sound graph alone: the picture filters would end the run early
        filters = [f for f in filters if f.startswith('anullsrc') or 'amix=' in f or f.endswith('[aout]') or (f.startswith('[') and f.split(']')[0].endswith(':a'))]
    with tempfile.NamedTemporaryFile('w', suffix='.txt', delete=False) as fh:
        fh.write(';\n'.join(filters))
        script = fh.name
    os.makedirs(os.path.dirname(os.path.abspath(a.out)), exist_ok=True)
    cmd = ['ffmpeg', '-hide_banner', '-nostdin', '-n', '-v', 'error'] + inputs + ['-filter_complex_script', script, '-map', '[vout]', '-map', '[aout]',
           '-r', str(fps), '-frames:v', str(frames), '-c:v', 'libx264', '-preset', 'slow', '-crf', str(a.crf), '-pix_fmt', 'yuv420p',
           '-color_primaries', 'bt709', '-color_trc', 'bt709', '-colorspace', 'bt709', '-c:a', 'aac', '-b:a', '256k', '-movflags', '+faststart', a.out]
    if a.sound_only:
        cmd = ['ffmpeg', '-hide_banner', '-nostdin', '-n', '-v', 'error'] + inputs + ['-filter_complex_script', script, '-map', '[aout]', '-c:a', 'pcm_s24le', '-ar', '48000', a.out]
    r = subprocess.run(cmd)
    os.unlink(script)
    if r.returncode:
        sys.exit('ffmpeg failed')
    print('wrote %s: %d frames (%.3f s), %dx%d, %d sound clips mixed' % (a.out, frames, T, w, h, len(mix) - 1))
    for x in left_out:
        print('  left out: ' + x)


if __name__ == '__main__':
    main()
