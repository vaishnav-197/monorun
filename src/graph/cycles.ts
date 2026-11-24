import { compareText } from '../text.js';

/**
 * Finds one dependency cycle and returns it as a path that starts and ends with the same node,
 * e.g. ["@shop/a", "@shop/b", "@shop/a"]. Returns null when there is none. The search starts from
 * the nodes in name order, so the same cycle is reported every time.
 */
export function findCycle(nodes: readonly string[], dependenciesOf: (node: string) => readonly string[]): string[] | null {
  const state = new Map<string, 'visiting' | 'done'>();
  const stack: string[] = [];

  const visit = (node: string): string[] | null => {
    state.set(node, 'visiting');
    stack.push(node);
    for (const next of [...dependenciesOf(node)].sort(compareText)) {
      const seen = state.get(next);
      if (seen === 'visiting') return [...stack.slice(stack.indexOf(next)), next];
      if (seen === undefined) {
        const cycle = visit(next);
        if (cycle) return cycle;
      }
    }
    stack.pop();
    state.set(node, 'done');
    return null;
  };

  for (const node of [...nodes].sort(compareText)) {
    if (state.has(node)) continue;
    const cycle = visit(node);
    if (cycle) return cycle;
  }
  return null;
}
