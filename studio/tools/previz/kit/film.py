"""The film's previz config, read from the film folder. Plain Python (no bpy): Blender scene scripts, storyboard.py and
assemble_film.py all use it.

    <film>/previz/film.json   (optional; every key optional)
    {"title": "...", "prefix": "ABC", "ratio": "9:16" | "16:9", "fps": 24, "res": 540,
     "cast": {"KEY": {"height": 1.70, "name": "..."}},
     "locations": {"L01": {"name": "...", "room": {plan} | "path/to/room.json"}}}

Fallbacks without film.json (or for a key it leaves out): the ratio from brief.md ("aspect ratio ... 9:16"), the title from
brief.md's first heading, the prefix from the folder name's initials (my-new-film -> MNF), fps 24, res 540, no cast, no
locations. `res` is the SHORT side of the draft frame in pixels (540 -> 540x960 at 9:16, 960x540 at 16:9)."""
import json, os, re

RATIOS = {'9:16': (9, 16), '16:9': (16, 9)}


class Film(object):
    def __init__(self, folder):
        self.folder = os.path.abspath(folder)
        self.config_path = os.path.join(self.folder, 'previz', 'film.json')
        d = {}
        if os.path.exists(self.config_path):
            with open(self.config_path) as fh: d = json.load(fh)
        brief = ''
        bp = os.path.join(self.folder, 'brief.md')
        if os.path.exists(bp):
            with open(bp) as fh: brief = fh.read()
        self.data = d
        self.ratio = str(d.get('ratio') or _ratio_from_brief(brief) or '9:16')
        if self.ratio not in RATIOS: raise ValueError('film ratio must be 9:16 or 16:9, not %r' % self.ratio)
        self.aspect = RATIOS[self.ratio]
        self.fps = int(d.get('fps', 24))
        self.res = int(d.get('res', 540))
        self.title = d.get('title') or _title_from_brief(brief) or os.path.basename(self.folder).replace('-', ' ').title()
        self.prefix = d.get('prefix') or ''.join(w[0] for w in re.split(r'[-_ ]+', os.path.basename(self.folder)) if w).upper() or 'FILM'
        self.cast = {k.upper(): dict(v) for k, v in (d.get('cast') or {}).items()}
        self.locations = dict(d.get('locations') or {})

    @property
    def portrait(self): return self.aspect[0] < self.aspect[1]

    def size(self, res=None):
        """(width, height) in pixels for a short side of res (default the film's res); both even"""
        s = int(res or self.res); w, h = self.aspect
        long_ = int(round(s * max(w, h) / float(min(w, h)) / 2.0)) * 2
        return (s, long_) if self.portrait else (long_, s)

    def character(self, key):
        return self.cast.get(str(key).upper(), {})

    def room_plan(self, key):
        """the plan dict of location `key` (inline in film.json, or a json path relative to the film folder)"""
        if key not in self.locations: raise KeyError('location %r is not in %s (locations: %s)' % (key, self.config_path, ', '.join(self.locations) or 'none'))
        r = self.locations[key].get('room')
        if isinstance(r, str):
            p = r if os.path.isabs(r) else os.path.join(self.folder, r)
            with open(p) as fh: r = json.load(fh)
        if not isinstance(r, dict): raise ValueError('location %r has no room plan' % key)
        r = dict(r); r.setdefault('name', key)
        return r

    def generation_dir(self, gen):
        """the generation's folder, as the pre-submit check finds it: generations/<gen> if it exists, else blocks/<gen> if it
        exists, else a new one under generations/ if that folder exists, else under blocks/"""
        for root in ('generations', 'blocks'):
            p = os.path.join(self.folder, root, gen)
            if os.path.isdir(p): return p
        g = os.path.join(self.folder, 'generations')
        return os.path.join(g if os.path.isdir(g) else os.path.join(self.folder, 'blocks'), gen)


def _ratio_from_brief(text):
    m = re.search(r'aspect\s*ratio\W{0,6}(9:16|16:9)', text, re.I)
    if m: return m.group(1)
    a, b = text.count('9:16'), text.count('16:9')
    return '9:16' if a > b else '16:9' if b > a else None


def _title_from_brief(text):
    for line in text.splitlines():
        if line.startswith('# '): return re.sub(r'\s*\(.*$', '', line[2:]).strip() or None
    return None


def find_film(path):
    """the film folder above a path inside it (<film>/previz/<G>/storyboard/v1 -> <film>), or None"""
    p = os.path.abspath(path)
    while True:
        if os.path.basename(p) == 'previz': return os.path.dirname(p)
        if os.path.isdir(os.path.join(p, 'previz')) or os.path.exists(os.path.join(p, 'brief.md')): return p
        q = os.path.dirname(p)
        if q == p: return None
        p = q
