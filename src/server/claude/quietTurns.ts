// A turn Alma starts on her own schedule (a ScheduleWakeup or cron watchdog) that changed nothing is not shown in the
// chat (a 5-minute watchdog would fill the thread overnight with "Still waiting on your cards."). Display only: the
// transcript is never edited. A scheduled turn is quiet when every main-thread tool it used only looks (changesNothing
// below); anything else, or anything unsure, counts as a change and the turn shows.
import { HIDEABLE_KINDS, type ThreadEvent } from '../types';

/** An event of a kind a hidden turn loses (assistant_text, tool_use, tool_result, result). */
export const hideable = (ev: ThreadEvent): boolean => HIDEABLE_KINDS.has(ev.kind);

const LOOKING_TOOLS = new Set(['Read', 'Grep', 'Glob', 'LS', 'TaskList', 'TaskGet', 'TaskOutput', 'BashOutput', 'ToolSearch']);

/** True when the tool call only looks: a looking tool, or a Bash whose command only looks. */
export function changesNothing(name: string, input: unknown): boolean {
  if (LOOKING_TOOLS.has(name)) return true;
  if (name !== 'Bash') return false;
  const i = (input && typeof input === 'object' ? input : {}) as { command?: unknown; run_in_background?: unknown };
  // a job left running in the background is a change, whatever it runs
  if (i.run_in_background === true || typeof i.command !== 'string') return false;
  return bashOnlyLooks(i.command);
}

// ---- Bash: a small reading of the shell, enough to find what runs and where it writes. Whatever it cannot read is a change.

interface Redir { op: string; target: string }
interface Heredoc { body: string; quoted: boolean }
interface Cmd { words: string[]; redirs: Redir[]; heredocs: Heredoc[] }

class Unreadable extends Error {}

/** The index of the `)` that closes the `(` just before `i`, past quotes and nested parentheses; -1 if none. */
function closeParen(s: string, i: number): number {
  let depth = 1;
  while (i < s.length) {
    const c = s[i];
    if (c === '\\') { i += 2; continue; }
    if (c === "'") { const j = s.indexOf("'", i + 1); if (j < 0) return -1; i = j + 1; continue; }
    if (c === '"') { const j = closeDouble(s, i + 1); if (j < 0) return -1; i = j; continue; }
    if (c === '`') { const j = closeTick(s, i + 1); if (j < 0) return -1; i = j + 1; continue; }
    if (c === '(') depth++;
    else if (c === ')' && --depth === 0) return i;
    i++;
  }
  return -1;
}
/** The index just past the `"` that closes a double-quoted string starting at `i`; -1 if none. */
function closeDouble(s: string, i: number): number {
  while (i < s.length) {
    const c = s[i];
    if (c === '\\') { i += 2; continue; }
    if (c === '"') return i + 1;
    if (c === '$' && s[i + 1] === '(') { const j = closeParen(s, i + 2); if (j < 0) return -1; i = j + 1; continue; }
    if (c === '`') { const j = closeTick(s, i + 1); if (j < 0) return -1; i = j + 1; continue; }
    i++;
  }
  return -1;
}
function closeTick(s: string, i: number): number {
  while (i < s.length) {
    if (s[i] === '\\') { i += 2; continue; }
    if (s[i] === '`') return i;
    i++;
  }
  return -1;
}

/** Splits a command line into simple commands (a pipeline's parts, `;`/`&&`/`||` lists, loop bodies), with the
 *  commands of every `$(…)`, backtick and `<(…)` inside it as commands of their own. */
function parseShell(src: string, depth = 0): Cmd[] {
  if (depth > 6) throw new Unreadable();
  const out: Cmd[] = [];
  let cur: Cmd = { words: [], redirs: [], heredocs: [] };
  let word = '';
  let inWord = false;
  let redirOp: string | null = null;
  let heredocQuoted = false;
  const pending: { delim: string; strip: boolean; quoted: boolean; cmd: Cmd }[] = [];
  const nested = (inner: string) => { out.push(...parseShell(inner, depth + 1)); };
  const endWord = () => {
    if (!inWord) return;
    if (redirOp) {
      if (redirOp === '<<' || redirOp === '<<-') pending.push({ delim: word, strip: redirOp === '<<-', quoted: heredocQuoted, cmd: cur });
      cur.redirs.push({ op: redirOp, target: word });
      redirOp = null;
    } else cur.words.push(word);
    word = '';
    inWord = false;
    heredocQuoted = false;
  };
  const endCmd = () => {
    endWord();
    if (redirOp) throw new Unreadable(); // a redirect with nothing after it
    if (cur.words.length || cur.redirs.length) out.push(cur);
    cur = { words: [], redirs: [], heredocs: [] };
  };
  const add = (t: string) => { word += t; inWord = true; };
  let i = 0;
  const n = src.length;
  while (i < n) {
    const c = src[i];
    if (c === '\n') {
      endCmd();
      i++;
      // the bodies of the here-documents opened on the line just ended
      for (const h of pending.splice(0)) {
        const lines: string[] = [];
        let found = false;
        while (i < n) {
          let e = src.indexOf('\n', i);
          if (e < 0) e = n;
          const line = src.slice(i, e);
          i = e + 1;
          if ((h.strip ? line.replace(/^\t+/, '') : line) === h.delim) { found = true; break; }
          lines.push(line);
        }
        if (!found) i = n;
        h.cmd.heredocs.push({ body: lines.join('\n'), quoted: h.quoted });
      }
      continue;
    }
    if (c === ' ' || c === '\t') { endWord(); i++; continue; }
    if (c === '\\') {
      if (src[i + 1] === '\n') { i += 2; continue; }
      add(src[i + 1] ?? '');
      i += 2;
      continue;
    }
    if (c === "'") {
      const j = src.indexOf("'", i + 1);
      if (j < 0) throw new Unreadable();
      add(src.slice(i + 1, j));
      if (redirOp) heredocQuoted = true;
      inWord = true;
      i = j + 1;
      continue;
    }
    if (c === '$' && src[i + 1] === "'") {
      let j = i + 2;
      let t = '';
      while (j < n && src[j] !== "'") { if (src[j] === '\\') { t += src[j + 1] ?? ''; j += 2; } else t += src[j++]; }
      if (j >= n) throw new Unreadable();
      add(t);
      if (redirOp) heredocQuoted = true;
      i = j + 1;
      continue;
    }
    if (c === '"') {
      const end = closeDouble(src, i + 1);
      if (end < 0) throw new Unreadable();
      let j = i + 1;
      let t = '';
      while (j < end - 1) {
        const d = src[j];
        if (d === '\\' && '$`"\\\n'.includes(src[j + 1] ?? '')) { t += src[j + 1] === '\n' ? '' : src[j + 1]; j += 2; continue; }
        if (d === '$' && src[j + 1] === '(') {
          const k = closeParen(src, j + 2);
          if (src[j + 2] !== '(') nested(src.slice(j + 2, k));
          t += '$(…)';
          j = k + 1;
          continue;
        }
        if (d === '`') { const k = closeTick(src, j + 1); nested(src.slice(j + 1, k)); t += '`…`'; j = k + 1; continue; }
        t += d;
        j++;
      }
      add(t);
      if (redirOp) heredocQuoted = true;
      inWord = true;
      i = end;
      continue;
    }
    if (c === '`') {
      const j = closeTick(src, i + 1);
      if (j < 0) throw new Unreadable();
      nested(src.slice(i + 1, j));
      add('`…`');
      i = j + 1;
      continue;
    }
    if (c === '$' && src[i + 1] === '(') {
      const j = closeParen(src, i + 2);
      if (j < 0) throw new Unreadable();
      // $(( … )) is arithmetic, not a command
      if (src[i + 2] !== '(') nested(src.slice(i + 2, j));
      add('$(…)');
      i = j + 1;
      continue;
    }
    if (c === '$' && src[i + 1] === '{') {
      const j = src.indexOf('}', i + 2);
      if (j < 0) throw new Unreadable();
      if (/\$\(|`/.test(src.slice(i + 2, j))) throw new Unreadable(); // ${x:-$(cmd)}: not read here
      add('${…}');
      i = j + 1;
      continue;
    }
    if (c === '#' && !inWord) { const e = src.indexOf('\n', i); i = e < 0 ? n : e; continue; }
    // redirects, with the file descriptor written before them ("2>")
    if (c === '<' || c === '>' || (c === '&' && src[i + 1] === '>')) {
      if (inWord && /^\d+$/.test(word) && !redirOp) { word = ''; inWord = false; } else endWord();
      if (redirOp) throw new Unreadable();
      if ((c === '<' || c === '>') && src[i + 1] === '(') {
        // process substitution: <(…) reads a command's output; >(…) feeds one, which counts as writing
        const j = closeParen(src, i + 2);
        if (j < 0) throw new Unreadable();
        nested(src.slice(i + 2, j));
        if (c === '>') cur.redirs.push({ op: '>(', target: '' });
        else add('/dev/fd/0');
        i = j + 1;
        continue;
      }
      const op = ['&>>', '&>', '<<<', '<<-', '<<', '>>', '>&', '<&', '>|', '<>', '>', '<'].find((o) => src.startsWith(o, i))!;
      redirOp = op;
      i += op.length;
      while (src[i] === ' ' || src[i] === '\t') i++;
      continue;
    }
    if (c === '|' || c === '&' || c === ';' || c === '(' || c === ')') {
      endCmd();
      i += (c === '|' || c === '&' || c === ';') && (src[i + 1] === c || (c === '|' && src[i + 1] === '&')) ? 2 : 1;
      continue;
    }
    add(c);
    i++;
  }
  endCmd();
  for (const h of pending) h.cmd.heredocs.push({ body: '', quoted: h.quoted });
  return out;
}

/** Output that goes nowhere, or to another of the command's own outputs: not a write. */
function harmless(r: Redir): boolean {
  if (r.op === '<' || r.op === '<<' || r.op === '<<-' || r.op === '<<<' || r.op === '<&') return true;
  if (r.op === '>&') return /^(\d+|-)$/.test(r.target);
  if (r.op === '>' || r.op === '>>' || r.op === '&>' || r.op === '&>>' || r.op === '>|') return r.target === '/dev/null';
  return false;
}

// commands that only read, print or test, whatever their arguments (the ones with exceptions are handled below)
const READERS = new Set([
  'ls', 'cat', 'head', 'tail', 'wc', 'grep', 'egrep', 'fgrep', 'rg', 'ag', 'stat', 'file', 'du', 'df', 'ps', 'pgrep', 'lsof',
  'basename', 'dirname', 'realpath', 'readlink', 'test', '[', '[[', ']]', 'true', 'false', ':', 'sleep', 'pwd', 'cd', 'pushd', 'popd',
  'which', 'type', 'whereis', 'uname', 'whoami', 'id', 'hostname', 'tree', 'md5', 'md5sum', 'shasum', 'sha1sum', 'sha256sum',
  'cksum', 'diff', 'cmp', 'comm', 'paste', 'join', 'nl', 'od', 'xxd', 'hexdump', 'strings', 'ffprobe', 'mdls', 'mdfind', 'jq',
  'rev', 'tac', 'fold', 'fmt', 'expand', 'unexpand', 'seq', 'expr', 'printenv', 'uptime', 'sw_vers', 'vm_stat', 'column', 'cut',
  'tr', 'uniq', 'echo', 'printf', 'zcat', 'gzcat', 'bzcat', 'xzcat', 'zgrep', 'look', 'cal', 'nproc', 'getconf', 'locale',
  'mediainfo', 'pdfinfo', 'identify', 'local', 'export', 'unset', 'set', 'shopt', 'read', 'declare', 'typeset', 'let', 'wait',
  'jobs', 'exit', 'return', 'break', 'continue', 'shift',
]);
// words that open or close a compound command: what follows them is the command
const PREFIXES = new Set(['if', 'then', 'else', 'elif', 'do', 'while', 'until', '!', '{', '}', 'time', 'exec', 'nohup', 'done', 'fi', 'esac']);
const GIT_READS = new Set(['status', 'log', 'diff', 'show', 'ls-files', 'ls-tree', 'rev-parse', 'rev-list', 'describe', 'blame', 'grep',
  'cat-file', 'shortlog', 'name-rev', 'for-each-ref', 'merge-base', 'count-objects', 'check-ignore', 'show-ref', 'var', 'help',
  'version', 'whatchanged', 'cherry', 'show-branch', 'annotate', 'check-attr']);

const base = (w: string) => w.slice(w.lastIndexOf('/') + 1);

function gitLooks(args: string[]): boolean {
  let i = 0;
  while (i < args.length && args[i].startsWith('-')) i += ['-C', '-c', '--git-dir', '--work-tree', '--namespace'].includes(args[i]) ? 2 : 1;
  const sub = args[i];
  const rest = args.slice(i + 1);
  if (!sub) return true;
  if (rest.some((a) => a.startsWith('--output'))) return false;
  if (GIT_READS.has(sub)) return true;
  switch (sub) {
    case 'branch': return rest.every((a) => /^-(a|r|v|vv|l|-list|-all|-remotes|-verbose|-show-current|-no-color|-color(=.*)?)$/.test(a));
    case 'tag': return !rest.length || rest[0] === '-l' || rest[0] === '--list';
    case 'stash': return rest[0] === 'list' || rest[0] === 'show';
    case 'remote': return !rest.length || rest[0] === '-v' || rest[0] === 'show' || rest[0] === 'get-url';
    case 'config': return rest.some((a) => ['--get', '--get-all', '--get-regexp', '--list', '-l'].includes(a));
    case 'worktree': return rest[0] === 'list';
    case 'reflog': return !rest.length || rest[0] === 'show';
    default: return false;
  }
}

/** Python or JavaScript run from the command line: it only looks unless the code has a sign of writing, running
 *  something else or reaching the network. */
export function codeOnlyLooks(code: string, lang: 'python' | 'node'): boolean {
  // print(…, file=sys.stderr) and sys.stdout.write are output, not files
  const c = code.replace(/\b(sys|process)\.(stdout|stderr)\.write\s*\(/g, 'print(');
  const common = [/\.write\s*\(/, /\bwrite_(text|bytes)\b/, /\bwriteFile/, /\bunlink/, /\brename/, /\bshutil\./, /\bos\.remove\b/];
  const python = [
    /\bjson\.dump\s*\(/, /\b(pickle|marshal|yaml|toml|tomli_w|plistlib)\.(safe_)?dump\s*\(/,
    /\bos\.(rmdir|removedirs|replace|mkdir|makedirs|link|symlink|chmod|chown|truncate|system|popen|exec\w*|spawn\w*|kill|killpg|utime|mkfifo|open|startfile|fork)\b/,
    /\bsubprocess\b/, /\.(mkdir|rmdir|touch|chmod|symlink_to|hardlink_to|link_to)\s*\(/, /\.save\s*\(/, /\bsavefig\b/, /\bimwrite\b/,
    /\.to_(csv|json|excel|parquet|pickle|sql|feather|html|hdf)\s*\(/, /\bnp\.save/, /\bsqlite3\b/, /\btempfile\b/,
    /\b(requests|urllib|httpx|aiohttp|http\.client|socket|smtplib|ftplib|webbrowser|ctypes|multiprocessing|asyncio\.create_subprocess)/,
    /\bexec\s*\(/, /\beval\s*\(/, /\b__import__\b/, /\bimportlib\b/, /\bZipFile\s*\([^)]*['"][wax]/,
  ];
  const node = [
    /\bappendFile/, /\bcreateWriteStream\b/, /\bmkdir/, /\brmSync\b/, /\brm\s*\(/, /\brmdir/, /\bcopyFile/, /\bcpSync\b/, /\bfs\.cp\b/,
    /\bsymlink/, /\blink(Sync)?\s*\(/, /\bchmod/, /\bchown/, /\btruncate/, /\butimes/, /\bopen(Sync)?\s*\(/, /\bchild_process\b/,
    /\bexec(Sync|File)?\s*\(/, /\bspawn/, /\bfork\s*\(/, /\bfetch\s*\(/, /\bhttps?\b/, /\bnet\b/, /\beval\s*\(/, /\bnew\s+Function\b/,
    /\bprocess\.kill\b/, /\bimport\s*\(/,
  ];
  if ([...common, ...(lang === 'python' ? python : node)].some((re) => re.test(c))) return false;
  return lang === 'python' ? pythonOpensForReading(c) : true;
}

/** Every open(…) in Python code opens for reading: no mode, or a mode without w, a, x or +; a mode it cannot read is a write. */
function pythonOpensForReading(code: string): boolean {
  for (const m of code.matchAll(/(\.)?\bopen\s*\(/g)) {
    const start = (m.index ?? 0) + m[0].length;
    const end = closeParen(code, start);
    if (end < 0) return false;
    const args = splitArgs(code.slice(start, end));
    const positional = args.filter((a) => !/^\w+\s*=/.test(a));
    const keyword = args.map((a) => /^mode\s*=\s*([^]*)$/.exec(a)?.[1]).filter((a): a is string => a !== undefined);
    // open(path, mode…): the path is skipped. A method (Path.open(mode), gzip/tarfile/io/Image.open(path, mode)):
    // its first argument is the mode or a path, so a name there reads as a path and a literal is checked
    const first = m[1] ? positional.slice(0, 1) : [];
    const rest = [...positional.slice(1), ...keyword];
    for (const raw of [...first, ...rest]) {
      const a = raw.trim();
      const lit = /^[rbuRBU]*(['"])([^]*)\1$/.exec(a);
      if (lit) { if (/^[rwabxtU+]{1,4}$/.test(lit[2]) && /[wax+]/.test(lit[2])) return false; continue; }
      if (/^-?\d+$/.test(a) || a === 'None') continue; // buffering
      if (first.includes(raw)) continue;
      return false; // a mode held in a name: unsure
    }
  }
  return true;
}

/** Splits call arguments at top-level commas. */
function splitArgs(s: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let q: string | null = null;
  let cur = '';
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) { cur += c; if (c === '\\') { cur += s[++i] ?? ''; continue; } if (c === q) q = null; continue; }
    if (c === '"' || c === "'") { q = c; cur += c; continue; }
    if ('([{'.includes(c)) depth++;
    if (')]}'.includes(c)) depth--;
    if (c === ',' && depth === 0) { out.push(cur.trim()); cur = ''; continue; }
    cur += c;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

/** A here-document fed to an interpreter: its code, unless the shell runs commands inside it first. */
function heredocCode(hs: Heredoc[], lang: 'python' | 'node' | 'shell', depth: number): boolean {
  if (!hs.length) return false; // the program comes from somewhere it cannot see
  return hs.every((h) => {
    if (!h.quoted && /\$\(|`/.test(h.body)) return false;
    return lang === 'shell' ? bashOnlyLooks(h.body, depth + 1) : codeOnlyLooks(h.body, lang);
  });
}

function interpreterLooks(args: string[], hs: Heredoc[], lang: 'python' | 'node', depth: number): boolean {
  const codeFlag = lang === 'python' ? /^-[A-Za-z]*c$/ : /^(-e|-p|--eval|--print|-pe)$/;
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (codeFlag.test(a)) return args[i + 1] !== undefined && codeOnlyLooks(args[i + 1], lang);
    if (a === '-') return heredocCode(hs, lang, depth);
    if (a === '-m' || a === '-r' || a === '--require' || a === '--import') return false;
    if (a.startsWith('-')) { if (lang === 'python' && (a === '-W' || a === '-X')) i++; continue; }
    return false; // a script file
  }
  return heredocCode(hs, lang, depth);
}

function commandLooks(words: string[], hs: Heredoc[], depth: number): boolean {
  let w = words;
  while (w.length && (PREFIXES.has(w[0]) || /^[A-Za-z_][A-Za-z0-9_]*=/.test(w[0]))) w = w.slice(1);
  if (!w.length) return true;
  const name = base(w[0]);
  const args = w.slice(1);
  if (name === 'for' || name === 'select' || name === 'case' || name === 'in') return !(name === 'for' && args[0]?.startsWith('(('));
  if (READERS.has(name)) return true;
  switch (name) {
    case 'date': return !args.some((a) => a === '-s' || a.startsWith('--set'));
    case 'sort': return !args.some((a) => a === '-o' || a.startsWith('--output') || /^-[a-zA-Z]*o/.test(a));
    case 'sed':
      if (args.some((a) => /^-[a-zA-Z]*i/.test(a) || a.startsWith('--in-place'))) return false;
      return !args.some((a) => !a.startsWith('-') && /(^|[;\n}]|\/[a-zA-Z0-9]*)\s*[wWe](\s|$)/.test(a));
    case 'awk': case 'gawk': case 'mawk': case 'nawk': {
      let i = 0;
      while (i < args.length && args[i].startsWith('-')) { if (args[i] === '-f' || args[i].startsWith('-f')) return false; i += ['-F', '-v'].includes(args[i]) ? 2 : 1; }
      const prog = args[i] ?? '';
      return !/system\s*\(|[|>]|\bfflush\b/.test(prog);
    }
    case 'find': {
      if (args.some((a) => ['-delete', '-fprint', '-fprint0', '-fprintf', '-fls'].includes(a))) return false;
      for (let i = 0; i < args.length; i++) {
        if (!['-exec', '-execdir', '-ok', '-okdir'].includes(args[i])) continue;
        let j = i + 1;
        while (j < args.length && args[j] !== ';' && args[j] !== '+') j++;
        if (!commandLooks(args.slice(i + 1, j), [], depth)) return false;
        i = j;
      }
      return true;
    }
    case 'xargs': {
      let i = 0;
      while (i < args.length && args[i].startsWith('-')) i += /^-[InPLdsEa]$/.test(args[i]) ? 2 : 1;
      return commandLooks(args.slice(i), [], depth);
    }
    case 'env': {
      let i = 0;
      while (i < args.length && (args[i].startsWith('-') || /^[A-Za-z_][A-Za-z0-9_]*=/.test(args[i]))) i += args[i] === '-u' ? 2 : 1;
      return commandLooks(args.slice(i), hs, depth);
    }
    case 'command': return args[0] === '-v' || args[0] === '-V' || commandLooks(args, hs, depth);
    case 'nice': return commandLooks(args[0] === '-n' ? args.slice(2) : args, hs, depth);
    case 'timeout': case 'gtimeout': {
      let i = 0;
      while (i < args.length && args[i].startsWith('-')) i += args[i] === '-s' || args[i] === '-k' ? 2 : 1;
      return commandLooks(args.slice(i + 1), hs, depth);
    }
    case 'perl':
      // the Mac's stand-in for timeout: perl -e 'alarm N; exec @ARGV' <command…>
      if (args[0] === '-e' && /^\s*alarm\s+\d+\s*;\s*exec\s+@ARGV\s*;?\s*$/.test(args[1] ?? '')) return commandLooks(args.slice(2), hs, depth);
      return false;
    case 'git': return gitLooks(args);
    case 'bash': case 'sh': case 'zsh': case 'dash': {
      const c = args.indexOf('-c');
      if (c >= 0) return args[c + 1] !== undefined && bashOnlyLooks(args[c + 1], depth + 1);
      if (args.some((a) => !a.startsWith('-'))) return false; // a script file
      return heredocCode(hs, 'shell', depth);
    }
    default:
      if (/^python(\d+(\.\d+)?)?$/.test(name) || name === 'pypy3') return interpreterLooks(args, hs, 'python', depth);
      if (name === 'node') return interpreterLooks(args, hs, 'node', depth);
      return false; // anything else (a script, tools/…, ./x, curl, ffmpeg, rm, cp, mv, tee…) is a change
  }
}

/** True when a Bash command only looks: every command in it reads, and nothing is written outside /dev/null. */
export function bashOnlyLooks(command: string, depth = 0): boolean {
  let cmds: Cmd[];
  try {
    cmds = parseShell(command, depth);
  } catch {
    return false;
  }
  for (const c of cmds) {
    if (!c.redirs.every(harmless)) return false;
    // an unquoted here-document runs the commands written inside it before the command reads it
    if (c.heredocs.some((h) => !h.quoted && /\$\(|`/.test(h.body))) return false;
    if (!commandLooks(c.words, c.heredocs, depth)) return false;
  }
  return true;
}

// ---- turns in the transcript

type Json = Record<string, unknown>;

/** A user line of the transcript that starts a turn: one with a turnOrigin, or a plain message. Tool results,
 *  compaction summaries and the CLI's own meta lines (skill bodies, reminders) belong to the turn they are in. */
export function startsTurn(e: Json): boolean {
  if (e.type !== 'user') return false;
  if (typeof e.turnOrigin === 'string' && e.turnOrigin) return true;
  if (e.isMeta === true || e.isCompactSummary === true) return false;
  const content = (e.message as Json | undefined)?.content;
  return !(Array.isArray(content) && content.some((b) => (b as Json)?.type === 'tool_result'));
}

export interface Turn {
  /** turnOrigin of the line that started it: 'scheduled', 'sdk', 'task_notification', 'peer'…; undefined for older lines. */
  origin?: string;
  at: string;
  /** Every tool it used only looked, and nobody's message was delivered into it. */
  quiet: boolean;
  /** The ids of its assistant_text, tool_use and tool_result events: what hiding it removes. */
  ids: string[];
  /** Its last reply line (for the calibration script). */
  last?: string;
}

export const quietScheduled = (t: Turn | null | undefined): boolean => !!t && t.origin === 'scheduled' && t.quiet;

/** Follows the turns of one transcript as its lines are read (kept between incremental reads). */
export class TurnTracker {
  current: Turn | null = null;
  /** The ids of every closed scheduled turn that changed nothing. */
  readonly hidden = new Set<string>();
  /** Every closed scheduled turn, in order. */
  readonly scheduled: Turn[] = [];

  start(origin: string | undefined, at: string): void {
    this.close();
    this.current = { origin, at, quiet: true, ids: [] };
  }
  close(): void {
    const t = this.current;
    this.current = null;
    if (!t || t.origin !== 'scheduled') return;
    this.scheduled.push(t);
    if (t.quiet) for (const id of t.ids) this.hidden.add(id);
  }
  /** A main-thread tool call of the current turn. */
  tool(name: string, input: unknown): void {
    if (this.current && this.current.quiet && !changesNothing(name, input)) this.current.quiet = false;
  }
  /** A message delivered into the running turn (the user's, or another session's): the turn shows. */
  delivered(): void {
    if (this.current) this.current.quiet = false;
  }
  /** An event the reader produced inside the current turn. */
  saw(ev: ThreadEvent): void {
    const t = this.current;
    if (!t || !hideable(ev)) return;
    t.ids.push(ev.id);
    if (ev.kind === 'assistant_text') t.last = ev.text;
  }
  /** The turn still open at the end of what was read, as a copy. */
  open(): Turn | null {
    return this.current ? { ...this.current, ids: [...this.current.ids] } : null;
  }
}
