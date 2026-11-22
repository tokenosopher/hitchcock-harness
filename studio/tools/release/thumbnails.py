"""YouTube (Shorts) thumbnail options from the clean master: full-size frames picked by frame index, optional zoomed crops,
and one sheet showing every option at preview size and at the small size the feed shows, for the user to choose from.
    .venv/bin/python tools/release/thumbnails.py --film "$FILM" --master <the final's copy without subtitles> \\
        --at "1:01.08=close" --at "0:13.75=wide" [--zoom "wide:780,165,0=wide zoom"] [--srt social/<slug>-w30.srt] [--fps 24]
--at TIME=NAME      TIME as seconds or m:ss.xx on the film's timeline; writes social/youtube-thumbnail-<NAME>.jpg
--zoom SRC:W,X,Y=NEW  crops a 9:16 window W wide at (X, Y) from option SRC and scales it back to full size
--srt               the SRT that is burned into the upload: every TIME inside a cue is flagged, because a thumbnail picked
                    in YouTube's frame picker comes from the captioned upload and a caption can give the punchline away
Writes social/thumbnails-sheet.jpg; tools/deliver.py copies the picked options into the Social kit.
--film is a path or a name under the studio's assets/films/ (default $FILM, else the film folder you are in).
Frames are picked by index from one straight decode of the master (-fps_mode passthrough, frames counted from the start),
never by -ss seeking and never by select=eq(n,...): a film joined from clips with different colour tags restarts ffmpeg's
frame counter partway (Flow v3.3 - 9 Edit, Checks)."""
import argparse, os, re, subprocess, sys
from PIL import Image

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'lib'))
import filmpath


def secs(t):
    p = [float(x) for x in t.split(':')]
    return p[0] if len(p) == 1 else p[0] * 60 + p[1] if len(p) == 2 else p[0] * 3600 + p[1] * 60 + p[2]


def srt_cues(path):
    def s(x): h, m, r = x.strip().split(':'); a, b = r.split(','); return int(h) * 3600 + int(m) * 60 + int(a) + int(b) / 1000
    out = []
    for block in open(path, encoding='utf-8-sig').read().strip().split('\n\n'):
        L = block.strip().split('\n')
        if len(L) >= 3 and '-->' in L[1]:
            a, b = L[1].split(' --> '); out.append((s(a), s(b), ' / '.join(L[2:])))
    return out


def grab_all(master, frames, outs):
    """Write frame N of MASTER to OUT for every (N, OUT): one straight decode from the first frame, frames counted here, each
    wanted frame re-encoded as it was decoded (yuv420p -> JPEG, no RGB round trip). Stops after the last wanted frame."""
    w, h = (int(v) for v in subprocess.run(['ffprobe', '-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height',
                                           '-of', 'csv=p=0', master], capture_output=True, text=True).stdout.strip().split('\n')[0].split(',')[:2])
    size = w * h * 3 // 2
    want = {}
    for n, out in zip(frames, outs):
        want.setdefault(n, []).append(out)
    pr = subprocess.Popen(['ffmpeg', '-v', 'error', '-i', master, '-map', '0:v:0', '-fps_mode', 'passthrough', '-pix_fmt', 'yuv420p',
                           '-f', 'rawvideo', '-'], stdout=subprocess.PIPE)
    n, last = 0, max(want)
    try:
        while n <= last:
            buf = pr.stdout.read(size)
            if len(buf) < size:
                break
            for out in want.get(n, []):
                subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'yuv420p', '-s', f'{w}x{h}', '-i', '-',
                                '-frames:v', '1', '-q:v', '2', out], input=buf, check=True)
            n += 1
    finally:
        pr.kill(); pr.wait()
    if n <= last:
        sys.exit(f'thumbnails.py: {master} has only {n} frames; asked for frame {last}')


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--film', default=None, help='film folder or a name under assets/films/ (default: $FILM, else the folder you are in)')
    ap.add_argument('--master', required=True)
    ap.add_argument('--at', action='append', required=True)
    ap.add_argument('--zoom', action='append', default=[])
    ap.add_argument('--srt')
    ap.add_argument('--fps', type=float, default=24)
    ap.add_argument('--outdir', default='social')
    a = ap.parse_args()
    a.film = filmpath.film_dir(a.film, 'thumbnails.py')
    F = lambda p: p if os.path.isabs(p) else os.path.join(a.film, p)
    R = lambda p: os.path.relpath(p, a.film) if os.path.abspath(p).startswith(os.path.abspath(a.film) + os.sep) else p
    master, outdir = F(a.master), F(a.outdir)
    os.makedirs(outdir, exist_ok=True)
    cues = srt_cues(F(a.srt)) if a.srt else []
    path = lambda name: os.path.join(outdir, 'youtube-thumbnail-' + re.sub(r'\s+', '-', name.strip()) + '.jpg')
    made = []
    specs = []
    for spec in a.at:
        t, name = spec.split('=', 1); specs.append((round(secs(t) * a.fps), name, path(name)))
    grab_all(master, [fr for fr, _, _ in specs], [out for _, _, out in specs])
    for fr, name, out in specs:
        made.append((name, out))
        hit = [c for c in cues if c[0] <= fr / a.fps <= c[1]]
        note = f'  caption on screen in the upload: "{hit[0][2]}" ({hit[0][0]:.2f}-{hit[0][1]:.2f} s); pick a time after {hit[0][1]:.2f}' if hit else ''
        print(f'{name}: frame {fr} ({fr / a.fps:.3f} s) -> {R(out)}' + note)
    for spec in a.zoom:
        src, rest = spec.split(':', 1); geo, new = rest.split('=', 1); w, x, y = [int(v) for v in geo.split(',')]
        im = Image.open(path(src)); W, H = im.size; h = round(w * H / W)
        if x + w > W or y + h > H:
            sys.exit(f'zoom {spec}: window {w}x{h} at ({x},{y}) leaves the {W}x{H} frame')
        out = path(new); im.crop((x, y, x + w, y + h)).resize((W, H), Image.LANCZOS).save(out, quality=92); made.append((new, out))
        print(f'{new}: {W / w:.2f}x zoom of {src} -> {R(out)} (softer full screen; fine at thumbnail size)')
    ims = [Image.open(p).convert('RGB') for _, p in made]
    big = [im.resize((300, round(300 * im.height / im.width))) for im in ims]
    small = [im.resize((84, round(84 * im.height / im.width))) for im in ims]
    Wd = max(len(big) * 306, 10); Hd = big[0].height + 20 + small[0].height
    sheet = Image.new('RGB', (Wd, Hd), 'white')
    for i, (b, s) in enumerate(zip(big, small)):
        sheet.paste(b, (i * 306, 0)); sheet.paste(s, (i * 306, b.height + 20))
    sp = os.path.join(outdir, 'thumbnails-sheet.jpg'); sheet.save(sp, quality=90)
    print(f'sheet: {R(sp)} (top: preview size; bottom: about the size the feed shows)')


if __name__ == '__main__':
    main()
