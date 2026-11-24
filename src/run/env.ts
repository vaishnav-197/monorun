import { delimiter, join } from 'node:path';
import type { Project, Workspace } from '../workspace/model.js';

/**
 * The environment a script runs in: the parent's environment, the project's and the root's
 * node_modules/.bin first on PATH (as `npm run` does), and three variables that tell the script
 * where it is.
 */
export function scriptEnv(base: NodeJS.ProcessEnv, workspace: Workspace, project: Project, task: string): NodeJS.ProcessEnv {
  const bins = [join(project.path, 'node_modules', '.bin'), join(workspace.root, 'node_modules', '.bin')];
  const path = [...bins, base.PATH].filter((part) => part !== undefined && part !== '').join(delimiter);
  return {
    ...base,
    PATH: path,
    MONORUN_ROOT: workspace.root,
    MONORUN_PROJECT: project.name,
    MONORUN_TASK: task,
  };
}
