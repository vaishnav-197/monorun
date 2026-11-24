import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { InputError } from '../errors.js';
import { readManifest } from './manifest.js';

/**
 * The nearest directory, from `start` upwards, whose package.json has a "workspaces" field.
 * A package.json without one (a project inside the workspace) is passed over.
 */
export function findWorkspaceRoot(start: string): string {
  const first = resolve(start);
  if (!existsSync(first)) throw new InputError(`directory "${start}" does not exist`);

  let dir = first;
  for (;;) {
    const file = join(dir, 'package.json');
    if (existsSync(file) && readManifest(file).workspaces !== null) return dir;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new InputError(`no package.json with a "workspaces" field in "${first}" or any directory above it`);
}
