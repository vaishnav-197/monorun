import type { Config } from '../config.js';
import { matchGlob } from '../glob.js';
import { type ProjectGraph, transitiveDependents } from '../graph/project-graph.js';
import { uniqueSorted } from '../text.js';
import type { Project, Workspace } from '../workspace/model.js';

export type FileOwner = { kind: 'project'; project: string } | { kind: 'global' } | { kind: 'none' };

/**
 * Who a changed file belongs to: the project whose directory holds it (the deepest one, when
 * projects are nested), or, for a file outside every project, all projects when it matches
 * globalFiles. Other files outside the projects, such as a README at the root, belong to nobody.
 */
export function ownerOf(file: string, workspace: Workspace, config: Config): FileOwner {
  let best: Project | null = null;
  for (const project of workspace.projects) {
    if (file !== project.dir && !file.startsWith(`${project.dir}/`)) continue;
    if (best === null || project.dir.length > best.dir.length) best = project;
  }
  if (best) return { kind: 'project', project: best.name };
  if (config.globalFiles.some((pattern) => matchGlob(pattern, file))) return { kind: 'global' };
  return { kind: 'none' };
}

export interface AffectedResult {
  /** Projects that hold a changed file. Every project when a global file changed. */
  changed: string[];
  /** The changed projects and every project that depends on them. Sorted. */
  affected: string[];
  /** Changed files that matched globalFiles. */
  globalFiles: string[];
  /** Changed files that belong to no project and are not global files. */
  ignoredFiles: string[];
  /** For each changed project, its changed files. */
  filesByProject: ReadonlyMap<string, string[]>;
}

export function findAffected(graph: ProjectGraph, config: Config, files: readonly string[]): AffectedResult {
  const { workspace } = graph;
  const filesByProject = new Map<string, string[]>();
  const globalFiles: string[] = [];
  const ignoredFiles: string[] = [];

  for (const file of files) {
    const owner = ownerOf(file, workspace, config);
    if (owner.kind === 'project') filesByProject.set(owner.project, [...(filesByProject.get(owner.project) ?? []), file]);
    else if (owner.kind === 'global') globalFiles.push(file);
    else ignoredFiles.push(file);
  }

  const changed = globalFiles.length > 0 ? workspace.projects.map((project) => project.name) : uniqueSorted(filesByProject.keys());
  const affected = uniqueSorted([...changed, ...transitiveDependents(graph, changed)]);
  return { changed, affected, globalFiles, ignoredFiles, filesByProject };
}
