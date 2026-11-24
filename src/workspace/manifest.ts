// Reads the parts of a package.json that monorun uses, and rejects values of the wrong type with
// the file and field in the message: 'packages/ui/package.json: scripts.build: expected a string'.

import { InputError } from '../errors.js';
import { readJsonFile } from '../read-json.js';
import { DEPENDENCY_FIELDS, type DependencyField } from './model.js';

export interface Manifest {
  name: string | null;
  version: string | null;
  /** The "workspaces" patterns, or null when the field is missing. */
  workspaces: string[] | null;
  scripts: Record<string, string>;
  dependencies: Record<DependencyField, Record<string, string>>;
}

export function readManifest(file: string): Manifest {
  return parseManifest(readJsonFile(file, 'package.json'), file);
}

export function parseManifest(data: unknown, file: string): Manifest {
  const fail = (field: string, problem: string): never => {
    throw new InputError(`${file}: ${field ? `${field}: ` : ''}${problem}`);
  };
  if (!isRecord(data)) fail('', 'expected a JSON object');
  const json = data as Record<string, unknown>;

  const optionalString = (field: string): string | null => {
    const value = json[field];
    if (value === undefined) return null;
    if (typeof value !== 'string') fail(field, 'expected a string');
    return value as string;
  };

  const stringRecord = (field: string): Record<string, string> => {
    const value = json[field];
    if (value === undefined || value === null) return {};
    if (!isRecord(value)) fail(field, 'expected an object');
    const result: Record<string, string> = {};
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      if (typeof entry !== 'string') fail(`${field}.${key}`, 'expected a string');
      result[key] = entry as string;
    }
    return result;
  };

  const name = optionalString('name');
  if (name !== null && name.trim() === '') fail('name', 'is empty');

  const dependencies = Object.fromEntries(DEPENDENCY_FIELDS.map((field) => [field, stringRecord(field)])) as Record<
    DependencyField,
    Record<string, string>
  >;

  return {
    name,
    version: optionalString('version'),
    workspaces: readWorkspaces(json.workspaces, fail),
    scripts: stringRecord('scripts'),
    dependencies,
  };
}

// npm takes an array of patterns. Yarn 1 also accepts { "packages": [...], "nohoist": [...] }.
function readWorkspaces(value: unknown, fail: (field: string, problem: string) => never): string[] | null {
  if (value === undefined) return null;
  const patterns = isRecord(value) ? value.packages : value;
  const field = isRecord(value) ? 'workspaces.packages' : 'workspaces';
  if (!Array.isArray(patterns) || !patterns.every((pattern) => typeof pattern === 'string')) {
    fail(field, 'expected an array of directory patterns');
  }
  return patterns as string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
