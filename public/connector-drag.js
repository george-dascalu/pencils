import { port, sides, routeEdge } from "./canvas-geometry.js";

// Screen-space thresholds keep targets equally forgiving at every zoom level.
export function connectorTarget(
  point,
  nodes,
  { from, hidden = new Set(), zoom = 1, bypass = false } = {},
) {
  const nearby = [];
  for (const node of nodes) {
    if (node.id === from || node.locked || hidden.has(node.id)) continue;
    const n = node.collapsed ? { ...node, h: 48 } : node;
    const gap =
      Math.hypot(
        Math.max(n.x - point.x, 0, point.x - n.x - n.w),
        Math.max(n.y - point.y, 0, point.y - n.y - n.h),
      ) * zoom;
    if (gap > 44) continue;
    const ports = sides.map((side) => ({ side, point: port(n, side) }));
    const nearest = ports.sort(
      (a, b) =>
        Math.hypot(a.point.x - point.x, a.point.y - point.y) -
        Math.hypot(b.point.x - point.x, b.point.y - point.y),
    )[0];
    nearby.push({
      node: n,
      gap,
      side: nearest.side,
      distance:
        Math.hypot(nearest.point.x - point.x, nearest.point.y - point.y) * zoom,
    });
  }
  nearby.sort(
    (a, b) => a.gap - b.gap || a.node.w * a.node.h - b.node.w * b.node.h,
  );
  const eligible = nearby.filter((n) => n.gap === 0 || n.distance <= 20);
  // A precise side target wins over the body of a surrounding frame.
  eligible.sort(
    (a, b) =>
      Number(b.distance <= 20) - Number(a.distance <= 20) ||
      a.gap - b.gap ||
      a.node.w * a.node.h - b.node.w * b.node.h,
  );
  return {
    nearby: nearby.slice(0, 6),
    target: bypass ? null : eligible[0] || null,
  };
}

export function connectorPreview(
  source,
  fromSide,
  point,
  target,
  edge = {},
  movingEnd = "to",
) {
  const end = target?.node || { ...point, w: 0, h: 0 };
  const options = {
    ...edge,
    routing: edge.routing || "curve",
    fromSide,
    toSide: target && target.distance <= 20 ? target.side : undefined,
  };
  return movingEnd === "from"
    ? routeEdge(
        {
          ...options,
          fromSide: target && target.distance <= 20 ? target.side : undefined,
          toSide: fromSide,
        },
        end,
        source,
      )
    : routeEdge(options, source, end);
}
