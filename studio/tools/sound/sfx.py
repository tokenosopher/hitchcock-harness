"""The sound designer's variations: one sound effect in several tries, or every effect of the sound designer's plan, made
on Higgsfield (generate_audio, model mirelo_text_to_audio) by Alma through the higgsfield MCP server, and the user's pick
recorded (Flow v3.3 - 11 Sound and music, "The sound designer"; the designer's brief is SOUND_DESIGNER.md here).
This script makes no call itself: it writes and prints the calls, takes in each downloaded result, and records the pick.

    .venv/bin/python tools/sound/sfx.py "$FILM" --plan audio/sfx/plan.json [--only ID …] [--again] [--tries N] [--refreeze] [--dry-run]
    .venv/bin/python tools/sound/sfx.py "$FILM" <name> --prompt "<a literal prompt>" [--prompt "<a natural, close one>" …]
        --seconds S [--kind reaction|bed|accent|carry-over] [--tries N] [--generate-seconds G] [--dry-run]
    .venv/bin/python tools/sound/sfx.py "$FILM" <name> --add N --file <downloaded audio> [--file <piece 2> …] --job <job id> [--job …]
        [--credits C]
    .venv/bin/python tools/sound/sfx.py "$FILM" <name> --pick N --note "<the user's words>" [--predicted M] [--no-taste]

Plan the tries (--plan, or one sound with --prompt): writes audio/sfx/<name>/calls.json, one entry a try with its style,
prompt and length, and prints for each one the generate_audio arguments to send through the higgsfield MCP server:
{"model": "mirelo_text_to_audio", "prompt", "duration", "use_unlim": false}. Send them (generate_audio_batch for several),
wait with jobs_wait, download each result into the film's scratch.nosync/ without printing its link, then --add it.
--dry-run prints and writes nothing. A second run adds tries after the last one ("none of these": three more). With --plan,
an effect whose folder already holds tries or planned calls is skipped unless --again.

One sound, many tries. The default is 4 tries, 3 for a bed (--tries N for another count; 3 to 5 is the flow's range).
The tries differ in prompt style, not only in wording: try 1 literal and specific to the setting ("a small crowd of about
fifteen guests at a long table in a timber hall …"), try 2 natural and close ("a short natural swell of approval …,
close and dry"), the rest quieter or in between. Where the prompts come from, first found:
  1. the plan effect's "variations": [{"style": "literal", "prompt": "…"}, {"style": "natural, close", …}, …];
  2. --prompt, given once per try in that order (styles: literal, natural and close, quieter, in between, fuller);
  3. the effect's "what" (or a single --prompt) for try 1, and the same words with a style direction added for the
     others. This is the fallback: it differs in wording more than in style, so the sound designer writes "variations".
Every prompt ends "no music"; a crowd prompt (crowd, men, court, cheer, murmur, applause …) is always wordless: "no clear
words" is added when it says nothing of the kind, and a crowd prompt with words in quotes is warned about.

How long. A reaction, an accent or a carry-over is made about 1 s longer at each end than its place (the place's
seconds + 2), so the user can slide it; a bed is made as long as its place. The plan's "generate_seconds" wins over both,
and 0 means the effect reuses another's sound (nothing is made). A sound over 30 s is planned as pieces crossfaded over
--crossfade seconds (default 2): two pieces up to 58 s. The longest sound one mirelo_text_to_audio call makes is not on
file: 30 s is assumed; if Higgsfield refuses a length, plan shorter pieces with --generate-seconds.

Take in a try (--add N): the downloaded file (or its pieces, in order) is kept as the raw original in
audio/sfx/<name>/raw/, then cleaned: a high-pass at 25 Hz, an 8 ms fade-in, its peak set to -1 dBFS, written as 48 kHz
stereo 24-bit WAV. Its loudness (LUFS) and length are measured and kept, for the mix. One spend.md row per job, "on the
plan" (sound effects need no quote and no go); --credits writes the price Higgsfield charged.

What it writes:
  audio/sfx/<name>/calls.json                    the planned tries: [{try, style, prompt, duration, pieces}]
  audio/sfx/<name>/<name>-try<N>.wav             each try, cleaned
  audio/sfx/<name>/raw/<name>-try<N>-raw.<ext>   the file Higgsfield returned (a long sound: -part<k>-raw.<ext> each)
  audio/sfx/<name>/prompts.json                  "prompts": try N's prompt at index N-1, and "tries": [{try, file, raw,
                                                 prompt, style, seconds_asked, seconds, pieces, lufs, job_ids, made}],
                                                 "effect" (the plan's entry and the plan's sha1), "model", and "picked"
  spend.md                                       one row per job, "on the plan"

The plan (--plan): the sound designer's plan.json (its shape is in SOUND_DESIGNER.md): {"film", "cut", "fps", "scenes": [...],
"effects": [{"id", "name"?, "kind", "start": {"tc", "frame"}, "end": {"tc", "frame"}, "seconds", "what", "variations"?,
"tries"?, "generate_seconds"?, "level_db", "fade_in_frames", "fade_out_frames", "replaces_or_ducks", "reason", "confidence",
"file"?}], "weighed_and_left": [...]}. Each effect's folder name is its "name", else the last part of its "file", else
"<id>-<kind>" in lower case. The plan is frozen before anything is made: the first --plan run writes <plan>-frozen.txt
beside it (its sha1 and the time) when there is none, and a later run refuses a plan whose sha1 differs (--refreeze after
saying why in the plan).

The pick (--pick N): writes audio/sfx/<name>/pick.json ({"sound", "effect", "picked": {try, file, prompt, style},
"passed_over": [...], "note", "predicted", "right", "date", "previous"?}), sets "picked" in prompts.json, and adds the row
to the studio's taste.md record table (--taste-file for another; --no-taste to leave it), its last cell "What it says"
left for you to write."""
import datetime, glob, hashlib, json, math, os, re, shutil, subprocess, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))      # tools/
STUDIO = os.path.dirname(ROOT)

MODEL = 'mirelo_text_to_audio'
MAX_CALL = 30.0

STYLES = ['literal', 'natural, close', 'quieter', 'in between', 'fuller']
STYLE_WORDS = {           # the fallback's style directions; a bed's are its own (a bed is never "short")
    'natural, close': ' Short and natural, unforced, close and dry.',
    'quieter': ' Quieter and more restrained, soft and warm.',
    'in between': ' Moderate: between restrained and full, never loud.',
    'fuller': ' A little fuller and more eager, still natural.',
}
BED_WORDS = {
    'natural, close': ' Natural and even, heard from close by, dry.',
    'quieter': ' Quieter and further off, softer, even.',
    'in between': ' Even and moderate, neither near nor far.',
    'fuller': ' A little fuller and nearer, still even.',
}
CROWD = re.compile(r'\b(crowd|people|men|women|court|courtiers|noblemen|nobles|audience|group|voices|murmur\w*|cheer\w*|walla|'
                   r'chatter|applau\w*|clap\w*|gasp\w*|laugh\w*|shout\w*|onlookers|soldiers|guests)\b', re.I)
WORDLESS = re.compile(r'wordless|no clear words|no words|no speech|without words', re.I)


def now():
    return datetime.datetime.utcnow().replace(microsecond=0).isoformat() + 'Z'


def today():
    return datetime.date.today().isoformat()


def slug(s):
    return re.sub(r'[^a-z0-9]+', '-', s.lower()).strip('-')


def ff(*a):
    subprocess.run(['ffmpeg', '-y', '-v', 'error', *a], check=True)


def seconds_of(p):
    r = subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', p], capture_output=True, text=True)
    try:
        return round(float(r.stdout.strip()), 3)
    except ValueError:
        return None


def peak_db(p):
    r = subprocess.run(['ffmpeg', '-v', 'info', '-i', p, '-af', 'volumedetect', '-f', 'null', '-'], capture_output=True, text=True)
    m = re.search(r'max_volume:\s*(-?[\d.]+|-inf) dB', r.stderr)
    return None if not m or m.group(1) == '-inf' else float(m.group(1))


def lufs(p):
    r = subprocess.run(['ffmpeg', '-v', 'info', '-i', p, '-af', 'ebur128', '-f', 'null', '-'], capture_output=True, text=True)
    m = re.findall(r'I:\s*(-?[\d.]+) LUFS', r.stderr)
    return float(m[-1]) if m else None


# ---- prompts

def finish_prompt(p):
    """Every prompt ends 'no music'; a crowd prompt is wordless. Returns (prompt, warning or None)."""
    p = p.strip().rstrip('.')
    warn = None
    if CROWD.search(p):
        if re.search(r'["\u201c\u2018][^"\u201d\u2019]{2,}["\u201d\u2019]', p) or re.search(r"\s'[^']{2,}'", p):
            warn = 'a crowd prompt with words in quotes: the user picks the wordless tries'
        if not WORDLESS.search(p):
            p += ', wordless, no clear words'
    if not re.search(r'\bno music\b', p, re.I):
        p += ', no music'
    return p, warn


def variations(effect, prompts, n):
    """[(style, prompt)] for n tries: the plan's variations, else the prompts given, each in its style's place; tries
    still missing get the first prompt with a style direction added."""
    v = effect.get('variations') or []
    if v:
        out = [(x.get('style') or STYLES[min(i, len(STYLES) - 1)], x['prompt']) for i, x in enumerate(v)]
    else:
        out = [(STYLES[min(i, len(STYLES) - 1)], p) for i, p in enumerate(prompts or [effect.get('what', '')])]
    if len(out) < n:
        base = out[0][1].strip().rstrip('.') + '.'
        have = {st for st, _ in out}
        fill = [st for st in STYLES[1:] if st not in have]
        print(f'  note: {effect.get("_name")}: {len(out)} prompt(s) for {n} tries: the other tries add a style direction '
              f'to the first ({", ".join(fill[:n - len(out)])}); the sound designer writes one prompt per style in "variations"')
        words = BED_WORDS if effect.get('kind') == 'bed' else STYLE_WORDS
        out += [(st, base + words[st]) for st in fill][:n - len(out)]
    return out[:n]


# ---- lengths

def ask_seconds(effect):
    """The length to make: the plan's generate_seconds, else a bed as long as its place, anything else 1 s longer at
    each end."""
    if effect.get('generate_seconds') is not None:
        return float(effect['generate_seconds'])
    s = float(effect.get('seconds') or 0)
    if not s and effect.get('start') and effect.get('end'):
        fps = effect.get('_fps') or 24
        s = (effect['end']['frame'] - effect['start']['frame']) / fps
    return round(max(0.5, s if effect.get('kind') == 'bed' else s + 2.0), 2)


def pieces(total, xf):
    """The lengths of the calls that make `total` seconds: one call up to 30 s, else n pieces crossfaded over xf s."""
    if total <= MAX_CALL:
        return [round(max(0.5, total), 2)]
    n = math.ceil((total - xf) / (MAX_CALL - xf))
    each = round((total + (n - 1) * xf) / n, 2)
    return [min(MAX_CALL, each)] * n


# ---- the calls (made by Alma through the higgsfield MCP server)

def gen_args(prompt, secs):
    return {'model': MODEL, 'prompt': prompt, 'duration': secs, 'use_unlim': False}


def spend_row(film, job, units, where, purpose, credits=None):
    p = os.path.join(film, 'spend.md')
    if not os.path.exists(p):
        print(f'  warning: no spend.md in the film: the row is not written ({where})'); return
    cost = f'{credits} cr' if credits is not None else 'see the job in the Higgsfield account'
    row = (f'| {today()} | 11 Sound | Higgsfield · {MODEL} | {job or "(no job id)"} | {units} | on the plan | {cost} | '
           f'{where} | {purpose} | sound effects need no go; the sound designer\'s plan |')
    text = open(p, encoding='utf-8').read()
    with open(p, 'a', encoding='utf-8') as f:
        f.write(('' if text.endswith('\n') else '\n') + row + '\n')


def clean(raws, out, xf):
    """Join the pieces with a crossfade, high-pass at 25 Hz, 8 ms fade-in, peak at -1 dBFS, 48 kHz stereo 24-bit."""
    tmp = out + '.tmp.wav'
    ins = []
    for r in raws:
        ins += ['-i', r]
    chain, last = [], '[0:a]'
    for k in range(1, len(raws)):
        chain.append(f'{last}[{k}:a]acrossfade=d={xf}:c1=qsin:c2=qsin[x{k}]'); last = f'[x{k}]'
    chain.append(f'{last}aresample=48000,highpass=f=25,afade=t=in:d=0.008[o]')
    ff(*ins, '-filter_complex', ';'.join(chain), '-map', '[o]', '-ac', '2', '-c:a', 'pcm_f32le', tmp)
    pk = peak_db(tmp)
    gain = 0.0 if pk is None else -1.0 - pk
    ff('-i', tmp, '-af', f'volume={gain:.2f}dB', '-ar', '48000', '-ac', '2', '-c:a', 'pcm_s24le', out)
    os.remove(tmp)


def folder_of(film, name):
    return os.path.join(film, 'audio', 'sfx', name)


def load_prompts(d):
    p = os.path.join(d, 'prompts.json')
    return json.load(open(p, encoding='utf-8')) if os.path.exists(p) else {}


def last_try(d, name, pj):
    n = len(pj.get('prompts') or [])
    for f in glob.glob(os.path.join(d, '*try*.wav')) + glob.glob(os.path.join(d, 'raw', '*try*')):
        m = re.search(r'try(\d+)', os.path.basename(f))
        if m:
            n = max(n, int(m.group(1)))
    return n


def load_calls(d):
    p = os.path.join(d, 'calls.json')
    return json.load(open(p, encoding='utf-8')) if os.path.exists(p) else {'tries': []}


def plan_sound(film, name, effect, prompts, n, xf, dry, plan_info=None):
    """Plans n tries of one sound: writes calls.json and prints the generate_audio arguments. Returns the number of calls."""
    effect = dict(effect, _name=name)
    want = ask_seconds(effect)
    if want <= 0:
        print(f'{name}: generate_seconds 0, it reuses another sound ({effect.get("file") or "see the plan"}); nothing made')
        return 0
    parts = pieces(want, xf)
    vs = variations(effect, prompts, n)
    d = folder_of(film, name)
    pj, cj = load_prompts(d), load_calls(d)
    first = max([last_try(d, name, pj)] + [t['try'] for t in cj.get('tries', [])]) + 1
    place = effect.get('seconds')
    print(f'{name} ({effect.get("id", "-")}, {effect.get("kind", "sound")}): {len(vs)} tries from try {first}, '
          f'{want:g} s each' + (f' (its place {place:g} s)' if place else '')
          + (f', in {len(parts)} pieces of {parts[0]:g} s crossfaded over {xf:g} s' if len(parts) > 1 else ''))
    calls, planned = 0, []
    for i, (style, raw_prompt) in enumerate(vs):
        k = first + i
        prompt, warn = finish_prompt(raw_prompt)
        print(f'  try {k} [{style}] {prompt}')
        if warn:
            print(f'    warning: {warn}')
        for j, secs in enumerate(parts, 1):
            print(f'    generate_audio ' + json.dumps(gen_args(prompt, secs), ensure_ascii=False)
                  + (f'   (piece {j} of {len(parts)})' if len(parts) > 1 else ''))
        calls += len(parts)
        planned.append({'try': k, 'style': style, 'prompt': prompt, 'duration': want, 'pieces': parts, 'crossfade': xf,
                        'planned': now()})
    if dry:
        return calls
    os.makedirs(d, exist_ok=True)
    cj['tries'] = [t for t in cj.get('tries', []) if t['try'] not in {p['try'] for p in planned}] + planned
    cj['model'] = MODEL
    if effect.get('id') or plan_info:
        cj['effect'] = {**{kk: vv for kk, vv in effect.items() if not kk.startswith('_') and kk != 'variations'}, **(plan_info or {})}
    json.dump(cj, open(os.path.join(d, 'calls.json'), 'w', encoding='utf-8'), indent=1, ensure_ascii=False)
    print(f'  planned in {os.path.relpath(d, film)}/calls.json; after each job: sfx.py "$FILM" {name} --add <try> --file <download> --job <id>')
    return calls


def add_try(film, name, k, files, jobs, credits):
    """Takes in try k from its downloaded file(s): keeps the raw original, cleans it, records it."""
    d = folder_of(film, name)
    cj = load_calls(d)
    t0 = next((t for t in cj.get('tries', []) if t['try'] == k), None)
    if not t0:
        sys.exit(f'{name} has no planned try {k} in calls.json: plan it first (--plan, or --prompt)')
    if len(files) != len(t0.get('pieces') or [1]):
        sys.exit(f'try {k} was planned in {len(t0.get("pieces") or [1])} piece(s); {len(files)} file(s) given')
    out = os.path.join(d, f'{name}-try{k}.wav')
    if os.path.exists(out):
        sys.exit(f'{os.path.relpath(out, film)} exists: a try is never overwritten')
    os.makedirs(os.path.join(d, 'raw'), exist_ok=True)
    raws = []
    for j, f in enumerate(files, 1):
        if not os.path.isfile(f):
            sys.exit(f'no such file: {f}')
        part = '' if len(files) == 1 else f'-part{j}'
        rp = os.path.join(d, 'raw', f'{name}-try{k}{part}-raw{os.path.splitext(f)[1] or ".audio"}')
        if os.path.exists(rp):
            sys.exit(f'{os.path.relpath(rp, film)} exists: a raw original is never overwritten')
        shutil.copy2(f, rp); raws.append(rp)
    clean(raws, out, float(t0.get('crossfade', 2)))
    eff = cj.get('effect') or {}
    purpose = f'{eff.get("id", name)}: {(eff.get("what") or t0["prompt"])[:70]} ({t0["style"]})'
    for j, job in enumerate(jobs or [None]):
        where = f'audio/sfx/{name}/{name}-try{k}.wav' + (f' piece {j + 1} of {len(jobs)}' if len(jobs) > 1 else '')
        spend_row(film, job, f'1 try, {t0["pieces"][min(j, len(t0["pieces"]) - 1)]:g} s', where, purpose,
                  credits if j == 0 else None)
    t = dict(**{'try': k}, file=os.path.relpath(out, film), raw=[os.path.relpath(r, film) for r in raws], prompt=t0['prompt'],
             style=t0['style'], seconds_asked=t0['duration'], seconds=seconds_of(out), pieces=len(raws), lufs=lufs(out),
             job_ids=[j for j in jobs if j], made=now())
    pj = load_prompts(d)
    prompts_list = pj.get('prompts') or []
    while len(prompts_list) < k - 1:
        prompts_list.append(None)
    if len(prompts_list) >= k:
        prompts_list[k - 1] = t0['prompt']
    else:
        prompts_list.append(t0['prompt'])
    pj['prompts'] = prompts_list
    pj['tries'] = [x for x in pj.get('tries', []) if x.get('try') != k] + [t]
    pj['model'] = MODEL
    if eff:
        pj['effect'] = eff
    json.dump(pj, open(os.path.join(d, 'prompts.json'), 'w', encoding='utf-8'), indent=1, ensure_ascii=False)
    print(f'{name} try {k} -> {t["file"]}, {t["seconds"]} s, {t["lufs"]} LUFS; raw kept in {os.path.relpath(d, film)}/raw/')


# ---- the plan

def effect_name(e):
    if e.get('name'):
        return slug(e['name'])
    if e.get('file'):
        return slug(os.path.basename(e['file']))
    return slug(f'{e.get("id", "fx")}-{e.get("kind", "sound")}')


def freeze(plan_p, refreeze):
    sha = hashlib.sha1(open(plan_p, 'rb').read()).hexdigest()
    fz = os.path.splitext(plan_p)[0] + '-frozen.txt'
    if os.path.exists(fz):
        m = re.search(r'sha1 ([0-9a-f]{40})', open(fz).read())
        if m and m.group(1) != sha and not refreeze:
            sys.exit(f'{os.path.basename(plan_p)} changed after it was frozen ({os.path.basename(fz)}): say why in the plan, then --refreeze')
        if m and m.group(1) == sha:
            return sha, False
    with open(fz, 'w') as f:
        f.write(f'{os.path.basename(plan_p)} sha1 {sha}\nfrozen at {now()}\n')
    return sha, True


def run_plan(film, plan_p, only, again, dry, xf, refreeze, tries_override):
    plan_p = plan_p if os.path.isabs(plan_p) else os.path.join(film, plan_p)
    plan = json.load(open(plan_p, encoding='utf-8'))
    if dry:
        sha, made = hashlib.sha1(open(plan_p, 'rb').read()).hexdigest(), False
    else:
        sha, made = freeze(plan_p, refreeze)
        if made:
            print(f'froze {os.path.relpath(plan_p, film)} (sha1 {sha[:12]}) before anything is made')
    info = {'plan': os.path.relpath(plan_p, film), 'plan_sha1': sha}
    total = 0
    for e in plan.get('effects', []):
        if only and e.get('id') not in only:
            continue
        name = effect_name(e)
        e = dict(e, _fps=plan.get('fps') or 24)
        d = folder_of(film, name)
        if os.path.isdir(d) and (last_try(d, name, load_prompts(d)) or load_calls(d).get('tries')) and not again:
            print(f'{name} ({e.get("id")}): has tries already; skipped (--again plans more)'); continue
        n = tries_override or e.get('tries') or (len(e['variations']) if e.get('variations') else 3 if e.get('kind') == 'bed' else 4)
        total += plan_sound(film, name, e, [], n, xf, dry, plan_info=info)
    print(f'{"would plan" if dry else "planned"} {total} generate_audio calls')
    return total


# ---- the pick

def film_title(film):
    for p in ('brief.md',):
        fp = os.path.join(film, p)
        if os.path.exists(fp):
            for line in open(fp, encoding='utf-8'):
                if line.startswith('# '):
                    return line[2:].strip()
    h = os.path.join(film, 'higgsfield.json')
    if os.path.exists(h):
        return json.load(open(h)).get('title') or os.path.basename(film)
    return os.path.basename(film)


def taste_row(path, row):
    """The row after the last row of the table under '## The record' (as the app's appendTasteRow does)."""
    lines = open(path, encoding='utf-8').read().split('\n')
    start = next((i for i, l in enumerate(lines) if re.match(r'^##\s+The record', l, re.I)), 0)
    last = -1
    for i in range(start, len(lines)):
        if i > start and lines[i].startswith('## ') and last >= 0:
            break
        if lines[i].strip().startswith('|'):
            last = i
    if last < 0:
        lines.append(row)
    else:
        lines.insert(last + 1, row)
    open(path, 'w', encoding='utf-8').write('\n'.join(lines))


def pick(film, name, n, note, predicted, taste, taste_file):
    d = folder_of(film, name)
    pj = load_prompts(d)
    if not pj:
        sys.exit(f'no {os.path.relpath(d, film)}/prompts.json')
    tries = {t['try']: t for t in pj.get('tries', [])}
    for k, p in enumerate(pj.get('prompts') or [], 1):           # folders that hold prompts only
        if k not in tries and p:
            f = sorted(glob.glob(os.path.join(d, f'*try{k}.wav')) + glob.glob(os.path.join(d, f'*try{k}-*.wav')))
            tries[k] = {'try': k, 'prompt': p, 'file': os.path.relpath(f[0], film) if f else None, 'style': None}
    if n not in tries:
        sys.exit(f'{name} has no try {n} (tries: {", ".join(map(str, sorted(tries)))})')
    keep = lambda t: {k: t.get(k) for k in ('try', 'file', 'prompt', 'style')}
    pk = os.path.join(d, 'pick.json')
    prev = json.load(open(pk, encoding='utf-8')) if os.path.exists(pk) else None
    rec = {'sound': name, 'effect': (pj.get('effect') or {}).get('id'), 'picked': keep(tries[n]),
           'passed_over': [keep(tries[k]) for k in sorted(tries) if k != n], 'note': note or '',
           'predicted': predicted, 'right': None if predicted is None else predicted == n, 'date': today()}
    if prev:
        rec['previous'] = [{k: v for k, v in prev.items() if k != 'previous'}] + prev.get('previous', [])
    json.dump(rec, open(pk, 'w', encoding='utf-8'), indent=1, ensure_ascii=False)
    pj['picked'] = {'try': n, 'date': today(), 'note': note or ''}
    json.dump(pj, open(os.path.join(d, 'prompts.json'), 'w', encoding='utf-8'), indent=1, ensure_ascii=False)
    print(f'{name}: try {n} picked -> {os.path.relpath(pk, film)}; {len(rec["passed_over"])} passed over')
    cell = lambda s: (str(s) if s is not None else '').replace('|', '/').replace('\n', ' ').strip() or '–'
    styles = ' · '.join(f'{k} {tries[k].get("style") or "?"}' for k in sorted(tries))
    eff = pj.get('effect') or {}
    what = f'{name} sound' + (f' ({eff["id"]}, {eff.get("kind", "effect")})' if eff.get('id') else '')
    p = tries[n]
    row = '| ' + ' | '.join(cell(x) for x in [
        today(), film_title(film), what,
        f'tries {styles} ({len(tries)})', f'**try {n}**: {p.get("style") or ""} · {(p.get("prompt") or "")[:120]}',
        f'"{note}"' if note else '– (picked on its card)', f'try {predicted}' if predicted is not None else 'no prediction made',
        '–' if predicted is None else ('yes' if predicted == n else 'no'), '–']) + ' |'
    if taste:
        tf = taste_file or os.path.join(STUDIO, 'taste.md')
        if not os.path.exists(tf):
            print(f'  warning: no {tf}; the taste row is not written:\n  {row}')
        else:
            taste_row(tf, row)
            print(f'  taste.md row added ({os.path.abspath(tf)}); its "What it says" cell is yours to write')
    else:
        print('  taste.md row (not written):\n  ' + row)


# ---- the command

def main(argv=None):
    a = list(sys.argv[1:] if argv is None else argv)
    if not a or a[0] in ('-h', '--help'):
        print(__doc__); return 0

    def opt(nm, default=None, many=False):
        out = []
        while nm in a:
            i = a.index(nm); out.append(a[i + 1]); del a[i:i + 2]
            if not many:
                break
        return out if many else (out[0] if out else default)

    def flag(nm):
        if nm in a:
            a.remove(nm); return True
        return False

    prompts = opt('--prompt', many=True); plan = opt('--plan'); only = opt('--only', many=True)
    seconds = opt('--seconds'); gen_s = opt('--generate-seconds'); kind = opt('--kind', 'reaction'); tries = opt('--tries')
    xf = float(opt('--crossfade', '2')); pick_n = opt('--pick'); note = opt('--note'); predicted = opt('--predicted')
    taste_file = opt('--taste-file'); add_n = opt('--add'); files = opt('--file', many=True); jobs = opt('--job', many=True)
    credits = opt('--credits')
    dry, again, refreeze, no_taste = flag('--dry-run'), flag('--again'), flag('--refreeze'), flag('--no-taste')
    if not a:
        sys.exit('give the film folder first')
    film = os.path.abspath(os.path.expanduser(a.pop(0)))
    if not os.path.isdir(film):
        sys.exit(f'not a folder: {film}')
    if plan:
        run_plan(film, plan, set(only), again, dry, xf, refreeze, int(tries) if tries else None); return 0
    if not a:
        sys.exit('give the sound\'s name (its folder under audio/sfx/), or --plan')
    name = slug(a.pop(0))
    if pick_n is not None:
        pick(film, name, int(pick_n), note, int(predicted) if predicted is not None else None, not no_taste, taste_file); return 0
    if add_n is not None:
        if not files:
            sys.exit('give --file <the downloaded result> (one per piece, in order)')
        add_try(film, name, int(add_n), files, jobs, float(credits) if credits else None); return 0
    if not prompts:
        sys.exit('give at least one --prompt (literal first, then natural and close, quieter, in between)')
    if not seconds and not gen_s:
        sys.exit('give --seconds (its place on the cut) or --generate-seconds')
    effect = {'kind': kind, 'what': prompts[0]}
    if seconds:
        effect['seconds'] = float(seconds)
    if gen_s:
        effect['generate_seconds'] = float(gen_s)
    n = int(tries) if tries else max(3 if kind == 'bed' else 4, min(len(prompts), 5))
    calls = plan_sound(film, name, effect, prompts, n, xf, dry)
    print(f'{"would plan" if dry else "planned"} {calls} generate_audio calls')
    return 0


if __name__ == '__main__':
    sys.exit(main())
