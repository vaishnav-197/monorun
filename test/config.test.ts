import { describe, expect, it } from 'vitest';
import { DEFAULT_GLOBAL_FILES, defaultConfig, loadConfig, parseConfig, parseTaskDependency, taskConfig } from '../src/config.js';
import { fixturePath, writeWorkspace } from './helpers.js';

describe('parseConfig', () => {
  it('reads tasks and globalFiles', () => {
    const config = parseConfig({ tasks: { build: { dependsOn: ['^build'] }, lint: {} }, globalFiles: ['tsconfig.base.json'] });
    expect(config).toEqual({ tasks: { build: { dependsOn: ['^build'] }, lint: { dependsOn: [] } }, globalFiles: ['tsconfig.base.json'] });
  });

  it('defaults to no task dependencies and the standard global files', () => {
    expect(parseConfig({})).toEqual({ tasks: {}, globalFiles: DEFAULT_GLOBAL_FILES });
    expect(taskConfig(defaultConfig(), 'build')).toEqual({ dependsOn: [] });
  });

  it.each([
    [[], 'expected a JSON object'],
    [{ pipeline: {} }, 'pipeline: unknown field (allowed: tasks, globalFiles)'],
    [{ tasks: [] }, 'tasks: expected an object of task names'],
    [{ tasks: { build: true } }, 'tasks.build: expected an object'],
    [{ tasks: { build: { outputs: ['dist/**'] } } }, 'tasks.build.outputs: unknown field (allowed: dependsOn)'],
    [{ tasks: { build: { dependsOn: '^build' } } }, 'tasks.build.dependsOn: expected an array of task names'],
    [{ tasks: { build: { dependsOn: ['^'] } } }, 'tasks.build.dependsOn: "^" is not a task name (use "build" or "^build")'],
    [{ tasks: { build: { dependsOn: ['^^build'] } } }, 'tasks.build.dependsOn: "^^build" is not a task name (use "build" or "^build")'],
    [{ tasks: { build: { dependsOn: ['build'] } } }, 'tasks.build.dependsOn: "build" cannot depend on itself'],
    [{ globalFiles: 'package.json' }, 'globalFiles: expected an array of file patterns'],
    [{ globalFiles: [''] }, 'globalFiles: expected an array of file patterns'],
  ])('rejects %j', (data, message) => {
    expect(() => parseConfig(data)).toThrow(message);
  });
});

describe('parseTaskDependency', () => {
  it('tells upstream from same-project dependencies', () => {
    expect(parseTaskDependency('^build')).toEqual({ task: 'build', upstream: true });
    expect(parseTaskDependency('build:types')).toEqual({ task: 'build:types', upstream: false });
    expect(parseTaskDependency('two words')).toBeNull();
  });
});

describe('loadConfig', () => {
  it('reads monorun.json from the root', () => {
    expect(loadConfig(fixturePath('workspaces', 'shop')).tasks.test).toEqual({ dependsOn: ['build'] });
  });

  it('returns the defaults without a monorun.json', () => {
    expect(loadConfig(fixturePath('workspaces', 'cycle'))).toEqual(defaultConfig());
  });

  it('names the file in validation errors', () => {
    const root = writeWorkspace({ 'monorun.json': { tasks: { build: { dependsOn: ['build'] } } } });
    expect(() => loadConfig(root)).toThrow(`invalid ${root}/monorun.json: tasks.build.dependsOn: "build" cannot depend on itself`);
  });

  it('reports invalid JSON', () => {
    const root = writeWorkspace({ 'monorun.json': '{ "tasks": ' });
    expect(() => loadConfig(root)).toThrow(/monorun\.json ".*" is not valid JSON/);
  });
});
