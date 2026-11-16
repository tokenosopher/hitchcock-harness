"""Record one voice candidate made on Higgsfield into voices/options.json, in the shape the Hitchcock Harness reads. Calls
no service: Alma makes the candidate through the MCP server (a preset's preview from list_voices, seed_audio from the
face, a qwen_audio_tts variant of a preset), saves the audio, and runs this once per candidate.
    FILM=<film> .venv/bin/python tools/voices/hf_candidates.py add <CID> --round <r> --kind preset|face|variant --file <audio>
        [--voice-id ID] [--voice-type preset|element] [--job ID] [--instruction '...'] [--brief '...'] [--option N]
    FILM=<film> .venv/bin/python tools/voices/hf_candidates.py list [<CID>]
--file is copied into voices/options/<CID>-<name>-<round>-<n><ext> unless it is already under the film folder. The
candidate's pitch (f0, the median of the voiced frames, as measure.py measures it) and length are measured; when the
file speaks the element line first ("This is how I look and this is how I sound."), as every generated candidate does,
f0_element_line is the pitch of its first 3.3 s. --round is a name ("r1") or a number. The option number is the next
free one for the character (or --option N). The round's text comes from voices/spec.py: SPEC[<CID>]['text'] (the
candidate text) is written as rounds.<round>.design_prompt, with the brief (SPEC 'desc') and the instruction beside it.
Each option: {option, round, file, f0, f0_element_line, seconds, brief, voice_id, kind, voice_type, job, instruction}."""
import json, os, re, shutil, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import film
from measure import f0

ELEMENT_LINE = 'This is how I look and this is how I sound.'
KINDS = {'preset': 'preset voice', 'face': 'a voice from the face', 'variant': 'a variant of a preset'}


def usage():
    print(__doc__); sys.exit(0)


def opt(a, name, default=None):
    if name in a:
        i = a.index(name)
        if i + 1 >= len(a): sys.exit(f'{name} needs a value')
        v = a[i + 1]; del a[i:i + 2]; return v
    return default


def f0_head(path, seconds=3.3):
    """Median pitch of the first seconds (the element line), measured as measure.f0 does."""
    import subprocess, tempfile
    fd, tmp = tempfile.mkstemp(suffix='.wav'); os.close(fd)
    try:
        subprocess.run([film.FFMPEG, '-y', '-v', 'error', '-i', path, '-t', f'{seconds}', '-ac', '1', tmp], check=True)
        return f0(tmp)
    finally:
        os.remove(tmp)


def main():
    a = sys.argv[1:]
    if not a or a[0] in ('-h', '--help'): usage()
    cmd = a.pop(0)
    F = film.film_root(a)
    H = os.path.join(F, 'voices'); oj = os.path.join(H, 'options.json')
    O = json.load(open(oj)) if os.path.exists(oj) else {}
    if cmd == 'list':
        for cid, rec in O.items():
            if a and cid not in a: continue
            print(cid, rec.get('name', ''), '| chosen:', (rec.get('chosen') or {}).get('option'))
            for o in rec.get('options', []):
                print(f"  {o['option']:>3} {str(o.get('round')):>4} {o.get('kind', ''):8} {o.get('f0')} Hz {o.get('seconds')} s  {o['file']}")
        return
    if cmd != 'add': usage()
    rnd = opt(a, '--round'); kind = opt(a, '--kind'); src = opt(a, '--file')
    vid = opt(a, '--voice-id'); vtype = opt(a, '--voice-type'); job = opt(a, '--job')
    instr = opt(a, '--instruction'); brief = opt(a, '--brief'); onum = opt(a, '--option')
    if not a: sys.exit('give the character ID: hf_candidates.py add <CID> --round ... --kind ... --file ...')
    cid = a[0]
    if not (rnd and kind and src): sys.exit('add needs --round, --kind and --file')
    if kind not in KINDS: sys.exit('--kind is preset, face or variant')
    if vtype and vtype not in ('preset', 'element'): sys.exit('--voice-type is preset or element')
    if kind == 'preset' and not vid: sys.exit('a preset candidate needs --voice-id (the preset\'s voice_id)')
    if instr and len(instr) > 128: print(f'note: the instruction is {len(instr)} characters; Higgsfield takes at most 128')
    src = os.path.abspath(os.path.expanduser(src))
    if not os.path.isfile(src): sys.exit(f'no such file: {src}')
    round_v = int(rnd) if re.fullmatch(r'\d+', rnd) else rnd
    S_ = film.load_spec(F, required=False)
    sp = (getattr(S_, 'SPEC', {}) if S_ else {}).get(cid, {})
    rec = O.setdefault(cid, {})
    name = rec.get('name') or sp.get('name') or cid
    rec['name'] = name
    opts = rec.setdefault('options', [])
    n = int(onum) if onum else max([o.get('option', 0) for o in opts] or [0]) + 1
    if any(o.get('option') == n for o in opts): sys.exit(f'{cid} already has option {n}')

    # the file, under the film folder
    rf = os.path.realpath(F)
    if os.path.realpath(src).startswith(rf + os.sep):
        dst = src
    else:
        d = os.path.join(H, 'options'); os.makedirs(d, exist_ok=True)
        slug = re.sub(r'[^a-z0-9]+', '-', name.lower()).strip('-') or cid.lower()
        dst = os.path.join(d, f'{cid}-{slug}-{rnd}-{n}{os.path.splitext(src)[1].lower()}')
        if os.path.exists(dst): sys.exit(f'{dst} exists already')
        shutil.copy2(src, dst)
    rel = os.path.relpath(os.path.realpath(dst), rf)

    secs = round(film.dur(dst), 2)
    hz = f0(dst)
    text = sp.get('text') or ''
    speaks_line = kind != 'preset' and film.canon(text)[:len(film.canon(ELEMENT_LINE))] == film.canon(ELEMENT_LINE)
    o = dict(option=n, round=round_v, file=rel, f0=hz, f0_element_line=f0_head(dst) if speaks_line else None,
             seconds=secs, brief=brief or KINDS[kind] + (f' ({vid})' if kind != 'face' and vid else ''),
             voice_id=vid, kind=kind, voice_type=vtype or ('preset' if kind in ('preset', 'variant') and vid else None),
             job=job, instruction=instr)
    opts.append(o)
    R = rec.setdefault('rounds', {}).setdefault(str(rnd), {})
    if text and 'design_prompt' not in R: R['design_prompt'] = text
    if sp.get('desc') and 'brief' not in R: R['brief'] = sp['desc']
    if instr: R['instruction'] = instr
    os.makedirs(H, exist_ok=True)
    json.dump(O, open(oj, 'w'), indent=1, ensure_ascii=False)
    print(f'{cid} {name} option {n} ({kind}, round {rnd}): {rel}, {secs} s, f0 {hz} Hz'
          + (f', element line {o["f0_element_line"]} Hz' if o['f0_element_line'] else ''))


if __name__ == '__main__':
    main()
