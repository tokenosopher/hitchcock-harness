# tools/stills

Local, free helpers for character sheets and other stills: they measure, mask and composite pictures on this Mac with
Pillow and numpy. Every paid still (faces, looks, sheets, edits, outpaints, the skin pass) is made on Higgsfield by Alma
through the `higgsfield` MCP server, and a cutout comes from Higgsfield `remove_background`; the rules are in
`flow/Flow v3.2 - 2 Characters.md`. Run from the studio folder with `.venv/bin/python`; every path is given on the
command line. All of them are unproven on a film of this flow: check their output by eye.

| Script | Command | What it does |
|---|---|---|
| `detail_composite.py` | `detail_composite.py BASE.png EDIT.png OUT.png [--thresh 22] [--grow 6] [--feather 4] [--region x0,y0,x1,y1]... [--close R] [--erase x,y,r]... [--copy sx,sy,sr:dx,dy,dr[,squash]]... [--mask-out MASK.png]` | keeps BASE everywhere except where the edit really changed something; `--region` limits it to boxes, `--erase` removes a misplaced detail, `--copy` moves a round detail by hand. Prints the share of edit pixels used |
| `figure_canvas.py` | `figure_canvas.py SHEET.png CUTOUT.png OUT_PREFIX --panel x0,y0,x1,y1 [--clear x0,y0,x1,y1 ...] [--size 1296x2304] [--at X,Y]` | lays the full-body panel on a tall canvas of the sheet's backdrop for an outpaint; writes `-canvas.png`, `-mask.npy`, `-mask.png` and prints `--at` and `--cut` for `extend_figure.py`. Check `-mask.png` for pieces of a neighbouring view |
| `extend_figure.py` | `extend_figure.py CANVAS.png MASK.npy OUTPAINT.png OUT.png --at X,Y [--fade 24] [--blend 300] [--cut Y]` | aligns the outpaint onto the canvas, matches the backdrop, and lays the original figure back over it. Only when the outpaint drifted (face, details); about 2 minutes a figure |
| `sheet_light.py` | `sheet_light.py SHEET.png [SHEET.png ...] [--skin x0,y0,x1,y1 ...]` | backdrop colour and warmth, black and white points, mid level, a skin patch; assumes three equal panels on a plain backdrop. Run before and after `match_light.py` |
| `match_light.py` | `match_light.py REF.png IN.png OUT.png [--strength 1.0] [--cutout IN-cutout.png] [--ref-cutout REF-cutout.png]` | matches IN's studio light to REF: black level, white balance from the backdrop, backdrop brightness on the backdrop only |
| `skin_check.py` | `skin_check.py --stage sheet [--cutouts DIR] [--who NAME] [--show OUT.jpg] FILE_OR_DIR ...` · `skin_check.py --stage sheet --spec boxes.json --show OUT.jpg` | skin Y', chroma and hue (BT.709 8-bit code units, medians on the key-lit skin), backdrop neutrality and level, the cast's palest/richest ratio; prints the scale a failing character needs and exits 1 on a fail. Screen with auto, gate with `--spec` |
| `skin_tune.py` | `skin_tune.py IN.png OUT.png [--cutout IN-cutout.png] [--hue DEG] [--chroma SCALE] [--show MASK.jpg]` | hue and chroma nudge on the skin pixels only, in `skin_check.py`'s units, so the result can be checked with it |

Cutouts are RGBA files from Higgsfield `remove_background`. Never compare `skin_check.py`'s numbers with
`tools/finish/skin_survey.py`'s, which read 3 to 10 units lower on the same faces.
