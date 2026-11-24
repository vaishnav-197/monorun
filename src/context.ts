import { type Config, loadConfig } from './config.js';
import { buildProjectGraph, type ProjectGraph } from './graph/project-graph.js';
import { findWorkspaceRoot } from './workspace/find-root.js';
import { loadWorkspace } from './workspace/load.js';
import type { Workspace } from './workspace/model.js';

/** Everything the commands need about the workspace, loaded once. */
export interface Context {
  workspace: Workspace;
  config: Config;
  graph: ProjectGraph;
}

export function loadContext(start: string): Context {
  const root = findWorkspaceRoot(start);
  const workspace = loadWorkspace(root);
  return { workspace, config: loadConfig(root), graph: buildProjectGraph(workspace) };
}
