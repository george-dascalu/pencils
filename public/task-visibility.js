// View pagination must preserve the meaning of a group or a hierarchy.
export const PAGE_SIZE = 100;
export function localDate(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
export function pageOf(items, page = 0, size = PAGE_SIZE) {
  const pages = Math.max(1, Math.ceil(items.length / size));
  page = Math.max(0, Math.min(Math.floor(Number(page) || 0), pages - 1));
  return {
    items: items.slice(page * size, (page + 1) * size),
    page,
    pages,
    total: items.length,
  };
}
export function treePage(matches, allTasks, page = 0, size = PAGE_SIZE, compare = null) {
  const all = new Map(allTasks.map((t) => [t.id, t]));
  const included = new Map(matches.map((t) => [t.id, t]));
  const matching = new Set(included.keys());
  for (const task of matches) {
    const visited = new Set([task.id]);
    let parent = all.get(task.parent);
    while (parent && !visited.has(parent.id)) {
      visited.add(parent.id);
      included.set(parent.id, parent);
      parent = all.get(parent.parent);
    }
  }
  const ordered = [...included.values()];
  if (compare) ordered.sort(compare);
  const children = new Map();
  for (const task of ordered) {
    const list = children.get(task.parent) || [];
    list.push(task);
    children.set(task.parent, list);
  }
  const roots = ordered.filter((t) => !included.has(t.parent));
  // Damaged external files can contain cycles. Keep every record reachable.
  const reachable = new Set();
  function visit(root, output, seen) {
    const pending = [root];
    while (pending.length) {
      const t = pending.pop();
      if (seen.has(t.id)) continue;
      seen.add(t.id);
      output?.push({ ...t, contextOnly: !matching.has(t.id) });
      pending.push(...(children.get(t.id) || []).slice().reverse());
    }
  }
  for (const root of roots) visit(root, null, reachable);
  for (const task of included.values())
    if (!reachable.has(task.id)) {
      roots.push(task);
      visit(task, null, reachable);
    }
  const result = pageOf(roots, page, size);
  const items = [],
    seen = new Set();
  for (const root of result.items) visit(root, items, seen);
  return {
    ...result,
    items,
    matching: matching.size,
    context: items.filter((t) => t.contextOnly).length,
  };
}
