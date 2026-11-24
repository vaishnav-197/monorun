import { readFileSync } from 'node:fs';
import { isAbsolute, posix, relative } from 'node:path';
import { InputError } from '../errors.js';
import { describeFsError } from '../read-json.js';
import { toPosix, uniqueSorted } from '../text.js';

export interface ChangedFileOptions {
  /** Paths given with --changed. */
  changed: readonly string[];
  /** The file given with --changed-file: one path per line, as `git diff --name-only` prints them. */
  changedFile?: string | undefined;
}

/**
 * Collects the changed paths and turns them into paths relative to the workspace root, with "/"
 * separators. Relative paths are taken as relative to the workspace root, as git prints them.
 * Blank lines are ignored. A path outside the workspace is an error.
 */
export function readChangedFiles(options: ChangedFileOptions, root: string): string[] {
  const paths = [...options.changed];
  if (options.changedFile !== undefined) {
    let text: string;
    try {
      text = readFileSync(options.changedFile, 'utf8');
    } catch (error) {
      throw new InputError(`cannot read changed-file list "${options.changedFile}": ${describeFsError(error)}`);
    }
    paths.push(...text.split(/\r?\n/));
  }
  return uniqueSorted(paths.map((path) => path.trim()).filter((path) => path !== '').map((path) => normalize(path, root)));
}

function normalize(path: string, root: string): string {
  const fromRoot = isAbsolute(path) ? toPosix(relative(root, path)) : toPosix(path);
  const normalized = posix.normalize(fromRoot);
  if (normalized === '..' || normalized.startsWith('../') || posix.isAbsolute(normalized)) {
    throw new InputError(`changed file "${path}" is outside the workspace`);
  }
  if (normalized === '.') throw new InputError(`changed file "${path}" is the workspace root, not a file`);
  return normalized;
}
