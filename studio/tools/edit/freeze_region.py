"""Freeze part of the picture of one generation (a prop the model keeps moving or garbling, e.g. a dial face) from one of its
own frames, from frame START to END, with everything else live (candles, faces). The region is an ellipse with a soft edge.
The patch is enabled by frame number, gte(n,START), because a time-based enable leaves one moving frame at the start of the
shot.
Frame numbers are those of IN (one generation), counted from its first frame.
    .venv/bin/python tools/edit/freeze_region.py IN.mp4 OUT.mp4 SRC_FRAME START END|-1 CX CY RX RY [--feather PX]
CX CY RX RY: the ellipse in IN's pixels. Writes OUT-check.jpg (the patch over frame START) to look at before cutting it in.
Then put OUT beside the original take and swap it in on the Edit page (the app's edit recipe). Needs PIL. For the 1080p
version run it again on the 1080p take."""
import argparse, json, subprocess
from PIL import Image, ImageDraw, ImageFilter

ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
ap.add_argument('inp'); ap.add_argument('out'); ap.add_argument('src_frame', type=int); ap.add_argument('start', type=int); ap.add_argument('end', type=int)
ap.add_argument('cx', type=float); ap.add_argument('cy', type=float); ap.add_argument('rx', type=float); ap.add_argument('ry', type=float)
ap.add_argument('--feather', type=float, default=4.0)
a = ap.parse_args()

pr = json.loads(subprocess.run(['ffprobe', '-v', 'error', '-select_streams', 'v', '-show_entries', 'stream=width,height', '-of', 'json', a.inp],
                               capture_output=True, text=True).stdout)['streams'][0]
W, H = pr['width'], pr['height']


def frame(i):
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', a.inp, '-vf', f'select=eq(n\\,{i}),format=rgb24', '-fps_mode', 'passthrough', '-frames:v', '1',
                          '-f', 'rawvideo', '-'], capture_output=True, check=True).stdout
    return Image.frombytes('RGB', (W, H), raw[:W * H * 3])


src = frame(a.src_frame)
m = Image.new('L', (W, H), 0)
ImageDraw.Draw(m).ellipse((a.cx - a.rx, a.cy - a.ry, a.cx + a.rx, a.cy + a.ry), fill=255)
m = m.filter(ImageFilter.GaussianBlur(a.feather))
patch = src.copy(); patch.putalpha(m)
pp = a.out.rsplit('.', 1)[0] + '-patch.png'; patch.save(pp)
chk = frame(a.start).convert('RGBA'); chk.alpha_composite(patch); chk.convert('RGB').save(a.out.rsplit('.', 1)[0] + '-check.jpg', quality=90)
en = f'gte(n,{a.start})' + (f'*lt(n,{a.end})' if a.end >= 0 else '')
subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', a.inp, '-loop', '1', '-i', pp, '-filter_complex',
                f"[1:v]format=rgba[s];[0:v][s]overlay=0:0:shortest=1:enable='{en}'", '-c:v', 'libx264', '-crf', '14', '-c:a', 'copy', a.out], check=True)
print('->', a.out, '| patch', pp)
