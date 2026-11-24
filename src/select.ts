import { UsageError } from './errors.js';
import { matchGlob } from './glob.js';
import { uniqueSorted } from './text.js';
import type { Workspace } from './workspace/model.js';

/**
 * The projects named by --projects: a comma-separated list of names or patterns ("@shop/*",
 * "*-app"). Without the option every project is selected. A name or pattern that matches no
 * project is an error, so a typo does not silently run nothing.
 */
export function selectProjects(workspace: Workspace, option: string | undefined): string[] {
  const names = workspace.projects.map((project) => project.name);
  if (option === undefined) return names;

  const patterns = option
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part !== '');
  if (patterns.length === 0) throw new UsageError('--projects needs at least one project name or pattern');

  const selected: string[] = [];
  for (const pattern of patterns) {
    const matches = names.filter((name) => matchGlob(pattern, name));
    if (matches.length === 0) throw new UsageError(`no project matches "${pattern}"`);
    selected.push(...matches);
  }
  return uniqueSorted(selected);
}
