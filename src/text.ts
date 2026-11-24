/** "1 error", "2 errors". */
export function plural(count: number, singular: string, pluralForm = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}

/** "a", "a and b", "a, b and c". */
export function joinList(items: readonly string[]): string {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`;
}

/** Sorts and removes duplicates. */
export function uniqueSorted(items: Iterable<string>): string[] {
  return [...new Set(items)].sort(compareText);
}

export function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Pads every column to its widest cell. The last column is not padded. */
export function formatColumns(rows: readonly (readonly string[])[], gap = '  '): string[] {
  const widths: number[] = [];
  for (const row of rows) {
    row.forEach((cell, i) => {
      widths[i] = Math.max(widths[i] ?? 0, cell.length);
    });
  }
  return rows.map((row) =>
    row
      .map((cell, i) => (i === row.length - 1 ? cell : cell.padEnd(widths[i] ?? 0)))
      .join(gap)
      .trimEnd(),
  );
}

/** "850ms", "4.2s", "1m 05s". */
export function formatDuration(ms: number): string {
  if (ms < 999.5) return `${Math.round(ms)}ms`;
  if (ms < 59_950) return `${(ms / 1000).toFixed(1)}s`;
  const total = Math.round(ms / 1000);
  return `${Math.floor(total / 60)}m ${String(total % 60).padStart(2, '0')}s`;
}

/** Turns a path into the form used everywhere in monorun: "/" separators, no leading "./". */
export function toPosix(path: string): string {
  const posix = path.split('\\').join('/');
  return posix.startsWith('./') ? posix.slice(2) : posix;
}
