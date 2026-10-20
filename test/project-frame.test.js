import test from "node:test";
import assert from "node:assert/strict";
import { updateProjectFrame } from "../public/project-frame.js";
import { encodeCanvas, decodeCanvas } from "../public/canvas-format.js";
import { edgeDependency } from "../public/dependency-model.js";
import { routeEdge } from "../public/canvas-geometry.js";
import { resizeTaskCard } from "../public/task-card-layout.js";

test("nested children and additions to resized parents route forward", () => {
  const frame = { id: "f", type: "frame", x: 0, y: 0, w: 640, h: 360 };
  const board = { nodes: [frame], edges: [] };
  const tasks = [{ id: "root" }, { id: "child", parent: "root" }, { id: "grandchild", parent: "child" }, { id: "sibling", parent: "root" }];
  updateProjectFrame(board, frame, tasks, "Tree");
  for (const obstacles of [null, board.nodes]) {
    for (const edge of board.edges) {
      const a = board.nodes.find(n => n.id === edge.from), b = board.nodes.find(n => n.id === edge.to);
      const route = routeEdge(edge, a, b, obstacles);
      for (let i = 1; i < route.points.length; i++)
        assert.ok(route.points[i].x >= route.points[i - 1].x, "Parent arrows never turn left");
    }
  }
  const root = board.nodes.find(n => n.task === "root");
  root.w = 600;
  updateProjectFrame(board, frame, [...tasks, { id: "addition", parent: "root" }], "Tree", { preservePlacement: true });
  assert.ok(board.nodes.find(n => n.task === "addition").x > root.x + root.w / 2);
});

test("card disclosure persists per placement and makes room only inside its generated plan", () => {
  const frame = { id: "f", type: "frame", x: 0, y: 0, w: 640, h: 360 };
  const board = { nodes: [frame], edges: [] };
  const tasks = [{ id: "root" }, { id: "child", parent: "root" }];
  updateProjectFrame(board, frame, tasks, "Tree");
  const parent = board.nodes.find(n => n.task === "root"), child = board.nodes.find(n => n.task === "child");
  const unrelated = { id: "other", type: "task", task: "root", x: 1000, y: child.y, w: 340, h: 220 };
  board.nodes.push(unrelated);
  const before = structuredClone(unrelated), gap = child.y - parent.y - parent.h;
  resizeTaskCard(board, parent, true, 112);
  assert.equal(child.y - parent.y - parent.h, gap);
  assert.equal(parent.taskExpandedHeight, 220);
  resizeTaskCard(board, parent, false, 700);
  assert.equal(child.y - parent.y - parent.h, gap);
  assert.ok(frame.y + frame.h > child.y + child.h);
  assert.deepEqual(unrelated, before);
  const restored = decodeCanvas(encodeCanvas(board));
  assert.equal(restored.nodes.find(n => n.id === parent.id).taskCollapsed, false);
  updateProjectFrame(restored, restored.nodes.find(n => n.id === frame.id), tasks, "Tree");
  assert.equal(restored.nodes.find(n => n.id === parent.id).h, 700);
  assert.ok(restored.nodes.find(n => n.id === child.id).y > parent.y + parent.h);
});
test("frame refresh preserves manually moved cards and places additions without overlaps", () => {
  const frame = { id: "f", type: "frame", x: 0, y: 0, w: 640, h: 360 };
  const board = { nodes: [frame], edges: [] };
  updateProjectFrame(board, frame, [{ id: "a" }], "Plan");
  const a = board.nodes.find((n) => n.task === "a");
  Object.assign(a, { x: 400, y: 100, w: 500, h: 250 });
  updateProjectFrame(board, frame, [{ id: "a" }, { id: "b" }], "Plan", {
    preservePlacement: true,
  });
  const kept = board.nodes.find((n) => n.task === "a"),
    added = board.nodes.find((n) => n.task === "b");
  assert.equal(kept.x, 400);
  assert.equal(kept.w, 500);
  assert.ok(
    added.x + added.w <= kept.x ||
      kept.x + kept.w <= added.x ||
      added.y + added.h <= kept.y ||
      kept.y + kept.h <= added.y,
  );
});

test("frame updates place a new dependent to the right of its retained prerequisite", () => {
  const frame = { id: "f", type: "frame", x: 0, y: 0, w: 640, h: 360 };
  const board = { nodes: [frame], edges: [] };
  const initial = [{ id: "phase" }, { id: "prerequisite" }];
  updateProjectFrame(board, frame, initial, "Plan");
  const card = (id) => board.nodes.find((n) => n.task === id);
  Object.assign(card("prerequisite"), { x: 488, y: 88 });
  const kept = structuredClone(board.nodes.filter((n) => n.type === "task"));
  const tasks = [
    { id: "dependent", dependencies: ["prerequisite"] },
    ...initial,
  ];
  updateProjectFrame(board, frame, tasks, "Plan", { preservePlacement: true });
  for (const old of kept) assert.deepEqual(card(old.task), old);
  assert.equal(
    card("dependent").x,
    card("prerequisite").x + card("prerequisite").w + 100,
  );
  assert.equal(card("dependent").y, card("prerequisite").y);
  assert.ok(
    frame.x + frame.w >= card("dependent").x + card("dependent").w + 48,
  );
  const updated = structuredClone(board);
  updateProjectFrame(board, frame, tasks, "Plan", { preservePlacement: true });
  assert.deepEqual(board, updated, "Repeated updates keep positions and IDs");
});

test("new dependency chains follow moved and resized cards regardless of task order", () => {
  const frame = { id: "f", type: "frame", x: 100, y: 200, w: 640, h: 360 };
  const board = { nodes: [frame], edges: [] };
  updateProjectFrame(board, frame, [{ id: "a" }], "Plan");
  const card = (id) => board.nodes.find((n) => n.task === id);
  Object.assign(card("a"), { x: 760, y: 540, w: 500, h: 300 });
  const anchor = structuredClone(card("a"));
  updateProjectFrame(
    board,
    frame,
    [
      { id: "c", dependencies: ["b"] },
      { id: "b", dependencies: ["a", "missing"] },
      { id: "a" },
    ],
    "Plan",
    { preservePlacement: true },
  );
  assert.deepEqual(card("a"), anchor);
  assert.equal(card("b").x, anchor.x + anchor.w + 100);
  assert.equal(card("c").x, card("b").x + card("b").w + 100);
  assert.equal(card("b").y, anchor.y);
  assert.equal(card("c").y, anchor.y);
});

test("multiple prerequisites and occupied space keep additions to the right without moving retained cards", () => {
  const frame = { id: "f", type: "frame", x: 0, y: 0, w: 640, h: 360 };
  const board = { nodes: [frame], edges: [] };
  const tasks = [{ id: "a" }, { id: "b" }, { id: "obstacle" }];
  updateProjectFrame(board, frame, tasks, "Plan");
  const card = (id) => board.nodes.find((n) => n.task === id);
  Object.assign(card("a"), { x: 200, y: 100 });
  Object.assign(card("b"), { x: 700, y: 500, w: 450 });
  Object.assign(card("obstacle"), { x: 1250, y: 100, w: 400, h: 400 });
  const kept = structuredClone(board.nodes.filter((n) => n.type === "task"));
  updateProjectFrame(
    board,
    frame,
    [...tasks, { id: "dependent", dependencies: ["a", "b"] }],
    "Plan",
    { preservePlacement: true },
  );
  for (const old of kept) assert.deepEqual(card(old.task), old);
  assert.equal(card("dependent").x, card("b").x + card("b").w + 100);
  assert.equal(
    card("dependent").y,
    card("obstacle").y + card("obstacle").h + 60,
  );
});

test("new dependent trees retain the initial child indentation after anchoring to a kept card", () => {
  const frame = { id: "f", type: "frame", x: 0, y: 0, w: 640, h: 360 };
  const board = { nodes: [frame], edges: [] };
  updateProjectFrame(board, frame, [{ id: "a" }], "Plan");
  const card = (id) => board.nodes.find((n) => n.task === id);
  Object.assign(card("a"), { x: 900, y: 600, w: 500 });
  updateProjectFrame(
    board,
    frame,
    [
      { id: "child", parent: "dependent", dependencies: ["dependent"] },
      { id: "dependent", dependencies: ["a"] },
      { id: "a" },
    ],
    "Plan",
    { preservePlacement: true },
  );
  assert.equal(card("dependent").x, card("a").x + card("a").w + 100);
  assert.equal(card("dependent").y, card("a").y);
  assert.ok(card("child").x > card("dependent").x + card("dependent").w / 2);
  assert.equal(card("child").y, card("dependent").y + card("dependent").h + 60);
});

test("incremental layout tolerates imported dependency cycles", () => {
  const frame = { id: "f", type: "frame", x: 0, y: 0, w: 640, h: 360 };
  const board = { nodes: [frame], edges: [] };
  updateProjectFrame(board, frame, [{ id: "kept" }], "Plan");
  updateProjectFrame(
    board,
    frame,
    [
      { id: "kept" },
      { id: "a", dependencies: ["b"] },
      { id: "b", dependencies: ["a"] },
    ],
    "Plan",
    { preservePlacement: true },
  );
  assert.equal(board.nodes.length, 4);
  assert.ok(
    board.nodes.every((n) => Number.isFinite(n.x) && Number.isFinite(n.y)),
  );
});
test("project plans reconcile their own cards and links without changing unrelated board content", () => {
  const frame = {
    id: "frame",
    type: "frame",
    projectFrame: true,
    text: "Project",
    x: 0,
    y: 0,
    w: 640,
    h: 360,
  };
  const other = {
    id: "other",
    type: "sticky",
    text: "Keep me",
    x: -500,
    y: 0,
    w: 180,
    h: 100,
  };
  const board = {
    id: "board",
    project: "project",
    nodes: [frame, other],
    edges: [],
  };
  const tasks = [
    { id: "parent", title: "Parent" },
    { id: "child", title: "Child", parent: "parent", dependencies: ["parent"] },
    { id: "old", archived: true },
  ];
  updateProjectFrame(board, frame, tasks, "My project");
  assert.equal(board.nodes.length, 4);
  assert.equal(board.edges.length, 2);
  const parent = board.nodes.find((n) => n.task === "parent"),
    child = board.nodes.find((n) => n.task === "child");
  assert.ok(child.x > parent.x + parent.w / 2);
  assert.ok(child.y > parent.y);
  assert.equal(
    board.nodes.find((n) => n.id === "other"),
    other,
  );
  const dependency = board.edges.find((e) => e.planRelation === "dependency"),
    hierarchy = board.edges.find((e) => e.planRelation === "parent");
  assert.equal(dependency.fromSide, "right");
  assert.equal(dependency.toSide, "left");
  assert.equal(hierarchy.fromSide, "bottom");
  assert.equal(hierarchy.toSide, "left");
  assert.equal(edgeDependency(board, dependency, tasks).active, true);
  assert.equal(edgeDependency(board, hierarchy, tasks).active, false);
  const ids = board.nodes.map((n) => n.id),
    edges = board.edges.map((e) => e.id);
  updateProjectFrame(board, frame, tasks, "Renamed");
  assert.deepEqual(
    board.nodes.map((n) => n.id),
    ids,
  );
  assert.deepEqual(
    board.edges.map((e) => e.id),
    edges,
  );
  assert.equal(frame.text, "Renamed");
  // Native Canvas extensions preserve ownership across reloads.
  const restored = decodeCanvas(encodeCanvas(board));
  assert.equal(
    restored.nodes.find((n) => n.id === frame.id).projectFrame,
    true,
  );
  assert.equal(
    restored.nodes.find((n) => n.task === "child").projectFrameOwner,
    frame.id,
  );
  updateProjectFrame(board, frame, [tasks[0]], "Renamed");
  assert.equal(board.nodes.length, 3);
  assert.equal(board.edges.length, 0);
});

test("generated connectors and cards can be undone and redone after persistence", async (t) => {
  const { Store } = await import("../server/store.js");
  const fs = await import("node:fs/promises");
  const os = await import("node:os");
  const path = await import("node:path");
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "pencils-plan-undo-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const store = new Store(root);
  await store.init();
  const project = await store.createProject({ title: "Plan" });
  const first = await store.createTask(project.id, { title: "Design" });
  const second = await store.createTask(project.id, {
    title: "Build",
    parent: first.id,
    dependencies: [first.id],
  });
  let board = structuredClone((await store.snapshot(project.id)).boards[0]);
  const frame = {
    id: "frame",
    type: "frame",
    projectFrame: true,
    text: "Plan",
    x: 0,
    y: 0,
    w: 640,
    h: 360,
  };
  board.nodes.push(frame);
  updateProjectFrame(board, frame, [first, second], "Plan");
  board = await store.updateBoard(project.id, board.id, {
    revision: board.revision,
    nodes: board.nodes,
    edges: board.edges,
    operationId: "plan-create",
  });
  assert.equal(board.nodes.length, 3);
  assert.equal(board.edges.length, 2);
  let undone = await store.undoBoard(project.id, board.id, {
    operation: "plan-create",
    operationId: "plan-undo",
  });
  assert.equal(undone.nodes.length, 0);
  assert.equal(undone.edges.length, 0);
  const restored = await store.undoBoard(project.id, board.id, {
    operation: "plan-undo",
    operationId: "plan-redo",
  });
  assert.equal(restored.nodes.length, 3);
  assert.equal(restored.edges.length, 2);
});

test("indented project relationships route around both endpoint cards", async () => {
  const { routeEdge } = await import("../public/canvas-geometry.js");
  const parent = { x: 48, y: 88, w: 340, h: 220 },
    child = { x: 128, y: 368, w: 340, h: 220 };
  for (const kind of ["parent", "dependency"]) {
    const path = routeEdge(
      {
        planRelation: kind,
        routing: "elbow",
        fromSide: kind === "parent" ? "bottom" : "right",
        toSide: "left",
      },
      parent,
      child,
    );
    for (let i = 1; i < path.points.length; i++) {
      const a = path.points[i - 1],
        b = path.points[i];
      for (const card of [parent, child]) {
        const horizontal =
          a.y === b.y &&
          a.y > card.y &&
          a.y < card.y + card.h &&
          Math.max(a.x, b.x) > card.x &&
          Math.min(a.x, b.x) < card.x + card.w;
        const vertical =
          a.x === b.x &&
          a.x > card.x &&
          a.x < card.x + card.w &&
          Math.max(a.y, b.y) > card.y &&
          Math.min(a.y, b.y) < card.y + card.h;
        assert.equal(
          horizontal || vertical,
          false,
          `${kind} avoids card interior`,
        );
      }
    }
  }
});

test("dependency plans align prerequisite-first chains regardless of task input order", async () => {
  const { routeEdge } = await import("../public/canvas-geometry.js");
  const frame = { id: "frame", type: "frame", x: 100, y: 200, w: 640, h: 360 };
  const board = { nodes: [frame], edges: [] };
  const tasks = [
    { id: "blocked", dependencies: ["prerequisite"] },
    { id: "prerequisite" },
    { id: "next", dependencies: ["blocked"] },
    { id: "branch", dependencies: ["prerequisite"] },
  ];
  updateProjectFrame(board, frame, tasks, "Dependency plan");
  const card = (id) => board.nodes.find((n) => n.task === id);
  assert.equal(card("prerequisite").y, card("blocked").y);
  assert.equal(card("next").y, card("blocked").y);
  assert.ok(card("prerequisite").x + 340 < card("blocked").x);
  assert.ok(card("blocked").x + 340 < card("next").x);
  assert.ok(card("branch").y >= card("blocked").y + 280);
  for (const edge of board.edges) {
    const a = board.nodes.find((n) => n.id === edge.from),
      b = board.nodes.find((n) => n.id === edge.to);
    const route = routeEdge(edge, a, b);
    assert.ok(
      route.points.every((p) => p.x >= a.x + a.w && p.x <= b.x),
      "No outside detour",
    );
    if (a.y === b.y)
      assert.equal(route.points.length, 2, "Aligned cards have a direct arrow");
  }
  const positions = board.nodes.map((n) => [n.id, n.x, n.y]);
  updateProjectFrame(board, frame, tasks, "Dependency plan");
  assert.deepEqual(
    board.nodes.map((n) => [n.id, n.x, n.y]),
    positions,
  );
});

test("dependency columns do not overlap indented parent and child groups", () => {
  const frame = { id: "frame", type: "frame", x: 0, y: 0, w: 640, h: 360 };
  const board = { nodes: [frame], edges: [] };
  updateProjectFrame(
    board,
    frame,
    [
      { id: "root" },
      { id: "child", parent: "root" },
      { id: "grandchild", parent: "child" },
      { id: "dependent", dependencies: ["root"] },
      { id: "independent" },
    ],
    "Plan",
  );
  const cards = board.nodes.filter((n) => n.type === "task");
  for (const a of cards)
    for (const b of cards) {
      if (a === b) continue;
      assert.equal(
        a.x < b.x + b.w &&
          a.x + a.w > b.x &&
          a.y < b.y + b.h &&
          a.y + a.h > b.y,
        false,
      );
    }
});
