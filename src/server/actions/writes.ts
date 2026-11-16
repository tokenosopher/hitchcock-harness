// The one place the harness writes into a film folder or the library. Every write goes through a Writer:
// a copy never overwrites (a new pick takes the next version number), and each write is one line of
// harness/writes.log (when, what, where). A dry-run Writer records the same lines and touches nothing.
import { constants, promises as fs } from 'node:fs';
import path from 'node:path';
import { claudeConfig } from '../claude/config';

export interface WriteRecord {
  at: string;
  action: string;                 // "pick face C01 r2-7", "library save face"
  op: 'copy' | 'write' | 'append' | 'mkdir' | 'run';
  where: string;                  // shown path: assets/films/<film>/… or the library path
  from?: string;
  note?: string;
}

/** Turns an absolute path into the one shown to the user (assets/films/… inside the film repo). */
export type ShowPath = (abs: string) => string;

export class Writer {
  readonly records: WriteRecord[] = [];
  private made = new Set<string>();
  constructor(readonly action: string, readonly show: ShowPath, readonly dryRun = false, private logFile = path.join(claudeConfig().harnessDir, 'writes.log')) {}

  private async log(r: Omit<WriteRecord, 'at' | 'action'>): Promise<void> {
    const rec: WriteRecord = { at: new Date().toISOString(), action: this.action, ...r };
    this.records.push(rec);
    if (this.dryRun) return;
    const line = [rec.at, rec.action, rec.op, rec.where, rec.from ? `from ${rec.from}` : '', rec.note ?? ''].join('\t').replace(/\t+$/, '');
    await fs.mkdir(path.dirname(this.logFile), { recursive: true });
    await fs.appendFile(this.logFile, line + '\n');
  }

  async mkdir(dir: string): Promise<void> {
    if (this.made.has(dir) || (await isDir(dir))) return;
    this.made.add(dir);
    if (!this.dryRun) await fs.mkdir(dir, { recursive: true });
    await this.log({ op: 'mkdir', where: this.show(dir) });
  }

  /** Copies a file to a path that must not exist yet (COPYFILE_EXCL: a race loses, it never overwrites). */
  async copyNew(from: string, to: string, note?: string): Promise<void> {
    await this.mkdir(path.dirname(to));
    if (!this.dryRun) await fs.copyFile(from, to, constants.COPYFILE_EXCL);
    await this.log({ op: 'copy', where: this.show(to), from: this.show(from), note });
  }

  /** Writes a new file; refuses an existing one. */
  async writeNew(to: string, text: string, note?: string): Promise<void> {
    await this.mkdir(path.dirname(to));
    if (!this.dryRun) await fs.writeFile(to, text, { flag: 'wx' });
    await this.log({ op: 'write', where: this.show(to), note });
  }

  /** Inserts text into a record file at a position the caller computed (the taste.md row). */
  async insertInto(file: string, before: string, inserted: string, after: string, note?: string): Promise<void> {
    if (!this.dryRun) {
      // re-read and check nothing moved under us since the caller read it
      const now = await fs.readFile(file, 'utf8');
      if (now !== before + after) throw new Error(`${this.show(file)} changed while the harness was writing to it; nothing written`);
      const tmp = `${file}.harness-tmp`;
      await fs.writeFile(tmp, before + inserted + after, { flag: 'wx' });
      await fs.rename(tmp, file);
    }
    await this.log({ op: 'append', where: this.show(file), note });
  }

  /** A file of the harness's own that the caller wrote itself (harness/answers.json): logged like the rest. */
  async wrote(where: string, note?: string): Promise<void> {
    await this.log({ op: 'write', where, note });
  }

  /** A script of the film flow that writes its own record files (pick.py and cast.json). */
  async ran(cmd: string, where: string, note?: string): Promise<void> {
    await this.log({ op: 'run', where, from: cmd, note });
  }
}

export async function isDir(p: string): Promise<boolean> {
  try {
    return (await fs.stat(p)).isDirectory();
  } catch {
    return false;
  }
}

export async function isFile(p: string): Promise<boolean> {
  try {
    return (await fs.stat(p)).isFile();
  } catch {
    return false;
  }
}

/** The next free versioned name: "pick-face.png" → itself when free, else "pick-face-v2.png", "-v3"… */
export async function nextVersion(dir: string, base: string, ext: string, taken: Set<string> = new Set()): Promise<string> {
  const names = new Set([...(await fs.readdir(dir).catch(() => [] as string[])), ...taken]);
  if (!names.has(`${base}${ext}`)) return path.join(dir, `${base}${ext}`);
  let n = 2;
  for (const name of names) {
    const m = new RegExp(`^${base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}-v(\\d+)${ext.replace('.', '\\.')}$`).exec(name);
    if (m) n = Math.max(n, Number(m[1]) + 1);
  }
  return path.join(dir, `${base}-v${n}${ext}`);
}
