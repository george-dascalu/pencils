import { intersects } from "./canvas-geometry.js";

// Separate entry/exit thresholds prevent repeated teardown near a zoom boundary.
export function detailLevel() {
  let identity, level;
  return (key, zoom) => {
    if (identity !== key) {
      identity = key;
      level = zoom < 0.12 ? 0 : zoom < 0.4 ? 1 : 2;
    } else if (zoom <= 0.105) level = 0;
    else if (zoom >= 0.42) level = 2;
    else if (level === 0 && zoom >= 0.14) level = 1;
    else if (level === 2 && zoom < 0.36) level = 1;
    return level;
  };
}

export function viewportRect(camera, width, height, margin = 0) {
  return {
    x: (-camera.x - margin) / camera.z,
    y: (-camera.y - margin) / camera.z,
    w: (width + margin * 2) / camera.z,
    h: (height + margin * 2) / camera.z,
  };
}

// Keep visible cards stable, preload neighbours, and retain recently seen cards
// during reversals. Detail is bounded without switching the whole board to bitmap.
export function viewportCache({ budget = 650, grace = 1200 } = {}) {
  let identity = null,
    retained = new Map();
  return {
    choose(
      nodes,
      {
        key,
        camera,
        width,
        height,
        selected = new Set(),
        hidden = new Set(),
        now,
        spatial = null,
        detailBudget = budget,
      },
    ) {
      if (key !== identity) {
        identity = key;
        retained.clear();
      }
      if (!detailBudget) { retained.clear(); return []; }
      const margin = Math.max(
        400,
        Math.min(900, Math.max(width, height) * 0.65),
      );
      const viewport = viewportRect(camera, width, height);
      const preload = viewportRect(camera, width, height, margin);
      const keep = viewportRect(camera, width, height, margin + 400);
      const centre = {
        x: viewport.x + viewport.w / 2,
        y: viewport.y + viewport.h / 2,
      };
      const candidates = [];
      const pool = spatial ? new Map(spatial.search(preload).map(n => [n.id, n])) : null;
      if (pool) for (const id of new Set([...selected, ...retained.keys()])) {
        const n = spatial.byId.get(id)?.item; if (n) pool.set(id, n);
      }
      for (const n of pool ? pool.values() : nodes) {
        if (hidden.has(n.id)) continue;
        const old = retained.get(n.id),
          near = intersects(n, preload),
          onScreen = intersects(n, viewport);
        if (
          !selected.has(n.id) &&
          !near &&
          !(old != null && (intersects(n, keep) || now - old < grace))
        )
          continue;
        candidates.push({
          n,
          seen: near ? now : (old ?? now),
          priority: selected.has(n.id)
            ? 0
            : onScreen
              ? old != null
                ? 1
                : 2
              : near
                ? old != null
                  ? 3
                  : 4
                : 5,
          distance: Math.hypot(
            n.x + n.w / 2 - centre.x,
            n.y + n.h / 2 - centre.y,
          ),
        });
      }
      candidates.sort(
        (a, b) => a.priority - b.priority || a.distance - b.distance,
      );
      const chosen = candidates.slice(0, detailBudget);
      retained = new Map(chosen.map(({ n, seen }) => [n.id, seen]));
      // Preserve board stacking order, including overlapping frames and grids.
      return spatial ? chosen.map(c => c.n).sort((a,b) => spatial.order(a) - spatial.order(b)) : nodes.filter((n) => retained.has(n.id));
    },
  };
}
