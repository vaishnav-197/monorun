export type Paint = (text: string) => string;

export interface Colors {
  red: Paint;
  yellow: Paint;
  green: Paint;
  bold: Paint;
  dim: Paint;
}

/** Colours are used only on a terminal, and never when NO_COLOR is set, even to an empty value. */
export function shouldUseColor(isTTY: boolean | undefined, env: NodeJS.ProcessEnv): boolean {
  return isTTY === true && env.NO_COLOR === undefined;
}

const ansi =
  (open: number, close: number): Paint =>
  (text) =>
    `\u001b[${open}m${text}\u001b[${close}m`;

const plain: Paint = (text) => text;

export function createColors(enabled: boolean): Colors {
  if (!enabled) return { red: plain, yellow: plain, green: plain, bold: plain, dim: plain };
  return { red: ansi(31, 39), yellow: ansi(33, 39), green: ansi(32, 39), bold: ansi(1, 22), dim: ansi(2, 22) };
}
