import { cellAt, cellBounds, gridTracks } from "./grid-model.js";
import { bounds, frameParents, hiddenByFrame } from "./canvas-geometry.js";
import { SpatialIndex } from "./spatial-index.js";

export const framePresets = [
  { id: "wide", label: "Presentation · 16:9", w: 960, h: 540 },
  { id: "standard", label: "Presentation · 4:3", w: 800, h: 600 },
  { id: "square", label: "Square · 1:1", w: 600, h: 600 },
  { id: "portrait", label: "Portrait · 9:16", w: 540, h: 960 },
  { id: "a4", label: "A4 landscape", w: 842, h: 595 },
];
export const contains = (frame, node) =>
  frame.id !== node.id &&
  frame.w * frame.h > node.w * node.h &&
  node.x >= frame.x &&
  node.y >= frame.y &&
  node.x + node.w <= frame.x + frame.w &&
  node.y + node.h <= frame.y + frame.h;

export function withFrameContents(
  nodes,
  selection,
  parents = frameParents(nodes),
) {
  const ids = new Set(selection.map((n) => n.id));
  return nodes.filter((n) => {
    let id = n.id;
    const seen = new Set();
    while (id && !seen.has(id)) {
      if (ids.has(id)) return true;
      seen.add(id);
      id = parents.get(id);
    }
    return false;
  });
}
export function frameContents(nodes, frame, parents) {
  return withFrameContents(nodes, [frame], parents).filter(
    (n) => n.id !== frame.id,
  );
}
// Resize the container only. Contents retain their exact positions and sizes.
export function fitFrame(nodes, frame, padding = 40) {
  const contents = frameContents(nodes, frame);
  if (!contents.length) return false;
  const box = bounds(contents);
  Object.assign(frame, {
    x: box.x - padding,
    y: box.y - padding - 24,
    w: Math.max(160, box.w + padding * 2),
    h: Math.max(100, box.h + padding * 2 + 24),
  });
  return true;
}
export function adoptFrameContents(nodes, frame) {
  for (const n of nodes)
    if (n.frame === frame.id && !contains(frame, n)) delete n.frame;
  const parents = frameParents(nodes);
  for (const n of nodes) {
    if (!contains(frame, n)) continue;
    const parent = nodes.find((f) => f.id === parents.get(n.id));
    if (parent?.type === "grid") continue;
    if (!parent || parent.id === frame.id || !contains(frame, parent)) {
      n.frame = frame.id;
      delete n.gridCell;
    }
  }
}
// Dragging an object out of a frame detaches it; children carried by a moving
// parent keep their relationship. This also prevents nesting a frame in itself.
export function updateFrameMembership(
  nodes,
  movingIds,
  previousNodes,
  { adopt = true, adoptNewFrames = true } = {},
) {
  const parents = frameParents(previousNodes);
  const byId = new Map(nodes.map(n => [n.id, n]));
  const previous = new Map(previousNodes.map(n => [n.id, n]));
  const frames = new SpatialIndex(nodes.filter(n => n.type === "frame"));
  const hasGrids = nodes.some(n => n.type === "grid");
  for (const n of nodes.filter((n) => movingIds.has(n.id))) {
    let parent = n.frame || parents.get(n.id),
      carried = false;
    const seen = new Set([n.id]);
    while (parent && !seen.has(parent)) {
      if (movingIds.has(parent)) {
        carried = true;
        break;
      }
      seen.add(parent);
      parent = byId.get(parent)?.frame || parents.get(parent);
    }
    if (carried) continue;
    const placedCell =
      !previous.has(n.id) &&
      n.gridCell &&
      (byId.get(n.frame)?.type === "grid" ? byId.get(n.frame) : null);
    const explicitTarget = placedCell
      ? { grid: placedCell, cell: n.gridCell }
      : null;
    delete n.frame;
    delete n.gridCell;
    // Copied containers keep their copied children. Overlapping their source
    // is not a deliberate drop into a grid; explicit drags can still nest them.
    const cellTarget =
      !hasGrids || (!previous.has(n.id) && (n.type === "grid" || (n.type === "frame" && !adoptNewFrames)))
        ? null
        : explicitTarget || gridDropTarget(nodes, n, movingIds);
    if (
      cellTarget &&
      (cellTarget.grid.grid.resizeMode !== "manual" ||
        (() => {
          const box = cellBounds(
            cellTarget.grid,
            cellTarget.cell.row,
            cellTarget.cell.column,
          );
          return n.w + 32 <= box.w && n.h + 32 <= box.h;
        })())
    ) {
      n.frame = cellTarget.grid.id;
      n.gridCell = cellTarget.cell;
      reflowGridContents(nodes, cellTarget.grid, structuredClone(nodes));
      continue;
    }
    const target = frames.search(n)
      .filter(
        (f) =>
          f.type === "frame" &&
          !f.collapsed &&
          !movingIds.has(f.id) &&
          contains(f, n),
      )
      .sort((a, b) => a.w * a.h - b.w * b.h)[0];
    if (target) n.frame = target.id;
    if (adopt && n.type === "frame" && (adoptNewFrames || previous.has(n.id))) adoptFrameContents(nodes, n);
  }
}
export function frameSlides(board) {
  const parents = frameParents(board.nodes);
  const roots = board.nodes.filter(
    (n) => n.type === "frame" && !parents.has(n.id),
  );
  const ids = new Set(roots.map((n) => n.id));
  return [...new Set([...(board.presentation || []), ...ids])].filter((id) =>
    ids.has(id),
  );
}
export function orderedFrames(board) {
  const ids = frameSlides(board),
    map = new Map(board.nodes.map((n) => [n.id, n]));
  return ids.map((id) => map.get(id));
}
export function reorderFrame(board, id, targetId) {
  const ids = frameSlides(board),
    from = ids.indexOf(id),
    to = ids.indexOf(targetId);
  if (from < 0 || to < 0 || from === to) return false;
  ids.splice(from, 1);
  ids.splice(to, 0, id);
  board.presentation = ids;
  return true;
}

export function frameDepth(id, parents) {
  let depth = 0;
  const seen = new Set([id]);
  while (parents.has(id) && !seen.has(parents.get(id))) {
    id = parents.get(id);
    seen.add(id);
    depth++;
  }
  return depth;
}
export function framePaintOrder(nodes) {
  const parents = frameParents(nodes);
  return [...nodes].sort(
    (a, b) =>
      (["frame", "grid"].includes(a.type) ? frameDepth(a.id, parents) : Number.MAX_SAFE_INTEGER) -
      (["frame", "grid"].includes(b.type) ? frameDepth(b.id, parents) : Number.MAX_SAFE_INTEGER),
  );
}

// Grid cells use the same parent chain as frames so movement, duplication and
// collapse work through arbitrarily nested containers.
export function gridDropTarget(nodes, node, movingIds = new Set([node.id])) {
  const x = node.x + node.w / 2, y = node.y + node.h / 2;
  // Most pasted roots are nowhere near a grid. Avoid rebuilding the entire
  // parent/visibility graph for every one of those objects.
  const candidates = nodes.filter(g => g.type === "grid" && !g.locked &&
    !movingIds.has(g.id) && x >= g.x && x <= g.x + g.w && y >= g.y && y <= g.y + g.h);
  if (!candidates.length) return null;
  const parents = frameParents(nodes),
    hidden = hiddenByFrame(nodes, parents);
  return candidates
    .filter(g => !hidden.has(g.id))
    .sort((a, b) => a.w * a.h - b.w * b.h)
    .map((grid) => {
      let p = grid.id;
      const seen = new Set();
      while (p && !seen.has(p)) {
        if (p === node.id) return null;
        seen.add(p);
        p = parents.get(p);
      }
      const cell = cellAt(grid, node.x + node.w / 2, node.y + node.h / 2);
      return cell ? { grid, cell } : null;
    })
    .find(Boolean);
}
export function reflowGridContents(
  nodes,
  grid,
  previousNodes,
  mapCell = (c) => c,
) {
  const oldGrid = previousNodes.find((n) => n.id === grid.id);
  if (!oldGrid?.grid) return;
  const previous = new Map(previousNodes.map((n) => [n.id, n]));
  const children = nodes.filter((n) => n.frame === grid.id && n.gridCell);
  const entries = [];
  for (const child of children) {
    const old = previous.get(child.id) || child;
    const cell = mapCell({ ...old.gridCell });
    if (!cell || !grid.grid.cells[cell.row]?.[cell.column]) {
      delete child.frame;
      delete child.gridCell;
      continue;
    }
    child.gridCell = cell;
    entries.push({
      child,
      old,
      cell,
      oldBox: cellBounds(oldGrid, old.gridCell.row, old.gridCell.column),
    });
  }
  const tracks = gridTracks(grid);
  for (const { child, cell } of entries) {
    tracks.rows[cell.row] = Math.max(tracks.rows[cell.row], child.h + 32);
    tracks.columns[cell.column] = Math.max(
      tracks.columns[cell.column],
      child.w + 32,
    );
  }
  grid.grid.rows = tracks.rows;
  grid.grid.columns = tracks.columns;
  grid.w = tracks.columns.reduce((a, b) => a + b, 0);
  grid.h = 24 + tracks.rows.reduce((a, b) => a + b, 0);
  for (const { child, old, cell, oldBox } of entries) {
    const box = cellBounds(grid, cell.row, cell.column);
    const x =
      box.x + Math.max(16, Math.min(box.w - child.w - 16, old.x - oldBox.x));
    const y =
      box.y + Math.max(16, Math.min(box.h - child.h - 16, old.y - oldBox.y));
    const dx = x - child.x,
      dy = y - child.y;
    for (const n of withFrameContents(nodes, [child])) {
      n.x += dx;
      n.y += dy;
    }
  }
}
