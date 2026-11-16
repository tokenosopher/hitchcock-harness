"""A title card on black, in the house style: Optima capitals with wide
letter-spacing in warm off-white, centred, and optional lines under it in Optima Italic, smaller, mixed case, a little dimmer.
Writes the still at 1440x2560 (9:16) and, with --seconds, a clip with silent stereo sound at each --size, 24 fps, hard cut
in and out.

    .venv/bin/python tools/edit/title_card.py --out "$FILM/edits/title/title-card" --title "CAPE WRATH, 1952" \
        --sub "The last night" --sub "of the lighthouse" --seconds 3 --size 480x854 --size 1080x1920 \
        --sound "$FILM/audio/sfx/title-boom.wav"

--sound lays a sound from the card's first frame (a boom starts on the cut), padded with silence to the end.

Writes <out>.png, and <out>-<W>x<H>.mp4 for each size."""
import argparse, os, subprocess
from PIL import Image, ImageDraw, ImageFont

W, H = 1440, 2560
INK = (236, 226, 204)          # warm off-white
SUB_INK = (196, 186, 166)      # its dimmer second line
FONT = '/System/Library/Fonts/Optima.ttc'


def tracked(d, text, font, size, track, y, ink):
    widths = [d.textlength(c, font=font) for c in text]
    gap = size * track
    x = (W - (sum(widths) + gap * (len(text) - 1))) / 2
    for c, w in zip(text, widths):
        d.text((x, y), c, font=font, fill=ink)
        x += w + gap


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--out', required=True)
    ap.add_argument('--title', required=True)
    ap.add_argument('--sub', action='append', default=[])
    ap.add_argument('--size-title', type=int, default=92)
    ap.add_argument('--size-sub', type=int, default=64)
    ap.add_argument('--seconds', type=float)
    ap.add_argument('--size', action='append', default=[])
    ap.add_argument('--sound')
    a = ap.parse_args()
    os.makedirs(os.path.dirname(os.path.abspath(a.out)), exist_ok=True)

    im = Image.new('RGB', (W, H), (0, 0, 0)); d = ImageDraw.Draw(im)
    f = ImageFont.truetype(FONT, a.size_title, index=0)
    g = ImageFont.truetype(FONT, a.size_sub, index=2)            # Optima Italic
    asc, desc = f.getmetrics(); sasc, sdesc = g.getmetrics()
    line_h = (sasc + sdesc) * 1.12
    block = asc + desc + (a.size_title * 0.85 + line_h * len(a.sub) if a.sub else 0)
    y = H / 2 - block / 2 if a.sub else H / 2 - (asc + desc) / 2
    tracked(d, a.title, f, a.size_title, 0.32, y, INK)
    y2 = y + asc + desc + a.size_title * 0.85
    for i, s in enumerate(a.sub):
        tracked(d, s, g, a.size_sub, 0.06, y2 + i * line_h, SUB_INK)
    png = a.out + '.png'; im.save(png); print('wrote', png)

    if a.seconds:
        for sz in a.size or ['480x854']:
            w, h = sz.split('x'); mp4 = '%s-%s.mp4' % (a.out, sz)
            subprocess.run(['ffmpeg', '-y', '-v', 'error', '-loop', '1', '-framerate', '24', '-i', png,
                            ] + (['-i', a.sound] if a.sound else ['-f', 'lavfi', '-i', 'anullsrc=channel_layout=stereo:sample_rate=48000']) + [
                            '-t', str(a.seconds), '-vf', 'scale=%s:%s:flags=lanczos,format=yuv420p,setsar=1' % (w, h),
                            '-af', 'aresample=48000,aformat=channel_layouts=stereo,apad',
                            '-c:v', 'libx264', '-preset', 'slow', '-crf', '14', '-tune', 'stillimage',
                            '-c:a', 'aac', '-b:a', '256k', '-movflags', '+faststart', mp4], check=True)
            print('wrote', mp4)


if __name__ == '__main__':
    main()
