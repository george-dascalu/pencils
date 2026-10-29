// Relationship arrows read from their start to their end: "A parent of B".
// Arrows of one kind that fan out from the same side of one object run along
// a shared trunk, so a single label names them all.

// Text the app generated for project-plan parent arrows. Anything else was
// typed by someone and is shown unchanged.
const GENERATED_PARENT = new Set(["", "parent / child", "parent of", "child of"]);

export function relationshipLabel(edge, fromTask, toTask) {
  const label = edge?.label || "";
  if (edge?.planRelation !== "parent" || !GENERATED_PARENT.has(label)) return label;
  return fromTask && toTask && fromTask.parent === toTask.id ? "child of" : "parent of";
}

// items: [{ id, from, fromSide, routing, bends, label }]. Returns id -> { lead, members }
// for every arrow in a group of two or more; the lowest id leads so the label stays put.
export function sharedLabels(items) {
  const groups = new Map();
  for (const item of items) {
    if (!item.label || item.routing !== "elbow" || !item.fromSide || item.bends?.length) continue;
    const key = `${item.from}\u0000${item.fromSide}\u0000${item.label}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item.id);
  }
  const result = new Map();
  for (const ids of groups.values()) {
    if (ids.length < 2) continue;
    const members = [...ids].sort();
    for (const id of members) result.set(id, { lead: members[0], members });
  }
  return result;
}

const near = (a, b) => Math.abs(a.x - b.x) < 0.5 && Math.abs(a.y - b.y) < 0.5;
const direction = (a, b) => {
  const length = Math.hypot(b.x - a.x, b.y - a.y);
  return length ? { x: (b.x - a.x) / length, y: (b.y - a.y) / length, length } : null;
};
// Drop repeated points and points in the middle of a straight run.
function corners(points) {
  const out = [];
  for (const point of points) {
    if (out.length && near(out[out.length - 1], point)) continue;
    if (out.length >= 2) {
      const a = direction(out[out.length - 2], out[out.length - 1]), b = direction(out[out.length - 1], point);
      if (a && b && Math.abs(a.x - b.x) < 1e-6 && Math.abs(a.y - b.y) < 1e-6) out.pop();
    }
    out.push(point);
  }
  return out;
}

// The common start of several routes that leave the same port.
export function sharedPrefix(routes) {
  const paths = routes.map(corners);
  const base = paths[0];
  const out = [base[0]];
  for (let i = 1; i < base.length; i++) {
    const a = base[i - 1], step = direction(a, base[i]);
    let reach = step.length;
    for (const path of paths.slice(1)) {
      const next = path[i], own = next && near(path[i - 1], a) && direction(path[i - 1], next);
      if (!own || Math.abs(own.x - step.x) > 1e-6 || Math.abs(own.y - step.y) > 1e-6) return out;
      reach = Math.min(reach, own.length);
    }
    if (reach < step.length - 0.5) {
      out.push({ x: a.x + step.x * reach, y: a.y + step.y * reach });
      return out;
    }
    out.push(base[i]);
  }
  return out;
}

// Where a shared label goes: the middle of the trunk's last stretch, where the
// arrows branch off (or its longest stretch when the last is too short for
// text). It sits left of a vertical stretch (child cards hang off its right
// side) or above a horizontal one. Null when the trunk is too short.
export function labelSpot(points, minimum = 24) {
  const stretches = [];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i];
    stretches.push({ a, b, length: Math.hypot(b.x - a.x, b.y - a.y) });
  }
  const last = stretches[stretches.length - 1];
  const best = last?.length >= minimum ? last : stretches.reduce((top, s) => (!top || s.length > top.length ? s : top), null);
  if (!best || best.length < minimum) return null;
  const x = (best.a.x + best.b.x) / 2, y = (best.a.y + best.b.y) / 2;
  const vertical = Math.abs(best.b.x - best.a.x) < Math.abs(best.b.y - best.a.y);
  return vertical ? { x: x - 6, y: y + 4, beside: true } : { x, y: y - 9, beside: false };
}

// A single relationship label at `point` on its route: beside the line when the
// point is on a vertical stretch, so the line does not run through the words.
export function spotOnRoute(points, point) {
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i];
    const within = (v, p, q) => v >= Math.min(p, q) - 0.5 && v <= Math.max(p, q) + 0.5;
    if (!within(point.x, a.x, b.x) || !within(point.y, a.y, b.y)) continue;
    const vertical = Math.abs(b.x - a.x) < 0.5 && Math.abs(b.y - a.y) >= 0.5;
    const horizontal = Math.abs(b.y - a.y) < 0.5;
    if (vertical) return { x: point.x - 6, y: point.y + 4, beside: true };
    if (horizontal) return { x: point.x, y: point.y - 9, beside: false };
  }
  return null;
}
