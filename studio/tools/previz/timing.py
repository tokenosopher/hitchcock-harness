"""How a film's previz stage spent its time, read from the Claude Code transcripts (read-only; never runs Blender).

    .venv/bin/python tools/previz/timing.py <session.jsonl> [--from 2026-01-12T13:20Z] [--to 2026-01-13T05:00Z]
                                            [--split <ISO time>] [--json out.json] [--runs] [--no-files]

<session.jsonl> is the film's main thread. Its sub-agents are read from <session dir>/<session id>/subagents/agent-*.jsonl,
each with its .meta.json (the description names the job: "previz · S4", "previz · S4 QC fixes round 1", "QC · S4 boards v1",
"location · L01 room from the pick", "pick-up · FIX-door-S4 set-up"). Agents are grouped by the scene named in the description.

Every Blender run is one `<python> .../blender_run.py <script> -- <args>` inside a Bash command (also through a shell function
or a for loop in the same command). For each run it records the mode (--check, --project, --panels, --plate, --mannequin,
--shots-file, any other flag a scene script added, or "take" with no mode flag), its start (the tool call's time) and its end,
and says how the end was found:
  call       the tool result of a foreground call that ran this one run (measured)
  call/n     a foreground call that ran n runs one after another: the call's time shared out evenly (estimated)
  task-file  a background task: the mtime of its output file in the session's tasks folder (measured, if the file is still there)
  log-file   the run wrote to a log (in a scratch.nosync folder, or /tmp in older films) that still exists and no later
             run wrote to it: its mtime (measured)
  call-par   runs started together with & in one call and waited on: the call's end (an upper bound), or the run's own log
  failed     the shell never started it (left out of every count)
  seen       the first later tool result that shows the run's finish line or its log (an upper bound)
  notify     the background task's notification (an upper bound)
  none       no end found
It then splits a run where the files allow it (--no-files skips this): the wrapper's "waiting for a Blender slot" line says the
run queued; the first output file (a check still, a panel, a take's first frame) written after the start gives
"to first picture" = wait + build + one still (measured), and a take's frames give the render span (measured).

Printed: per scene, agent time (first to last line of each of its agents, summed), the time in tool calls that ran or waited on
Blender, runs by kind (count, mean and median elapsed), QC rounds and scores; with --split, runs before / after that time (a kit change, say);
the stage totals. Times are UTC as the transcripts write them."""
import glob, json, os, re, signal, statistics, sys
from datetime import datetime, timezone

FIX = None                                   # --split <ISO time>: compare runs before and after it
VALUE_FLAGS = {'--film', '--res', '--samples', '--version', '--only', '--shots', '--mq-time', '--round', '--exposure',
               '--panel-start', '--panel-times', '--bounce2', '--grey', '--outdir', '--out', '--views'}
MODES = ['--project', '--plate', '--mannequin', '--shots-file', '--panels', '--check']
FINISH = re.compile(r'(CHECK DONE|PANELS DONE|PLATE DONE|MANNEQUIN DONE|STILLS DONE|WROTE /|PROJECT \{|SHOTS FILE|Traceback|[A-Z]+ DONE)')


def ts(s):
    if not s: return None
    s = s.replace('Z', '+00:00')
    try: return datetime.fromisoformat(s[:26] + s[-6:] if '.' in s and len(s) > 32 else s)
    except ValueError: return datetime.fromisoformat(s.split('.')[0] + '+00:00')


def hm(d):
    return d.strftime('%H:%M:%S') if d else '-'


def mins(x):
    return '%.1f' % (x / 60.0) if x is not None else '-'


def text_of(content):
    if isinstance(content, str): return content
    out = []
    for c in content or []:
        if isinstance(c, dict):
            if c.get('type') == 'text': out.append(c.get('text', ''))
            elif c.get('type') == 'tool_result': out.append(text_of(c.get('content')))
    return '\n'.join(out)


def read_agent(path):
    """tool calls (id -> dict), results, notifications, first/last time, assistant texts"""
    calls, order, notes, texts = {}, [], [], []
    first = last = None
    with open(path) as fh:
        for line in fh:
            try: d = json.loads(line)
            except ValueError: continue
            t = ts(d.get('timestamp'))
            if t:
                first = first or t; last = t
            msg = d.get('message') or {}
            cont = msg.get('content')
            if d.get('type') == 'assistant' and isinstance(cont, list):
                for c in cont:
                    if c.get('type') == 'tool_use':
                        calls[c['id']] = dict(id=c['id'], name=c['name'], input=c.get('input') or {}, start=t, end=None, result='')
                        order.append(c['id'])
                    elif c.get('type') == 'text': texts.append((t, c.get('text', '')))
            elif d.get('type') == 'user':
                if isinstance(cont, list):
                    for c in cont:
                        if isinstance(c, dict) and c.get('type') == 'tool_result' and c.get('tool_use_id') in calls:
                            k = calls[c['tool_use_id']]; k['end'] = t; k['result'] = text_of(c.get('content'))
                s = text_of(cont) if cont is not None else ''
                if '<task-notification>' in s:
                    for m in re.finditer(r'<task-id>(\w+)</task-id>.*?<tool-use-id>(\w+)</tool-use-id>', s, re.S):
                        notes.append(dict(task=m.group(1), tool=m.group(2), at=t))
    return dict(calls=calls, order=order, notes=notes, first=first, last=last, texts=texts)


# ---------------------------------------------------------------- finding the runs in a command
RUN = re.compile(r'(?:python3?|\S*/bin/python)\s+\S*blender_run\.py\s+("?[^\s"]+"?)\s+--\s*([^\n;|&]*)')


def assigns(cmd):
    out = {}
    for m in re.finditer(r'(?:^|[\s;&(])([A-Za-z_]\w*)=("([^"]*)"|\'([^\']*)\'|([^\s;&|)]+))', cmd):
        out[m.group(1)] = m.group(3) if m.group(3) is not None else m.group(4) if m.group(4) is not None else m.group(5)
    return out


def subst(s, env):
    return re.sub(r'\$\{?([A-Za-z_]\w*)\}?', lambda m: env.get(m.group(1), m.group(0)), s)


def mode_of(script, args):
    a = args.replace('"', ' ').replace("'", ' ').split()
    for f in MODES:
        if f in a: return f.lstrip('-')
    for x in a:
        if x.startswith('--') and x not in VALUE_FLAGS and x != '--': return x.lstrip('-')
    base = os.path.basename(script.strip('"'))
    if not re.match(r'(S\d|FIX|L0\d)', base) and not base.startswith('$'): return 'probe:' + base
    if re.search(r'\$\w', args): return 'unknown'
    return 'take'


def runs_in(cmd):
    """[(script, args, log path or None, shell_bg)] for every run the command makes"""
    env = assigns(cmd); out = []
    for m in RUN.finditer(cmd):
        script, args = m.group(1), m.group(2)
        tail = cmd[m.end():m.end() + 160]
        lm = re.search(r'>\s*["\']?((?:/tmp/|/private/tmp/|[^\s;&|)>"\']*scratch\.nosync/)[^\s;&|)"\']+)', m.group(0) + tail[:60])
        argsx = re.split(r'\s[12]?>', ' ' + args)[0]
        shell_bg = bool(re.match(r'[^\n;]*?&\s*(\)|$|\n|;|wait)', tail)) and '&&' not in tail[:6]
        # a shell function: count its call sites
        fn = None
        head = cmd[:m.start()]
        fm = list(re.finditer(r'([A-Za-z_]\w*)\s*\(\)\s*\{', head))
        if fm and ('$@' in args or re.search(r'\$[1-9]', args)) and '}' not in cmd[fm[-1].end():m.start()]:
            fn = fm[-1].group(1)
        if fn:
            body_end = cmd.find('}', m.end())
            rest = cmd[body_end + 1:] if body_end >= 0 else ''
            for c in re.finditer(r'(?:^|[;\n&|(]|&&|then|do)\s*%s((?:[ \t]+[^\n;&|>]*)?)' % re.escape(fn), rest):
                ca = subst(c.group(1).strip(), env)
                for v in loop_items(rest, c.group(1)) or [ca]:
                    out.append((script, subst(argsx.replace('"$@"', v).replace('$@', v), env), lm.group(1) if lm else None, shell_bg))
            continue
        items = loop_items(cmd[:m.start()] + cmd[m.start():], argsx)
        if items:
            for v in items: out.append((script, v, lm.group(1) if lm else None, shell_bg))
            continue
        out.append((script, subst(argsx, env), subst(lm.group(1), env) if lm else None, shell_bg))
    return out


def loop_items(cmd, args):
    """for m in a b c; do ... $m ...: the args once per item"""
    for v in re.findall(r'\$\{?([A-Za-z_]\w*)\}?', args):
        lm = re.search(r'for\s+%s\s+in\s+([^;\n]+?)\s*;\s*do' % v, cmd)
        if lm:
            items = re.findall(r'"([^"]*)"|\'([^\']*)\'|(\S+)', lm.group(1))
            return [re.sub(r'\$\{?%s\}?' % v, (a or b or c), args).replace('"', '') for a, b, c in items]
    return None


# ---------------------------------------------------------------- files
def stat_mtime(p):
    try: return datetime.fromtimestamp(os.stat(p).st_mtime, timezone.utc)
    except OSError: return None


class Alarm(Exception): pass


def _alarm(*a): raise Alarm()


def listdir_t(d, secs=60):
    """a folder's files with mtimes, under a time limit (the drive can hang)"""
    signal.signal(signal.SIGALRM, _alarm); signal.alarm(secs)
    try:
        out = []
        for n in os.listdir(d):
            p = os.path.join(d, n)
            if os.path.isfile(p): out.append((stat_mtime(p), p))
        return sorted(x for x in out if x[0])
    except (OSError, Alarm):
        return []
    finally:
        signal.alarm(0)


def out_dir(text, mode):
    m = re.search(r'(CHECK DONE|PANELS DONE|MANNEQUIN DONE|STILLS DONE)\s+(\S+)', text or '')
    if m: return m.group(2), False
    m = re.search(r'WROTE\s+(\S+)-previz-take-(\d+)\.mp4', text or '')
    if m: return os.path.join(os.path.dirname(m.group(1)), 'frames-take-%s' % m.group(2)), True
    return None, False


# ---------------------------------------------------------------- the scene of an agent
def scene_of(desc):
    m = re.search(r'\b(FIX-[\w-]+|S\d+|L0\d)\b', desc or '')
    return m.group(1) if m else None


def kind_of(desc):
    d = (desc or '').lower()
    for k in ('qc', 'previz', 'location', 'pick-up'):
        if d.startswith(k): return k
    return d.split(' ')[0] if d else '?'


def main():
    a = sys.argv[1:]
    if not a or a[0] in ('-h', '--help'): print(__doc__); sys.exit(0)
    if a[0].startswith('-'): sys.exit(__doc__)
    sess = os.path.abspath(a[0])
    def opt(k, d=None): return a[a.index(k) + 1] if k in a else d
    global FIX
    FIX = opt('--split')
    t_from, t_to = ts(opt('--from')), ts(opt('--to'))
    use_files = '--no-files' not in a
    sdir = os.path.join(os.path.dirname(sess), os.path.basename(sess)[:-6])
    tasks_dir = None
    agents = []
    for mp in sorted(glob.glob(os.path.join(sdir, 'subagents', 'agent-*.meta.json'))):
        meta = json.load(open(mp)); desc = meta.get('description') or ''
        jp = mp[:-len('.meta.json')] + '.jsonl'
        if not os.path.exists(jp): continue
        A = read_agent(jp)
        if not A['first'] or (t_from and A['last'] < t_from) or (t_to and A['first'] > t_to): continue
        A.update(id=os.path.basename(jp)[6:-6], desc=desc, scene=scene_of(desc), kind=kind_of(desc))
        agents.append(A)
    agents.sort(key=lambda x: x['first'])

    runs = []
    for A in agents:
        calls = A['calls']; order = A['order']
        task_of = {}
        for cid in order:
            k = calls[cid]
            m = re.search(r'background with ID: (\w+)', k['result'] or '')
            if m: task_of[cid] = m.group(1)
            m = re.search(r'(/private/tmp/claude-\d+/[^\s]+/tasks)/', k['result'] or '')
            if m and not tasks_dir: tasks_dir = m.group(1)
        notify = {n['tool']: n['at'] for n in A['notes']}
        for i, cid in enumerate(order):
            k = calls[cid]
            if k['name'] != 'Bash': continue
            cmd = k['input'].get('command', '')
            found = runs_in(cmd)
            if not found: continue
            bg = bool(k['input'].get('run_in_background'))
            for j, (script, args, log, shell_bg) in enumerate(found):
                r = dict(scene=A['scene'] or '?', agent=A['id'], desc=A['desc'], mode=mode_of(script, args), script=os.path.basename(script.strip('"')),
                         args=args.strip()[:160], start=k['start'], end=None, how='none', n_in_call=len(found), bg=bg or shell_bg, log=log,
                         call=cid, idx=i, pos=j, waited=None, slot=None, text='', wait_s=None, run_s=None, lane=None)
                runs.append(r)
    # ends
    if not tasks_dir:
        g = glob.glob('/private/tmp/claude-*/%s/%s/tasks' % (os.path.basename(os.path.dirname(sess)), os.path.basename(sdir)))
        tasks_dir = g[0] if g else None
    by_agent = {A['id']: A for A in agents}
    last_by_log = {}
    for r in runs:
        if r['log']: last_by_log[r['log']] = r
    for r in runs:
        A = by_agent[r['agent']]; k = A['calls'][r['call']]
        res = k['result'] or ''
        quick = k['end'] and (k['end'] - k['start']).total_seconds() < 3
        if re.search(r'no such file or directory: \S*python3', res) or (quick and not k['input'].get('run_in_background')
                                                                          and res.strip() in ('', '(Bash completed with no output)')):
            r['how'] = 'failed'; continue      # the shell never started it (a quoting slip), or it gave nothing at once
        if not k['input'].get('run_in_background'):
            cmd = k['input'].get('command', '')
            if r['bg'] and re.search(r'\bwait\b', cmd) and k['end']:
                # runs started together with & and waited on: each ends by the call's end (an upper bound)
                r['end'] = k['end']; r['how'] = 'call-par'; r['text'] = res
                if r['log'] and last_by_log.get(r['log']) is r:
                    mt = stat_mtime(r['log'])
                    if mt and r['start'] <= mt <= k['end']:
                        r['end'] = mt; r['how'] = 'log-file'
                        try: r['text'] = open(r['log'], errors='replace').read()
                        except OSError: pass
                continue
            if not r['bg']:
                if k['end']:
                    r['end'] = k['end']; r['how'] = 'call' if r['n_in_call'] == 1 else 'call/%d' % r['n_in_call']; r['text'] = res
                continue
        # background
        tid = re.search(r'background with ID: (\w+)', res)
        if tid and tasks_dir:
            f = os.path.join(tasks_dir, tid.group(1) + '.output')
            mt = stat_mtime(f)
            if mt and mt >= r['start'] and r['n_in_call'] == 1:
                r['end'] = mt; r['how'] = 'task-file'
                try: r['text'] = open(f, errors='replace').read()[-6000:]
                except OSError: pass
        if not r['end'] and r['log'] and last_by_log.get(r['log']) is r:
            mt = stat_mtime(r['log'])
            if mt and mt >= r['start']:
                r['end'] = mt; r['how'] = 'log-file'
                try: r['text'] = open(r['log'], errors='replace').read()
                except OSError: pass
        if not r['end']:
            key = r['log'] or (tid.group(1) if tid else None)
            for cid in A['order'][r['idx'] + 1:]:
                c = A['calls'][cid]
                if not c['end'] or c['end'] < r['start']: continue
                inp = json.dumps(c['input'])
                if (key and key in inp or key and key in (c['result'] or '')) and FINISH.search(c['result'] or ''):
                    r['end'] = c['end']; r['how'] = 'seen'; r['text'] = c['result']; break
        if not r['end'] and r['call'] in notify:
            r['end'] = notify[r['call']]; r['how'] = 'notify'
    for r in runs:
        t = r['text'] or ''
        r['waited'] = 'waiting for a Blender slot' in t if t else None
        m = re.search(r'slot (\d+): ', t)
        r['slot'] = int(m.group(1)) if m else None
        # the wrapper's own last line: measured wait and run, no guessing
        ww = re.findall(r'blender_run: (\w+) slot (\d+), waited ([\d.]+) s, ran ([\d.]+) s', t)
        if ww and (len(ww) == r['n_in_call'] or len(ww) == 1):
            lane, sl, wt, rn = ww[min(r['pos'], len(ww) - 1)]
            r['lane'], r['slot'], r['wait_s'], r['run_s'] = lane, int(sl), float(wt), float(rn); r['waited'] = float(wt) > 2
        r['elapsed'] = (r['end'] - r['start']).total_seconds() if r['end'] else None
        if r['how'].startswith('call/') and r['elapsed']: r['elapsed'] /= r['n_in_call']
        r['first_pic'] = r['render_span'] = None
        if use_files and r['end'] and r['how'] in ('call', 'call-par', 'task-file', 'log-file', 'seen'):
            d, frames = out_dir(t, r['mode'])
            if d:
                fs = [x for x in listdir_t(os.path.realpath(d)) if r['start'] <= x[0] <= r['end']]
                if fs:
                    r['first_pic'] = (fs[0][0] - r['start']).total_seconds()
                    if frames and len(fs) > 1: r['render_span'] = (fs[-1][0] - fs[0][0]).total_seconds()
    failed = [r for r in runs if r['how'] == 'failed']; runs = [r for r in runs if r['how'] != 'failed']
    report(agents, runs, sess, use_files, len(failed))
    if opt('--json'):
        with open(opt('--json'), 'w') as fh:
            json.dump(dict(agents=[dict(id=A['id'], desc=A['desc'], scene=A['scene'], kind=A['kind'], first=A['first'].isoformat(),
                                        last=A['last'].isoformat(), qc=qc_score(A)) for A in agents],
                           runs=[{k_: (v.isoformat() if isinstance(v, datetime) else v) for k_, v in r.items() if k_ not in ('text', 'call', 'idx')} for r in runs]),
                      fh, indent=1)
    if '--runs' in a:
        print('\nEVERY RUN')
        print('scene | agent | mode | start | end | how | elapsed min | waited | slot | to first picture min | render span min | args')
        for r in runs:
            print(' | '.join(str(x) for x in (r['scene'], r['desc'], r['mode'], hm(r['start']), hm(r['end']), r['how'], mins(r['elapsed']),
                                              {True: 'yes', False: 'no', None: '?'}[r['waited']], r['slot'] if r['slot'] is not None else '-',
                                              mins(r['first_pic']), mins(r['render_span']), r['args'][:90])))


def qc_score(A):
    if A['kind'] != 'qc': return None
    for t, s in reversed(A['texts']):
        for pat in (r'Score:?\**\s*:?\s*\**\s*(\d+(?:\.\d+)?)', r'\bscores?\s+\**(\d+\.\d)'):
            m = re.search(pat, s)
            if m: return float(m.group(1))
    return None


def blender_call_time(A, runs):
    """seconds of tool calls that ran a Blender run or waited on one (its log, its task, a Monitor or sleep loop on it)"""
    mine = [r for r in runs if r['agent'] == A['id']]
    keys = set()
    for r in mine:
        if r['log']: keys.add(r['log'])
        k = A['calls'][r['call']]; m = re.search(r'background with ID: (\w+)', k['result'] or '')
        if m: keys.add(m.group(1))
    run_calls = {r['call'] for r in mine}
    tot = 0.0
    for cid in A['order']:
        c = A['calls'][cid]
        if not c['end'] or not c['start']: continue
        inp = json.dumps(c['input'])
        if cid in run_calls and c['input'].get('run_in_background'): continue
        hit = cid in run_calls or any(k_ in inp for k_ in keys) or (c['name'] in ('Bash', 'Monitor', 'TaskOutput', 'BashOutput')
                                                                    and re.search(r'[Bb]lender|DONE|sleep', inp) and re.search(r'blender|Blender|\.log|\.output', inp))
        if hit: tot += (c['end'] - c['start']).total_seconds()
    return tot


def stats(xs):
    xs = [x for x in xs if x is not None]
    if not xs: return '-', '-'
    return mins(statistics.mean(xs)), mins(statistics.median(xs))


def report(agents, runs, sess, use_files, n_failed=0):
    fix = ts(FIX) if FIX else None
    split_at = fix or ts('9999-12-31T00:00:00Z')   # no --split: every run counts as before
    print('PREVIZ TIMING  %s' % os.path.basename(sess))
    print('agents read: %d; Blender runs found: %d (and %d that never started); ends found: %d (%s)' % (
        len(agents), len(runs), n_failed, sum(1 for r in runs if r['end']),
        ', '.join('%s %d' % (h, sum(1 for r in runs if r['how'] == h)) for h in ('call', 'call-par', 'task-file', 'log-file', 'seen', 'notify', 'none')
                  if any(r['how'] == h for r in runs)) + ', call/n %d' % sum(1 for r in runs if r['how'].startswith('call/'))))
    scenes = []
    for A in agents:
        s = A['scene'] or '?'
        if s not in scenes and (A['kind'] in ('previz', 'qc', 'pick-up', 'location') or any(r['agent'] == A['id'] for r in runs)): scenes.append(s)
    def key(s):
        m = re.match(r'S(\d+)$', s); return (0, int(m.group(1))) if m else (1, s)
    scenes.sort(key=key)
    print('\nPER SCENE (minutes; UTC)')
    print('scene | agents | agent time | in Blender calls and waits | share | runs | runs before split | runs after split | first | last | QC rounds and scores')
    tot = dict(agent=0, bl=0)
    for s in scenes:
        As = [A for A in agents if (A['scene'] or '?') == s and (A['kind'] in ('previz', 'pick-up', 'location') or any(r['agent'] == A['id'] for r in runs))]
        Q = [A for A in agents if (A['scene'] or '?') == s and A['kind'] == 'qc' and 'boards' in A['desc']]
        rs = [r for r in runs if r['scene'] == s]
        at = sum((A['last'] - A['first']).total_seconds() for A in As)
        bl = sum(blender_call_time(A, runs) for A in As)
        tot['agent'] += at; tot['bl'] += bl
        qc = ', '.join('%s %s' % (re.sub(r'^QC · \S+ ', '', A['desc']), qc_score(A) if qc_score(A) is not None else '?') for A in Q)
        print('%s | %d | %s | %s | %s | %d | %d | %d | %s | %s | %s' % (
            s, len(As), mins(at), mins(bl), ('%d%%' % round(100 * bl / at)) if at else '-', len(rs),
            sum(1 for r in rs if r['start'] < split_at), sum(1 for r in rs if r['start'] >= split_at),
            hm(min(A['first'] for A in As)) if As else '-', hm(max(A['last'] for A in As)) if As else '-', qc or '-'))
    print('all | | %s | %s | %s' % (mins(tot['agent']), mins(tot['bl']), ('%d%%' % round(100 * tot['bl'] / tot['agent'])) if tot['agent'] else '-'))

    kinds = sorted(set(r['mode'] for r in runs), key=lambda m: (-sum(1 for r in runs if r['mode'] == m), m))
    print('\nRUNS BY KIND PER SCENE: count / mean / median elapsed min (start of the call to the end found; includes the wait)')
    print('scene | ' + ' | '.join(kinds))
    for s in scenes:
        rs = [r for r in runs if r['scene'] == s]
        if not rs: continue
        cells = []
        for m in kinds:
            x = [r['elapsed'] for r in rs if r['mode'] == m]
            cells.append('-' if not x else '%d / %s / %s' % (len(x), *stats(x)))
        print('%s | %s' % (s, ' | '.join(cells)))
    if fix is not None:
        print('\nBEFORE AND AFTER %s: mean / median elapsed min, count' % FIX)
        print('kind | before | after')
    for m in (kinds if fix is not None else []):
        b = [r['elapsed'] for r in runs if r['mode'] == m and r['start'] < fix]; f = [r['elapsed'] for r in runs if r['mode'] == m and r['start'] >= fix]
        print('%s | %s / %s, %d | %s / %s, %d' % (m, *stats(b), len(b), *stats(f), len(f)))
    w = [r for r in runs if r['waited']]
    print('\nWAITING: %d runs printed "waiting for a Blender slot", %d did not, %d unknown (no output read)' % (
        len(w), sum(1 for r in runs if r['waited'] is False), sum(1 for r in runs if r['waited'] is None)))
    wr = [r for r in runs if r['run_s'] is not None]
    if wr:
        print('WRAPPER TIMES (the wrapper\'s own last line): %d runs' % len(wr))
        print('kind | lane | runs | wait mean / median min | run mean / median min')
        for m in kinds:
            for ln in ('render', 'fast'):
                x = [r for r in wr if r['mode'] == m and r['lane'] == ln]
                if x: print('%s | %s | %d | %s / %s | %s / %s' % (m, ln, len(x), *stats([r['wait_s'] for r in x]), *stats([r['run_s'] for r in x])))
    if use_files:
        fp = [r for r in runs if r['first_pic'] is not None]
        print('FIRST PICTURE (measured from file mtimes; = wait + build + one still): %d runs; mean %s, median %s min' % (len(fp), *stats([r['first_pic'] for r in fp])))
        for m in kinds:
            x = [r['first_pic'] for r in fp if r['mode'] == m]
            if x: print('  %s: %d runs, mean %s, median %s; before split %s, after %s' % (m, len(x), *stats(x), stats([r['first_pic'] for r in fp if r['mode'] == m and r['start'] < split_at])[0], stats([r['first_pic'] for r in fp if r['mode'] == m and r['start'] >= split_at])[0]))
        rsp = [r for r in runs if r['render_span'] is not None]
        if rsp: print('TAKE RENDER SPAN (first to last frame, measured): %d takes; mean %s, median %s min' % (len(rsp), *stats([r['render_span'] for r in rsp])))
    el = [r['elapsed'] for r in runs if r['elapsed'] is not None]
    print('\nSTAGE TOTALS: %d runs; %d with an end; elapsed summed %s min (mean %s, median %s)' % (len(runs), len(el), mins(sum(el)), *stats(el)))
    for m in kinds:
        x = [r['elapsed'] for r in runs if r['mode'] == m and r['elapsed'] is not None]
        print('  %s: %d runs, %s min summed' % (m, sum(1 for r in runs if r['mode'] == m), mins(sum(x))))
    pv = [A for A in agents if A['kind'] == 'previz']
    if pv: print('previz agents: first start %s, last end %s' % (hm(min(A['first'] for A in pv)), hm(max(A['last'] for A in pv))))


if __name__ == '__main__':
    main()
