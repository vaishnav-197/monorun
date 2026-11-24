/**
 * Splits a stream of text chunks into lines. A chunk can end in the middle of a line; that part
 * is kept until the rest arrives, or until flush() at the end of the stream.
 */
export class LineSplitter {
  private pending = '';

  push(chunk: string): string[] {
    const text = this.pending + chunk;
    const parts = text.split('\n');
    this.pending = parts.pop() ?? '';
    return parts.map(stripCarriageReturn);
  }

  /** The last line, when the stream did not end with a newline. */
  flush(): string[] {
    const rest = this.pending;
    this.pending = '';
    return rest === '' ? [] : [stripCarriageReturn(rest)];
  }
}

function stripCarriageReturn(line: string): string {
  return line.endsWith('\r') ? line.slice(0, -1) : line;
}
