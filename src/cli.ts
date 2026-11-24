#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { findAffected } from './affected/affected.js';
import { readChangedFiles } from './affected/changed-files.js';
import { shouldUseColor } from './color.js';
import { type Context, loadContext } from './context.js';
import { InputError, UsageError } from './errors.js';
import { affectedSummary, formatAffectedJson, formatAffectedText } from './report/affected-output.js';
import { formatGraphJson, formatGraphText } from './report/graph-output.js';
import { createRunReporter, formatPlan, formatSummary } from './report/run-output.js';
import { runTasks } from './run/runner.js';
import { selectProjects } from './select.js';
import { buildTaskGraph } from './tasks/task-graph.js';

const HELP = `Usage: monorun run <task> [options]
       monorun affected --changed <path>... [options]
       monorun graph [options]

Runs package scripts across an npm workspaces monorepo, in dependency order.

Commands:
  run <task>               run the script <task> in every selected project, after the
                           tasks it depends on (see "dependsOn" in monorun.json)
  affected                 list the projects affected by a set of changed files
  graph                    list the workspace projects and their dependencies

Options:
  -p, --projects <list>    comma-separated project names or patterns, e.g. "@shop/*"
                           (default: every project)
      --changed <path>     a changed file, relative to the workspace root; repeatable.
                           With run, only the affected projects are selected
      --changed-file <path>
                           a file with one changed path per line, such as the output of
                           "git diff --name-only main"
      --continue           keep running tasks that do not depend on a failed task
      --dry-run            print the plan without running anything (run only)
      --json               print JSON (affected and graph only)
      --cwd <dir>          look for the workspace from this directory (default: current)
  -h, --help               show this help
  -v, --version            show the version number

Exit codes:
  0  every task passed, or nothing needed to run
  1  a task failed
  2  usage, workspace or config error
`;

const OPTIONS = {
  projects: { type: 'string', short: 'p' },
  changed: { type: 'string', multiple: true },
  'changed-file': { type: 'string' },
  continue: { type: 'boolean' },
  'dry-run': { type: 'boolean' },
  json: { type: 'boolean' },
  cwd: { type: 'string' },
  help: { type: 'boolean', short: 'h' },
  version: { type: 'boolean', short: 'v' },
} as const;

type Values = ReturnType<typeof parseCommandLine>['values'];

function parseCommandLine(args: string[]) {
  try {
    return parseArgs({ args, options: OPTIONS, allowPositionals: true, strict: true });
  } catch (error) {
    throw new UsageError(error instanceof Error ? error.message : String(error));
  }
}

function readVersion(): string {
  const pkg: unknown = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  return typeof pkg === 'object' && pkg !== null && 'version' in pkg ? String(pkg.version) : 'unknown';
}

function hasChangedOption(values: Values): boolean {
  return values.changed !== undefined || values['changed-file'] !== undefined;
}

function affectedFor(context: Context, values: Values) {
  const files = readChangedFiles({ changed: values.changed ?? [], changedFile: values['changed-file'] }, context.workspace.root);
  return { files, result: findAffected(context.graph, context.config, files) };
}

function rejectOptions(values: Values, command: string, names: (keyof Values)[]): void {
  for (const name of names) {
    if (values[name] !== undefined) throw new UsageError(`--${String(name)} cannot be used with ${command}`);
  }
}

async function runCommand(task: string | undefined, extra: string[], values: Values): Promise<number> {
  if (task === undefined) throw new UsageError('missing <task>: which script to run, e.g. "monorun run build"');
  if (extra.length > 0) throw new UsageError(`unexpected argument "${extra[0]}"`);
  rejectOptions(values, 'run', ['json']);

  const context = loadContext(values.cwd ?? process.cwd());
  let selected = selectProjects(context.workspace, values.projects);

  if (hasChangedOption(values)) {
    const { result } = affectedFor(context, values);
    const affected = new Set(result.affected);
    selected = selected.filter((name) => affected.has(name));
    process.stdout.write(`${affectedSummary(result)}\n`);
    if (selected.length === 0) return 0;
  }

  const graph = buildTaskGraph(context.graph, context.config, task, selected);
  if (graph.order.length === 0) {
    if (hasChangedOption(values)) {
      process.stdout.write(`None of the affected projects has a "${task}" script.\n`);
      return 0;
    }
    throw new InputError(
      selected.length === 1 ? `${selected[0]} has no "${task}" script` : `none of the selected projects has a "${task}" script`,
    );
  }

  if (values['dry-run']) {
    process.stdout.write(formatPlan(graph));
    return 0;
  }

  const color = shouldUseColor(process.stdout.isTTY, process.env);
  const summary = await runTasks(graph, context.workspace, createRunReporter(process.stdout, process.stderr, color), {
    continueOnFailure: values.continue === true,
    env: process.env,
  });
  process.stdout.write(formatSummary(summary, graph, color));
  return summary.failed > 0 ? 1 : 0;
}

function affectedCommand(extra: string[], values: Values): number {
  if (extra.length > 0) throw new UsageError(`unexpected argument "${extra[0]}"`);
  rejectOptions(values, 'affected', ['continue', 'dry-run']);
  if (!hasChangedOption(values)) throw new UsageError('affected needs --changed or --changed-file');

  const context = loadContext(values.cwd ?? process.cwd());
  const { files, result } = affectedFor(context, values);
  if (values.projects !== undefined) {
    const selected = new Set(selectProjects(context.workspace, values.projects));
    result.affected = result.affected.filter((name) => selected.has(name));
  }
  process.stdout.write(values.json ? formatAffectedJson(result) : formatAffectedText(result, context.graph, files));
  return 0;
}

function graphCommand(extra: string[], values: Values): number {
  if (extra.length > 0) throw new UsageError(`unexpected argument "${extra[0]}"`);
  rejectOptions(values, 'graph', ['projects', 'changed', 'changed-file', 'continue', 'dry-run']);
  const context = loadContext(values.cwd ?? process.cwd());
  process.stdout.write(values.json ? formatGraphJson(context.graph) : formatGraphText(context.graph));
  return 0;
}

async function main(args: string[]): Promise<number> {
  const { values, positionals } = parseCommandLine(args);
  if (values.help) {
    process.stdout.write(HELP);
    return 0;
  }
  if (values.version) {
    process.stdout.write(`${readVersion()}\n`);
    return 0;
  }

  const [command, ...rest] = positionals;
  switch (command) {
    case 'run':
      return runCommand(rest[0], rest.slice(1), values);
    case 'affected':
      return affectedCommand(rest, values);
    case 'graph':
      return graphCommand(rest, values);
    case undefined:
      throw new UsageError('missing command');
    default:
      throw new UsageError(`unknown command "${command}"`);
  }
}

try {
  process.exitCode = await main(process.argv.slice(2));
} catch (error) {
  if (error instanceof UsageError) {
    process.stderr.write(`monorun: ${error.message}\nRun "monorun --help" for usage.\n`);
  } else if (error instanceof InputError) {
    process.stderr.write(`monorun: ${error.message}\n`);
  } else {
    process.stderr.write(`monorun: unexpected error\n${error instanceof Error ? error.stack : String(error)}\n`);
  }
  process.exitCode = 2;
}
