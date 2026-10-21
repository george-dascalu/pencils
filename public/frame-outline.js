// One iterative traversal supplies outline order and descendant counts. Avoid
// scanning the whole board for each row or recursing through imported nesting.
export function frameOutline(board, parents) {
  const children = new Map(), nodes = new Map(board.nodes.map(n => [n.id, n]));
  const order = new Map((board.presentation || []).map((id, i) => [id, i]));
  for (const n of board.nodes) {
    const parent = parents.get(n.id) || null;
    if (!children.has(parent)) children.set(parent, []);
    children.get(parent).push(n);
  }
  const roots = children.get(null) || [];
  roots.sort((a, b) => (order.get(a.id) ?? Infinity) - (order.get(b.id) ?? Infinity));
  const stack = roots.toReversed().map(n => ({node:n,depth:0})), visited = new Set(), rows = [], traversal = [];
  while (stack.length) {
    const entry = stack.pop(), n = entry.node;
    if (visited.has(n.id)) continue;
    visited.add(n.id); traversal.push(n);
    if (n.type === 'frame') rows.push(entry);
    for (const child of (children.get(n.id) || []).toReversed()) stack.push({node:child,depth:entry.depth+1});
  }
  const counts = new Map();
  for (const n of traversal.toReversed()) {
    const parent = parents.get(n.id);
    if (nodes.has(parent)) counts.set(parent,(counts.get(parent)||0)+1+(counts.get(n.id)||0));
  }
  return {rows, counts};
}
