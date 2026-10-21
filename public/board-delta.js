// Field-level, reversible patches keep a single-card edit small, with the same
// conflict semantics online, offline, and when another participant edits first.
export function equalValue(a, b) {
  if (a === b) return true;
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object' || Array.isArray(a) !== Array.isArray(b)) return false;
  const keys = Object.keys(a), other = Object.keys(b);
  return keys.length === other.length && keys.every(k => Object.hasOwn(b, k) && equalValue(a[k], b[k]));
}
const fields = ['title', 'archived', 'templates', 'presentation', 'settings', 'layers'];
export function boardDifference(before, after) {
  const changes = [];
  for (const kind of ['nodes', 'edges']) {
    const a = new Map((before[kind] || []).map(v => [v.id, v]));
    const b = new Map((after[kind] || []).map(v => [v.id, v]));
    if (a.size === b.size && [...a.keys()].every(id => b.has(id)) && !equalValue([...a.keys()], [...b.keys()]))
      changes.push({ kind: 'order', collection: kind, before: [...a.keys()], after: [...b.keys()] });
    for (const id of new Set([...a.keys(), ...b.keys()])) {
      const old = a.get(id), next = b.get(id);
      if (old === next) continue;
      if (!old || !next) changes.push({ kind, id, before: old ?? null, after: next ?? null });
      else for (const key of new Set([...Object.keys(old), ...Object.keys(next)]))
        if (key !== 'native' && !equalValue(old[key], next[key]))
          changes.push({ kind, id, key, before: old[key] ?? null, after: next[key] ?? null });
    }
  }
  for (const key of fields) if (!equalValue(before[key], after[key]))
    changes.push({ key, before: before[key] ?? null, after: after[key] ?? null });
  return changes;
}
export function applyBoardDelta(current, changes, { guard = true, reverse = false } = {}) {
  if (!Array.isArray(changes) || changes.length > 1_000_000) throw new Error('Invalid board changes.');
  const result = { ...current }, maps = {}, orders = {};
  for (const kind of ['nodes', 'edges']) maps[kind] = new Map((current[kind] || []).map(n => [n.id, n]));
  const check = (value, before, after) => {
    if (guard && !equalValue(value ?? null, before) && !equalValue(value ?? null, after)) {
      const error = new Error('A changed board value was edited by someone else. Your draft is retained.');
      error.status = 409; throw error;
    }
  };
  for (const c of changes) {
    if (!c || !Object.hasOwn(c, 'before') || !Object.hasOwn(c, 'after')) throw new Error('Invalid board change.');
    const before = reverse ? c.after : c.before, after = reverse ? c.before : c.after;
    if (c.kind === 'order') {
      const afterIDs = new Set(Array.isArray(after) ? after : []);
      if (!["nodes", "edges"].includes(c.collection) || !Array.isArray(before) || !Array.isArray(after) ||
        new Set(after).size !== after.length || before.length !== after.length || !before.every(id => afterIDs.has(id)))
        throw new Error('Invalid board order.');
      const ids = new Set(before), existing = [...maps[c.collection].keys()].filter(id => ids.has(id));
      check(existing, before, after); orders[c.collection] = after;
    } else if (c.kind) {
      if (!['nodes', 'edges'].includes(c.kind) || typeof c.id !== 'string') throw new Error('Invalid board object.');
      const map = maps[c.kind], old = map.get(c.id);
      if (c.key !== undefined) {
        if (typeof c.key !== 'string' || ['id', 'native', '__proto__', 'constructor', 'prototype'].includes(c.key)) throw new Error('Invalid board field.');
        if (!old) { const e = new Error('The edited object was removed.'); e.status = 409; throw e; }
        check(old[c.key], before, after);
        const next = { ...old }; if (after === null) delete next[c.key]; else next[c.key] = after;
        map.set(c.id, next);
      } else {
        check(old, before, after);
        if (after === null) map.delete(c.id);
        else { if (after.id !== c.id) throw new Error('Object IDs must match.'); map.set(c.id, after); }
      }
    } else {
      if (!fields.includes(c.key)) throw new Error('Invalid board setting.');
      check(result[c.key], before, after);
      if (after === null) delete result[c.key]; else result[c.key] = after;
    }
  }
  for (const kind of ['nodes', 'edges']) {
    const order = orders[kind];
    if (order) {
      const ids = new Set(order); let i = 0;
      result[kind] = [...maps[kind].values()].map(n => ids.has(n.id) ? maps[kind].get(order[i++]) : n).filter(Boolean);
    } else result[kind] = [...maps[kind].values()];
  }
  return result;
}
