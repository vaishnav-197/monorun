import { readFileSync } from 'node:fs';
import { InputError } from './errors.js';

export function readJsonFile(path: string, description: string): unknown {
  let text: string;
  try {
    text = readFileSync(path, 'utf8');
  } catch (error) {
    throw new InputError(`cannot read ${description} "${path}": ${describeFsError(error)}`);
  }
  try {
    return JSON.parse(text);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new InputError(`${description} "${path}" is not valid JSON: ${reason}`);
  }
}

export function describeFsError(error: unknown): string {
  const code = (error as NodeJS.ErrnoException).code;
  if (code === 'ENOENT') return 'file not found';
  if (code === 'EISDIR') return 'it is a directory';
  if (code === 'EACCES') return 'permission denied';
  return error instanceof Error ? error.message : String(error);
}
