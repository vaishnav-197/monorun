import { compareText } from '../text.js';

/**
 * Orders `nodes` so that every node comes after the nodes it depends on. Among nodes that are
 * ready at the same time, the one that sorts first by name goes first, so the order is the same
 * on every run and on every machine.
 *
 * Throws when the dependencies have a cycle; callers report cycles themselves with findCycle
 * before sorting.
 */
export function topologicalOrder(nodes: readonly string[], dependenciesOf: (node: string) => readonly string[]): string[] {
  const remaining = new Map<string, number>();
  const dependents = new Map<string, string[]>();
  for (const node of nodes) {
    const dependencies = dependenciesOf(node);
    remaining.set(node, dependencies.length);
    for (const dependency of dependencies) {
      dependents.set(dependency, [...(dependents.get(dependency) ?? []), node]);
    }
  }

  const ready = nodes.filter((node) => remaining.get(node) === 0).sort(compareText);
  const order: string[] = [];
  while (ready.length > 0) {
    const node = ready.shift() as string;
    order.push(node);
    for (const dependent of dependents.get(node) ?? []) {
      const left = (remaining.get(dependent) ?? 0) - 1;
      remaining.set(dependent, left);
      if (left === 0) {
        ready.push(dependent);
        ready.sort(compareText);
      }
    }
  }

  if (order.length !== nodes.length) throw new Error('topologicalOrder: the graph has a cycle');
  return order;
}
