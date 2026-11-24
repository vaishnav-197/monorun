import { createColors } from '../color.js';
import type { RunEvents, RunSummary, TaskResult } from '../run/runner.js';
import type { TaskGraph } from '../tasks/task-graph.js';
import { describeWithoutScript } from '../tasks/task-graph.js';
import { formatColumns, formatDuration, plural } from '../text.js';

export interface Writer {
  write(text: string): void;
}

/**
 * Prints a line when a task starts, then every line of its output with the task id in front, so
 * output stays readable when it is collected in a CI log. stderr lines go to stderr.
 */
export function createRunReporter(out: Writer, err: Writer, color: boolean): RunEvents {
  const c = createColors(color);
  return {
    taskStart(node) {
      out.write(`${c.bold(node.id)} ${c.dim(`$ ${node.command}`)}\n`);
    },
    taskOutput(node, stream, line) {
      const prefix = c.dim(`${node.id} |`);
      (stream === 'stderr' ? err : out).write(line === '' ? `${prefix}\n` : `${prefix} ${line}\n`);
    },
    taskEnd(node, result) {
      if (result.status === 'failed') out.write(`${c.red(`${node.id} failed`)} ${c.dim(`(${failureReason(result)})`)}\n`);
    },
  };
}

export function formatPlan(graph: TaskGraph): string {
  const lines = [`Plan: ${plural(graph.order.length, 'task')} for "${graph.task}"`];
  const rows = graph.order.map((id, index) => {
    const node = graph.nodes.get(id);
    return [`${index + 1}.`, id, node?.reason ?? '', node?.command ?? ''];
  });
  lines.push(...formatColumns(rows).map((line) => `  ${line}`));
  const skipped = describeWithoutScript(graph);
  if (skipped) lines.push('', skipped);
  return `${lines.join('\n')}\n`;
}

export function formatSummary(summary: RunSummary, graph: TaskGraph, color: boolean): string {
  const c = createColors(color);
  const rows = summary.results.map((result) => [
    result.id,
    result.status,
    result.status === 'skipped' ? '' : formatDuration(result.durationMs),
    describeResult(result),
  ]);
  const lines = formatColumns(rows).map((line, index) => {
    const status = summary.results[index]?.status;
    const paint = status === 'failed' ? c.red : status === 'skipped' ? c.yellow : (text: string) => text;
    return `  ${paint(line)}`;
  });

  const skipped = describeWithoutScript(graph);
  const counts = [`${summary.passed} passed`, `${summary.failed} failed`, `${summary.skipped} skipped`].join(', ');
  const total = `${counts} in ${formatDuration(summary.durationMs)}`;
  return `\nSummary\n${lines.join('\n')}\n${skipped ? `${skipped}\n` : ''}\n${summary.failed > 0 ? c.red(total) : c.green(total)}\n`;
}

function describeResult(result: TaskResult): string {
  if (result.status === 'failed') return failureReason(result);
  return result.note ?? '';
}

function failureReason(result: TaskResult): string {
  if (result.note) return result.note;
  return result.exitCode === null ? 'no exit code' : `exit code ${result.exitCode}`;
}
