import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import YAML from "yaml";
import { Store } from "../server/store.js";
import { createServer } from "../server/index.js";
import { Auth } from "../server/auth.js";
import {
  markdownSlice,
  decodeCanvas,
  encodeCanvas,
} from "../public/canvas-format.js";
import {
  frameParents,
  hiddenByFrame,
  routeEdge,
} from "../public/canvas-geometry.js";
async function setup(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "pencils-canvas-")),
    store = new Store(root);
  await store.init();
  const project = await store.createProject({ title: "Canvas tests" }),
    board = (await store.snapshot(project.id)).boards[0];
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  return { root, store, project, board };
}
const sticky = (id, x = 0) => ({
  id,
  type: "sticky",
  x,
  y: 80,
  w: 220,
  h: 170,
  text: `Note ${id}`,
  color: "#f5e7a2",
});
const write = async (store, p, b, changes, extra = {}) =>
  store.mutate(() =>
    store.updateBoard(p.id, b.id, {
      revision: b.revision,
      ...changes,
      ...extra,
    }),
  );
test("draft tasks retain metadata in Canvas and reject malformed draft records", async (t) => {
  const { store, project, board, root } = await setup(t);
  const draft = {
    ...sticky("draft-a"),
    type: "draft",
    text: "## Explore\nA draft description",
    draft: {
      title: "Explore an idea",
      type: "story",
      priority: "high",
      status: "todo",
      assignee: "George",
      due: "2026-10-20",
      subtasks: [{ title: "Investigate", type: "task" }],
    },
    comments: [
      {
        id: "c",
        author: "George",
        text: "Keep this discussion",
        created: "2026-10-15T10:00:00.000Z",
      },
    ],
  };
  await write(store, project, board, { nodes: [draft], edges: [] });
  const fresh = new Store(root);
  await fresh.init();
  const snapshot = await fresh.snapshot(project.id);
  assert.equal(snapshot.tasks.length, 0);
  assert.equal(snapshot.boards[0].nodes[0].type, "draft");
  assert.deepEqual(snapshot.boards[0].nodes[0].draft, draft.draft);
  assert.equal(snapshot.boards[0].nodes[0].text, draft.text);
  assert.deepEqual(snapshot.boards[0].nodes[0].comments, draft.comments);
  for (const metadata of [
    null,
    { title: "" },
    { title: "Idea", subtasks: [null] },
    { title: "Idea", priority: 42 },
  ])
    await assert.rejects(() =>
      write(fresh, project, snapshot.boards[0], {
        nodes: [{ ...draft, draft: metadata }],
      }),
    );
});
test("draft conversion retries create one parent and one set of subtasks", async (t) => {
  const { store, project, board } = await setup(t);
  const payload = {
    title: "Draft idea",
    type: "story",
    body: "Description",
    canvas_source: `canvas:${board.id}:draft-a`,
    subtasks: [{ title: "Investigate", type: "task" }],
  };
  const parent = await store.createTask(project.id, payload);
  const retry = await store.createTask(project.id, payload);
  assert.equal(retry.id, parent.id);
  const tasks = (await store.snapshot(project.id)).tasks;
  assert.equal(tasks.length, 2);
  assert.equal(tasks.filter((task) => task.parent === parent.id).length, 1);
});
test("native JSON Canvas round trips standard fields and unknown extensions after external edits", async (t) => {
  const { store, project, root, board } = await setup(t);
  const source = {
    customRoot: { version: 9 },
    nodes: [
      {
        id: "group",
        type: "group",
        x: 0,
        y: 0,
        width: 600,
        height: 500,
        label: "Research",
        background: "image.png",
        backgroundStyle: "ratio",
        customNode: "keep",
      },
      {
        id: "text",
        type: "text",
        x: 30,
        y: 60,
        width: 220,
        height: 170,
        text: "Obsidian text",
        color: "3",
        pencils: { type: "sticky", locked: true, customExtension: 42 },
      },
      {
        id: "file",
        type: "file",
        x: 300,
        y: 90,
        width: 200,
        height: 300,
        file: `Projects/${project.id}/notes/spec.md`,
        subpath: "#^decision",
      },
    ],
    edges: [
      {
        id: "link",
        fromNode: "text",
        toNode: "file",
        fromSide: "bottom",
        toSide: "left",
        fromEnd: "arrow",
        toEnd: "none",
        label: "Checks",
        customEdge: true,
        pencils: { routing: "elbow", extra: "keep" },
      },
    ],
  };
  const created = await store.createBoard(project.id, {
    title: "Native",
    canvas: source,
  });
  assert.ok(created.file.endsWith(".canvas"));
  const disk = path.join(root, created.file),
    external = JSON.parse(await fs.readFile(disk, "utf8"));
  external.nodes[1].text = "Edited in Obsidian";
  external.nodes[1].x = 95;
  external.nodes[2].subpath = "#New heading";
  await fs.writeFile(disk, JSON.stringify(external));
  const current = (await store.snapshot(project.id)).boards.find(
    (b) => b.id === created.id,
  );
  assert.equal(current.nodes[1].text, "Edited in Obsidian");
  assert.equal(current.nodes[1].x, 95);
  await write(store, project, current, {
    nodes: current.nodes.map((n) => (n.id === "text" ? { ...n, y: 180 } : n)),
  });
  const result = JSON.parse(await fs.readFile(disk, "utf8"));
  assert.deepEqual(result.customRoot, { version: 9 });
  assert.equal(result.nodes[0].backgroundStyle, "ratio");
  assert.equal(result.nodes[1].text, "Edited in Obsidian");
  assert.equal(result.nodes[1].color, "3");
  assert.equal(result.nodes[1].pencils.customExtension, 42);
  assert.equal(result.nodes[2].subpath, "#New heading");
  assert.equal(result.edges[0].customEdge, true);
  assert.equal(result.edges[0].pencils.extra, "keep");
  assert.equal(result.edges[0].fromSide, "bottom");
  assert.equal(result.edges[0].toEnd, "none");
  const fresh = new Store(root);
  await fresh.init();
  assert.equal((await fresh.snapshot(project.id)).boards.length, 2);
  // Friendly Obsidian filenames are discovered with stable IDs across restart.
  await fs.writeFile(
    path.join(root, `Projects/${project.id}/boards/My ideas.canvas`),
    JSON.stringify(source),
  );
  const imported = (await fresh.snapshot(project.id)).boards.find(
    (b) => b.title === "My ideas",
  );
  assert.ok(imported);
  await write(fresh, project, imported, { title: "Named" });
  assert.equal(
    path.basename(fresh.file(project.id, "boards", imported.id)),
    "My ideas.canvas",
  );
});
test("legacy Markdown board migration preserves source and is restart safe", async (t) => {
  const { store, project, root, board } = await setup(t);
  const legacy = path.join(root, `Projects/${project.id}/boards/b-old.md`),
    data = {
      id: "b-old",
      kind: "board",
      project: project.id,
      title: "Legacy",
      nodes: [sticky("n")],
      edges: [],
      custom: "retained",
    };
  const raw = `---\n${YAML.stringify(data)}---\nOriginal board description\n`;
  await fs.writeFile(legacy, raw);
  const next = new Store(root);
  await next.init();
  const migrated = (await next.snapshot(project.id)).boards.find(
    (b) => b.id === "b-old",
  );
  assert.equal(migrated.nodes[0].text, "Note n");
  assert.equal(migrated.custom, "retained");
  assert.match(migrated.body, /Original board/);
  assert.equal(
    await fs.readFile(
      path.join(root, ".pencils/legacy-boards", project.id, "b-old.md"),
      "utf8",
    ),
    raw,
  );
  await assert.rejects(fs.access(legacy));
  const again = new Store(root);
  await again.init();
  assert.equal(
    (await again.snapshot(project.id)).boards.filter((b) => b.id === "b-old")
      .length,
    1,
  );
});
test("concurrent board operations merge disjoint edits, reject conflicts, persist history and deduplicate retries", async (t) => {
  const { store, project, root, board } = await setup(t);
  const base = await write(store, project, board, {
    nodes: [sticky("a"), sticky("b", 300)],
  });
  const first = await write(
    store,
    project,
    base,
    { nodes: base.nodes.map((n) => (n.id === "a" ? { ...n, x: 120 } : n)) },
    { base, operationId: "alice-move" },
  );
  const second = await write(
    store,
    project,
    base,
    {
      nodes: base.nodes.map((n) =>
        n.id === "b" ? { ...n, text: "Bob writing" } : n,
      ),
    },
    { base, operationId: "bob-text" },
  );
  assert.equal(second.nodes[0].x, 120);
  assert.equal(second.nodes[1].text, "Bob writing");
  const retry = await write(
    store,
    project,
    base,
    {
      nodes: base.nodes.map((n) =>
        n.id === "b" ? { ...n, text: "Bob writing" } : n,
      ),
    },
    { base, operationId: "bob-text" },
  );
  assert.equal(retry.revision, second.revision);
  await assert.rejects(
    write(
      store,
      project,
      base,
      { nodes: base.nodes.map((n) => (n.id === "a" ? { ...n, x: 200 } : n)) },
      { base },
    ),
    (e) => e.status === 409,
  );
  const fresh = new Store(root);
  await fresh.init();
  let current = (await fresh.snapshot(project.id)).boards[0];
  assert.ok(current.operations.some((o) => o.id === "alice-move"));
  current = await fresh.undoBoard(
    project.id,
    board.id,
    { operation: "alice-move" },
    "Alice",
  );
  assert.equal(current.nodes[0].x, 0);
  assert.equal(current.nodes[1].text, "Bob writing");
  await assert.rejects(
    fresh.undoBoard(project.id, board.id, { operation: "alice-move" }, "Alice"),
    (e) => e.status === 409,
  );
  const old = (await fresh.history(current.file)).find(
    (v) => v.data.nodes?.[0]?.x === 120,
  );
  assert.ok(old);
  const restored = await fresh.restoreVersion(
    current.file,
    old.revision,
    current.revision,
  );
  assert.equal(restored.nodes[0].x, 120);
});
test("heading and block edits preserve surrounding Markdown, frontmatter and revisions", async (t) => {
  const { store, project, root } = await setup(t);
  const file = `Projects/${project.id}/notes/plan.md`;
  await fs.mkdir(path.dirname(path.join(root, file)), { recursive: true });
  const raw =
    "---\ntags: [planning]\n# keep this comment\nunknown: yes\n---\n# Plan\n\n## Scope\nFirst paragraph.\n\n### Detail\nNested.\n\n## Other\nLeave alone.\n\nA decision\nwith continuation. ^decision\n";
  await fs.writeFile(path.join(root, file), raw);
  const note = await store.canvasNote(project.id, file),
    slice = markdownSlice(note.body, "#Scope");
  assert.match(slice.text, /Nested/);
  assert.doesNotMatch(slice.text, /Leave alone/);
  const edited = await store.editCanvasNote(project.id, {
    file,
    revision: note.revision,
    subpath: "#Scope",
    body: "## Scope\nNew scope.\n\n",
  });
  const result = await fs.readFile(path.join(root, file), "utf8");
  assert.match(result, /# keep this comment/);
  assert.match(result, /unknown: yes/);
  assert.match(result, /## Other\nLeave alone/);
  assert.match(result, /New scope/);
  assert.equal(
    markdownSlice(edited.body, "#^decision").text,
    "A decision\nwith continuation. ^decision",
  );
  await assert.rejects(
    store.editCanvasNote(project.id, {
      file,
      revision: note.revision,
      body: "Stale",
    }),
    (e) => e.status === 409,
  );
  await assert.rejects(
    store.canvasNote(project.id, "Projects/someone-else/secret.md"),
    (e) => e.status === 400,
  );
  const task = await store.createTask(project.id, {
    title: "A task",
    body: "## Scope\nOriginal\n\n## Keep\nSafe\n",
  });
  await store.editCanvasNote(project.id, {
    file: task.file,
    revision: task.revision,
    subpath: "#Scope",
    body: "## Scope\nChanged\n\n",
  });
  assert.match(
    (await store.snapshot(project.id)).tasks[0].body,
    /## Keep\nSafe/,
  );
});
test("semantic connectors create real cycle-checked dependencies and sticky conversion is idempotent", async (t) => {
  const { store, project, board } = await setup(t);
  const a = await store.createTask(project.id, {
    title: "First",
    canvas_source: `canvas:${board.id}:sticky-a`,
  });
  const retry = await store.createTask(project.id, {
    title: "First",
    canvas_source: `canvas:${board.id}:sticky-a`,
  });
  assert.equal(a.id, retry.id);
  const b = await store.createTask(project.id, { title: "Second" });
  let current = await write(store, project, board, {
    nodes: [
      { ...sticky("a"), type: "task", task: a.id },
      { ...sticky("b", 300), type: "task", task: b.id },
    ],
    edges: [{ id: "e", from: "a", to: "b", relationship: "relates" }],
  });
  const dependent = await store.boardDependency(project.id, board.id, {
    edge: "e",
  });
  assert.deepEqual(dependent.dependencies, [a.id]);
  const same = await store.boardDependency(project.id, board.id, { edge: "e" });
  assert.equal(dependent.revision, same.revision);
  current = await write(store, project, current, {
    edges: [
      ...current.edges,
      { id: "reverse", from: "b", to: "a", relationship: "blocks" },
    ],
  });
  await assert.rejects(
    store.boardDependency(project.id, board.id, { edge: "reverse" }),
    (e) => e.status === 400,
  );
  const removed = await store.boardDependency(project.id, board.id, { edge: "e", remove: true });
  assert.deepEqual(removed.dependencies, []);
  const removedAgain = await store.boardDependency(project.id, board.id, { edge: "e", remove: true });
  assert.equal(removedAgain.revision, removed.revision);
  const reversed = await store.boardDependency(project.id, board.id, { edge: "reverse" });
  assert.deepEqual(reversed.dependencies, [b.id]);

});
test("nested frames, collapse visibility and connector routes have deterministic geometry", () => {
  const outer = {
      id: "outer",
      type: "frame",
      x: 0,
      y: 0,
      w: 1000,
      h: 800,
      collapsed: true,
    },
    inner = { id: "inner", type: "frame", x: 50, y: 50, w: 500, h: 400 },
    note = sticky("note", 100),
    nodes = [outer, inner, note];
  const parents = frameParents(nodes);
  assert.equal(parents.get("note"), "inner");
  assert.equal(parents.get("inner"), "outer");
  assert.deepEqual([...hiddenByFrame(nodes, parents)], ["inner", "note"]);
  assert.match(
    routeEdge({ fromSide: "right", toSide: "left", routing: "curve" }, note, {
      ...note,
      x: 500,
    }).d,
    / C/,
  );
  assert.match(
    routeEdge({ routing: "elbow" }, note, { ...note, x: 500 }).d,
    / H/,
  );
  assert.match(
    routeEdge({ routing: "straight" }, note, { ...note, x: 500 }).d,
    / L/,
  );
});
test("presence and board APIs enforce organisation access, including viewer write restrictions", async (t) => {
  const { store, project, board } = await setup(t),
    auth = new Auth(store, true);
  await auth.save({
    username: "admin",
    password: "a-secure-password",
    admin: true,
  });
  await auth.save({
    username: "viewer",
    password: "a-secure-password",
    admin: false,
    organisations: { "o-default": "viewer" },
  });
  await auth.save({
    username: "outsider",
    password: "a-secure-password",
    admin: false,
    organisations: {},
  });
  const server = createServer(store, { auth });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  t.after(() => {
    server.closeAllConnections();
    server.close();
  });
  const base = `http://127.0.0.1:${server.address().port}/api`,
    url = `/projects/${project.id}/boards/${board.id}`;
  const request = (url, method = "GET", body, cookie = "") =>
    fetch(base + url, {
      method,
      headers: { "Content-Type": "application/json", cookie },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  const login = async (username) =>
    (
      await request("/session", "POST", {
        username,
        password: "a-secure-password",
      })
    ).headers
      .get("set-cookie")
      .split(";")[0];
  const viewer = await login("viewer"),
    outsider = await login("outsider");
  assert.equal(
    (
      await request(
        url + "/presence",
        "POST",
        {
          client: "viewer-tab",
          name: "Pretend admin",
          x: 12,
          y: 24,
          selection: [],
        },
        viewer,
      )
    ).status,
    200,
  );
  const room = await (
    await request(url + "/presence", "GET", undefined, viewer)
  ).json();
  assert.equal(room.members[0].name, "viewer");
  assert.equal(
    (await request(url + "/presence", "GET", undefined, outsider)).status,
    403,
  );
  assert.equal(
    (await request(url + "/undo", "POST", { operation: "fake" }, viewer))
      .status,
    403,
  );
  assert.equal(
    (await request(`/projects/${project.id}/notes`, "GET", undefined, outsider))
      .status,
    403,
  );
  assert.equal(
    (
      await request(
        url,
        "PATCH",
        { revision: board.revision, nodes: [] },
        viewer,
      )
    ).status,
    403,
  );
});

test("lost acknowledgements followed by newer edits retry the original operation without losing either edit", async (t) => {
  const { store, project, board } = await setup(t);
  const base = await write(store, project, board, { nodes: [sticky("a")] });
  const storage = () => {
    const values = new Map();
    return {
      getItem: (k) => values.get(k) ?? null,
      setItem: (k, v) => values.set(k, String(v)),
      removeItem: (k) => values.delete(k),
    };
  };
  const old = {
    window: globalThis.window,
    localStorage: globalThis.localStorage,
    sessionStorage: globalThis.sessionStorage,
  };
  globalThis.window = { addEventListener() {} };
  globalThis.localStorage = storage();
  globalThis.sessionStorage = storage();
  const { SaveQueue } = await import("../public/sync.js");
  let first = true,
    release,
    committed;
  const acknowledged = new Promise((r) => (committed = r)),
    hold = new Promise((r) => (release = r)),
    calls = [];
  const queue = new SaveQueue({
    changed() {},
    saved() {},
    api: async (url, options) => {
      if (!options)
        return store.public(
          await store.read(store.file(project.id, "boards", board.id)),
          store.file(project.id, "boards", board.id),
        );
      calls.push(options.body.operationId);
      const result = await write(store, project, base, options.body);
      if (first) {
        first = false;
        committed();
        await hold;
        throw new Error("Acknowledgement lost");
      }
      return result;
    },
  });
  t.after(() => {
    clearInterval(queue.timer);
    clearInterval(queue.leaseTimer);
    for (const [key, value] of Object.entries(old))
      if (value === undefined) delete globalThis[key];
      else globalThis[key] = value;
  });
  const url = `/projects/${project.id}/boards/${board.id}`;
  const firstSave = queue.enqueue(url, base, {
    nodes: [{ ...base.nodes[0], x: 120 }],
  });
  await acknowledged;
  queue.enqueue(url, base, {
    nodes: [{ ...base.nodes[0], x: 160, text: "A newer edit" }],
  });
  release();
  await firstSave;
  assert.ok(queue.entries.size);
  await queue.run(queue.entries.get(url));
  assert.equal(queue.entries.size, 0);
  const result = (await store.snapshot(project.id)).boards[0];
  assert.equal(result.nodes[0].x, 160);
  assert.equal(result.nodes[0].text, "A newer edit");
  assert.equal(calls[0], calls[1]);
  assert.notEqual(calls[1], calls[2]);
  assert.equal(
    result.operations.filter((o) => o.client === queue.client).length,
    2,
  );
});
test("layer reordering persists, merges with other edits, and can be undone without changing content", async (t) => {
  const { store, project, board } = await setup(t);
  const base = await write(store, project, board, {
    nodes: [sticky("a"), sticky("b", 300)],
  });
  const reordered = await write(
    store,
    project,
    base,
    { nodes: [base.nodes[1], base.nodes[0]] },
    { base, operationId: "layer-change" },
  );
  const concurrent = await write(
    store,
    project,
    base,
    {
      nodes: base.nodes.map((n) =>
        n.id === "a" ? { ...n, text: "Keep my content" } : n,
      ),
    },
    { base },
  );
  assert.deepEqual(
    concurrent.nodes.map((n) => n.id),
    ["b", "a"],
  );
  const undone = await store.undoBoard(project.id, board.id, {
    operation: "layer-change",
  });
  assert.deepEqual(
    undone.nodes.map((n) => n.id),
    ["a", "b"],
  );
  assert.equal(undone.nodes[0].text, "Keep my content");
});
test("backlinks include project notes with wiki aliases, heading links and relative Markdown links", async (t) => {
  const { store, project, root } = await setup(t);
  const target = await store.createTask(project.id, { title: "Specification" });
  const dir = path.join(root, `Projects/${project.id}/notes`);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(
    path.join(dir, "references.md"),
    `[[Specification#Scope|see scope]]\n\n[Link](../tasks/${target.id}.md)`,
  );
  const results = await store.canvasBacklinks(project.id, target.file);
  assert.equal(results.length, 1);
  assert.equal(results[0].title, "references");
  assert.equal(results[0].id, null);
});

test("exhausted filesystem watchers fall back to polling without crashing or losing writes", async (t) => {
  const { store, project } = await setup(t);
  store.watch();
  t.after(() => store.close());
  if (store.watcher)
    store.watcher.handles[0].emit(
      "error",
      Object.assign(new Error("Watcher limit"), { code: "ENOSPC" }),
    );
  assert.ok(store.watchFallback);
  assert.equal(store.watcher, null);
  const task = await store.createTask(project.id, { title: "Still writable" });
  assert.equal((await store.snapshot(project.id)).tasks[0].id, task.id);
});

test("board settings persist in native canvas, stay isolated, validate and undo", async (t) => {
  const { root, store, project, board } = await setup(t);
  const second = await store.createBoard(project.id, {
    title: "Another board",
  });
  const saved = await write(
    store,
    project,
    board,
    { settings: { snap: false, alignObjects: false } },
    { operationId: "disable-snap" },
  );
  assert.equal(saved.settings.snap, false);
  assert.equal(saved.settings.alignObjects, false);
  const native = JSON.parse(
    await fs.readFile(path.join(root, saved.file), "utf8"),
  );
  assert.equal(native.pencils.settings.snap, false);
  assert.equal(native.pencils.settings.alignObjects, false);
  assert.equal(decodeCanvas(encodeCanvas(saved)).settings.snap, false);
  assert.equal(decodeCanvas(encodeCanvas(saved)).settings.alignObjects, false);
  const fresh = new Store(root);
  await fresh.init();
  const boards = (await fresh.snapshot(project.id)).boards;
  assert.equal(boards.find((b) => b.id === board.id).settings.snap, false);
  assert.equal(
    boards.find((b) => b.id === second.id).settings?.snap,
    undefined,
  );
  assert.equal(
    boards.find((b) => b.id === board.id).settings.alignObjects,
    false,
  );
  for (const settings of [
    null,
    [],
    "false",
    { snap: "false" },
    { alignObjects: "false" },
  ]) {
    await assert.rejects(
      write(fresh, project, saved, { settings }),
      /Board settings/,
    );
  }
  const undone = await fresh.undoBoard(project.id, board.id, {
    operation: "disable-snap",
  });
  assert.notEqual(undone.settings?.snap, false);
  assert.notEqual(undone.settings?.alignObjects, false);
});

test("board backgrounds survive native round trips and reject malformed appearance settings", async (t) => {
  const { store, project, board, root } = await setup(t);
  const background = {
    pattern: "grid",
    color: "#123456",
    lineColor: "auto",
    spacing: 40,
  };
  const saved = await write(store, project, board, {
    settings: { snap: false, background },
  });
  assert.deepEqual(
    decodeCanvas(encodeCanvas(saved)).settings.background,
    background,
  );
  const fresh = new Store(root);
  await fresh.init();
  assert.deepEqual(
    (await fresh.snapshot(project.id)).boards[0].settings.background,
    background,
  );
  for (const invalid of [
    null,
    [],
    { ...background, pattern: "invalid" },
    { ...background, color: "url(https://example.com)" },
    { ...background, spacing: 0 },
    { ...background, spacing: 20.5 },
    { ...background, lineColor: "red" },
  ])
    await assert.rejects(
      write(fresh, project, saved, { settings: { background: invalid } }),
      /background/,
    );
  const reverted = await fresh.undoBoard(project.id, board.id, {
    operation: saved.operations.at(-1).id,
  });
  assert.equal(reverted.settings?.background, undefined);
});

test("rich connector endpoints round trip with valid JSON Canvas fallbacks and respect external edits", async (t) => {
  const { store, project, board } = await setup(t);
  const heads = [
    "none",
    "arrow",
    "triangle",
    "circle",
    "circle-outline",
    "diamond",
    "diamond-outline",
    "bar",
  ];
  const updated = await write(store, project, board, {
    nodes: [sticky("one"), sticky("two", 400)],
    edges: heads.map((head, i) => ({
      id: `edge-${i}`,
      from: "one",
      to: "two",
      fromEnd: head,
      toEnd: head,
      width: 3,
      lineStyle: "dotted",
      color: "#123abc",
    })),
  });
  const encoded = encodeCanvas(updated);
  assert.ok(
    encoded.edges.every(
      (e) =>
        ["none", "arrow"].includes(e.fromEnd) &&
        ["none", "arrow"].includes(e.toEnd),
    ),
  );
  assert.ok(
    encoded.edges.every(
      (e) => e.width === undefined && e.lineStyle === undefined,
    ),
  );
  const restored = decodeCanvas(encoded, project.id);
  assert.deepEqual(
    restored.edges.map((e) => e.toEnd),
    heads,
  );
  assert.ok(
    restored.edges.every((e) => e.width === 3 && e.lineStyle === "dotted"),
  );
  encoded.edges[2].toEnd = "none";
  assert.equal(decodeCanvas(encoded, project.id).edges[2].toEnd, "none");
  encoded.edges[0].toEnd = "arrow";
  assert.equal(decodeCanvas(encoded, project.id).edges[0].toEnd, "arrow");
  for (const changes of [
    { toEnd: "bogus" },
    { width: 100 },
    { lineStyle: "bogus" },
  ])
    await assert.rejects(
      write(store, project, updated, {
        nodes: updated.nodes,
        edges: [{ ...updated.edges[0], ...changes }],
      }),
      /Invalid/,
    );
});

test("text alignment persists in native Canvas without changing Markdown and rejects invalid values", async (t) => {
  const { store, project, board, root } = await setup(t);
  const nodes = ["left", "center", "right", "justify"].map((textAlign, i) => ({
    ...sticky(`aligned-${i}`, i * 250),
    textAlign,
    text: "**Original**\n\n- Markdown",
  }));
  const saved = await write(store, project, board, { nodes });
  const source = JSON.parse(
    await fs.readFile(path.join(root, saved.file), "utf8"),
  );
  assert.deepEqual(
    source.nodes.map((n) => n.pencils.textAlign),
    nodes.map((n) => n.textAlign),
  );
  assert.ok(source.nodes.every((n) => n.text === "**Original**\n\n- Markdown"));
  assert.deepEqual(
    decodeCanvas(source, { project: project.id }).nodes.map((n) => n.textAlign),
    nodes.map((n) => n.textAlign),
  );
  const reread = (await store.snapshot(project.id)).boards.find(
    (b) => b.id === saved.id,
  );
  assert.deepEqual(
    reread.nodes.map((n) => n.textAlign),
    nodes.map((n) => n.textAlign),
  );
  await assert.rejects(
    write(store, project, reread, {
      nodes: [{ ...nodes[0], textAlign: "invalid" }],
    }),
    /text alignment/i,
  );
});
test('creating a dependency connector and its task relationship is journaled together',async t=>{const {store,project,board}=await setup(t),first=await store.createTask(project.id,{title:'A'}),second=await store.createTask(project.id,{title:'B',dependencies:[first.id]});const current=await write(store,project,board,{nodes:[{id:'a',type:'task',task:first.id,x:0,y:0,w:300,h:240},{id:'b',type:'task',task:second.id,x:400,y:0,w:300,h:240}],edges:[]});await assert.rejects(store.mutate(()=>store.boardDependency(project.id,board.id,{revision:current.revision,edge:'cycle',newEdge:{id:'cycle',from:'b',to:'a',fromSide:'right',toSide:'left'}})),/cycle/i);assert.equal((await store.snapshot(project.id)).boards[0].edges.length,0);});

test("board delta drafts recover after reload, including conflict with a deleted object", async (t) => {
  const { store, project, board } = await setup(t);
  const base = await write(store, project, board, { nodes: [sticky("a"), sticky("b", 300)] });
  const storage = () => { const values = new Map(); return { getItem: k => values.get(k) ?? null, setItem: (k,v) => values.set(k,String(v)), removeItem: k => values.delete(k) }; };
  const previous = { window: globalThis.window, localStorage: globalThis.localStorage, sessionStorage: globalThis.sessionStorage };
  globalThis.window = { addEventListener() {} }; globalThis.localStorage = storage(); globalThis.sessionStorage = storage();
  const { SaveQueue } = await import('../public/sync.js');
  const url = `/projects/${project.id}/boards/${board.id}`;
  const queues = [];
  let online = false;
  const api = async (_url, options) => {
    if (!online) throw new Error('offline');
    if (options) return write(store, project, base, options.body);
    const file = store.file(project.id, 'boards', board.id); return store.public(await store.read(file), file);
  };
  const make = () => { const queue = new SaveQueue({ api, changed() {}, saved() {} }); queues.push(queue); return queue; };
  t.after(() => { for (const queue of queues) { clearInterval(queue.timer); clearInterval(queue.leaseTimer); } for (const [k,v] of Object.entries(previous)) v === undefined ? delete globalThis[k] : globalThis[k] = v; });
  const first = make();
  await first.enqueue(url, base, { nodes: [{ ...base.nodes[0], text: 'Offline work' }, base.nodes[1]] });
  clearInterval(first.timer);
  const packed = JSON.parse(localStorage.getItem(first.key()))[0];
  assert.equal(packed.packedBoard, true); assert.equal(packed.nodes, undefined); assert.equal(packed.base, undefined);
  assert.equal(packed.changes.length, 1);
  // Another writer removes the card before this browser reconnects.
  await write(store, project, base, { nodes: [base.nodes[1]] });
  online = true;
  const second = make(); second.load('shared');
  await second.entries.get(url).promise;
  const pending = second.entries.get(url);
  assert.ok(pending.conflict, 'The deletion must surface as a conflict');
  assert.equal(pending.local.nodes.find(n => n.id === 'a').text, 'Offline work');
  await second.resolve(url, 'local');
  const result = await api(url);
  assert.equal(result.nodes.find(n => n.id === 'a').text, 'Offline work');
  assert.equal(second.entries.size, 0);
});
