"""Start a new film: the folder tree, brief.md, spend.md, regeneration-log.md, the cards file the Hitchcock Harness reads
(review/cards.json), the Higgsfield and element records, the upload registry; and the film's line in the studio's
films.txt. Flow v3.3 - 1 Setup and story, done in one command. Never overwrites a file. Calls no service.

    .venv/bin/python tools/film/new_film.py assets/films/<film> --title "<Public Title>" --code <ABC> [--ratio 9:16|16:9|21:9|1:1]
                                            [--budget-credits N] [--date YYYY-MM-DD]

--code is the film's short code (2 to 6 capitals or digits, e.g. LHK): the prefix of its Higgsfield element and upload
names. --ratio defaults to 9:16 and --budget-credits to 2000 (the setup defaults). The ratio goes into brief.md as its
"- Aspect ratio:" line, which the Hitchcock Harness reads for the frame of the film's cut (9:16 1080x1920, 16:9 1920x1080,
21:9 2520x1080, 1:1 1080x1080), and into higgsfield.json for every Seedance job.
--date is the day the film starts (default today); it dates the delivery folder assets/final-cuts/<date> <Title>."""
import argparse, datetime, json, os, re, sys

HERE = os.path.dirname(os.path.abspath(__file__))
TOOLS = os.path.dirname(HERE)
STUDIO = os.path.dirname(TOOLS)
DEFAULT_BUDGET = 2000

# The tree of Flow v3.3 - 1 Setup and story, step 3, with generations/ in place of blocks/ (script.md, refs/README.md,
# refs/characters/SOURCES.md and video/ come with the steps that fill them).
TREE = [
    'story',           # story/v1.md, v2.md...: the short story, one file per version
    'refs/characters', 'refs/analysis', 'refs/research',
    'cast',            # cast/C0N-<name>/: face rounds, the pick, the sheet
    'elements',        # elements/<CID>/: the element clips, a folder per take
    'voices', 'audio',
    'locations',       # locations/L0N-<name>/
    'props',           # props/P0N-<name>/
    'previz',          # previz/S<n>/
    'generations',     # generations/<G>/ (scene text, prompt versions, media lists, takes/take<N>/); generations/FIX-<what>/
    'cut', 'social', 'subtitles',
    'review',          # cards.json, the cards the app shows
]


def write_new(path, text, made, kept):
    """Create a file only if it does not exist yet."""
    try:
        with open(path, 'x', encoding='utf-8') as f:
            f.write(text)
        made.append(path)
    except FileExistsError:
        kept.append(path)


def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0], formatter_class=argparse.RawDescriptionHelpFormatter,
                                 epilog=__doc__.split('\n\n', 1)[1])
    ap.add_argument('film', help='the film folder to create (or complete)')
    ap.add_argument('--title', required=True, help='the public title, e.g. "The Lighthouse Keeper"')
    ap.add_argument('--code', required=True, help='short code, 2 to 6 capitals or digits, e.g. LHK')
    ap.add_argument('--ratio', default='9:16', choices=['9:16', '16:9', '21:9', '1:1'],
                    help='the film\'s frame, which the app sizes the cut from (default 9:16)')
    ap.add_argument('--budget-credits', type=int, help=f'the Higgsfield credit budget the user set (default {DEFAULT_BUDGET})')
    ap.add_argument('--date', help='the day the film starts, YYYY-MM-DD (default today)')
    A = ap.parse_args()

    if not re.fullmatch(r'[A-Z0-9]{2,6}', A.code):
        sys.exit(f'--code must be 2 to 6 capitals or digits (got {A.code!r})')
    title = A.title.strip()
    if not title or '/' in title:
        sys.exit('--title must be a plain title (no "/"; it names the delivery folder)')
    day = A.date or datetime.date.today().isoformat()
    try:
        d = datetime.date.fromisoformat(day)
    except ValueError:
        sys.exit(f'--date must be YYYY-MM-DD (got {day!r})')
    day_long = f'{d.day} {d.strftime("%b %Y")}'
    film = A.film if os.path.isabs(os.path.expanduser(A.film)) else os.path.join(STUDIO, A.film)
    film = os.path.abspath(os.path.expanduser(film))
    name = os.path.basename(film)
    if not re.fullmatch(r'[a-z0-9][a-z0-9-]*', name):
        sys.exit(f'name the film folder in lower case with hyphens (got {name!r}), e.g. the-lighthouse-keeper')
    parent = os.path.dirname(film)
    if not os.path.isdir(parent):
        sys.exit(f'the parent folder does not exist: {parent} (run the app\'s setup.sh, which makes assets/films)')

    made, kept = [], []
    os.makedirs(film, exist_ok=True)
    for sub in TREE:
        p = os.path.join(film, sub)
        if not os.path.isdir(p):
            os.makedirs(p)
            made.append(p + '/')

    delivery = f'{day} {title}'
    budget = f'{A.budget_credits} credits (the user\'s figure)' if A.budget_credits else f'{DEFAULT_BUDGET} credits (the setup default)'

    write_new(os.path.join(film, 'brief.md'), f"""# {title}

Started {day_long}. Folder `{name}`.

- Title: {title}
- Code: {A.code} (Higgsfield element and upload names start with `{A.code}-`)
- Aspect ratio: {A.ratio}
- Budget: {budget}
- Delivery folder: `assets/final-cuts/{delivery}`
- Setup defaults: {A.ratio}; voices from Higgsfield; video elements 1920x1080, 5 s; 1080p by Seedance 2.5 finalize

## Premise

## Decisions
- **Aspect ratio {A.ratio}.**

## Cast

## Locations

## Props

## Look
""", made, kept)

    write_new(os.path.join(film, 'spend.md'), f"""# Spend · {title}

Budget: {budget}. One line per paid job, written when it is submitted; a blocked job at 0.

| date | stage | service | job id | units | rate | cost | version or take | purpose | the user's go |
|---|---|---|---|---|---|---|---|---|---|
""", made, kept)

    write_new(os.path.join(film, 'regeneration-log.md'), f"""# Regeneration log · {title}

Every miss in a landed take, by category (camera/geography, blocking/count, prop/scale, performance/lines, audio, effect),
each with what fixes it: the previz, the prompt, a reference, or the edit with no new take.
""", made, kept)

    cards = dict(title=title, subtitle=f'Setup · the film folder is made · {day_long}', delivery_folder=delivery, sections=[])
    write_new(os.path.join(film, 'review', 'cards.json'), json.dumps(cards, indent=1, ensure_ascii=False) + '\n', made, kept)

    write_new(os.path.join(film, 'higgsfield.json'), json.dumps({
        'title': title, 'code': A.code, 'aspect_ratio': A.ratio,
        'project_id': None, 'project_name': f'{A.code} {title}', 'workspace_id': None,
        'folders': {'cast': None, 'locations': None, 'prompts': None, 'generations': {}},
        'note': 'create_project once, create_folder per generation (S1, S2, ... and FIX-<what>) and for cast, locations, '
                'prompts; write each id here and pass the folder_id with every job.'}, indent=1) + '\n', made, kept)

    write_new(os.path.join(film, 'elements.json'), json.dumps({
        'elements': {},
        'note': 'elements: image elements by ID (C01, L01, P01): {name, id, media_id, job_id, source}; in prompts <<<id>>>. '
                'clips: video elements E-<CID>: {file, media_id, job_id, take}; passed to scenes as video_references.'},
        indent=1) + '\n', made, kept)

    write_new(os.path.join(film, 'generations', 'upload-registry.json'), '{}\n', made, kept)

    # films.txt at the studio root: the films the app shows
    films_txt = os.path.join(STUDIO, 'films.txt')
    entry = os.path.relpath(film, os.path.join(STUDIO, 'assets', 'films'))
    if entry.startswith('..') or os.sep in entry:
        listed = 'films.txt not touched: the folder is not in assets/films/'
    else:
        txt = open(films_txt).read() if os.path.exists(films_txt) else ''
        if entry in [l.strip() for l in txt.splitlines()]:
            listed = f'{entry} already in films.txt'
        else:
            with open(films_txt, 'a') as f:
                f.write(('' if txt.endswith('\n') or not txt else '\n') + entry + '\n')
            listed = f'{entry} added to films.txt'

    rel = lambda p: os.path.relpath(p, film)
    brief_p = os.path.join(film, 'brief.md')
    if brief_p in kept:                                  # an existing film: report what its files hold, not the arguments
        b = open(brief_p, errors='replace').read()
        mt = re.search(r'^- Title: (.+)$', b, re.M)
        if mt and mt.group(1).strip() != title:
            print(f'note: brief.md keeps the title "{mt.group(1).strip()}"; the new title was not applied anywhere')
            title = mt.group(1).strip()
        cj = os.path.join(film, 'review', 'cards.json')
        if os.path.exists(cj):
            cd = json.load(open(cj, encoding='utf-8'))
            delivery = cd.get('delivery_folder') or delivery
    print(f'{os.path.relpath(film, STUDIO)}')
    print(f'  made: {", ".join(rel(p) for p in made) or "nothing (all there)"}')
    if kept:
        print(f'  kept as they were: {", ".join(rel(p) for p in kept)}')
    print(f'  {listed}')
    print(f'  delivery folder: assets/final-cuts/{delivery} (made at the first delivery)')
    print(f"""next:
  Higgsfield: balance; create_project "{A.code} {title}"; create_folder for cast, locations, prompts and each generation;
  write the ids into higgsfield.json and pass folder_id with every job.""")


if __name__ == '__main__':
    main()
