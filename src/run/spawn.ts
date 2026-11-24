import { spawn } from 'node:child_process';
import { performance } from 'node:perf_hooks';
import { LineSplitter } from './lines.js';

export type OutputStream = 'stdout' | 'stderr';

export interface ScriptOptions {
  command: string;
  cwd: string;
  env: NodeJS.ProcessEnv;
  onLine: (stream: OutputStream, line: string) => void;
}

export interface ScriptResult {
  /** null when the process was killed by a signal or could not start. */
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  durationMs: number;
  /** Set when the shell could not be started at all. */
  spawnError: string | null;
}

/**
 * Runs one script with `sh -c`, the way npm runs package scripts on Linux and macOS, and passes
 * its output on line by line. Resolves when the process has exited and both streams are closed;
 * it never rejects.
 */
export function runScript(options: ScriptOptions): Promise<ScriptResult> {
  const started = performance.now();
  return new Promise((resolve) => {
    let spawnError: string | null = null;
    const child = spawn('sh', ['-c', options.command], {
      cwd: options.cwd,
      env: options.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    const streams: [OutputStream, NodeJS.ReadableStream | null][] = [
      ['stdout', child.stdout],
      ['stderr', child.stderr],
    ];
    for (const [name, stream] of streams) {
      if (!stream) continue;
      const splitter = new LineSplitter();
      stream.setEncoding('utf8');
      stream.on('data', (chunk: string) => {
        for (const line of splitter.push(chunk)) options.onLine(name, line);
      });
      stream.on('end', () => {
        for (const line of splitter.flush()) options.onLine(name, line);
      });
    }

    child.on('error', (error) => {
      spawnError = error.message;
    });
    child.on('close', (code, signal) => {
      resolve({ exitCode: code, signal, durationMs: performance.now() - started, spawnError });
    });
  });
}
