import test from "node:test";
import assert from "node:assert/strict";
import { updateProjectFrame } from "../public/project-frame.js";
import { encodeCanvas, decodeCanvas } from "../public/canvas-format.js";
import { edgeDependency } from "../public/dependency-model.js";
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
  assert.equal(child.x - parent.x, 80);
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
