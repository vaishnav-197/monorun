// monorun.json, next to the root package.json. It is optional.
//
//   {
//     "tasks": {
//       "build": { "dependsOn": ["^build"] },
//       "test": { "dependsOn": ["build"] }
//     },
//     "globalFiles": ["package.json", "package-lock.json", "monorun.json", "tsconfig.base.json"]
//   }
//
// "^build" means: run "build" in the projects this project depends on first. "build" without the
// caret means: run this project's own "build" first. A task that is not listed has no
// dependencies. globalFiles are root files whose change affects every project.

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { InputError } from './errors.js';
import { readJsonFile } from './read-json.js';

export const CONFIG_FILE = 'monorun.json';

export const DEFAULT_GLOBAL_FILES: readonly string[] = ['package.json', 'package-lock.json', CONFIG_FILE];

export interface TaskConfig {
  /** "^task" for the same task in dependency projects, "task" for another task of the same project. */
  dependsOn: readonly string[];
}

export interface Config {
  tasks: Readonly<Record<string, TaskConfig>>;
  /** Patterns, relative to the workspace root, for files whose change affects every project. */
  globalFiles: readonly string[];
}

export interface TaskDependency {
  task: string;
  /** true for "^task": the task in the projects this project depends on. */
  upstream: boolean;
}

export function defaultConfig(): Config {
  return { tasks: {}, globalFiles: DEFAULT_GLOBAL_FILES };
}

/** Reads monorun.json from the workspace root, or returns the defaults when there is none. */
export function loadConfig(root: string): Config {
  const file = join(root, CONFIG_FILE);
  if (!existsSync(file)) return defaultConfig();
  const data = readJsonFile(file, CONFIG_FILE);
  try {
    return parseConfig(data);
  } catch (error) {
    if (error instanceof InputError) throw new InputError(`invalid ${file}: ${error.message}`);
    throw error;
  }
}

export function parseConfig(data: unknown): Config {
  if (!isRecord(data)) fail('', 'expected a JSON object');
  const json = data as Record<string, unknown>;
  rejectUnknown(json, ['tasks', 'globalFiles'], '');

  const tasks: Record<string, TaskConfig> = {};
  if (json.tasks !== undefined) {
    if (!isRecord(json.tasks)) fail('tasks', 'expected an object of task names');
    for (const [name, raw] of Object.entries(json.tasks as Record<string, unknown>)) {
      tasks[name] = parseTask(name, raw);
    }
  }

  let globalFiles = DEFAULT_GLOBAL_FILES;
  if (json.globalFiles !== undefined) {
    const value = json.globalFiles;
    if (!Array.isArray(value) || !value.every((entry) => typeof entry === 'string' && entry.trim() !== '')) {
      fail('globalFiles', 'expected an array of file patterns');
    }
    globalFiles = value as string[];
  }

  return { tasks, globalFiles };
}

function parseTask(name: string, raw: unknown): TaskConfig {
  const path = `tasks.${name}`;
  if (!isRecord(raw)) fail(path, 'expected an object');
  const task = raw as Record<string, unknown>;
  rejectUnknown(task, ['dependsOn'], path);

  const dependsOn = task.dependsOn ?? [];
  if (!Array.isArray(dependsOn) || !dependsOn.every((entry) => typeof entry === 'string')) {
    fail(`${path}.dependsOn`, 'expected an array of task names');
  }
  for (const entry of dependsOn as string[]) {
    const dependency = parseTaskDependency(entry);
    if (dependency === null) fail(`${path}.dependsOn`, `"${entry}" is not a task name (use "build" or "^build")`);
    if (!dependency.upstream && dependency.task === name) fail(`${path}.dependsOn`, `"${name}" cannot depend on itself`);
  }
  return { dependsOn: dependsOn as string[] };
}

export function parseTaskDependency(entry: string): TaskDependency | null {
  const upstream = entry.startsWith('^');
  const task = upstream ? entry.slice(1) : entry;
  if (task === '' || /[\s^]/.test(task)) return null;
  return { task, upstream };
}

export function taskConfig(config: Config, task: string): TaskConfig {
  return config.tasks[task] ?? { dependsOn: [] };
}

function rejectUnknown(object: Record<string, unknown>, allowed: readonly string[], path: string): void {
  for (const key of Object.keys(object)) {
    if (!allowed.includes(key)) fail(path ? `${path}.${key}` : key, `unknown field (allowed: ${allowed.join(', ')})`);
  }
}

function fail(path: string, problem: string): never {
  throw new InputError(path ? `${path}: ${problem}` : problem);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
