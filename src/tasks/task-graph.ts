// Turns "run build in these projects" into the full set of tasks to run and the order to run them
// in, following the dependsOn settings of monorun.json.

import { type Config, parseTaskDependency, taskConfig } from '../config.js';
import { InputError } from '../errors.js';
import { findCycle } from '../graph/cycles.js';
import type { ProjectGraph } from '../graph/project-graph.js';
import { topologicalOrder } from '../graph/topo.js';
import { joinList, uniqueSorted } from '../text.js';

export interface TaskNode {
  /** "<project>#<task>", e.g. "@shop/ui#build". */
  id: string;
  project: string;
  task: string;
  /** The script from package.json. */
  command: string;
  /** ids of the tasks that must succeed first, sorted. */
  dependsOn: readonly string[];
  /** requested: the task asked for, in a selected project. dependency: needed by another task. */
  reason: 'requested' | 'dependency';
}

export interface TaskGraph {
  task: string;
  nodes: ReadonlyMap<string, TaskNode>;
  /** Every id, dependencies before the tasks that need them. */
  order: readonly string[];
  /** Selected projects that have no script with this name. */
  withoutScript: readonly string[];
}

export function taskId(project: string, task: string): string {
  return `${project}#${task}`;
}

/**
 * Builds the tasks for running `task` in `selected` projects.
 *
 * Selected projects without the script are left out. Dependencies come from dependsOn:
 * "^build" adds the build of every project this one depends on. When such a project has no build
 * script, monorun looks through it to the projects it depends on, so a package with nothing to
 * build does not cut its dependencies out of the order. A same-project dependency ("build" in the
 * dependsOn of "test") is skipped when the project has no such script.
 */
export function buildTaskGraph(graph: ProjectGraph, config: Config, task: string, selected: readonly string[]): TaskGraph {
  const { workspace } = graph;
  const nodes = new Map<string, TaskNode>();
  const withoutScript: string[] = [];

  const scriptOf = (project: string, name: string): string | undefined => workspace.byName.get(project)?.scripts[name];

  const requested = selected.filter((project) => {
    if (scriptOf(project, task) !== undefined) return true;
    withoutScript.push(project);
    return false;
  });
  // The nearest projects below `project` that have the script `name`, looking through projects
  // that do not.
  const upstreamWithScript = (project: string, name: string): string[] => {
    const found = new Set<string>();
    const seen = new Set<string>();
    const queue = [...(graph.dependencies.get(project) ?? [])];
    while (queue.length > 0) {
      const next = queue.shift() as string;
      if (seen.has(next)) continue;
      seen.add(next);
      if (scriptOf(next, name) !== undefined) found.add(next);
      else queue.push(...(graph.dependencies.get(next) ?? []));
    }
    return [...found];
  };

  const queue: { project: string; task: string; reason: TaskNode['reason'] }[] = requested.map((project) => ({
    project,
    task,
    reason: 'requested' as const,
  }));

  while (queue.length > 0) {
    const item = queue.shift() as (typeof queue)[number];
    const id = taskId(item.project, item.task);
    const existing = nodes.get(id);
    if (existing) {
      if (item.reason === 'requested' && existing.reason === 'dependency') nodes.set(id, { ...existing, reason: 'requested' });
      continue;
    }

    const dependsOn: string[] = [];
    for (const entry of taskConfig(config, item.task).dependsOn) {
      const dependency = parseTaskDependency(entry);
      if (dependency === null) continue;
      const targets = dependency.upstream
        ? upstreamWithScript(item.project, dependency.task)
        : scriptOf(item.project, dependency.task) === undefined
          ? []
          : [item.project];
      for (const project of targets) {
        dependsOn.push(taskId(project, dependency.task));
        queue.push({ project, task: dependency.task, reason: 'dependency' });
      }
    }

    nodes.set(id, {
      id,
      project: item.project,
      task: item.task,
      command: scriptOf(item.project, item.task) ?? '',
      dependsOn: uniqueSorted(dependsOn),
      reason: item.reason,
    });
  }

  const ids = [...nodes.keys()];
  const dependenciesOf = (id: string): readonly string[] => nodes.get(id)?.dependsOn ?? [];
  const cycle = findCycle(ids, dependenciesOf);
  if (cycle) throw new InputError(`the dependsOn settings in monorun.json form a cycle: ${cycle.join(' -> ')}`);

  return { task, nodes, order: topologicalOrder(ids, dependenciesOf), withoutScript: uniqueSorted(withoutScript) };
}

export function describeWithoutScript(graph: TaskGraph): string | null {
  if (graph.withoutScript.length === 0) return null;
  return `skipped ${joinList([...graph.withoutScript])}: no "${graph.task}" script`;
}
