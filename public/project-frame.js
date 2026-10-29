import { randomUUID } from "./uuid.js";
const cardWidth = 340,
  cardHeight = 220,
  columnGap = 100,
  rowGap = 60,
  // The child's left edge sits beyond the parent's bottom-centre port.
  childIndent = cardWidth / 2 + rowGap;
// Project frames own only the cards and connectors they generate. Updating a
// plan never moves unrelated cards or changes the project's relationships.
export function updateProjectFrame(
  board,
  frame,
  tasks,
  title,
  { preservePlacement = false } = {},
) {
  const active = tasks.filter((t) => !t.archived);
  const byId = new Map(active.map((t) => [t.id, t]));
  const children = new Map();
  for (const t of active) {
    const parent = byId.has(t.parent) ? t.parent : null;
    if (!children.has(parent)) children.set(parent, []);
    children.get(parent).push(t);
  }
  const ordered = [],
    seen = new Set();
  function visit(t, depth = 0) {
    if (seen.has(t.id)) return;
    seen.add(t.id);
    ordered.push({ task: t, depth });
    for (const child of children.get(t.id) || []) visit(child, depth + 1);
  }
  for (const t of children.get(null) || []) visit(t);
  for (const t of active) visit(t); // Keep malformed imported trees visible.
  const ranks = new Map();
  function rank(id, visiting = new Set()) {
    if (ranks.has(id)) return ranks.get(id);
    if (visiting.has(id)) return 0;
    visiting.add(id);
    const value = Math.max(
      0,
      ...(byId.get(id)?.dependencies || [])
        .filter((d) => byId.has(d))
        .map((d) => rank(d, visiting) + 1),
    );
    visiting.delete(id);
    ranks.set(id, value);
    return value;
  }
  const owned = board.nodes.filter((n) => n.projectFrameOwner === frame.id);
  const existing = new Map(owned.map((n) => [n.task, n]));
  const heightFor = (task) => typeof existing.get(task.id)?.taskCollapsed === "boolean"
    ? existing.get(task.id).h : cardHeight;
  // Keep each parent/children tree together, but place dependency columns on
  // shared rows instead of giving every task a new row in input order.
  const groups = [];
  for (const entry of ordered) {
    if (!entry.depth) groups.push([]);
    groups.at(-1).push(entry);
  }
  groups.sort((a, b) => rank(a[0].task.id) - rank(b[0].task.id));
  const placed = new Map(),
    occupied = [],
    nodes = [];
  for (const group of groups) {
    const root = group[0].task;
    const x = frame.x + 48 + rank(root.id) * (cardWidth + columnGap);
    const width =
      cardWidth + Math.max(...group.map((entry) => entry.depth)) * childIndent;
    const height = group.reduce((sum, entry) => sum + heightFor(entry.task) + rowGap, -rowGap);
    const prerequisites = (root.dependencies || [])
      .map((id) => placed.get(id))
      .filter(Boolean);
    let y = prerequisites.length
      ? Math.min(...prerequisites.map((n) => n.y))
      : frame.y + 88;
    // Advance past occupied tree blocks; leave room for their connectors.
    for (;;) {
      const collision = occupied.find(
        (box) =>
          x < box.x + box.w + rowGap &&
          x + width + rowGap > box.x &&
          y < box.y + box.h + rowGap &&
          y + height + rowGap > box.y,
      );
      if (!collision) break;
      y = collision.y + collision.h + rowGap;
    }
    occupied.push({ x, y, w: width, h: height });
    let cardY = y;
    group.forEach(({ task, depth }) => {
      const node = {
        ...existing.get(task.id),
        id: existing.get(task.id)?.id || `n-${randomUUID()}`,
        type: "task",
        task: task.id,
        frame: frame.id,
        projectFrameOwner: frame.id,
        x: x + depth * childIndent,
        y: cardY,
        w: cardWidth,
        h: heightFor(task),
      };
      placed.set(task.id, node);
      nodes.push(node);
      cardY += node.h + rowGap;
    });
  }
  const cards = new Map(nodes.map((n) => [n.task, n]));
  if (preservePlacement && existing.size) {
    const planned = new Map(nodes.map((n) => [n.task, { x: n.x, y: n.y }]));
    const kept = [];
    const positioned = new Set(),
      positioning = new Set();
    for (const n of nodes) {
      const old = existing.get(n.task);
      if (old) {
        Object.assign(n, { x: old.x, y: old.y, w: old.w, h: old.h });
        kept.push(n);
        positioned.add(n.task);
      }
    }
    function place(n) {
      if (!n || positioning.has(n.task)) return null;
      if (positioned.has(n.task)) return n;
      positioning.add(n.task);
      const task = byId.get(n.task);
      // Preserve the initial layout's indented parent/child trees. Anchor
      // new trees to actual prerequisite positions, including resized cards.
      const parent = place(cards.get(task.parent));
      if (parent) {
        n.x = parent.x + parent.w / 2 + rowGap;
        n.y =
          parent.y +
          planned.get(n.task).y -
          planned.get(parent.task).y +
          parent.h -
          heightFor(byId.get(parent.task));
      } else {
        const prerequisites = (task.dependencies || [])
          .map((id) => place(cards.get(id)))
          .filter(Boolean);
        if (prerequisites.length) {
          n.x = Math.max(...prerequisites.map((p) => p.x + p.w)) + columnGap;
          n.y = Math.min(...prerequisites.map((p) => p.y));
        }
      }
      for (;;) {
        const hit = kept.find(
          (k) =>
            n.x < k.x + k.w + 40 &&
            n.x + n.w + 40 > k.x &&
            n.y < k.y + k.h + 40 &&
            n.y + n.h + 40 > k.y,
        );
        if (!hit) break;
        n.y = hit.y + hit.h + rowGap;
      }
      kept.push(n);
      positioning.delete(n.task);
      positioned.add(n.task);
      return n;
    }
    for (const n of nodes) place(n);
  }
  const oldEdges = new Map(
    board.edges
      .filter((e) => e.projectFrameOwner === frame.id)
      .map((e) => [`${e.planRelation}:${e.from}:${e.to}`, e]),
  );
  const edges = [];
  function link(from, to, kind, label) {
    const a = cards.get(from),
      b = cards.get(to);
    if (!a || !b || a === b) return;
    const old = oldEdges.get(`${kind}:${a.id}:${b.id}`);
    edges.push({
      id: old?.id || `e-${randomUUID()}`,
      from: a.id,
      to: b.id,
      fromSide: kind === "dependency" ? "right" : "bottom",
      toSide: "left",
      routing: "elbow",
      fromEnd: "none",
      toEnd: "arrow",
      color: "#78906f",
      width: 2,
      lineStyle: "solid",
      label,
      projectFrameOwner: frame.id,
      planRelation: kind,
    });
  }
  for (const t of active) {
    for (const dependency of new Set(t.dependencies || []))
      link(dependency, t.id, "dependency", "blocks");
    if (t.parent) link(t.parent, t.id, "parent", "parent of");
  }
  const removed = new Set(
    owned.filter((n) => !cards.has(n.task)).map((n) => n.id),
  );
  const nextNodes = board.nodes
    .filter((n) => n.projectFrameOwner !== frame.id)
    .concat(nodes);
  const nextEdges = board.edges
    .filter(
      (e) =>
        e.projectFrameOwner !== frame.id &&
        !removed.has(e.from) &&
        !removed.has(e.to),
    )
    .concat(edges);
  const w = Math.max(640, ...nodes.map((n) => n.x + n.w - frame.x + 48));
  const h = Math.max(360, ...nodes.map((n) => n.y + n.h - frame.y + 48));
  if (
    nextNodes.length > 10000 ||
    nextEdges.length > 20000 ||
    w > 100000 ||
    h > 100000 ||
    nodes.some((n) => Math.abs(n.x) > 100000 || Math.abs(n.y) > 100000)
  )
    throw new Error("This project plan exceeds the board size limit.");
  Object.assign(frame, {
    text: title || "Project frame",
    w,
    h,
    collapsed: false,
  });
  board.nodes = nextNodes;
  board.edges = nextEdges;
}
