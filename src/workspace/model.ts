/** The package.json fields whose entries can point at another project of the workspace. */
export const DEPENDENCY_FIELDS = ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies'] as const;

export type DependencyField = (typeof DEPENDENCY_FIELDS)[number];

/** One package of the workspace: a directory with a package.json, matched by the "workspaces" patterns. */
export interface Project {
  name: string;
  version: string | null;
  /** Directory relative to the workspace root, with "/" separators, e.g. "packages/ui". */
  dir: string;
  /** Absolute path of the directory. */
  path: string;
  /** Script name to command, as in package.json. */
  scripts: Readonly<Record<string, string>>;
  /** Every dependency declared in package.json, by field: name to version spec. */
  dependencies: Readonly<Record<DependencyField, Readonly<Record<string, string>>>>;
}

export interface Workspace {
  /** Absolute path of the directory with the root package.json. */
  root: string;
  /** The "workspaces" patterns of the root package.json. */
  patterns: readonly string[];
  /** Sorted by name. */
  projects: readonly Project[];
  byName: ReadonlyMap<string, Project>;
}
