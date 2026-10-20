import {orthogonalRoute} from "./orthogonal-route.js";
import { throughPoints } from "./connector-path.js";
export const sides = ["top", "right", "bottom", "left"];
export function port(n, side) {
  const p = {
    x: n.x + (side === "left" ? 0 : side === "right" ? n.w : n.w / 2),
    y: n.y + (side === "top" ? 0 : side === "bottom" ? n.h : n.h / 2),
  };
  if (!n.rotation) return p;
  const a = (n.rotation * Math.PI) / 180,
    cx = n.x + n.w / 2,
    cy = n.y + n.h / 2,
    dx = p.x - cx,
    dy = p.y - cy;
  return {
    x: cx + dx * Math.cos(a) - dy * Math.sin(a),
    y: cy + dx * Math.sin(a) + dy * Math.cos(a),
  };
}
export function routeEdge(edge, a, b, obstacles = null) {
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
    { top: "bottom", bottom: "top", right: "left", left: "right" }[
      Math.abs(dx) > Math.abs(dy)
        ? dx > 0
          ? "right"
          : "left"
        : dy > 0
          ? "bottom"
          : "top"
    ];
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
  if(obstacles && edge.routing === "elbow" && !edge.bends?.length && !a.rotation && !b.rotation) {
    if(edge.planRelation === "parent" && toSide === "left") q.y=b.y+b.h*.25;
    const route=orthogonalRoute(p,q,fromSide,toSide,obstacles,a.id,b.id);
    if(route)return {d:throughPoints(route.points),...route,p,q};
  }
  // Generated project plans keep their relationship arrows outside the cards,
  // including when a child is only slightly indented from its parent.
  if (
    edge.planRelation &&
    edge.routing === "elbow" &&
    !edge.bends?.length &&
    !a.rotation &&
    !b.rotation
  ) {
    let points, label;
    if (
      edge.planRelation === "parent" &&
      fromSide === "bottom" &&
      toSide === "left"
    ) {
      q.y = b.y + b.h * 0.25;
      const left = q.x - p.x >= 48 && b.y >= a.y + a.h + 36
          ? q.x - 24
          : Math.min(a.x, b.x) - 24,
        gap = a.y + a.h + 18;
      points = [
        p,
        { x: p.x, y: gap },
        { x: left, y: gap },
        { x: left, y: q.y },
        q,
      ];
      label = { x: (p.x + left) / 2, y: gap };
    } else if (
      edge.planRelation === "dependency" &&
      fromSide === "right" &&
      toSide === "left"
    ) {
      // Use the space between columns whenever the target is to the right.
      // The outside detour is only needed for indented or backward links.
      if (q.x - p.x >= 48) {
        const middle = (p.x + q.x) / 2;
        points =
          p.y === q.y
            ? [p, q]
            : [p, { x: middle, y: p.y }, { x: middle, y: q.y }, q];
        label = { x: middle, y: (p.y + q.y) / 2 };
        return { d: throughPoints(points), points, ...label, p, q };
      }
      const right = Math.max(a.x + a.w, b.x + b.w) + 32,
        left = b.x - 24;
      const gap = b.y > a.y ? b.y - 18 : b.y + b.h + 18;
      points = [
        p,
        { x: right, y: p.y },
        { x: right, y: gap },
        { x: left, y: gap },
        { x: left, y: q.y },
        q,
      ];
      label = { x: (right + left) / 2, y: gap };
    }
    if (points) return { d: throughPoints(points), points, ...label, p, q };
  }
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
  let points = [p, q];
  if (edge.bends?.length) {
    points = [p, ...edge.bends, q];
    if (edge.routing === "elbow")
      points = points.flatMap((v, i) =>
        i ? [{ x: v.x, y: points[i - 1].y }, v] : [v],
      );
    d = throughPoints(points, !["straight", "elbow"].includes(edge.routing));
  } else if (edge.routing === "elbow") {
    const horizontal = ["left", "right"].includes(fromSide),
      endHorizontal = ["left", "right"].includes(toSide);
    points =
      horizontal && endHorizontal
        ? [p, { x: (p.x + q.x) / 2, y: p.y }, { x: (p.x + q.x) / 2, y: q.y }, q]
        : !horizontal && !endHorizontal
          ? [
              p,
              { x: p.x, y: (p.y + q.y) / 2 },
              { x: q.x, y: (p.y + q.y) / 2 },
              q,
            ]
          : horizontal
            ? [p, { x: q.x, y: p.y }, q]
            : [p, { x: p.x, y: q.y }, q];
  }
  return { d, points, x: (p.x + q.x) / 2, y: (p.y + q.y) / 2, p, q };
}
export function frameParents(nodes) {
  const frames = nodes.filter((n) => n.type === "frame"),
    byId = new Map(nodes.map((n) => [n.id, n])),
    parents = new Map();
  // Explicit nesting wins. Spatial containment supports groups created by Obsidian.
  for (const n of nodes) {
    if (n.frame && ["frame", "grid"].includes(byId.get(n.frame)?.type)) {
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
    if (n.layerHidden) hidden.add(n.id);
    let p = parents.get(n.id);
    const seen = new Set([n.id]);
    while (p && !seen.has(p)) {
      seen.add(p);
      if (byId.get(p)?.collapsed || byId.get(p)?.layerHidden) {
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
