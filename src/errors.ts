/** A problem with the command line arguments. Exit code 2. */
export class UsageError extends Error {
  override name = 'UsageError';
}

/** A problem with the workspace, a package.json or monorun.json. Exit code 2. */
export class InputError extends Error {
  override name = 'InputError';
}
