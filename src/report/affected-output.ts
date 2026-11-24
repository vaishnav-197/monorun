import type { AffectedResult } from '../affected/affected.js';
import { type ProjectGraph, transitiveDependencies } from '../graph/project-graph.js';
import { formatColumns, joinList, plural } from '../text.js';

export function formatAffectedText(result: AffectedResult, graph: ProjectGraph, files: readonly string[]): string {
  const lines: string[] = [];

  const fileRows = files.map((file) => {
    const project = [...result.filesByProject].find(([, list]) => list.includes(file))?.[0];
    if (project) return [file, project];
    if (result.globalFiles.includes(file)) return [file, '(global file: affects every project)'];
    return [file, '(not in a project)'];
  });
  lines.push(`Changed files (${files.length})`, ...formatColumns(fileRows).map((line) => `  ${line}`), '');

  if (result.affected.length === 0) {
    lines.push('No affected projects.');
    return `${lines.join('\n')}\n`;
  }

  const changed = new Set(result.changed);
  const why = (name: string): string => {
    if (result.globalFiles.length > 0) return 'global file changed';
    if (changed.has(name)) return 'changed';
    const through = transitiveDependencies(graph, [name]).filter((dependency) => changed.has(dependency));
    return `depends on ${joinList(through)}`;
  };
  lines.push(
    `Affected projects (${result.affected.length})`,
    ...formatColumns(result.affected.map((name) => [name, why(name)])).map((line) => `  ${line}`),
  );
  return `${lines.join('\n')}\n`;
}

export function formatAffectedJson(result: AffectedResult): string {
  const json = {
    changed: result.changed,
    affected: result.affected,
    globalFiles: result.globalFiles,
    ignoredFiles: result.ignoredFiles,
    filesByProject: Object.fromEntries(result.filesByProject),
  };
  return `${JSON.stringify(json, null, 2)}\n`;
}

export function affectedSummary(result: AffectedResult): string {
  return result.affected.length === 0
    ? 'No affected projects.'
    : `${plural(result.affected.length, 'affected project')}: ${joinList(result.affected)}`;
}
