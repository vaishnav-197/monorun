// Runs the tasks of a task graph one at a time, in graph order.

import { performance } from 'node:perf_hooks';
import type { TaskGraph, TaskNode } from '../tasks/task-graph.js';
import type { Workspace } from '../workspace/model.js';
import { scriptEnv } from './env.js';
import { type OutputStream, runScript } from './spawn.js';

export type TaskStatus = 'passed' | 'failed' | 'skipped';

export interface TaskResult {
  id: string;
  project: string;
  task: string;
  status: TaskStatus;
  /** null for skipped tasks, and for scripts killed by a signal or that could not start. */
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  durationMs: number;
  /** Why a task failed without an exit code, or why it was skipped. */
  note: string | null;
}

export interface RunSummary {
  results: TaskResult[];
  durationMs: number;
  passed: number;
  failed: number;
  skipped: number;
}

/** Called as the run goes, so output can be shown while scripts are still running. */
export interface RunEvents {
  taskStart(node: TaskNode): void;
  taskOutput(node: TaskNode, stream: OutputStream, line: string): void;
  taskEnd(node: TaskNode, result: TaskResult): void;
}

export interface RunOptions {
  /** Keep running tasks that do not depend on a failed task. By default the run stops at the first failure. */
  continueOnFailure: boolean;
  env: NodeJS.ProcessEnv;
}

export async function runTasks(graph: TaskGraph, workspace: Workspace, events: RunEvents, options: RunOptions): Promise<RunSummary> {
  const started = performance.now();
  const results: TaskResult[] = [];
  const statusById = new Map<string, TaskStatus>();
  let stopped = false;

  for (const id of graph.order) {
    const node = graph.nodes.get(id);
    const project = node && workspace.byName.get(node.project);
    if (!node || !project) throw new Error(`runTasks: unknown task ${id}`);

    const blocker = node.dependsOn.find((dependency) => statusById.get(dependency) !== 'passed');
    let result: TaskResult;
    if (blocker !== undefined || stopped) {
      const note =
        blocker !== undefined
          ? `${blocker} ${statusById.get(blocker) === 'failed' ? 'failed' : 'did not run'}`
          : 'stopped after an earlier failure';
      result = { ...base(node), status: 'skipped', exitCode: null, signal: null, durationMs: 0, note };
    } else {
      events.taskStart(node);
      const outcome = await runScript({
        command: node.command,
        cwd: project.path,
        env: scriptEnv(options.env, workspace, project, node.task),
        onLine: (stream, line) => events.taskOutput(node, stream, line),
      });
      const passed = outcome.exitCode === 0 && outcome.spawnError === null;
      result = {
        ...base(node),
        status: passed ? 'passed' : 'failed',
        exitCode: outcome.exitCode,
        signal: outcome.signal,
        durationMs: outcome.durationMs,
        note: outcome.spawnError ?? (outcome.signal ? `killed by ${outcome.signal}` : null),
      };
      if (!passed && !options.continueOnFailure) stopped = true;
    }

    statusById.set(id, result.status);
    results.push(result);
    events.taskEnd(node, result);
  }

  const count = (status: TaskStatus): number => results.filter((result) => result.status === status).length;
  return {
    results,
    durationMs: performance.now() - started,
    passed: count('passed'),
    failed: count('failed'),
    skipped: count('skipped'),
  };
}

function base(node: TaskNode): Pick<TaskResult, 'id' | 'project' | 'task'> {
  return { id: node.id, project: node.project, task: node.task };
}

