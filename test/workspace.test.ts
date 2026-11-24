import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { InputError } from '../src/errors.js';
import { findWorkspaceRoot } from '../src/workspace/find-root.js';
import { loadWorkspace } from '../src/workspace/load.js';
import { parseManifest } from '../src/workspace/manifest.js';
import { expandPatterns } from '../src/workspace/patterns.js';
import { fixturePath, writeWorkspace } from './helpers.js';

const SHOP = fixturePath('workspaces', 'shop');

describe('parseManifest', () => {
  it('reads name, version, scripts and every dependency field', () => {
    const manifest = parseManifest(
      {
        name: '@shop/ui',
        version: '2.0.1',
        scripts: { build: 'tsc' },
        dependencies: { '@shop/theme': '^1.2.0' },
        devDependencies: { vitest: '5.0.5' },
        peerDependencies: { react: '^18.3.0' },
      },
      'ui/package.json',
    );
    expect(manifest).toEqual({
      name: '@shop/ui',
      version: '2.0.1',
      workspaces: null,
      scripts: { build: 'tsc' },
      dependencies: {
        dependencies: { '@shop/theme': '^1.2.0' },
        devDependencies: { vitest: '5.0.5' },
        peerDependencies: { react: '^18.3.0' },
        optionalDependencies: {},
      },
    });
  });

  it('accepts npm and Yarn 1 forms of "workspaces"', () => {
    expect(parseManifest({ workspaces: ['packages/*'] }, 'package.json').workspaces).toEqual(['packages/*']);
    expect(parseManifest({ workspaces: { packages: ['apps/*'], nohoist: ['**/react'] } }, 'package.json').workspaces).toEqual([
      'apps/*',
    ]);
  });

  it.each([
    [[], 'package.json: expected a JSON object'],
    [{ name: 5 }, 'package.json: name: expected a string'],
    [{ name: ' ' }, 'package.json: name: is empty'],
    [{ scripts: { build: ['tsc'] } }, 'package.json: scripts.build: expected a string'],
    [{ dependencies: [] }, 'package.json: dependencies: expected an object'],
    [{ workspaces: 'packages/*' }, 'package.json: workspaces: expected an array of directory patterns'],
    [{ workspaces: { packages: [1] } }, 'package.json: workspaces.packages: expected an array of directory patterns'],
  ])('rejects %j', (data, message) => {
    expect(() => parseManifest(data, 'package.json')).toThrow(new InputError(message));
  });
});

describe('findWorkspaceRoot', () => {
  it('returns the directory itself when it is the root', () => {
    expect(findWorkspaceRoot(SHOP)).toBe(SHOP);
  });

  it('walks up past project package.json files', () => {
    expect(findWorkspaceRoot(join(SHOP, 'packages', 'ui', 'src'))).toBe(SHOP);
  });

  it('fails when no package.json above has "workspaces"', () => {
    const root = writeWorkspace({ 'package.json': { name: 'single' }, 'src/index.js': '' });
    expect(() => findWorkspaceRoot(join(root, 'src'))).toThrow(/no package\.json with a "workspaces" field in ".*src" or any directory above it/);
  });

  it('fails for a directory that does not exist', () => {
    expect(() => findWorkspaceRoot('/no/such/dir')).toThrow('directory "/no/such/dir" does not exist');
  });
});

describe('expandPatterns', () => {
  const root = writeWorkspace({
    'package.json': { workspaces: [] },
    'packages/a/package.json': { name: 'a' },
    'packages/b/package.json': { name: 'b' },
    'packages/legacy/package.json': { name: 'legacy' },
    'packages/notes/README.md': 'no package.json here',
    'packages/a/node_modules/dep/package.json': { name: 'dep' },
    'packages/.cache/package.json': { name: 'cache' },
    'apps/web/package.json': { name: 'web' },
    'apps/mobile/ios/package.json': { name: 'ios' },
    'tools/cli/package.json': { name: 'cli' },
  });

  it('matches one level with "*" and needs a package.json', () => {
    expect(expandPatterns(root, ['packages/*'])).toEqual(['packages/a', 'packages/b', 'packages/legacy']);
  });

  it('matches any depth with "**", skipping node_modules and hidden directories', () => {
    expect(expandPatterns(root, ['packages/**', 'apps/**'])).toEqual([
      'apps/mobile/ios',
      'apps/web',
      'packages/a',
      'packages/b',
      'packages/legacy',
    ]);
  });

  it('takes exact paths, "./" prefixes and trailing slashes', () => {
    expect(expandPatterns(root, ['./tools/cli/', 'apps/web'])).toEqual(['apps/web', 'tools/cli']);
  });

  it('excludes directories with "!" patterns', () => {
    expect(expandPatterns(root, ['packages/*', '!packages/legacy'])).toEqual(['packages/a', 'packages/b']);
  });

  it.each(['../outside/*', '/abs/*', ''])('rejects the pattern %j', (pattern) => {
    expect(() => expandPatterns(root, [pattern])).toThrow(/must be a path inside the workspace/);
  });
});

describe('loadWorkspace', () => {
  it('loads every project, sorted by name', () => {
    const workspace = loadWorkspace(SHOP);
    expect(workspace.patterns).toEqual(['packages/*', 'apps/*']);
    expect(workspace.projects.map((p) => `${p.name} ${p.dir}`)).toEqual([
      '@shop/admin apps/admin',
      '@shop/api apps/api',
      '@shop/theme packages/theme',
      '@shop/tokens packages/tokens',
      '@shop/ui packages/ui',
      '@shop/utils packages/utils',
      '@shop/web apps/web',
    ]);
    expect(workspace.byName.get('@shop/ui')?.path).toBe(join(SHOP, 'packages', 'ui'));
  });

  it('requires a name in every project', () => {
    const root = writeWorkspace({ 'package.json': { workspaces: ['packages/*'] }, 'packages/a/package.json': { version: '1.0.0' } });
    expect(() => loadWorkspace(root)).toThrow(`${join(root, 'packages/a/package.json')} has no "name". Every workspace project needs one.`);
  });

  it('rejects two projects with the same name', () => {
    const root = writeWorkspace({
      'package.json': { workspaces: ['packages/*', 'apps/*'] },
      'packages/ui/package.json': { name: '@shop/ui' },
      'apps/ui/package.json': { name: '@shop/ui' },
    });
    expect(() => loadWorkspace(root)).toThrow('"apps/ui" and "packages/ui" are both named "@shop/ui"');
  });

  it('fails when the patterns match nothing', () => {
    const root = writeWorkspace({ 'package.json': { workspaces: ['packages/*'] }, 'apps/web/package.json': { name: 'web' } });
    expect(() => loadWorkspace(root)).toThrow(/patterns in .*package\.json \(packages\/\*\) match no directory with a package\.json/);
  });
});
