import type { ProjectGraph } from '../graph/project-graph.js';
import { formatColumns, plural } from '../text.js';

export function formatGraphText(graph: ProjectGraph): string {
  const { workspace } = graph;
  const header = `${plural(workspace.projects.length, 'project')} in ${workspace.root} (workspaces: ${workspace.patterns.join(', ')})`;
  const rows = [
    ['Project', 'Directory', 'Scripts', 'Depends on'],
    ...workspace.projects.map((project) => [
      project.name,
      project.dir,
      Object.keys(project.scripts).sort().join(', ') || '-',
      (graph.dependencies.get(project.name) ?? []).join(', ') || '-',
    ]),
  ];
  return `${header}\n\n${formatColumns(rows).join('\n')}\n`;
}

export function formatGraphJson(graph: ProjectGraph): string {
  const { workspace } = graph;
  const json = {
    root: workspace.root,
    patterns: workspace.patterns,
    projects: workspace.projects.map((project) => ({
      name: project.name,
      version: project.version,
      dir: project.dir,
      scripts: Object.keys(project.scripts).sort(),
      dependencies: graph.dependencies.get(project.name) ?? [],
      dependents: graph.dependents.get(project.name) ?? [],
    })),
  };
  return `${JSON.stringify(json, null, 2)}\n`;
}
