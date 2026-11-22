"""Write each painted view's camera into locations/views.md: the position, yaw, pitch and lens of the plate the view
was painted over, so a shot that moves off its plate is caught (precheck.py's plate check) and a repaint starts from the right
camera.
    .venv/bin/python tools/previz/views_cams.py <film> [--write] [--plates-from <film folder>]
For every table in views.md with a "Painted over" column, a "Camera" column is added (or refreshed) after it. A row whose plate
is a shot plate (previz/<G>/plates/cam<id>-<t>-empty.png) gets the camera from the plate's own record (<plate>.json, written by
--plate), else from the take json of that generation written nearest in time to the plate (marked "~", with
the take named). Other rows (a room's master, front or back plate) get "-". The table's
shape is templates/views.md; a film with no views.md yet is left alone. Without --write it prints the table rows it would
write. --plates-from: look for the plates and takes in another film folder (a test copy beside a film), read-only."""
import glob, json, math, os, re, sys

CAM_COL = 'Camera (x, y, z · yaw · pitch · lens)'


def plate_camera(film, plate, plates_from=None):
    """(text, record) for a plate path relative to the film folder"""
    m = re.search(r'previz/([^/]+)/plates/cam([^-/]+)-(\d+(?:\.\d+)?)-empty\.png', plate)
    if not m: return '-', None
    g, sid, t = m.group(1), m.group(2), float(m.group(3))
    roots = [r for r in [film] + ([plates_from] if plates_from else []) if os.path.exists(os.path.join(r, plate))] or [film]
    for root in roots:                      # the folder that holds the plate: its takes are the ones it was rendered beside
        p = os.path.join(root, plate)
        if os.path.exists(p[:-4] + '.json'):
            with open(p[:-4] + '.json') as fh: r = json.load(fh)
            return fmt(r), dict(r, source='plate record')
        takes = glob.glob(os.path.join(root, 'previz', g, '%s-previz-take-*.json' % g))
        if not takes: continue
        pt = os.path.getmtime(p) if os.path.exists(p) else None
        best = min(takes, key=lambda f: abs(os.path.getmtime(f) - pt)) if pt else max(takes, key=os.path.getmtime)
        with open(best) as fh: tj = json.load(fh)
        sh = next((s for s in tj.get('shots', []) if str(s.get('id')) == sid), None)
        if sh is None: continue
        cam, yaw, pitch, diag = sh['cam'], sh['yaw'], sh['pitch'], sh['diag_fov']
        mv = sh.get('move')
        if mv and mv['t1'] > mv['t0']:
            u = min(1.0, max(0.0, (t - mv['t0']) / (mv['t1'] - mv['t0'])))
            cam = [a + (b - a) * u for a, b in zip(cam, mv['to_cam'])]; yaw = yaw + ((mv['to_yaw'] - yaw + 180) % 360 - 180) * u
            pitch = pitch + (mv['to_pitch'] - pitch) * u; diag = diag + (mv['to_diag_fov'] - diag) * u
        r = dict(shot=sid, t=t, cam=[round(v, 3) for v in cam], yaw=round(yaw % 360, 2), pitch=round(pitch, 2), diag=round(diag, 2),
                 lens_ff_mm=round(21.633 / math.tan(math.radians(diag / 2)), 1), source='~ %s' % os.path.basename(best))
        return fmt(r), r
    return '? (plate and takes not found)', None


def fmt(r):
    c = r['cam']
    return '%sx %.2f, y %.2f, z %.2f · yaw %.1f° · pitch %.1f° · %g° (%d mm)%s' % (
        '~' if str(r.get('source', '')).startswith('~') else '', c[0], c[1], c[2], r['yaw'], r['pitch'], r['diag'], round(r['lens_ff_mm']),
        (' (%s)' % r['source'][2:]) if str(r.get('source', '')).startswith('~') else '')


def parse_cam(text):
    """a Camera cell back to numbers: dict(cam, yaw, pitch, diag) or None"""
    m = re.search(r'x (-?[\d.]+), y (-?[\d.]+), z (-?[\d.]+) · yaw ([\d.]+)° · pitch (-?[\d.]+)° · ([\d.]+)°', text or '')
    if not m: return None
    v = [float(x) for x in m.groups()]
    return dict(cam=v[:3], yaw=v[3], pitch=v[4], diag=v[5], approx=text.strip().startswith('~'))


def cells(line):
    return [c.strip() for c in line.strip().strip('|').split('|')]


def rewrite(film, text, plates_from=None):
    out, hdr = [], None
    for line in text.splitlines():
        if line.strip().startswith('|'):
            cs = cells(line)
            if hdr is None and 'Painted over' in cs:
                hdr = cs; pi = cs.index('Painted over'); has = CAM_COL in cs
                if not has: cs = cs[:pi + 1] + [CAM_COL] + cs[pi + 1:]
                out.append('| ' + ' | '.join(cs) + ' |'); continue
            if hdr is not None and set(line.replace('|', '').strip()) <= set('-: '):
                n = len(hdr) + (0 if CAM_COL in hdr else 1); out.append('|' + '|'.join(['---'] * n) + '|'); continue
            if hdr is not None:
                pi = hdr.index('Painted over'); has = CAM_COL in hdr
                plate = re.findall(r'`([^`]+)`', cs[pi]) if pi < len(cs) else []
                txt, rec = plate_camera(film, plate[0], plates_from) if plate else ('-', None)
                if has: cs[hdr.index(CAM_COL)] = txt
                else: cs = cs[:pi + 1] + [txt] + cs[pi + 1:]
                out.append('| ' + ' | '.join(cs) + ' |'); continue
        else:
            hdr = None
        out.append(line)
    return '\n'.join(out) + ('\n' if text.endswith('\n') else '')


def view_cameras(film):
    """{view tag: camera dict} from views.md's Camera column (for precheck.py)"""
    p = os.path.join(film, 'locations', 'views.md')
    if not os.path.exists(p): return {}
    res, hdr = {}, None
    for line in open(p).read().splitlines():
        if not line.strip().startswith('|'): hdr = None; continue
        cs = cells(line)
        if hdr is None:
            if CAM_COL in cs: hdr = cs
            continue
        if set(line.replace('|', '').strip()) <= set('-: '): continue
        tag = re.findall(r'\[[^\]]+\]', cs[0]); cam = parse_cam(cs[hdr.index(CAM_COL)]) if len(cs) > hdr.index(CAM_COL) else None
        if tag and cam and not re.search(r'\bdry\b|pick-up', cs[0]):
            ui = next((i for i, h in enumerate(hdr) if h.lower().startswith('used by')), None)
            res.setdefault(tag[0], dict(cam, plate=cs[hdr.index('Painted over')], used=cs[ui] if ui is not None and ui < len(cs) else ''))
    return res


if __name__ == '__main__':
    if len(sys.argv) < 2 or sys.argv[1] in ('-h', '--help'):
        print(__doc__); sys.exit(0)
    film = os.path.abspath(sys.argv[1]); pf = sys.argv[sys.argv.index('--plates-from') + 1] if '--plates-from' in sys.argv else None
    p = os.path.join(film, 'locations', 'views.md')
    if not os.path.exists(p):
        print('views_cams: no locations/views.md in this film yet (it is written with the painted views); nothing to do'); sys.exit(0)
    t = open(p).read(); n = rewrite(film, t, pf)
    if '--write' in sys.argv:
        open(p, 'w').write(n); print('views.md: camera column written:', p)
    for l in n.splitlines():
        if l.startswith('| [') or CAM_COL in l: print(l[:220])
