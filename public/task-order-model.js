// Manual order is a local task property, including on imported tasks.
export const compareTaskOrder = (a, b) =>
  (a.order || 0) - (b.order || 0) || a.id.localeCompare(b.id);

export function reorderTasks(tasks, visibleIds, id, target, after = false) {
  const byId = new Map(tasks.map(t => [t.id, t]));
  const visible = [...new Set(visibleIds)].filter(key => byId.has(key));
  if (id === target || !visible.includes(id) || !visible.includes(target)) return [];
  const moved = visible.filter(key => key !== id);
  moved.splice(moved.indexOf(target) + Number(after), 0, id);
  if (moved.every((key, i) => key === visible[i])) return [];

  // Replace only the participating slots. Filtered, archived and other branches'
  // tasks retain their positions relative to each other.
  const base = [...tasks].sort(compareTaskOrder);
  const participating = new Set(visible);
  let index = 0;
  const result = base.map(t => participating.has(t.id) ? byId.get(moved[index++]) : t);
  let first = result.findIndex((t, i) => t !== base[i]);
  if (first < 0) return [];
  let last = result.length - 1;
  while (result[last] === base[last]) last--;
  const count = last - first + 1;
  let low = first ? (base[first - 1].order || 0) : null;
  let high = last + 1 < base.length ? (base[last + 1].order || 0) : null;
  if (low == null) low = (high ?? 0) - 1024 * (count + 1);
  if (high == null) high = low + 1024 * (count + 1);
  let step = (high - low) / (count + 1);
  // Old projects can have tied/missing ranks. Rebalance once when no numeric
  // space remains, keeping the exact same relative order of hidden records.
  if (!Number.isFinite(step) || step <= 1e-6 || low + step === low || high - step === high) {
    first = 0;
    last = result.length - 1;
    low = 0;
    step = 1024;
  }
  return result.slice(first, last + 1).flatMap((t, i) => {
    const order = low + step * (i + 1);
    return t.order === order ? [] : [{ id: t.id, order }];
  });
}
