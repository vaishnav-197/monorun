import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { findAffected, ownerOf } from '../src/affected/affected.js';
import { readChangedFiles } from '../src/affected/changed-files.js';
import { defaultConfig } from '../src/config.js';
import { buildProjectGraph } from '../src/graph/project-graph.js';
import { loadWorkspace } from '../src/workspace/load.js';
import { shopContext, writeWorkspace } from './helpers.js';

const { graph, config, workspace } = shopContext();

describe('readChangedFiles', () => {
  it('normalises paths relative to the workspace root', () => {
    const files = readChangedFiles(
      { changed: ['./packages/ui/src/button.js', 'apps\\web\\src\\index.js', join(workspace.root, 'README.md'), 'apps/api/../api/src/index.js'] },
      workspace.root,
    );
    expect(files).toEqual(['README.md', 'apps/api/src/index.js', 'apps/web/src/index.js', 'packages/ui/src/button.js']);
  });

  it('reads one path per line from --changed-file and drops blank lines and repeats', () => {
    const dir = writeWorkspace({ 'changed.txt': 'packages/ui/src/button.js\r\n\n  apps/web/src/index.js  \npackages/ui/src/button.js\n' });
    const files = readChangedFiles({ changed: [], changedFile: join(dir, 'changed.txt') }, workspace.root);
    expect(files).toEqual(['apps/web/src/index.js', 'packages/ui/src/button.js']);
  });

  it.each([['../outside.js'], ['/etc/passwd'], ['.']])('rejects %j', (path) => {
    expect(() => readChangedFiles({ changed: [path] }, workspace.root)).toThrow(/outside the workspace|is the workspace root/);
  });

  it('reports a missing list file', () => {
    expect(() => readChangedFiles({ changed: [], changedFile: '/no/such/list.txt' }, workspace.root)).toThrow(
      'cannot read changed-file list "/no/such/list.txt": file not found',
    );
  });
});

describe('ownerOf', () => {
  it('finds the project that holds the file', () => {
    expect(ownerOf('packages/ui/src/button.js', workspace, config)).toEqual({ kind: 'project', project: '@shop/ui' });
    expect(ownerOf('packages/ui', workspace, config)).toEqual({ kind: 'project', project: '@shop/ui' });
  });

  it('does not mistake a sibling with a longer name for the project', () => {
    expect(ownerOf('packages/ui-kit/index.js', workspace, config)).toEqual({ kind: 'none' });
  });

  it('marks root files from globalFiles as global and others as nobody', () => {
    expect(ownerOf('tsconfig.base.json', workspace, config)).toEqual({ kind: 'global' });
    expect(ownerOf('README.md', workspace, config)).toEqual({ kind: 'none' });
  });

  it('gives a file in a nested project to the deepest project', () => {
    const root = writeWorkspace({
      'package.json': { workspaces: ['packages/**'] },
      'packages/ui/package.json': { name: 'ui' },
      'packages/ui/icons/package.json': { name: 'icons' },
    });
    const nested = loadWorkspace(root);
    expect(ownerOf('packages/ui/icons/star.svg', nested, defaultConfig())).toEqual({ kind: 'project', project: 'icons' });
    expect(ownerOf('packages/ui/button.js', nested, defaultConfig())).toEqual({ kind: 'project', project: 'ui' });
  });
});

describe('findAffected', () => {
  it('adds every project that depends on a changed one', () => {
    const result = findAffected(graph, config, ['packages/tokens/src/index.js', 'README.md']);
    expect(result.changed).toEqual(['@shop/tokens']);
    expect(result.affected).toEqual(['@shop/admin', '@shop/theme', '@shop/tokens', '@shop/ui', '@shop/web']);
    expect(result.ignoredFiles).toEqual(['README.md']);
    expect(Object.fromEntries(result.filesByProject)).toEqual({ '@shop/tokens': ['packages/tokens/src/index.js'] });
  });

  it('affects every project when a global file changes', () => {
    const result = findAffected(graph, config, ['package-lock.json']);
    expect(result.globalFiles).toEqual(['package-lock.json']);
    expect(result.affected).toEqual(workspace.projects.map((project) => project.name));
  });

  it('affects nothing when only unrelated files change', () => {
    expect(findAffected(graph, config, ['docs/setup.md']).affected).toEqual([]);
  });

  it('uses the globalFiles of the config', () => {
    const root = writeWorkspace({
      'package.json': { workspaces: ['packages/*'] },
      'packages/a/package.json': { name: 'a' },
    });
    const g = buildProjectGraph(loadWorkspace(root));
    expect(findAffected(g, { tasks: {}, globalFiles: ['.github/**'] }, ['.github/workflows/ci.yml']).affected).toEqual(['a']);
    expect(findAffected(g, { tasks: {}, globalFiles: ['.github/**'] }, ['package.json']).affected).toEqual([]);
  });
});
