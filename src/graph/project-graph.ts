import { InputError } from '../errors.js';
import { uniqueSorted } from '../text.js';
import { DEPENDENCY_FIELDS, type Workspace } from '../workspace/model.js';
import { findCycle } from './cycles.js';

/**
 * Which projects of the workspace depend on which.
 *
 * A project depends on another when any of its dependency fields (dependencies, devDependencies,
 * peerDependencies, optionalDependencies) names it. The version spec is not checked: the entry is
 * treated as the local project whether it says "workspace:*", "*" or "^1.2.0".
 */
export interface ProjectGraph {
  workspace: Workspace;
  /** For each project, the projects it depends on directly, sorted. */
  dependencies: ReadonlyMap<string, readonly string[]>;
  /** For each project, the projects that depend on it directly, sorted. */
  dependents: ReadonlyMap<string, readonly string[]>;
}

export function buildProjectGraph(workspace: Workspace): ProjectGraph {
  const dependencies = new Map<string, string[]>();
  const dependents = new Map<string, string[]>(workspace.projects.map((project) => [project.name, []]));

  for (const project of workspace.projects) {
    const names = DEPENDENCY_FIELDS.flatMap((field) => Object.keys(project.dependencies[field]));
    const internal = uniqueSorted(names.filter((name) => name !== project.name && workspace.byName.has(name)));
    dependencies.set(project.name, internal);
    for (const name of internal) dependents.get(name)?.push(project.name);
  }
  for (const [name, list] of dependents) dependents.set(name, uniqueSorted(list));

  const cycle = findCycle(
    workspace.projects.map((project) => project.name),
    (name) => dependencies.get(name) ?? [],
  );
  if (cycle) throw new InputError(`the workspace projects depend on each other in a cycle: ${cycle.join(' -> ')}`);

  return { workspace, dependencies, dependents };
}

/** Every project that depends on one of `names`, directly or through other projects. */
export function transitiveDependents(graph: ProjectGraph, names: Iterable<string>): string[] {
  const seen = new Set<string>();
  const queue = [...names];
  while (queue.length > 0) {
    const name = queue.shift() as string;
    for (const dependent of graph.dependents.get(name) ?? []) {
      if (seen.has(dependent)) continue;
      seen.add(dependent);
      queue.push(dependent);
    }
  }
  return uniqueSorted(seen);
}

/** Every project that one of `names` depends on, directly or through other projects. */
export function transitiveDependencies(graph: ProjectGraph, names: Iterable<string>): string[] {
  const seen = new Set<string>();
  const queue = [...names];
  while (queue.length > 0) {
    const name = queue.shift() as string;
    for (const dependency of graph.dependencies.get(name) ?? []) {
      if (seen.has(dependency)) continue;
      seen.add(dependency);
      queue.push(dependency);
    }
  }
  return uniqueSorted(seen);
}
