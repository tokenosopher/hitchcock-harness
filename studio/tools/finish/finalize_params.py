"""Turn a draft's generate_video params into the 1080p finalize params for the same take. Prints JSON for the Higgsfield
generate_video tool; submits nothing.
    .venv/bin/python tools/finish/finalize_params.py DRAFT_PARAMS.json --draft-job JOB_ID [--cost]
    .venv/bin/python tools/finish/finalize_params.py DRAFT_PARAMS.json --draft-job $TK/<G>-take<N>.jobid [--film $FILM] [--cost]
    .venv/bin/python tools/finish/finalize_params.py DRAFT_PARAMS.json --film $FILM --gen S4 --take 2 [--cost]
The draft's job id, in this order:
  1. --draft-job: the id itself, or a .jobid file, or the take folder holding one (relative paths from --film, else the cwd);
  2. --film + --gen (+ --take N): the job-id file the take was logged in, generations/<G>/takes/take<N>/<G>-take<N>.jobid (the
     landing tool's name; FIX-<name>-take<N>.jobid for a pick-up), else take<N>.jobid in that folder. A 1080p pass's own
     <id>-take<N>-1080p.jobid is never taken for the draft. Without --take the generation must hold exactly one draft
     job-id file;
  3. a video/plan.json in the film (the last non-finalize entry for --gen), only when that file exists.
DRAFT_PARAMS.json: the exact params the draft was submitted with. Best source: show_generation_by_ids on the draft job (it
returns what was really sent; save its params object to a file). Second best: the prompt and media list kept as sent beside
the take. Do not rebuild the prompt: the film's prompt files usually changed after the take was shot.
The finalize needs the draft's full params (prompt, medias, and declined_preset_id when the draft declined a preset) plus
resolution 1080p and draft_job_id; with only draft_job_id the call fails with "prompt too short".
--cost adds get_cost: true, a free quote. Billed for the WHOLE generation (quote with get_cost every time). Use only on the
user's say-so for this spend. A draft is finalizable for 7 days. The job-id lookup is unproven: check the id it prints."""
import argparse, glob, json, os, re, sys

ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
ap.add_argument('params')
ap.add_argument('--draft-job', help='job id, or a .jobid file, or a take folder holding one')
ap.add_argument('--film', default=os.environ.get('FILM'))
ap.add_argument('--gen', help='the generation (S4, FIX-door-S4)')
ap.add_argument('--take', type=int, help='take number, with --gen')
ap.add_argument('--cost', action='store_true', help='add get_cost: true (quote only)')
A = ap.parse_args()
FILM = os.path.abspath(os.path.expanduser(A.film)) if A.film else None


def read_jobid(path):
    txt = open(path).read().strip().split()
    if not txt: sys.exit(f'finalize_params.py: {path} is empty')
    return txt[0], path


def from_path(p):
    """A .jobid file, or a take folder holding exactly one."""
    if os.path.isfile(p): return read_jobid(p)
    if os.path.isdir(p):
        ids = sorted(f for f in glob.glob(os.path.join(p, '*.jobid')) if not re.search(r'-1080p?\.jobid$', f))
        if len(ids) == 1: return read_jobid(ids[0])
        sys.exit(f'finalize_params.py: {p} holds {len(ids)} draft job-id files: {[os.path.basename(i) for i in ids]}')
    return None


def from_film(F, gen, take):
    """The job-id file of a take, in the video-driven layout (then an older film's blocks/ layout)."""
    pats = []
    for top in ('generations', 'blocks'):
        G = os.path.join(F, top, gen, 'takes')
        if take is not None:
            pats += [os.path.join(G, f'take{take}', f'{gen}-take{take}.jobid'), os.path.join(G, f'take{take}', f'take{take}.jobid'),
                     os.path.join(G, f'take{take}', '*.jobid'),
                     os.path.join(G, f'take{take}.jobid'), os.path.join(G, f'*take{take}.jobid')]
        else:
            pats += [os.path.join(G, 'take*', '*.jobid'), os.path.join(G, '*.jobid')]
    found = []
    for pat in pats:
        for f in sorted(glob.glob(pat)):
            if re.search(r'-1080p?\.jobid$', f) or f in found: continue        # the 1080p pass's own job is not a draft
            found.append(f)
        if found and take is not None: break
    if len(found) == 1: return read_jobid(found[0])
    if found: sys.exit(f'finalize_params.py: {len(found)} job-id files for {gen}; pass --take N: ' + ', '.join(os.path.relpath(f, F) for f in found))
    return None


job = src = None
if A.draft_job:
    p = A.draft_job if os.path.isabs(A.draft_job) else os.path.join(FILM or os.getcwd(), A.draft_job)
    got = from_path(os.path.expanduser(p)) if (os.sep in A.draft_job or A.draft_job.endswith('.jobid') or os.path.exists(p)) else None
    job, src = got if got else (A.draft_job, 'given')
elif FILM and A.gen:
    got = from_film(FILM, A.gen, A.take)
    if got: job, src = got
    else:
        plan_p = os.path.join(FILM, 'video', 'plan.json')
        if os.path.exists(plan_p):
            es = [e for e in json.load(open(plan_p)) if e.get('gen') == A.gen and not e['gen'].startswith('F-')]
            if es: job, src = es[-1]['job_id'], 'video/plan.json'
        if not job:
            sys.exit(f'finalize_params.py: no job-id file for {A.gen}' + (f' take {A.take}' if A.take is not None else '') +
                     ' under generations/ or blocks/' + (', and no entry in video/plan.json' if os.path.exists(plan_p) else ''))
if not job: sys.exit('finalize_params.py: give --draft-job JOB_ID (or its .jobid file), or --film and --gen [--take N]')
if src not in ('given', 'video/plan.json'):
    src = os.path.relpath(src, FILM) if FILM and os.path.abspath(src).startswith(FILM + os.sep) else src
print(f'draft job {job} (from {src})', file=sys.stderr)

d = json.load(open(A.params))
d = d.get('params', d)                       # accept a saved tool call ({"params": {...}}) or the bare params
problems, notes = [], []
if len(str(d.get('prompt', ''))) < 200: problems.append('prompt missing or short: use the draft\'s full prompt (show_generation_by_ids)')
if not d.get('medias'): problems.append('no medias: the finalize needs the draft\'s media list')
if not d.get('declined_preset_id'): notes.append('no declined_preset_id: fine unless the draft was submitted declining a preset')
if d.get('draft') is False or ('draft' not in d and str(d.get('resolution', '')).lower() == '480p'):
    problems.append('the params do not say draft: true; a 480p job sent without it cannot be finalized')
for k in ('draft', 'get_cost', 'draft_job_id', 'resolution'): d.pop(k, None)
d['resolution'] = '1080p'; d['draft_job_id'] = job
if A.cost: d['get_cost'] = True
for p in problems: print('WARNING:', p, file=sys.stderr)
for n in notes: print('note:', n, file=sys.stderr)
print(json.dumps(d, ensure_ascii=False))
