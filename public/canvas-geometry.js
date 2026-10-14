export const sides = ["top", "right", "bottom", "left"];
export function port(n, side) {
  return {
    x: n.x + (side === "left" ? 0 : side === "right" ? n.w : n.w / 2),
    y: n.y + (side === "top" ? 0 : side === "bottom" ? n.h : n.h / 2),
  };
}
export function routeEdge(edge, a, b) {
  const dx = b.x + b.w / 2 - a.x - a.w / 2,
    dy = b.y + b.h / 2 - a.y - a.h / 2;
  const fromSide =
    edge.fromSide ||
    (Math.abs(dx) > Math.abs(dy)
      ? dx > 0
        ? "right"
        : "left"
      : dy > 0
        ? "bottom"
        : "top");
  const toSide =
    edge.toSide ||
    { top: "bottom", bottom: "top", right: "left", left: "right" }[fromSide];
  const p = port(a, fromSide),
    q = port(b, toSide),
    length = Math.max(40, Math.min(240, Math.hypot(q.x - p.x, q.y - p.y) / 2));
  const vector = { top: [0, -1], bottom: [0, 1], left: [-1, 0], right: [1, 0] };
  const u = {
    x: p.x + vector[fromSide][0] * length,
    y: p.y + vector[fromSide][1] * length,
  };
  const v = {
    x: q.x + vector[toSide][0] * length,
    y: q.y + vector[toSide][1] * length,
  };
  let d = `M${p.x},${p.y}`;
  if (edge.routing === "straight") d += ` L${q.x},${q.y}`;
  else if (edge.routing === "elbow") {
    const horizontal = ["left", "right"].includes(fromSide),
      endHorizontal = ["left", "right"].includes(toSide);
    if (horizontal && endHorizontal)
      d += ` H${(p.x + q.x) / 2} V${q.y} H${q.x}`;
    else if (!horizontal && !endHorizontal)
      d += ` V${(p.y + q.y) / 2} H${q.x} V${q.y}`;
    else if (horizontal) d += ` H${q.x} V${q.y}`;
    else d += ` V${q.y} H${q.x}`;
  } else d += ` C${u.x},${u.y} ${v.x},${v.y} ${q.x},${q.y}`;
  return { d, x: (p.x + q.x) / 2, y: (p.y + q.y) / 2, p, q };
}
export function frameParents(nodes) {
  const frames = nodes.filter((n) => n.type === "frame"),
    byId = new Map(nodes.map((n) => [n.id, n])),
    parents = new Map();
  // Explicit nesting wins. Spatial containment supports groups created by Obsidian.
  for (const n of nodes) {
    if (n.frame && byId.get(n.frame)?.type === "frame") {
      parents.set(n.id, n.frame);
      continue;
    }
    let parent = null;
    for (const f of frames)
      if (
        f.id !== n.id &&
        f.w * f.h > n.w * n.h &&
        n.x >= f.x &&
        n.y >= f.y &&
        n.x + n.w <= f.x + f.w &&
        n.y + n.h <= f.y + f.h &&
        (!parent || f.w * f.h < parent.w * parent.h)
      )
        parent = f;
    if (parent) parents.set(n.id, parent.id);
  }
  return parents;
}
export function hiddenByFrame(nodes, parents) {
  const byId = new Map(nodes.map((n) => [n.id, n])),
    hidden = new Set();
  for (const n of nodes) {
    let p = parents.get(n.id);
    const seen = new Set([n.id]);
    while (p && !seen.has(p)) {
      seen.add(p);
      if (byId.get(p)?.collapsed) {
        hidden.add(n.id);
        break;
      }
      p = parents.get(p);
    }
  }
  return hidden;
}
export function intersects(n, rect) {
  return (
    n.x + n.w >= rect.x &&
    n.y + n.h >= rect.y &&
    n.x <= rect.x + rect.w &&
    n.y <= rect.y + rect.h
  );
}
export function bounds(nodes) {
  if (!nodes.length) return { x: 0, y: 0, w: 800, h: 500 };
  let x = Infinity,
    y = Infinity,
    right = -Infinity,
    bottom = -Infinity;
  for (const n of nodes) {
    x = Math.min(x, n.x);
    y = Math.min(y, n.y);
    right = Math.max(right, n.x + n.w);
    bottom = Math.max(bottom, n.y + n.h);
  }
  return { x, y, w: right - x, h: bottom - y };
}
