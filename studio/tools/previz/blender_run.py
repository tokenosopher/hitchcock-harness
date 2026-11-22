"""Run Blender headless with at most SLOTS renders at once across every agent of this studio.
It can be changed while renders wait: write a number into <studio>/scratch.nosync/previz-blender/line-slots (every waiting
run reads it on each try); remove the file to go back to SLOTS.
    .venv/bin/python tools/previz/blender_run.py <scene script>.py -- --film $FILM <script args>
Blender is /Applications/Blender.app, or the program named in BLENDER_BIN. Waits for a free slot (an flock on
<studio>/scratch.nosync/previz-blender/line-slot-N), runs `Blender -b --disable-autoexec -P <script> -- <args>` (a .blend
file's own scripts never run; the -P script does), streams its output minus the per-frame noise, and exits
with Blender's return code. Set SLOTS=1 in the environment to serialise (SLOTS set in a run's environment beats the live file
for that run).

First come, first served: each waiting run takes a numbered ticket (<studio>/scratch.nosync/previz-blender/line-queue/), and only the lowest waiting
number may take a freed slot, so a new run never jumps one that has waited longer.
A fast lane for runs that render nothing: --project, --shots-file, --build, --facts and tools/previz/build_location.py only build
the scene and print or write text. They never take a render slot: they have their own FAST_SLOTS (default 3, slot files
line-fast-N, their own queue), so a camera question is not stuck behind takes.
Every run ends with one line: `blender_run: <lane> slot N, waited W s, ran R s, exit E` (timing.py reads it).

The memory check. A grey previz render can take about 2 GB; eight at once can fill a 16 GB Mac's memory. SLOTS stays the
ceiling; a render also waits while the Mac has no room for one more:
  - the first four renders always start (MEM_MIN_PARALLEL), so nothing can wait for ever;
  - a further render starts only when macOS reports normal memory pressure and at least MEM_NEED_GB (3) is free, counting
    MEM_NEED_GB as already taken by each render started in the last MEM_RAMP_S (45) seconds, which has not grown yet;
  - the line stays first come, first served: the run at the head waits for memory and the others wait behind it.
MEM_CHECK=0 in a run's environment switches the check off for that run; a number in <studio>/scratch.nosync/previz-blender/line-mem-need changes
MEM_NEED_GB while renders wait. The fast lane is never held (its runs render nothing).
A render also prints `blender_run: memory: <free> GB free at the start, waited M s for memory, peak <P> GB`, and every
run adds one line to <studio>/scratch.nosync/previz-blender/blender-runs.log, so the limit can be set from what was measured.
Every file of the line lives in the studio folder (<studio> is the folder that holds tools/), never in /tmp, so every agent
of this studio shares one line; BLENDER_RUN_PREFIX and BLENDER_RUN_LOG choose other places."""
import ctypes, fcntl, json, os, resource, struct, subprocess, sys, threading, time

BLENDER = os.environ.get('BLENDER_BIN', '/Applications/Blender.app/Contents/MacOS/Blender')
SLOTS = int(os.environ.get('SLOTS', 8))
FAST_SLOTS = int(os.environ.get('FAST_SLOTS', 3))
STUDIO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))   # tools/previz/ -> the studio
LINE_DIR = os.path.join(STUDIO, 'scratch.nosync', 'previz-blender')
PREFIX = os.environ.get('BLENDER_RUN_PREFIX', os.path.join(LINE_DIR, 'line'))   # the tests use their own, so they never touch the real line
os.makedirs(os.path.dirname(PREFIX), exist_ok=True)
LIVE = PREFIX + '-slots'
MEM_LIVE = PREFIX + '-mem-need'
RUNNING = PREFIX + '-running'                                            # one file per render that holds a slot: <pid>, its mtime the start
MEM_CHECK = os.environ.get('MEM_CHECK', '1') != '0'
MEM_NEED_GB = float(os.environ.get('MEM_NEED_GB', 3))
MEM_RAMP_S = float(os.environ.get('MEM_RAMP_S', 45))
MEM_MIN_PARALLEL = int(os.environ.get('MEM_MIN_PARALLEL', 4))
RUN_LOG = os.environ.get('BLENDER_RUN_LOG', os.path.join(LINE_DIR, 'blender-runs.log'))
FAST_FLAGS = ('--project', '--shots-file', '--build', '--facts')
FAST_SCRIPTS = ('build_location.py',)
LANES = {'render': dict(slot=PREFIX + '-slot-%d', queue=PREFIX + '-queue'),
         'fast': dict(slot=PREFIX + '-fast-%d', queue=PREFIX + '-queue-fast')}


def slots(lane):
    if lane == 'fast': return max(1, FAST_SLOTS)
    if 'SLOTS' in os.environ: return max(1, SLOTS)        # an explicit SLOTS for this run beats the live file
    try:
        return max(1, min(8, int(open(LIVE).read().strip())))
    except (OSError, ValueError):
        return SLOTS
NOISE = ('Fra:', 'Read prefs', 'Shadow buffer full', 'Saved: ', 'Time: ', 'Append frame')


def lane_of(script, rest):
    return 'fast' if os.path.basename(script) in FAST_SCRIPTS or any(f in rest for f in FAST_FLAGS) else 'render'


def _alive(pid):
    try:
        os.kill(pid, 0); return True
    except ProcessLookupError:
        return False
    except PermissionError:
        return True


def take_ticket(qdir):
    """the next number in the line, as a file <number>.<pid> in qdir (the counter is kept under a lock)"""
    os.makedirs(qdir, exist_ok=True)
    with open(os.path.join(qdir, 'counter'), 'a+') as fh:
        fcntl.flock(fh, fcntl.LOCK_EX); fh.seek(0)
        try: n = int(fh.read().strip() or 0) + 1
        except ValueError: n = 1
        fh.seek(0); fh.truncate(); fh.write(str(n)); fh.flush(); fcntl.flock(fh, fcntl.LOCK_UN)
    path = os.path.join(qdir, '%010d.%d' % (n, os.getpid())); open(path, 'w').close()
    return n, path


def ahead(qdir, n):
    """how many live tickets are lower than n (tickets of runs that died are cleared)"""
    k = 0
    for f in os.listdir(qdir):
        if f == 'counter' or '.' not in f: continue
        a, b = f.split('.', 1)
        try: m, pid = int(a), int(b)
        except ValueError: continue
        if m < n:
            if _alive(pid): k += 1
            else:
                try: os.remove(os.path.join(qdir, f))
                except OSError: pass
    return k


def memory_now():
    """(GB free for a new render, macOS's pressure level: 1 normal, 2 warning, 4 critical). Free is what can be handed
    out without swapping: the free, speculative, inactive and purgeable pages of vm_stat. None when it cannot be read."""
    try:
        out = subprocess.run(['/usr/bin/vm_stat'], capture_output=True, text=True, timeout=5).stdout
        size = 16384
        head = out.split('\n', 1)[0]
        if 'page size of' in head: size = int(head.split('page size of')[1].split()[0])
        pages = 0
        for line in out.split('\n'):
            for key in ('Pages free:', 'Pages speculative:', 'Pages inactive:', 'Pages purgeable:'):
                if line.startswith(key): pages += int(line.split(':')[1].strip().rstrip('.'))
        free = pages * size / 2 ** 30
        lv = subprocess.run(['/usr/sbin/sysctl', '-n', 'kern.memorystatus_vm_pressure_level'], capture_output=True, text=True, timeout=5).stdout.strip()
        return free, int(lv) if lv.isdigit() else 1
    except Exception:
        return None, 1


def footprint_gb(pid):
    """the memory a process really holds, in GB: macOS's physical footprint, which counts what it has compressed or
    swapped as well as what is in RAM (the figure Activity Monitor shows). The resident size alone reads low on a busy
    Mac: a grey previz once held 1.9 GB by this figure and 0.7 GB resident. None when it cannot be read."""
    try:
        buf = ctypes.create_string_buffer(1024)
        if ctypes.CDLL('/usr/lib/libproc.dylib').proc_pid_rusage(int(pid), 0, buf) != 0: return None
        return struct.unpack_from('Q', buf.raw, 72)[0] / 2 ** 30
    except Exception:
        return None


def watch_peak(pid, out, stop):
    """keeps the highest footprint seen in out[0], read every 2 s while the run lasts"""
    while not stop.is_set():
        f = footprint_gb(pid)
        if f is not None and f > out[0]: out[0] = f
        stop.wait(2)


def need_gb():
    try:
        return max(0.5, float(open(MEM_LIVE).read().strip()))
    except (OSError, ValueError):
        return MEM_NEED_GB


def renders_running():
    """(how many renders hold a slot, how many of them started in the last MEM_RAMP_S seconds)"""
    n = young = 0; now = time.time()
    try: names = os.listdir(RUNNING)
    except OSError: return 0, 0
    for f in names:
        path = os.path.join(RUNNING, f)
        try: pid = int(f)
        except ValueError: continue
        if not _alive(pid):
            try: os.remove(path)
            except OSError: pass
            continue
        n += 1
        try:
            if now - os.path.getmtime(path) < MEM_RAMP_S: young += 1
        except OSError: pass
    return n, young


def room(lane, read=memory_now, running=renders_running):
    """(may a render start now, why not, GB free). Never holds the fast lane, a run with MEM_CHECK=0, or the first
    MEM_MIN_PARALLEL renders."""
    if lane != 'render' or not MEM_CHECK: return True, '', None
    free, level = read()
    n, young = running()
    if free is None or n < MEM_MIN_PARALLEL: return True, '', free
    need = need_gb()
    if level > 1: return False, 'macOS reports memory pressure', free
    if free - young * need < need:
        return False, '%.1f GB free, %.0f GB needed%s' % (free, need, ', %d render%s just started' % (young, '' if young == 1 else 's') if young else ''), free
    return True, '', free


def acquire(lane):
    """(the slot's lock, its number, seconds waited in all, seconds of that waited for memory, GB free at the start)"""
    L = LANES[lane]; t0 = time.time(); said = False; said_mem = 0.0; mem_wait = 0.0
    n, ticket = take_ticket(L['queue'])
    try:
        while True:
            k = ahead(L['queue'], n)
            if k == 0:
                ok, why, free = room(lane)
                if ok:
                    for i in range(slots(lane)):
                        fh = open(L['slot'] % i, 'w')
                        try:
                            fcntl.flock(fh, fcntl.LOCK_EX | fcntl.LOCK_NB)
                            if lane == 'render':
                                os.makedirs(RUNNING, exist_ok=True); open(os.path.join(RUNNING, str(os.getpid())), 'w').close()
                            return fh, i, time.time() - t0, mem_wait, free
                        except BlockingIOError:
                            fh.close()
                else:
                    mem_wait += 1
                    if time.time() - said_mem > 60:
                        print('waiting for memory... (%s; %d renders running)' % (why, renders_running()[0]), flush=True); said_mem = time.time()
            if not said and time.time() - t0 > 2:
                print('waiting for a Blender %sslot... (ticket %d, %d ahead)' % ('fast-lane ' if lane == 'fast' else '', n, k), flush=True); said = True
            time.sleep(1)
    finally:
        try: os.remove(ticket)
        except OSError: pass


def main():
    if len(sys.argv) < 2 or sys.argv[1] in ('-h', '--help'): print(__doc__); sys.exit(0)
    script, rest = sys.argv[1], sys.argv[2:]
    lane = lane_of(script, rest)
    fh, n, waited, mem_wait, free = acquire(lane)
    print(f'slot {n}: {os.path.basename(script)} {" ".join(rest)}' + (' (fast lane)' if lane == 'fast' else ''), flush=True)
    t1 = time.time(); rc = None; seen = [0.0]; done = threading.Event()
    try:
        p = subprocess.Popen([BLENDER, '-b', '--disable-autoexec', '-P', script] + rest, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True,
                             env=dict(os.environ, PREVIZ_SLOT='%s%d' % ('fast-' if lane == 'fast' else '', n)))   # the kit (kit/core.py) refuses a headless run without it
        threading.Thread(target=watch_peak, args=(p.pid, seen, done), daemon=True).start()
        for line in p.stdout:
            if not line.strip() or any(k in line for k in NOISE): continue
            print(line.rstrip(), flush=True)
        rc = p.wait()
        return rc
    finally:
        fcntl.flock(fh, fcntl.LOCK_UN); fh.close()
        try: os.remove(os.path.join(RUNNING, str(os.getpid())))
        except OSError: pass
        done.set()
        ran = time.time() - t1
        # the highest footprint seen while it ran; for a run too short to be read, the most it held in RAM (bytes on macOS)
        peak = seen[0] or resource.getrusage(resource.RUSAGE_CHILDREN).ru_maxrss / 2 ** 30
        if lane == 'render':
            print('blender_run: memory: %s GB free at the start, waited %.0f s for memory, peak %.1f GB' % ('%.1f' % free if free is not None else '?', mem_wait, peak), flush=True)
        try:
            os.makedirs(os.path.dirname(RUN_LOG), exist_ok=True)
            with open(RUN_LOG, 'a') as lf:
                lf.write(json.dumps(dict(at=time.strftime('%Y-%m-%dT%H:%M:%S'), lane=lane, slot=n, script=os.path.basename(script), args=' '.join(rest)[:200], waited=round(waited, 1),
                                         mem_wait=round(mem_wait), free_gb=None if free is None else round(free, 1), peak_gb=round(peak, 2), ran=round(ran, 1), exit=rc)) + '\n')
        except OSError:
            pass
        print('blender_run: %s slot %d, waited %.1f s, ran %.1f s, exit %s' % (lane, n, waited, ran, rc), flush=True)


if __name__ == '__main__':
    sys.exit(main())
