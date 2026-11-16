"""The second 1080p route (the Higgsfield upscale): split a finished render into segments on hard cuts, and join the
upscaled segments back into one 1080p cut with the render's own audio. The steps around it: tools/finish/README.md.
    split:  .venv/bin/python tools/finish/segments.py split RENDER.mp4 $FILM/video/1080/segments [--max 30] [--min 12]
            -> seg-NN.mp4 (frame-exact, H.264 crf 15, GOP 48, no audio: small enough to upload) and segments.json;
               prints the seconds to upscale
    join:   .venv/bin/python tools/finish/segments.py join $FILM/video/1080/segments $FILM/video/1080/upscale RENDER.mp4 OUT.mp4
            -> each upscale/seg-NN-up.mp4 is filled to the film's size (1080x1920 for a tall render, 1920x1080 for a wide
               one: scaled to cover, centre-cropped, never padded) as seg-NN-1080.mp4, checked against the segment's frame
               count, listed in concat.txt, joined in order and muxed with RENDER's audio into OUT.
Cuts come from tools/edit/cuts.py (threshold 0.18); a boundary goes on the latest cut between --min and --max seconds after
the previous boundary (at --max when there is none). The segments' frames add up to the render's."""
import json, os, subprocess, sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / 'edit'))
from cuts import detect_cuts, THRESHOLD   # noqa: E402

FFMPEG = os.environ.get('HARNESS_FFMPEG') or 'ffmpeg'
FFPROBE = os.environ.get('HARNESS_FFPROBE') or 'ffprobe'


def probe_frames(p):
    o = subprocess.run([FFPROBE, '-v', 'error', '-count_packets', '-select_streams', 'v:0', '-show_entries',
                        'stream=nb_read_packets,r_frame_rate,width,height', '-of', 'json', p], capture_output=True, text=True).stdout
    s = json.loads(o)['streams'][0]; num, den = s['r_frame_rate'].split('/')
    return int(s['nb_read_packets']), float(num) / float(den), int(s['width']), int(s['height'])


def split(render, outdir, mx=30.0, mn=12.0):
    os.makedirs(outdir, exist_ok=True)
    n, fps, w, h = probe_frames(render); dur = n / fps
    cs = sorted(set(round(c * fps) for c in detect_cuts(render, THRESHOLD)))   # first frame of each new shot
    bounds = [0]
    while dur - bounds[-1] / fps > mx:
        lo, hi = bounds[-1] + int(mn * fps), bounds[-1] + int(mx * fps)
        cands = [c for c in cs if lo <= c <= hi]
        bounds.append(max(cands) if cands else hi)
    bounds.append(n)
    segs = []
    for i in range(len(bounds) - 1):
        a, b = bounds[i], bounds[i + 1]
        out = os.path.join(outdir, f'seg-{i:02d}.mp4')
        subprocess.run([FFMPEG, '-v', 'error', '-y', '-i', render, '-vf', f"select='between(n,{a},{b - 1})',setpts=N/FRAME_RATE/TB",
                        '-fps_mode', 'passthrough', '-an', '-c:v', 'libx264', '-preset', 'slow', '-crf', '15', '-pix_fmt', 'yuv420p',
                        '-g', '48', out], check=True)
        got = probe_frames(out)[0]
        if got != b - a:
            sys.exit(f'{out}: {got} frames, expected {b - a}')
        segs.append(dict(i=i, file=os.path.basename(out), start=a, end=b, frames=b - a, seconds=round((b - a) / fps, 3),
                         width=w, height=h))
        print(f'{out}: frames {a}-{b - 1} ({b - a}, {(b - a) / fps:.2f} s)')
    json.dump(dict(render=os.path.abspath(render), frames=n, fps=fps, width=w, height=h, segments=segs),
              open(os.path.join(outdir, 'segments.json'), 'w'), indent=1)
    print(f'{len(segs)} segments, {n} frames, {dur:.2f} s to upscale ({w}x{h}, {fps:g} fps)')


def target_size(render):
    """The master's frame size from the render's own ratio: 1080x1920 for a tall render, 1920x1080 for a wide one."""
    _, _, w, h = probe_frames(render)
    return (1080, 1920) if h > w else (1920, 1080)


def join(segdir, updir, render, out):
    W, H = target_size(render)
    meta = json.load(open(os.path.join(segdir, 'segments.json')))
    parts = []
    for s in meta['segments']:
        up = os.path.join(updir, s['file'].replace('.mp4', '-up.mp4'))
        if not os.path.exists(up):
            sys.exit(f'missing {up}')
        n = probe_frames(up)[0]
        if n != s['frames']:
            sys.exit(f'{up}: {n} frames, expected {s["frames"]} (the segment\'s): check the upscale kept the frame rate')
        fixed = os.path.join(updir, s['file'].replace('.mp4', '-1080.mp4'))
        if not os.path.exists(fixed) or os.path.getmtime(fixed) < os.path.getmtime(up):
            subprocess.run([FFMPEG, '-v', 'error', '-y', '-i', up, '-vf',
                            f'scale={W}:{H}:force_original_aspect_ratio=increase,crop={W}:{H},setsar=1',
                            '-fps_mode', 'passthrough', '-an', '-c:v', 'libx264', '-preset', 'slow', '-crf', '12',
                            '-pix_fmt', 'yuv420p', fixed], check=True)
            if probe_frames(fixed)[0] != s['frames']:
                sys.exit(f'{fixed}: frame count changed in the fill and crop')
        parts.append(fixed)
    lst = os.path.join(updir, 'concat.txt')
    open(lst, 'w').write(''.join(f"file '{os.path.abspath(p)}'\n" for p in parts))
    os.makedirs(os.path.dirname(os.path.abspath(out)), exist_ok=True)
    subprocess.run([FFMPEG, '-v', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', lst, '-i', render, '-map', '0:v:0',
                    '-map', '1:a:0?', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '256k', '-movflags', '+faststart', out], check=True)
    n, _, w, h = probe_frames(out)
    print(f'{out}: {w}x{h}, {n} frames (render {meta["frames"]}), {"OK" if n == meta["frames"] else "FRAME COUNT DIFFERS"}')


def main():
    a = sys.argv[1:]
    if not a or a[0] in ('-h', '--help') or a[0] not in ('split', 'join'):
        print(__doc__); sys.exit(0 if not a or a[0] in ('-h', '--help') else 2)
    def opt(name, default):
        if name in a:
            i = a.index(name); v = float(a[i + 1]); del a[i:i + 2]; return v
        return default
    if a[0] == 'split':
        mx, mn = opt('--max', 30.0), opt('--min', 12.0)
        if len(a) != 3: sys.exit('split RENDER OUTDIR [--max 30] [--min 12]')
        split(a[1], a[2], mx, mn)
    else:
        if len(a) != 5: sys.exit('join SEGDIR UPDIR RENDER OUT')
        join(*a[1:5])


if __name__ == '__main__':
    main()
