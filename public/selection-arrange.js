import { bounds, frameParents } from "./canvas-geometry.js";
export const arrangementActions = [
  "align-left",
  "align-center",
  "align-right",
  "align-top",
  "align-middle",
  "align-bottom",
  "distribute",
  "distribute-vertical",
  "bring-front",
  "send-back",
];
export function arrangeSelection(board, nodes, action) {
  const movable = nodes.filter((n) => !n.locked);
  if (!movable.length) return;
  if (["bring-front", "send-back"].includes(action)) {
    const ids = new Set(movable.map((n) => n.id));
    const moved = board.nodes.filter((n) => ids.has(n.id)),
      rest = board.nodes.filter((n) => !ids.has(n.id));
    board.nodes =
      action === "bring-front" ? [...rest, ...moved] : [...moved, ...rest];
    return;
  }
  if (nodes.length < 2) return;
  const before = new Map(board.nodes.map((n) => [n.id, { x: n.x, y: n.y }])),
    parents = frameParents(board.nodes);
  const box = bounds(nodes);
  for (const n of movable) {
    if (action === "align-left") n.x = box.x;
    if (action === "align-center") n.x = (box.x + (box.x + box.w) - n.w) / 2;
    if (action === "align-right") n.x = box.x + box.w - n.w;
    if (action === "align-top") n.y = box.y;
    if (action === "align-middle") n.y = (box.y + (box.y + box.h) - n.h) / 2;
    if (action === "align-bottom") n.y = box.y + box.h - n.h;
  }
  if (
    ["distribute", "distribute-vertical"].includes(action) &&
    movable.length >= 3
  ) {
    const vertical = action === "distribute-vertical",
      axis = vertical ? "y" : "x",
      size = vertical ? "h" : "w";
    const sorted = [...movable].sort((a, b) => a[axis] - b[axis]);
    const start = sorted[0][axis],
      end = Math.max(...sorted.map((n) => n[axis] + n[size]));
    const gap =
      (end - start - sorted.reduce((s, n) => s + n[size], 0)) /
      (sorted.length - 1);
    let at = start;
    for (const n of sorted) {
      n[axis] = at;
      at += n[size] + gap;
    }
  }
  // Moving a frame carries its contents, including nested frames, exactly once.
  const selected = new Set(nodes.map((n) => n.id)),
    byId = new Map(board.nodes.map((n) => [n.id, n]));
  for (const n of board.nodes) {
    if (n.locked || selected.has(n.id)) continue;
    let parent = parents.get(n.id);
    const seen = new Set();
    while (parent && !seen.has(parent)) {
      seen.add(parent);
      if (selected.has(parent)) {
        const frame = byId.get(parent),
          old = before.get(parent);
        n.x += frame.x - old.x;
        n.y += frame.y - old.y;
        break;
      }
      parent = parents.get(parent);
    }
  }
}
