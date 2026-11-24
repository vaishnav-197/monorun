import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseConfig } from '../src/config.js';
import { loadContext } from '../src/context.js';
import { type RunEvents, runTasks } from '../src/run/runner.js';
import { buildTaskGraph } from '../src/tasks/task-graph.js';
import { copyWorkspace, writeWorkspace } from './helpers.js';

interface Recorded {
  started: string[];
  lines: string[];
  ended: string[];
}

function recorder(): { events: RunEvents; recorded: Recorded } {
  const recorded: Recorded = { started: [], lines: [], ended: [] };
  return {
    recorded,
    events: {
      taskStart: (node) => recorded.started.push(node.id),
      taskOutput: (node, stream, line) => recorded.lines.push(`${node.id} ${stream}: ${line}`),
      taskEnd: (node, result) => recorded.ended.push(`${node.id} ${result.status}`),
    },
  };
}

async function run(root: string, task: string, projects?: string[], continueOnFailure = false) {
  const context = loadContext(root);
  const selected = projects ?? context.workspace.projects.map((project) => project.name);
  const graph = buildTaskGraph(context.graph, context.config, task, selected);
  const { events, recorded } = recorder();
  const summary = await runTasks(graph, context.workspace, events, { continueOnFailure, env: process.env });
  return { summary, recorded };
}

describe('runTasks', () => {
  it('runs every task in graph order, in its project directory', async () => {
    const root = copyWorkspace('shop');
    const { summary, recorded } = await run(root, 'build');

    expect(recorded.started).toEqual([
      '@shop/tokens#build',
      '@shop/ui#build',
      '@shop/admin#build',
      '@shop/utils#build',
      '@shop/api#build',
      '@shop/web#build',
    ]);
    expect(recorded.lines).toContain('@shop/ui#build stdout: built @shop/ui (2 files)');
    expect(summary).toMatchObject({ passed: 6, failed: 0, skipped: 0 });
    expect(JSON.parse(readFileSync(join(root, 'packages/ui/dist/build-info.json'), 'utf8'))).toEqual({
      name: '@shop/ui',
      version: '2.0.1',
      files: ['button.js', 'index.js'],
    });
  });

  it('builds before testing, so the tests find the output', async () => {
    const root = copyWorkspace('shop');
    const { summary, recorded } = await run(root, 'test', ['@shop/api']);
    expect(recorded.ended).toEqual(['@shop/utils#build passed', '@shop/api#build passed', '@shop/api#test passed']);
    expect(summary.failed).toBe(0);
  });

  it('stops at the first failure and skips everything after it', async () => {
    const root = copyWorkspace('shop');
    writeFileSync(join(root, 'packages/ui/src/button.js'), 'export function Button( {\n');
    const { summary, recorded } = await run(root, 'build');

    expect(recorded.ended).toEqual([
      '@shop/tokens#build passed',
      '@shop/ui#build failed',
      '@shop/admin#build skipped',
      '@shop/utils#build skipped',
      '@shop/api#build skipped',
      '@shop/web#build skipped',
    ]);
    expect(recorded.lines).toContain('@shop/ui#build stderr: build failed: src/button.js does not parse');
    const notes = Object.fromEntries(summary.results.map((result) => [result.id, result.note]));
    expect(notes['@shop/admin#build']).toBe('@shop/ui#build failed');
    expect(notes['@shop/utils#build']).toBe('stopped after an earlier failure');
    expect(summary.results.find((result) => result.id === '@shop/ui#build')?.exitCode).toBe(1);
    expect(existsSync(join(root, 'packages/utils/dist'))).toBe(false);
  });

  it('with continueOnFailure, still runs tasks that do not depend on the failure', async () => {
    const root = copyWorkspace('shop');
    writeFileSync(join(root, 'packages/ui/src/button.js'), 'export function Button( {\n');
    const { summary, recorded } = await run(root, 'build', undefined, true);

    expect(recorded.ended).toEqual([
      '@shop/tokens#build passed',
      '@shop/ui#build failed',
      '@shop/admin#build skipped',
      '@shop/utils#build passed',
      '@shop/api#build passed',
      '@shop/web#build skipped',
    ]);
    expect(summary).toMatchObject({ passed: 3, failed: 1, skipped: 2 });
    expect(summary.results.find((result) => result.id === '@shop/web#build')?.note).toBe('@shop/ui#build failed');
  });

  it('says why a task was skipped when its dependency was skipped', async () => {
    const root = copyWorkspace('shop');
    writeFileSync(join(root, 'packages/tokens/src/index.js'), 'export const = 1;\n');
    const { summary } = await run(root, 'build', ['@shop/admin'], true);
    expect(summary.results.map((result) => `${result.id} ${result.status} ${result.note ?? ''}`.trim())).toEqual([
      '@shop/tokens#build failed',
      '@shop/ui#build skipped @shop/tokens#build failed',
      '@shop/admin#build skipped @shop/ui#build did not run',
    ]);
  });

  it('passes the monorun variables and runs scripts with sh', async () => {
    const root = writeWorkspace({
      'package.json': { workspaces: ['packages/*'] },
      'packages/a/package.json': {
        name: 'a',
        scripts: { env: 'echo "$MONORUN_PROJECT $MONORUN_TASK $(basename "$PWD")" && echo to-stderr >&2' },
      },
    });
    const { recorded } = await run(root, 'env');
    expect(recorded.lines).toEqual(['a#env stdout: a env a', 'a#env stderr: to-stderr']);
  });

  it('reports a command that is not found and a script killed by a signal', async () => {
    const root = writeWorkspace({
      'package.json': { workspaces: ['packages/*'] },
      'packages/a/package.json': { name: 'a', scripts: { go: 'no-such-command-monorun' } },
      'packages/b/package.json': { name: 'b', scripts: { go: 'kill -TERM $$' } },
    });
    const context = loadContext(root);
    const graph = buildTaskGraph(context.graph, parseConfig({}), 'go', ['a', 'b']);
    const summary = await runTasks(graph, context.workspace, recorder().events, { continueOnFailure: true, env: process.env });
    const [a, b] = summary.results;
    expect(a).toMatchObject({ status: 'failed', exitCode: 127, signal: null });
    expect(b).toMatchObject({ status: 'failed', exitCode: null, signal: 'SIGTERM', note: 'killed by SIGTERM' });
  });
});
