const DAY = 86400000;
const stamp = (value) => (value ? Date.parse(`${value}T00:00:00Z`) : NaN);
const date = (value) => new Date(value).toISOString().slice(0, 10);

// Finish-to-start constraints: the successor starts the following calendar day.
// Never mutate records here: both cascading moves and incomplete schedules are previewed.
export function schedulePreview(tasks) {
  const map = new Map(tasks.filter((t) => !t.archived).map((t) => [t.id, t]));
  const incoming = new Map(),
    children = new Map(),
    queue = [],
    projected = new Map(),
    moves = [],
    warnings = [];
  for (const t of map.values()) {
    const deps = [...new Set(t.dependencies || [])].filter((id) => map.has(id));
    incoming.set(t.id, deps.length);
    if (!deps.length) queue.push(t.id);
    for (const id of deps) {
      if (!children.has(id)) children.set(id, []);
      children.get(id).push(t.id);
    }
    for (const id of (t.dependencies || []).filter((id) => !map.has(id)))
      warnings.push(
        `${t.key || t.title}: prerequisite ${id} is unavailable or archived.`,
      );
  }
  for (let i = 0; i < queue.length; i++) {
    const id = queue[i],
      t = map.get(id),
      start = stamp(t.start || t.due),
      due = stamp(t.due || t.start);
    let minimum = start;
    for (const dependency of t.dependencies || []) {
      const p = projected.get(dependency);
      if (p && Number.isFinite(p.due))
        minimum = Number.isFinite(minimum)
          ? Math.max(minimum, p.due + DAY)
          : NaN;
      else if (map.has(dependency))
        warnings.push(
          `${t.key || t.title}: a prerequisite has no finish date.`,
        );
    }
    if (!Number.isFinite(start) || !Number.isFinite(due)) {
      if (t.dependencies?.length || children.has(id))
        warnings.push(
          `${t.key || t.title}: set dates before scheduling this relationship.`,
        );
      projected.set(id, { start, due });
    } else if (due < start) {
      warnings.push(`${t.key || t.title}: due date precedes start date.`);
      projected.set(id, { start, due });
    } else if (minimum > start) {
      const end = due + minimum - start;
      moves.push({
        id,
        title: t.title,
        key: t.key,
        before: { start: t.start, due: t.due },
        after: { start: date(minimum), due: date(end) },
      });
      projected.set(id, { start: minimum, due: end });
    } else projected.set(id, { start, due });
    for (const child of children.get(id) || []) {
      incoming.set(child, incoming.get(child) - 1);
      if (!incoming.get(child)) queue.push(child);
    }
  }
  const cycle = queue.length < map.size;
  if (cycle)
    warnings.push(
      "A dependency cycle prevents a complete schedule. Remove the cycle before applying moves.",
    );
  return { moves, warnings, cycle };
}
