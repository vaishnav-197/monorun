import { join } from 'node:path';
import { InputError } from '../errors.js';
import { compareText } from '../text.js';
import { readManifest } from './manifest.js';
import type { Project, Workspace } from './model.js';
import { expandPatterns } from './patterns.js';

/** Reads the root package.json at `root` and every project its "workspaces" patterns match. */
export function loadWorkspace(root: string): Workspace {
  const rootManifest = readManifest(join(root, 'package.json'));
  const patterns = rootManifest.workspaces;
  if (patterns === null) throw new InputError(`${join(root, 'package.json')} has no "workspaces" field`);

  const dirs = expandPatterns(root, patterns);
  if (dirs.length === 0) {
    throw new InputError(
      `the "workspaces" patterns in ${join(root, 'package.json')} (${patterns.join(', ') || 'none'}) match no directory with a package.json`,
    );
  }

  const byName = new Map<string, Project>();
  for (const dir of dirs) {
    const file = join(root, dir, 'package.json');
    const manifest = readManifest(file);
    if (manifest.name === null) {
      throw new InputError(`${file} has no "name". Every workspace project needs one.`);
    }
    const existing = byName.get(manifest.name);
    if (existing) {
      throw new InputError(`"${existing.dir}" and "${dir}" are both named "${manifest.name}"`);
    }
    byName.set(manifest.name, {
      name: manifest.name,
      version: manifest.version,
      dir,
      path: join(root, dir),
      scripts: manifest.scripts,
      dependencies: manifest.dependencies,
    });
  }

  const projects = [...byName.values()].sort((a, b) => compareText(a.name, b.name));
  return { root, patterns, projects, byName };
}
