import { frameParents, hiddenByFrame } from "./canvas-geometry.js";
import { nodeMinimum, resizedNode, visualNodeType } from "./node-layout.js";

const box = (n) => ({ ...n, h: n.collapsed ? 48 : n.h });
export function alignmentTargets(nodes, movingIds) {
  const parents = frameParents(nodes),
    hidden = hiddenByFrame(nodes, parents);
  const exclude = new Set(movingIds);
  for (const id of movingIds) {
    const seen = new Set([id]);
    let parent = parents.get(id);
    while (parent && !seen.has(parent)) {
      seen.add(parent);
      exclude.add(parent);
      parent = parents.get(parent);
    }
  }
  return nodes.filter((n) => !exclude.has(n.id) && !hidden.has(n.id)).map(box);
}
const separation = (a, b, axis, size) =>
  Math.max(0, a[axis] - b[axis] - b[size], b[axis] - a[axis] - a[size]);
const overlap = (a, b, axis, size) =>
  Math.min(a[axis] + a[size], b[axis] + b[size]) - Math.max(a[axis], b[axis]);

// All thresholds are screen pixels. Return one shared translation for the whole
// selection so grid rounding and object snapping cannot distort group spacing.
export function snapTranslation(
  moving,
  targets,
  dx,
  dy,
  {
    zoom = 1,
    grid = false,
    align = true,
    previous = {},
    primary = moving[0],
  } = {},
) {
  const visible = moving.map(box);
  const origin = {
    x: Math.min(...visible.map((n) => n.x)),
    y: Math.min(...visible.map((n) => n.y)),
  };
  origin.w = Math.max(...visible.map((n) => n.x + n.w)) - origin.x;
  origin.h = Math.max(...visible.map((n) => n.y + n.h)) - origin.y;
  const raw = { ...origin, x: origin.x + dx, y: origin.y + dy };
  const result = {
    dx:
      (grid
        ? Math.round((primary.x + dx) / 20) * 20
        : Math.round(primary.x + dx)) - primary.x,
    dy:
      (grid
        ? Math.round((primary.y + dy) / 20) * 20
        : Math.round(primary.y + dy)) - primary.y,
    guides: [],
    locks: {},
  };
  if (!align) return result;
  const distance = (n) =>
    Math.hypot(separation(raw, n, "x", "w"), separation(raw, n, "y", "h"));
  const nearby = targets
    .map((n) => ({ n, distance: distance(n) }))
    .filter((t) => t.distance * zoom <= 240)
    .sort((a, b) => a.distance - b.distance || a.n.id.localeCompare(b.n.id))
    .slice(0, 64)
    .map((t) => t.n);
  const chosen = {};
  for (const [axis, size, cross, crossSize] of [
    ["x", "w", "y", "h"],
    ["y", "h", "x", "w"],
  ]) {
    const options = [];
    for (const target of nearby) {
      for (const anchor of [0, 0.5, 1])
        for (const targetAnchor of [0, 0.5, 1]) {
          const value = target[axis] + target[size] * targetAnchor;
          options.push({
            key: `${target.id}:${anchor}:${targetAnchor}`,
            kind: "align",
            target,
            value,
            position: value - raw[size] * anchor,
            priority:
              (anchor === targetAnchor ? 0 : 2) +
              (anchor === 0.5 ? 0 : 0.1) +
              (target.type === primary.type ? 0 : 0.2),
          });
        }
    }
    // Consecutive, non-overlapping neighbours in the same row/column provide
    // repeatable gaps, including placing an object halfway between two others.
    const lane = nearby
      .filter(
        (n) =>
          n.type !== "frame" &&
          overlap(raw, n, cross, crossSize) >=
            Math.min(raw[crossSize], n[crossSize]) * 0.25,
      )
      .sort((a, b) => a[axis] - b[axis]);
    for (let i = 0; i < lane.length - 1; i++) {
      const a = lane[i],
        b = lane[i + 1],
        gap = b[axis] - a[axis] - a[size];
      if (gap < 0 || overlap(a, b, cross, crossSize) <= 0) continue;
      const placements = [
        ["before", a[axis] - gap - raw[size]],
        ["after", b[axis] + b[size] + gap],
      ];
      if (gap >= raw[size])
        placements.push(["between", a[axis] + a[size] + (gap - raw[size]) / 2]);
      for (const [placement, position] of placements) {
        const spacing = placement === "between" ? (gap - raw[size]) / 2 : gap;
        if (spacing <= 0 || spacing * zoom > 240) continue;
        options.push({
          key: `gap:${a.id}:${b.id}:${placement}`,
          kind: "gap",
          a,
          b,
          placement,
          position,
          priority: 1,
        });
      }
    }
    const delta = (o) => Math.abs(o.position - raw[axis]) * zoom;
    const sticky =
      previous[axis] &&
      options.find((o) => o.key === previous[axis] && delta(o) <= 10);
    const best =
      sticky ||
      options
        .filter((o) => delta(o) <= 6)
        .sort(
          (a, b) =>
            delta(a) - delta(b) ||
            a.priority - b.priority ||
            a.key.localeCompare(b.key),
        )[0];
    if (!best) continue;
    chosen[axis] = best;
    result[axis === "x" ? "dx" : "dy"] = best.position - origin[axis];
    result.locks[axis] = best.key;
  }
  const final = { ...raw, x: origin.x + result.dx, y: origin.y + result.dy };
  for (const [axis, size, cross, crossSize] of [
    ["x", "w", "y", "h"],
    ["y", "h", "x", "w"],
  ]) {
    const match = chosen[axis];
    if (!match) continue;
    if (match.kind === "align")
      result.guides.push({
        kind: "align",
        axis,
        value: match.value,
        start: Math.min(final[cross], match.target[cross]) - 12 / zoom,
        end:
          Math.max(
            final[cross] + final[crossSize],
            match.target[cross] + match.target[crossSize],
          ) +
          12 / zoom,
      });
    else {
      const row = [final, match.a, match.b].sort((a, b) => a[axis] - b[axis]);
      const level = Math.min(...row.map((n) => n[cross])) - 16 / zoom;
      for (let i = 0; i < 2; i++)
        result.guides.push({
          kind: "gap",
          axis: cross,
          value: level,
          start: row[i][axis] + row[i][size],
          end: row[i + 1][axis],
          label: Math.round(row[i + 1][axis] - row[i][axis] - row[i][size]),
        });
    }
  }
  return result;
}

// Match dimensions in screen space, independently of grid snapping. Keep a
// match slightly beyond its acquisition radius to avoid flickering at the edge.
export function snapResize(
  node,
  original,
  targets,
  dx,
  dy,
  {
    zoom = 1,
    grid = false,
    align = true,
    axis = null,
    previous = {},
    corner = "se",
  } = {},
) {
  const west = corner.includes("w"),
    north = corner.includes("n");
  dx *= west ? -1 : 1;
  dy *= north ? -1 : 1;
  const anchor = (size) => ({
    x: west ? original.x + original.w - size.w : original.x,
    y: north ? original.y + original.h - size.h : original.y,
  });
  const result = {
    ...resizedNode(node, original, dx, dy, { axis, snap: grid }),
    guides: [],
    locks: {},
  };
  Object.assign(result, anchor(result));
  if (!align) return result;
  const min = nodeMinimum(node);
  const raw = {
    ...original,
    w:
      axis === "y"
        ? original.w
        : Math.max(min.w, Math.min(100000, original.w + dx)),
    h:
      axis === "x"
        ? original.h
        : Math.max(min.h, Math.min(100000, original.h + dy)),
  };
  Object.assign(raw, anchor(raw));
  const nearby = targets
    .filter((target) => target.id !== node.id && !target.collapsed)
    .map((target) => ({
      target,
      distance:
        Math.hypot(
          separation(raw, target, "x", "w"),
          separation(raw, target, "y", "h"),
        ) * zoom,
    }))
    .filter(({ distance }) => distance <= 240)
    .sort(
      (a, b) =>
        a.distance - b.distance || a.target.id.localeCompare(b.target.id),
    )
    .slice(0, 64);
  for (const [size, direction] of [
    ["w", "x"],
    ["h", "y"],
  ]) {
    if (axis && axis !== direction) continue;
    const options = nearby.filter(
      ({ target }) => target[size] >= min[size] && target[size] <= 100000,
    );
    const delta = ({ target }) => Math.abs(target[size] - raw[size]) * zoom;
    const match =
      options.find((o) => o.target.id === previous[size] && delta(o) <= 10) ||
      options
        .filter((o) => delta(o) <= 6)
        .sort(
          (a, b) =>
            delta(a) - delta(b) ||
            Number(visualNodeType(a.target) !== visualNodeType(node)) -
              Number(visualNodeType(b.target) !== visualNodeType(node)) ||
            a.distance - b.distance ||
            a.target.id.localeCompare(b.target.id),
        )[0];
    if (!match) continue;
    result[size] = match.target[size];
    result.locks[size] = match.target.id;
  }
  Object.assign(result, anchor(result));
  for (const size of ["w", "h"]) {
    const target = nearby.find(
      (o) => o.target.id === result.locks[size],
    )?.target;
    if (!target) continue;
    for (const n of [{ ...original, ...result }, target])
      result.guides.push({
        kind: "size",
        axis: size === "w" ? "y" : "x",
        value: (size === "w" ? n.y : n.x) - 16 / zoom,
        start: size === "w" ? n.x : n.y,
        end: size === "w" ? n.x + n.w : n.y + n.h,
        label: `${size === "w" ? "W" : "H"} ${Math.round(n[size])}`,
      });
  }
  return result;
}

export function paintAlignmentGuides(canvas, guides, camera) {
  let layer = canvas.querySelector(".alignment-guides");
  if (!guides.length) {
    layer?.remove();
    return;
  }
  if (!layer) {
    layer = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    layer.classList.add("alignment-guides");
    layer.setAttribute("aria-hidden", "true");
    canvas.append(layer);
  }
  const { x, y, z } = camera;
  layer.innerHTML = guides
    .map((g) => {
      const vertical = g.axis === "x",
        a = g.value * z + (vertical ? x : y),
        b = g.start * z + (vertical ? y : x),
        c = g.end * z + (vertical ? y : x);
      const line = vertical ? `M${a},${b}V${c}` : `M${b},${a}H${c}`;
      const caps = vertical
        ? `M${a - 4},${b}h8M${a - 4},${c}h8`
        : `M${b},${a - 4}v8M${c},${a - 4}v8`;
      const outsideLabel = vertical && g.kind === "size";
      return `<g class="guide-${g.kind}"><path d="${line}"/><path d="${caps}"/>${g.label !== undefined ? `<text x="${vertical ? a + (outsideLabel ? -8 : 8) : (b + c) / 2}" y="${vertical ? (b + c) / 2 : a - 6}" text-anchor="${vertical ? (outsideLabel ? "end" : "start") : "middle"}">${g.label}</text>` : ""}</g>`;
    })
    .join("");
}
