import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { type Context, loadContext } from '../src/context.js';

export const ROOT = fileURLToPath(new URL('..', import.meta.url));
export const CLI = join(ROOT, 'dist', 'cli.js');

export function fixturePath(...parts: string[]): string {
  return join(ROOT, 'fixtures', ...parts);
}

export function tempDir(): string {
  // realpath, because macOS puts tmpdir() behind a symlink and the tests compare paths.
  return realpathSync(mkdtempSync(join(tmpdir(), 'monorun-')));
}

/** A fresh copy of a fixture workspace, so tests can build in it and change files. */
export function copyWorkspace(name: string): string {
  const dir = join(tempDir(), name);
  cpSync(fixturePath('workspaces', name), dir, { recursive: true });
  return dir;
}

/** Writes a workspace from a map of path to content. Objects are written as JSON. */
export function writeWorkspace(files: Record<string, unknown>): string {
  const root = tempDir();
  for (const [path, content] of Object.entries(files)) {
    const file = join(root, path);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, typeof content === 'string' ? content : `${JSON.stringify(content, null, 2)}\n`);
  }
  return root;
}

export function shopContext(): Context {
  return loadContext(fixturePath('workspaces', 'shop'));
}

export interface CliResult {
  status: number | null;
  stdout: string;
  stderr: string;
}

export function runCli(args: string[], cwd: string, env: NodeJS.ProcessEnv = {}): CliResult {
  const base = { ...process.env };
  delete base.NO_COLOR;
  delete base.FORCE_COLOR;
  const result = spawnSync(process.execPath, [CLI, ...args], { cwd, env: { ...base, ...env }, encoding: 'utf8' });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}
