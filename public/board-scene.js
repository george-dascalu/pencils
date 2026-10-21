import { SpatialIndex, objectBounds } from './spatial-index.js';
import { bounds, routeEdge, frameParents, hiddenByFrame } from './canvas-geometry.js';
import { palette } from './canvas-format.js';

// Geometry lives in document coordinates and is invalidated by edits, never by
// the camera. Both DOM detail and the bitmap overview query these same indexes.
export function boardScene(board, presenting = false) {
  const nodes = new Map(board.nodes.map(n => [n.id, n]));
  const spatial = new SpatialIndex(board.nodes, objectBounds);
  const parents = frameParents(board.nodes);
  const hidden = presenting ? new Set() : hiddenByFrame(board.nodes, parents);
  const effective = id => {
    let n = nodes.get(id); const seen = new Set();
    while (n && hidden.has(n.id) && !seen.has(n.id)) {
      seen.add(n.id); n = nodes.get(parents.get(n.id));
    }
    return n?.collapsed && !presenting ? { ...n, h: 48 } : n;
  };
  const entries = [];
  for (const edge of board.edges) {
    const a = effective(edge.from), b = effective(edge.to);
    if (!a || !b || a.id === b.id) continue;
    const r = bounds([a, b, ...(edge.bends || []).map(p => ({ ...p, w: 0, h: 0 }))]);
    entries.push({ id: edge.id, edge, a, b, x: r.x - 520, y: r.y - 520, w: r.w + 1040, h: r.h + 1040 });
  }
  const edges = new SpatialIndex(entries);
  const routes = new Map();
  function route(entry, exact = true) {
    const key = `${entry.id}:${exact}`;
    if (!routes.has(key)) {
      const obstacles = exact ? spatial.search(entry) : null;
      routes.set(key, routeEdge(entry.edge, entry.a, entry.b, obstacles));
      // A bounded cache avoids retaining a Path2D for every object on huge boards.
      if (routes.size > 4000) routes.delete(routes.keys().next().value);
    }
    return routes.get(key);
  }
  return { nodes, spatial, parents, hidden, effective, edges, route, box: bounds(board.nodes) };
}

// Low-detail connectors share paths by colour/width; no per-edge DOM or marker
// trees. Selected connectors always use the complete SVG editor above this layer.
export function paintOverviewEdges(g, entries, scene, camera) {
  const groups = new Map();
  const simple = camera.z < 0.12 || entries.length > 2000;
  for (const entry of entries) {
    const e = entry.edge, color = palette[e.color] || e.color || '#78906f';
    const key = `${color}:${e.width || 2}:${e.lineStyle || ''}`;
    if (!groups.has(key)) groups.set(key, { color, width: e.width || 2, dash: e.lineStyle, path: new Path2D() });
    const group = groups.get(key);
    if (simple) {
      group.path.moveTo(entry.a.x + entry.a.w / 2, entry.a.y + entry.a.h / 2);
      group.path.lineTo(entry.b.x + entry.b.w / 2, entry.b.y + entry.b.h / 2);
    } else {
      const p = scene.route(entry, false);
      p.bitmap ||= new Path2D(p.d);
      group.path.addPath(p.bitmap);
    }
  }
  g.save(); g.translate(camera.x, camera.y); g.scale(camera.z, camera.z);
  for (const { color, width, dash, path } of groups.values()) {
    g.strokeStyle = color; g.lineWidth = Math.max(width, 0.5 / camera.z);
    g.setLineDash(dash === 'dashed' ? [8, 5] : dash === 'dotted' ? [1, 5] : []);
    g.stroke(path);
  }
  g.restore();
}
