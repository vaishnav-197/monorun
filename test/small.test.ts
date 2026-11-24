import { describe, expect, it } from 'vitest';
import { LineSplitter } from '../src/run/lines.js';
import { scriptEnv } from '../src/run/env.js';
import { selectProjects } from '../src/select.js';
import { formatDuration, toPosix } from '../src/text.js';
import { shopContext } from './helpers.js';

const { workspace } = shopContext();

describe('selectProjects', () => {
  it('selects every project without --projects', () => {
    expect(selectProjects(workspace, undefined)).toHaveLength(7);
  });

  it('takes names and patterns, comma-separated', () => {
    expect(selectProjects(workspace, '@shop/web, @shop/u*')).toEqual(['@shop/ui', '@shop/utils', '@shop/web']);
  });

  it('fails for a name or pattern that matches nothing', () => {
    expect(() => selectProjects(workspace, '@shop/web,@shop/wbe')).toThrow('no project matches "@shop/wbe"');
    expect(() => selectProjects(workspace, ' , ')).toThrow('--projects needs at least one project name or pattern');
  });
});

describe('LineSplitter', () => {
  it('joins lines split across chunks', () => {
    const splitter = new LineSplitter();
    expect(splitter.push('built @sh')).toEqual([]);
    expect(splitter.push('op/ui\nwarn')).toEqual(['built @shop/ui']);
    expect(splitter.push('ing: slow\r\n\n')).toEqual(['warning: slow', '']);
    expect(splitter.flush()).toEqual([]);
  });

  it('returns a last line without a newline on flush', () => {
    const splitter = new LineSplitter();
    splitter.push('done');
    expect(splitter.flush()).toEqual(['done']);
    expect(splitter.flush()).toEqual([]);
  });
});

describe('scriptEnv', () => {
  it('puts the node_modules/.bin directories first and names the task', () => {
    const project = workspace.byName.get('@shop/ui');
    if (!project) throw new Error('fixture');
    const env = scriptEnv({ PATH: '/usr/bin', HOME: '/home/me' }, workspace, project, 'build');
    expect(env).toEqual({
      PATH: `${project.path}/node_modules/.bin:${workspace.root}/node_modules/.bin:/usr/bin`,
      HOME: '/home/me',
      MONORUN_ROOT: workspace.root,
      MONORUN_PROJECT: '@shop/ui',
      MONORUN_TASK: 'build',
    });
  });
});

describe('text helpers', () => {
  it.each([
    [12.4, '12ms'],
    [999.4, '999ms'],
    [999.6, '1.0s'],
    [4210, '4.2s'],
    [59_960, '1m 00s'],
    [65_000, '1m 05s'],
    [119_999, '2m 00s'],
  ])('formatDuration(%d) is %s', (ms, text) => {
    expect(formatDuration(ms)).toBe(text);
  });

  it('turns paths into the "/" form', () => {
    expect(toPosix('.\\packages\\ui')).toBe('packages/ui');
    expect(toPosix('./apps/web')).toBe('apps/web');
  });
});
