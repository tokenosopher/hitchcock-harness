"""The caption script for make_srt.py: one entry per spoken line, in film order, {"shot", "who", "line"}. The caption text is
the line's exact words with the performance marks taken out, because captions show what is said, not how:
  - stage directions in brackets, "(beat)", "(sighs)", are removed;
  - markdown emphasis (*word*, _word_) loses its asterisks or underscores;
  - words written in capitals for stress ("It MAY?") are listed, and lowered only when named with --lower, because
    acronyms (AI, UBI) look the same and must stay.
Two sources:
  - the film's script.md, its "### S<n>" sections under "## Script", one entry per **NAME:** "words" row; "shot" is the
    generation (S1, S2 ...), "who" the name title-cased (MAREN -> Maren, AI stays);
  - a line table, audio/lines.json; "shot" is the line id (V01 ...).
    .venv/bin/python tools/release/make_script_json.py [--film "$FILM"] [--script script.md | --lines audio/lines.json]
        [--out social/script.json] [--lower MAY,NEVER] [--skip S3,S5.2,V09]
--film is a path or a name under the studio's assets/films/ (default $FILM, else the film folder you are in). --skip leaves
lines out (a line cut from the film): a line id (V09), a whole generation (S3) or one line of it (S5.2 = its second line).
make_srt.py also reports script lines it cannot find in the cut."""
import argparse, json, os, re, sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'lib'))
import filmpath, script_md

ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
ap.add_argument('--film', default=None, help='film folder, or a name under assets/films/ (default: $FILM, else the folder you are in)')
ap.add_argument('--script', default=None, help='script.md to read (default: <film>/script.md on a video-driven film, or when there is no audio/lines.json)')
ap.add_argument('--lines', default=None, help='line table (default: <film>/audio/lines.json when it exists)')
ap.add_argument('--out', default='social/script.json')
ap.add_argument('--lower', default='', help='comma-separated capitalised stress words to lower, e.g. MAY')
ap.add_argument('--skip', default='', help='comma-separated: line ids (V09), generations (S3) or one line of one (S5.2)')
a = ap.parse_args()
film = filmpath.film_dir(a.film, 'make_script_json.py')
F = lambda p: p if os.path.isabs(p) else os.path.join(film, p)
out = F(a.out)

if a.script and a.lines:
    sys.exit('make_script_json.py: give --script or --lines, not both')
video_driven = os.path.isdir(F('generations')) or os.path.isdir(F('blocks'))  # the video-driven layout: the lines live in script.md, audio/lines.json holds only reference recordings
if a.lines or (not a.script and not video_driven and os.path.exists(F('audio/lines.json'))):
    src = F(a.lines or 'audio/lines.json')
    rows = [dict(id=l['id'], keys={l['id']}, who=l.get('name') or l.get('character', ''), text=l['text']) for l in json.load(open(src))]
else:
    src = F(a.script or 'script.md')
    if not os.path.exists(src):
        sys.exit(f'make_script_json.py: neither audio/lines.json nor {src} exists')
    rows = [dict(id=r['gen'], keys={r['gen'], f"{r['gen']}.{r['n']}"}, who=r['who'], text=r['line']) for r in script_md.lines(src)]
    if not rows:
        sys.exit(f'make_script_json.py: no **NAME:** "words" rows under "### S<n>" headings in {src}')

lower = {w.strip().upper() for w in a.lower.split(',') if w.strip()}
skip = {s.strip() for s in a.skip.split(',') if s.strip()}
caps_seen = {}
script, skipped = [], 0
for l in rows:
    if l['keys'] & skip:
        skipped += 1
        continue
    t = l['text']
    t = re.sub(r'\s*\([^)]*\)\s*', ' ', t)                 # (beat), (sighs)
    t = re.sub(r'(?<!\w)[*_]{1,2}([^*_]+?)[*_]{1,2}(?!\w)', r'\1', t)   # *stress*, _stress_
    def fix(m):
        w = m.group(0)
        if w.upper() in lower:
            return w.lower()
        caps_seen.setdefault(w, []).append(l['id'])
        return w
    t = re.sub(r"\b[A-Z]{2,}(?:'[A-Z]+)?\b", fix, t)
    t = re.sub(r'\s+', ' ', t).strip()
    script.append(dict(shot=l['id'], who=l['who'], line=t))

os.makedirs(os.path.dirname(out) or '.', exist_ok=True)
json.dump(script, open(out, 'w'), indent=0, ensure_ascii=False)
print(f'{out}: {len(script)} lines from {os.path.relpath(src, film)} (skipped {skipped})')
unused = sorted(s for s in skip if not any(s in l['keys'] for l in rows))
if unused:
    print('--skip names nothing in the source:', ', '.join(unused))
if caps_seen:
    print('Words in capitals (acronym, or stress to lower with --lower?):')
    for w, ids in sorted(caps_seen.items()):
        print(f'   {w:10s} {", ".join(sorted(set(ids)))}')
