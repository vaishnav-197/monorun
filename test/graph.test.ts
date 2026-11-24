import { describe, expect, it } from 'vitest';
import { findCycle } from '../src/graph/cycles.js';
import { buildProjectGraph, transitiveDependencies, transitiveDependents } from '../src/graph/project-graph.js';
import { topologicalOrder } from '../src/graph/topo.js';
import { loadWorkspace } from '../src/workspace/load.js';
import { fixturePath, shopContext, writeWorkspace } from './helpers.js';

describe('buildProjectGraph', () => {
  const { graph } = shopContext();

  it('links projects through any dependency field, whatever the version spec', () => {
    expect(Object.fromEntries(graph.dependencies)).toEqual({
      '@shop/admin': ['@shop/ui'],
      '@shop/api': ['@shop/utils'],
      '@shop/theme': ['@shop/tokens'],
      '@shop/tokens': [],
      '@shop/ui': ['@shop/theme'],
      '@shop/utils': [],
      '@shop/web': ['@shop/ui', '@shop/utils'],
    });
  });

  it('ignores packages from outside the workspace', () => {
    expect(graph.dependencies.get('@shop/web')).not.toContain('react');
  });

  it('lists dependents', () => {
    expect(graph.dependents.get('@shop/ui')).toEqual(['@shop/admin', '@shop/web']);
    expect(graph.dependents.get('@shop/web')).toEqual([]);
  });

  it('rejects a cycle and names it', () => {
    expect(() => buildProjectGraph(loadWorkspace(fixturePath('workspaces', 'cycle')))).toThrow(
      'the workspace projects depend on each other in a cycle: @cycle/a -> @cycle/b -> @cycle/a',
    );
  });

  it('ignores a project that lists itself', () => {
    const root = writeWorkspace({
      'package.json': { workspaces: ['packages/*'] },
      'packages/a/package.json': { name: 'a', devDependencies: { a: '*' } },
    });
    expect(buildProjectGraph(loadWorkspace(root)).dependencies.get('a')).toEqual([]);
  });
});

describe('transitive helpers', () => {
  const { graph } = shopContext();

  it('finds everything that depends on a project', () => {
    expect(transitiveDependents(graph, ['@shop/tokens'])).toEqual(['@shop/admin', '@shop/theme', '@shop/ui', '@shop/web']);
    expect(transitiveDependents(graph, ['@shop/web'])).toEqual([]);
  });

  it('finds everything a project depends on', () => {
    expect(transitiveDependencies(graph, ['@shop/web'])).toEqual(['@shop/theme', '@shop/tokens', '@shop/ui', '@shop/utils']);
  });
});

describe('topologicalOrder', () => {
  const deps: Record<string, string[]> = { app: ['lib', 'util'], lib: ['util'], util: [], other: [] };

  it('puts dependencies first and breaks ties by name', () => {
    expect(topologicalOrder(Object.keys(deps), (n) => deps[n] ?? [])).toEqual(['other', 'util', 'lib', 'app']);
  });

  it('gives the same order whatever order the nodes come in', () => {
    expect(topologicalOrder(['app', 'other', 'lib', 'util'], (n) => deps[n] ?? [])).toEqual(['other', 'util', 'lib', 'app']);
  });

  it('throws on a cycle', () => {
    expect(() => topologicalOrder(['a', 'b'], (n) => (n === 'a' ? ['b'] : ['a']))).toThrow('the graph has a cycle');
  });
});

describe('findCycle', () => {
  it('returns null without a cycle', () => {
    expect(findCycle(['a', 'b'], (n) => (n === 'a' ? ['b'] : []))).toBeNull();
  });

  it('returns the cycle as a closed path', () => {
    const deps: Record<string, string[]> = { a: ['b'], b: ['c'], c: ['b'], d: [] };
    expect(findCycle(Object.keys(deps), (n) => deps[n] ?? [])).toEqual(['b', 'c', 'b']);
  });
});
