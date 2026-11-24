import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { CLI, copyWorkspace, fixturePath, ROOT, runCli, tempDir } from './helpers.js';

const SHOP = fixturePath('workspaces', 'shop');

beforeAll(() => {
  if (!existsSync(CLI)) throw new Error('dist/cli.js not found. Run "npm run build" before the tests.');
});

describe('monorun run', () => {
  it('runs a task everywhere and exits with 0', () => {
    const root = copyWorkspace('shop');
    const result = runCli(['run', 'build'], root);
    expect(result.status).toBe(0);
    expect(result.stderr).toBe('');
    expect(result.stdout).toContain('@shop/web#build | built @shop/web (1 file)');
    expect(result.stdout).toMatch(/\n6 passed, 0 failed, 0 skipped in \d/);
    expect(existsSync(join(root, 'apps/web/dist/index.js'))).toBe(true);
  });

  it('exits with 1 when a task fails, and shows its stderr', () => {
    const root = copyWorkspace('shop');
    writeFileSync(join(root, 'packages/utils/src/index.js'), 'export const = 1;\n');
    const result = runCli(['run', 'build', '--projects', '@shop/api'], root);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('@shop/utils#build | build failed: src/index.js does not parse');
    expect(result.stdout).toMatch(/\n {2}@shop\/api#build +skipped +@shop\/utils#build failed\n/);
  });

  it('prints the plan with --dry-run and runs nothing', () => {
    const root = copyWorkspace('shop');
    const result = runCli(['run', 'build', '-p', '@shop/admin', '--dry-run'], root);
    expect(result).toEqual({
      status: 0,
      stderr: '',
      stdout: [
        'Plan: 3 tasks for "build"',
        '  1.  @shop/tokens#build  dependency  node ../../tools/build.mjs',
        '  2.  @shop/ui#build      dependency  node ../../tools/build.mjs',
        '  3.  @shop/admin#build   requested   node ../../tools/build.mjs',
        '',
      ].join('\n'),
    });
    expect(existsSync(join(root, 'packages/tokens/dist'))).toBe(false);
  });

  it('runs only the affected projects with --changed, plus the builds they need', () => {
    const result = runCli(['run', 'build', '--changed', 'apps/admin/src/index.js', '--dry-run'], SHOP);
    expect(result.status).toBe(0);
    expect(result.stdout.split('\n').slice(0, 5)).toEqual([
      '1 affected project: @shop/admin',
      'Plan: 3 tasks for "build"',
      '  1.  @shop/tokens#build  dependency  node ../../tools/build.mjs',
      '  2.  @shop/ui#build      dependency  node ../../tools/build.mjs',
      '  3.  @shop/admin#build   requested   node ../../tools/build.mjs',
    ]);
  });

  it('does nothing when no project is affected', () => {
    expect(runCli(['run', 'build', '--changed', 'README.md'], SHOP)).toEqual({ status: 0, stdout: 'No affected projects.\n', stderr: '' });
  });

  it('does nothing when no affected project has the script', () => {
    const result = runCli(['run', 'test', '--changed', 'apps/admin/src/index.js'], SHOP);
    expect(result).toEqual({
      status: 0,
      stdout: '1 affected project: @shop/admin\nNone of the affected projects has a "test" script.\n',
      stderr: '',
    });
  });

  it('works from a subdirectory and with --cwd', () => {
    const fromSubdir = runCli(['run', 'build', '--dry-run', '-p', '@shop/utils'], join(SHOP, 'apps', 'web', 'src'));
    const withCwd = runCli(['run', 'build', '--dry-run', '-p', '@shop/utils', '--cwd', SHOP], ROOT);
    expect(fromSubdir.stdout).toBe('Plan: 1 task for "build"\n  1.  @shop/utils#build  requested  node ../../tools/build.mjs\n');
    expect(withCwd.stdout).toBe(fromSubdir.stdout);
  });
});

describe('monorun affected', () => {
  it('reads --changed-file and prints JSON', () => {
    const list = join(tempDir(), 'changed.txt');
    writeFileSync(list, 'packages/utils/src/index.js\nREADME.md\n');
    const result = runCli(['affected', '--changed-file', list, '--json'], SHOP);
    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({
      changed: ['@shop/utils'],
      affected: ['@shop/api', '@shop/utils', '@shop/web'],
      ignoredFiles: ['README.md'],
    });
  });

  it('filters the affected list with --projects', () => {
    const result = runCli(['affected', '--changed', 'package.json', '-p', '@shop/a*', '--json'], SHOP);
    expect(JSON.parse(result.stdout).affected).toEqual(['@shop/admin', '@shop/api']);
  });
});

describe('monorun graph', () => {
  it('prints the projects as JSON', () => {
    const result = runCli(['graph', '--json'], SHOP);
    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout).projects).toHaveLength(7);
  });
});

describe('errors exit with 2', () => {
  it.each([
    [[], 'monorun: missing command\nRun "monorun --help" for usage.\n'],
    [['deploy'], 'monorun: unknown command "deploy"\nRun "monorun --help" for usage.\n'],
    [['run'], 'monorun: missing <task>: which script to run, e.g. "monorun run build"\nRun "monorun --help" for usage.\n'],
    [['run', 'build', 'extra'], 'monorun: unexpected argument "extra"\nRun "monorun --help" for usage.\n'],
    [['run', 'build', '--json'], 'monorun: --json cannot be used with run\nRun "monorun --help" for usage.\n'],
    [['affected'], 'monorun: affected needs --changed or --changed-file\nRun "monorun --help" for usage.\n'],
    [['graph', '--dry-run'], 'monorun: --dry-run cannot be used with graph\nRun "monorun --help" for usage.\n'],
    [['run', 'biuld'], 'monorun: none of the selected projects has a "biuld" script\n'],
    [['run', 'test', '-p', '@shop/admin'], 'monorun: @shop/admin has no "test" script\n'],
    [['run', 'build', '-p', '@shop/nope'], 'monorun: no project matches "@shop/nope"\nRun "monorun --help" for usage.\n'],
    [['affected', '--changed', '../secret.txt'], 'monorun: changed file "../secret.txt" is outside the workspace\n'],
  ])('%j', (args, stderr) => {
    expect(runCli(args, SHOP)).toEqual({ status: 2, stdout: '', stderr });
  });

  it('for a workspace cycle', () => {
    const result = runCli(['graph'], fixturePath('workspaces', 'cycle'));
    expect(result).toEqual({
      status: 2,
      stdout: '',
      stderr: 'monorun: the workspace projects depend on each other in a cycle: @cycle/a -> @cycle/b -> @cycle/a\n',
    });
  });

  it('outside a workspace', () => {
    const dir = tempDir();
    expect(runCli(['graph'], dir).stderr).toBe(`monorun: no package.json with a "workspaces" field in "${dir}" or any directory above it\n`);
  });

  it('for an unknown option', () => {
    const result = runCli(['run', 'build', '--parallel'], SHOP);
    expect(result.status).toBe(2);
    expect(result.stderr).toMatch(/^monorun: Unknown option '--parallel'/);
  });
});

describe('help and version', () => {
  it('prints help', () => {
    const result = runCli(['--help'], SHOP);
    expect(result.status).toBe(0);
    expect(result.stdout.startsWith('Usage: monorun run <task> [options]\n')).toBe(true);
  });

  it('prints the version from package.json', () => {
    const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as { version: string };
    expect(runCli(['--version'], SHOP)).toEqual({ status: 0, stdout: `${pkg.version}\n`, stderr: '' });
  });
});
