import { describe, expect, it } from 'vitest';
import { parseConfig } from '../src/config.js';
import { buildProjectGraph } from '../src/graph/project-graph.js';
import { buildTaskGraph, describeWithoutScript, type TaskGraph } from '../src/tasks/task-graph.js';
import { loadWorkspace } from '../src/workspace/load.js';
import { shopContext, writeWorkspace } from './helpers.js';

const { graph, config, workspace } = shopContext();
const all = workspace.projects.map((project) => project.name);

function edges(taskGraph: TaskGraph): Record<string, string[]> {
  return Object.fromEntries(taskGraph.order.map((id) => [id, [...(taskGraph.nodes.get(id)?.dependsOn ?? [])]]));
}

describe('buildTaskGraph', () => {
  it('orders builds by "^build" and looks through projects without a build script', () => {
    const tasks = buildTaskGraph(graph, config, 'build', all);
    expect(edges(tasks)).toEqual({
      '@shop/tokens#build': [],
      // @shop/ui depends on @shop/theme, which has nothing to build, so it waits for @shop/tokens.
      '@shop/ui#build': ['@shop/tokens#build'],
      '@shop/admin#build': ['@shop/ui#build'],
      '@shop/utils#build': [],
      '@shop/api#build': ['@shop/utils#build'],
      '@shop/web#build': ['@shop/ui#build', '@shop/utils#build'],
    });
    expect(tasks.withoutScript).toEqual(['@shop/theme']);
    expect(describeWithoutScript(tasks)).toBe('skipped @shop/theme: no "build" script');
  });

  it('adds same-project dependencies, and the tasks those need', () => {
    const tasks = buildTaskGraph(graph, config, 'test', ['@shop/web']);
    expect(edges(tasks)).toEqual({
      '@shop/tokens#build': [],
      '@shop/ui#build': ['@shop/tokens#build'],
      '@shop/utils#build': [],
      '@shop/web#build': ['@shop/ui#build', '@shop/utils#build'],
      '@shop/web#test': ['@shop/web#build'],
    });
    expect(tasks.nodes.get('@shop/web#test')?.reason).toBe('requested');
    expect(tasks.nodes.get('@shop/ui#build')?.reason).toBe('dependency');
  });

  it('marks a task as requested when it is both asked for and needed', () => {
    const tasks = buildTaskGraph(graph, config, 'build', ['@shop/web', '@shop/ui']);
    expect(tasks.nodes.get('@shop/ui#build')?.reason).toBe('requested');
    expect(tasks.nodes.get('@shop/tokens#build')?.reason).toBe('dependency');
  });

  it('keeps the script and project of each task', () => {
    const node = buildTaskGraph(graph, config, 'build', ['@shop/utils']).nodes.get('@shop/utils#build');
    expect(node).toEqual({
      id: '@shop/utils#build',
      project: '@shop/utils',
      task: 'build',
      command: 'node ../../tools/build.mjs',
      dependsOn: [],
      reason: 'requested',
    });
  });

  it('returns an empty graph when no selected project has the script', () => {
    const tasks = buildTaskGraph(graph, config, 'deploy', all);
    expect(tasks.order).toEqual([]);
    expect(tasks.withoutScript).toEqual(all);
  });

  it('gives tasks that are not in monorun.json no dependencies', () => {
    const tasks = buildTaskGraph(graph, parseConfig({}), 'build', all);
    expect(Object.values(edges(tasks)).every((list) => list.length === 0)).toBe(true);
  });

  it('skips a same-project dependency the project does not have', () => {
    const tasks = buildTaskGraph(graph, parseConfig({ tasks: { start: { dependsOn: ['lint'] } } }), 'start', ['@shop/api']);
    expect(edges(tasks)).toEqual({ '@shop/api#start': [] });
  });

  it('rejects a cycle between tasks', () => {
    const root = writeWorkspace({
      'package.json': { workspaces: ['packages/*'] },
      'packages/a/package.json': { name: 'a', scripts: { build: 'true', test: 'true' } },
    });
    const cyclic = parseConfig({ tasks: { build: { dependsOn: ['test'] }, test: { dependsOn: ['build'] } } });
    expect(() => buildTaskGraph(buildProjectGraph(loadWorkspace(root)), cyclic, 'build', ['a'])).toThrow(
      'the dependsOn settings in monorun.json form a cycle: a#build -> a#test -> a#build',
    );
  });
});
