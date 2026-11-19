// npm run port:test
// The harness's address reaches Alma from the port the server really runs on, and from nowhere else: no file she
// reads names a port (a copy on 8810 once had its calls answered by another app on 8800, because recipes/edit.md
// said http://localhost:8800), and the address in her standing prompt and in her shell follows the configured port.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

process.env.HARNESS_ALMA_DRYRUN = '1';

let bad = 0;
const fail = (m: string): void => { bad++; console.error(`✗ ${m}`); };
const ROOT = path.resolve(__dirname, '..');
const LITERAL = /(?:localhost|127\.0\.0\.1):\d+/;

// 1. Everything Alma reads: the recipes, the rules, the studio's CLAUDE.md, its skills and its tools.
const READ = ['recipes', 'studio/flow', 'studio/CLAUDE.md', 'studio/.claude', 'studio/tools'];
const SKIP = new Set(['.venv', 'node_modules', '__pycache__', '.git']);
const files: string[] = [];
const walk = (p: string): void => {
  let st;
  try { st = statSync(p); } catch { return; }
  if (st.isDirectory()) {
    for (const n of readdirSync(p)) if (!SKIP.has(n) && !n.endsWith('.nosync')) walk(path.join(p, n));
  } else if (st.isFile() && st.size < 2_000_000) files.push(p);
};
for (const r of READ) walk(path.join(ROOT, r));
if (files.length < 50) fail(`only ${files.length} files found under ${READ.join(', ')}: the walk is wrong`);
for (const f of files) {
  const buf = readFileSync(f);
  if (buf.includes(0)) continue; // a picture or another binary
  buf.toString('utf8').split('\n').forEach((line, i) => {
    const m = LITERAL.exec(line);
    if (m) fail(`${path.relative(ROOT, f)}:${i + 1} names a port Alma would call: ${m[0]}`);
  });
}

async function main(): Promise<void> {
  // 2. The address follows the port: Next's PORT (set in the server once it listens) first, then HARNESS_PORT.
  delete process.env.PORT;
  process.env.HARNESS_PORT = '8814';
  const { harnessUrl, harnessConfig } = await import('../src/server/config');
  const { almaAppendPrompt, almaShellEnv } = await import('../src/server/claude/process');
  if (harnessUrl() !== 'http://localhost:8814') fail(`with HARNESS_PORT=8814 the address is ${harnessUrl()}`);
  process.env.PORT = '8813';
  if (harnessUrl() !== 'http://localhost:8813') fail(`with PORT=8813 (the server's real port) the address is ${harnessUrl()}`);
  if (harnessConfig().port !== 8813) fail(`the Settings page's port is ${harnessConfig().port}, not the server's 8813`);
  const prompt = almaAppendPrompt();
  if (!prompt.includes('http://localhost:8813')) fail('Alma\'s standing prompt does not give the address at the server\'s port');
  if (!prompt.includes('$HARNESS_URL')) fail('Alma\'s standing prompt does not name $HARNESS_URL');
  const others = [...prompt.matchAll(new RegExp(LITERAL, 'g'))].map((m) => m[0]).filter((a) => a !== 'localhost:8813');
  if (others.length) fail(`Alma's standing prompt names another address: ${others.join(', ')}`);
  const env = almaShellEnv(undefined, { ...process.env, PORT: '8813' });
  if (env.HARNESS_URL !== 'http://localhost:8813') fail(`Alma's shell gets HARNESS_URL=${env.HARNESS_URL}`);
  process.env.PORT = '8821';
  if (almaShellEnv().HARNESS_URL !== 'http://localhost:8821' || !almaAppendPrompt().includes('http://localhost:8821')) fail('the address does not follow a change of port');

  // 3. The recipes call the harness only through $HARNESS_URL.
  const edit = readFileSync(path.join(ROOT, 'recipes', 'edit.md'), 'utf8');
  for (const route of ['cut/plan', 'cut/export']) {
    if (!new RegExp(`\\$HARNESS_URL/api/films/<film>/${route}`).test(edit)) fail(`recipes/edit.md does not call ${route} at $HARNESS_URL`);
  }

  if (bad) { console.error(`port-test: ${bad} failed`); process.exit(1); }
  console.log(`✓ port-test: ${files.length} files Alma reads name no port; the address follows the server's port`);
}
void main();
