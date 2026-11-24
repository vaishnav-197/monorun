import { describe, expect, it } from 'vitest';
import { findAffected } from '../src/affected/affected.js';
import { affectedSummary, formatAffectedJson, formatAffectedText } from '../src/report/affected-output.js';
import { formatGraphJson, formatGraphText } from '../src/report/graph-output.js';
import { createRunReporter, formatPlan, formatSummary } from '../src/report/run-output.js';
import type { RunSummary, TaskResult } from '../src/run/runner.js';
import { buildTaskGraph } from '../src/tasks/task-graph.js';
import { shopContext } from './helpers.js';

const { graph, config, workspace } = shopContext();

describe('formatPlan', () => {
  it('lists the tasks in order with why each one runs', () => {
    expect(formatPlan(buildTaskGraph(graph, config, 'test', ['@shop/api', '@shop/theme']))).toBe(
      [
        'Plan: 3 tasks for "test"',
        '  1.  @shop/utils#build  dependency  node ../../tools/build.mjs',
        '  2.  @shop/api#build    dependency  node ../../tools/build.mjs',
        '  3.  @shop/api#test     requested   node ../../tools/test.mjs',
        '',
        'skipped @shop/theme: no "test" script',
        '',
      ].join('\n'),
    );
  });
});

describe('formatSummary', () => {
  const tasks = buildTaskGraph(graph, config, 'build', ['@shop/api']);
  const result = (id: string, status: TaskResult['status'], durationMs: number, extra: Partial<TaskResult> = {}): TaskResult => ({
    id,
    project: id.split('#')[0] ?? '',
    task: 'build',
    status,
    exitCode: status === 'passed' ? 0 : null,
    signal: null,
    durationMs,
    note: null,
    ...extra,
  });

  it('prints one row per task and the totals', () => {
    const summary: RunSummary = {
      results: [
        result('@shop/utils#build', 'failed', 312, { exitCode: 2 }),
        result('@shop/api#build', 'skipped', 0, { note: '@shop/utils#build failed' }),
      ],
      durationMs: 1250,
      passed: 0,
      failed: 1,
      skipped: 1,
    };
    expect(formatSummary(summary, tasks, false)).toBe(
      [
        '',
        'Summary',
        '  @shop/utils#build  failed   312ms  exit code 2',
        '  @shop/api#build    skipped         @shop/utils#build failed',
        '',
        '0 passed, 1 failed, 1 skipped in 1.3s',
        '',
      ].join('\n'),
    );
  });

  it('colours failed rows red and the total green when everything passed', () => {
    const passed: RunSummary = {
      results: [result('@shop/utils#build', 'passed', 40), result('@shop/api#build', 'passed', 41)],
      durationMs: 90,
      passed: 2,
      failed: 0,
      skipped: 0,
    };
    expect(formatSummary(passed, tasks, true)).toContain('\u001b[32m2 passed, 0 failed, 0 skipped in 90ms\u001b[39m');
  });
});

describe('createRunReporter', () => {
  it('prefixes every output line with the task id and sends stderr to stderr', () => {
    const out: string[] = [];
    const err: string[] = [];
    const reporter = createRunReporter({ write: (t) => out.push(t) }, { write: (t) => err.push(t) }, false);
    const node = buildTaskGraph(graph, config, 'build', ['@shop/utils']).nodes.get('@shop/utils#build');
    if (!node) throw new Error('fixture');

    reporter.taskStart(node);
    reporter.taskOutput(node, 'stdout', 'built @shop/utils (1 file)');
    reporter.taskOutput(node, 'stdout', '');
    reporter.taskOutput(node, 'stderr', 'warning: slow');
    reporter.taskEnd(node, { ...node, status: 'failed', exitCode: 1, signal: null, durationMs: 5, note: null });

    expect(out.join('')).toBe(
      [
        '@shop/utils#build $ node ../../tools/build.mjs',
        '@shop/utils#build | built @shop/utils (1 file)',
        '@shop/utils#build |',
        '@shop/utils#build failed (exit code 1)',
        '',
      ].join('\n'),
    );
    expect(err).toEqual(['@shop/utils#build | warning: slow\n']);
  });
});

describe('graph output', () => {
  it('prints a table of projects', () => {
    expect(formatGraphText(graph).split('\n').slice(2, 5)).toEqual([
      'Project       Directory        Scripts             Depends on',
      '@shop/admin   apps/admin       build               @shop/ui',
      '@shop/api     apps/api         build, start, test  @shop/utils',
    ]);
  });

  it('prints JSON with dependencies and dependents', () => {
    const json = JSON.parse(formatGraphJson(graph));
    expect(json.root).toBe(workspace.root);
    expect(json.projects.find((p: { name: string }) => p.name === '@shop/ui')).toEqual({
      name: '@shop/ui',
      version: '2.0.1',
      dir: 'packages/ui',
      scripts: ['build', 'test'],
      dependencies: ['@shop/theme'],
      dependents: ['@shop/admin', '@shop/web'],
    });
  });
});

describe('affected output', () => {
  const files = ['README.md', 'packages/theme/src/index.js'];
  const result = findAffected(graph, config, files);

  it('explains why each project is affected', () => {
    expect(formatAffectedText(result, graph, files)).toBe(
      [
        'Changed files (2)',
        '  README.md                    (not in a project)',
        '  packages/theme/src/index.js  @shop/theme',
        '',
        'Affected projects (4)',
        '  @shop/admin  depends on @shop/theme',
        '  @shop/theme  changed',
        '  @shop/ui     depends on @shop/theme',
        '  @shop/web    depends on @shop/theme',
        '',
      ].join('\n'),
    );
    expect(affectedSummary(result)).toBe('4 affected projects: @shop/admin, @shop/theme, @shop/ui and @shop/web');
  });

  it('prints JSON', () => {
    expect(JSON.parse(formatAffectedJson(result))).toEqual({
      changed: ['@shop/theme'],
      affected: ['@shop/admin', '@shop/theme', '@shop/ui', '@shop/web'],
      globalFiles: [],
      ignoredFiles: ['README.md'],
      filesByProject: { '@shop/theme': ['packages/theme/src/index.js'] },
    });
  });

  it('says when nothing is affected', () => {
    const none = findAffected(graph, config, ['README.md']);
    expect(formatAffectedText(none, graph, ['README.md']).endsWith('\nNo affected projects.\n')).toBe(true);
    expect(affectedSummary(none)).toBe('No affected projects.');
  });
});
