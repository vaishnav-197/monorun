// Expands the "workspaces" patterns of the root package.json into project directories, the way
// npm does: a directory is a project when a pattern matches its path and it has a package.json.
// Patterns starting with "!" exclude directories again. node_modules and hidden directories are
// never searched.

import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { InputError } from '../errors.js';
import { matchGlob } from '../glob.js';
import { compareText, toPosix } from '../text.js';

const SKIPPED = new Set(['node_modules']);

export function expandPatterns(root: string, patterns: readonly string[]): string[] {
  const include: string[] = [];
  const exclude: string[] = [];
  for (const raw of patterns) {
    const negated = raw.startsWith('!');
    const pattern = normalizePattern(negated ? raw.slice(1) : raw);
    (negated ? exclude : include).push(pattern);
  }
  if (include.length === 0) return [];

  // How deep the search has to go: "packages/*" needs one level below "packages", "**" any depth.
  const maxDepth = include.some((pattern) => pattern.includes('**'))
    ? Number.POSITIVE_INFINITY
    : Math.max(...include.map((pattern) => pattern.split('/').length));

  const found: string[] = [];
  const walk = (relative: string, depth: number): void => {
    if (depth >= maxDepth) return;
    const entries = readdirSync(join(root, relative), { withFileTypes: true }).sort((a, b) => compareText(a.name, b.name));
    for (const entry of entries) {
      if (!entry.isDirectory() || SKIPPED.has(entry.name) || entry.name.startsWith('.')) continue;
      const child = relative ? `${relative}/${entry.name}` : entry.name;
      const matches = include.some((pattern) => matchGlob(pattern, child)) && !exclude.some((pattern) => matchGlob(pattern, child));
      if (matches && existsSync(join(root, child, 'package.json'))) found.push(child);
      walk(child, depth + 1);
    }
  };
  walk('', 0);
  return found.sort(compareText);
}

function normalizePattern(pattern: string): string {
  let result = toPosix(pattern.trim());
  while (result.endsWith('/')) result = result.slice(0, -1);
  if (result === '' || result.startsWith('/') || /^[A-Za-z]:/.test(result) || result.split('/').includes('..')) {
    throw new InputError(`workspace pattern "${pattern}" must be a path inside the workspace, such as "packages/*"`);
  }
  return result;
}
