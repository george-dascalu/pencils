import { BOARD_LIMITS } from "./board-limits.js";
// Shared geometry for board rendering, editing and exports.
export function throughPoints(points, curved = false) {
  let d = `M${points[0].x},${points[0].y}`;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1],
      b = points[i];
    if (!curved) d += ` L${b.x},${b.y}`;
    else {
      const prev = points[Math.max(0, i - 2)],
        next = points[Math.min(points.length - 1, i + 1)];
      d += ` C${a.x + (b.x - prev.x) / 6},${a.y + (b.y - prev.y) / 6} ${b.x - (next.x - a.x) / 6},${b.y - (next.y - a.y) / 6} ${b.x},${b.y}`;
    }
  }
  return d;
}
export function lineJumps(points, otherRoutes, radius = 7) {
  let d = `M${points[0].x},${points[0].y}`;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1],
      b = points[i],
      dx = b.x - a.x,
      dy = b.y - a.y,
      length = Math.hypot(dx, dy);
    const hits = [];
    for (const route of otherRoutes)
      for (let j = 1; j < route.length; j++) {
        const c = route[j - 1],
          e = route[j],
          ex = e.x - c.x,
          ey = e.y - c.y,
          cross = dx * ey - dy * ex;
        if (Math.abs(cross) < 0.001) continue;
        const t = ((c.x - a.x) * ey - (c.y - a.y) * ex) / cross,
          u = ((c.x - a.x) * dy - (c.y - a.y) * dx) / cross;
        if (
          t * length > radius * 2 &&
          (1 - t) * length > radius * 2 &&
          u > 0.01 &&
          u < 0.99
        )
          hits.push(t);
      }
    let previous = -Infinity;
    for (const t of hits.sort((x, y) => x - y)) {
      if ((t - previous) * length < radius * 3) continue;
      const x = a.x + t * dx,
        y = a.y + t * dy,
        ux = dx / length,
        uy = dy / length;
      d += ` L${x - radius * ux},${y - radius * uy} Q${x - radius * 2 * uy},${y + radius * 2 * ux} ${x + radius * ux},${y + radius * uy}`;
      previous = t;
    }
    d += ` L${b.x},${b.y}`;
  }
  return d;
}
export function validConnectorGeometry(e) {
  const point = (p) =>
    p &&
    Number.isFinite(p.x) &&
    Number.isFinite(p.y) &&
    Math.abs(p.x) <= BOARD_LIMITS.coordinate &&
    Math.abs(p.y) <= BOARD_LIMITS.coordinate;
  return (
    (e.bends == null ||
      (Array.isArray(e.bends) &&
        e.bends.length <= 20 &&
        e.bends.every(point))) &&
    (e.labelOffset == null || point(e.labelOffset)) &&
    (e.lineJumps == null || typeof e.lineJumps === "boolean") &&
    (e.labels == null ||
      (Array.isArray(e.labels) &&
        e.labels.length <= 10 &&
        e.labels.every(
          (l) => point(l) && typeof l.text === "string" && l.text.length <= 500,
        )))
  );
}
