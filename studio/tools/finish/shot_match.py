"""Per-shot fix for one character's outlier shots, written as a timed ffmpeg filter chain: for a character whose blacks came
out milky (so every cut to them goes flat) or whose skin measures less saturated than the others'.
Brightness: the Y plane only (colour untouched, so their warmth stays) and only below K, so eye sockets just under the
milky floor keep their level: each shot's 1st-percentile black is halved, easing to nothing at K. (Matching the blacks
fully with per-channel RGB curves darkens the eyes and takes the tint out of the shadows.)
Colour: each shot's chroma is scaled so the character's skin reaches TARGET (chroma only, brightness untouched), capped at
CAP, fading out in the whites so white gloves and highlights stay white. Wides, where the face is too small to measure, take
the median scale. Without a skin survey only the brightness fix is written.
Writes seconds, not frame numbers, so it survives the frame counter restarting mid-film. Apply it in a plain YUV pass:
    .venv/bin/python tools/finish/shot_match.py SHOTS.json OUT.txt [SKIN.json [TARGET]] --match look/<who>/match.json --who <NAME>
    ffmpeg -i MASTER.mp4 -vf "setparams=color_primaries=bt709:color_trc=bt709:colorspace=bt709:range=tv,$(cat OUT.txt)" \\
      -c:v libx264 -preset slow -crf 16 -pix_fmt yuv420p -color_primaries bt709 -color_trc bt709 -colorspace bt709 -c:a copy \\
      -movflags +faststart MASTER-fixed.mp4
SHOTS.json: from shot_survey.py on the master; SKIN.json: from skin_survey.py on the same master.
match.json: {"fix": {"<NAME>": [shot numbers]}, "who": {...}, "k": 0.13, "target": 38, "cap": 1.3, "fps": 24} (k, target,
cap and fps optional, these the defaults; TARGET on the command line overrides match.json). Check the result with
shotfix_check.py."""
import argparse, json, sys

ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
ap.add_argument('shots'); ap.add_argument('out'); ap.add_argument('skin', nargs='?'); ap.add_argument('target', nargs='?', type=float)
ap.add_argument('--match', required=True); ap.add_argument('--who', required=True)
A = ap.parse_args()
shots = json.load(open(A.shots)); M = json.load(open(A.match))
FPS = float(M.get('fps', 24))
FIX = M['fix'][A.who]                                         # the character's shots in the master, by shot number
bad = [i for i in FIX if i >= len(shots)]
if bad: sys.exit(f'shot_match.py: shots {bad} are not in {A.shots} ({len(shots)} shots): re-read the sheet')
K = float(M.get('k', 0.13))                                   # from here up (the eyes and everything brighter) untouched
# colour: each of the character's shots is scaled so their skin reaches TARGET (an uneven outlier would keep its palest
# shot pale under a flat scale). Wides, where the face is too small to measure, take the median scale. Needs the skin
# survey: .venv/bin/python tools/finish/skin_survey.py VIDEO shots.json skin.json --match match.json
skin = json.load(open(A.skin)) if A.skin else {}
TARGET = A.target if A.target is not None else float(M.get('target', 38.0))
CAP = float(M.get('cap', 1.3))
scale = {int(k): TARGET / v['sat'] for k, v in skin.items() if v['who'] == A.who}
mid = sorted(scale.values())[len(scale) // 2] if scale else 1.0
out = []
for i in FIX:
    s = shots[i]
    p = s['y1'] / 255                                        # 1st-percentile luma, as a fraction of the range
    D = (p / 2) / (1 - p / K) ** 2                           # halves that black; the correction fades out by K
    a, b = (s['a'] - 0.5) / FPS, (s['b'] - 0.5) / FPS
    y = f"if(lt(val,{16 + 219 * K:.2f}),16+219*max(0,(val-16)/219-{D:.5f}*pow(1-(val-16)/{219 * K:.3f},2)),val)"
    # capped: shots that need 1.5-1.8x to reach TARGET go yellow; about 1.3 looks right
    k = min(scale.get(i, mid), CAP) if skin else 1.0
    en = f"enable='between(t,{a:.4f},{b:.4f})'"
    out.append(f"lutyuv=y='{y}':{en}")
    if k != 1:
        # the boost fades out from luma 165 to 230, so white gloves and highlights stay white (a flat boost turns
        # white lilac or yellow)
        wgt = "clip((230-lum(X/SW\\,Y/SH))/65\\,0\\,1)"
        c = lambda pl: f"128+({pl}(X\\,Y)-128)*(1+{k - 1:.3f}*{wgt})"
        out.append(f"geq=lum='lum(X\\,Y)':cb='{c('cb')}':cr='{c('cr')}':{en}")
    print(f'shot {i}: colour x{k:.2f}')
open(A.out, 'w').write(','.join(out))
print(len(out), 'filters ->', A.out)
