// Run inside the built image with --network none and a temporary /data mount.
import { newGrid, gridMarkdown } from "../public/grid-model.js";
import { makeStroke } from "../public/pen-model.js";
import assert from "node:assert/strict";
import os from "node:os";
import { Store } from "../server/store.js";
import { createServer } from "../server/index.js";

assert.ok(
  Object.values(os.networkInterfaces())
    .flat()
    .every((address) => address.internal),
  "This test must run with Docker --network none.",
);
const store = new Store(process.env.VAULT_PATH || "/data");
const ink = makeStroke(
  [
    { x: 100, y: 400, pressure: 0.2 },
    { x: 300, y: 430, pressure: 0.8 },
  ],
  { strokeWidth: 18, opacity: 0.32, brush: "highlighter", color: "#f4cb48" },
  "offline-ink",
);
await store.init();
const server = createServer(store);
await new Promise((resolve) => server.listen(3000, "127.0.0.1", resolve));
try {
  const base = "http://127.0.0.1:3000";
  assert.equal((await fetch(base)).status, 200);
  for (const file of [
    "/app.js",
    "/task-modal.js",
    "/teams.js",
    "/capacity.js",
    "/workflow-model.js",
    "/workflow-editor.js",
    ...[
      "object-text",
      "grid-merge",
      "connector-path",
      "connector-edit",
      "frame-export",
      "board-layout-tools",
      "task-timeline",
      "object-geometry",
      "pen-advanced",
      "board-session",
    ].map((name) => `/${name}.js`),
    "/board-upgrades.css",
    "/pen-model.js",
    "/pen-tools.js",
    "/pen-tools.css",
    "/grid-model.js",
    "/board-grid.js",
    "/grid-reorder.js",
    "/board-grid.css",
    "/connector-drag.js",
    "/connector-style.js",
    "/connector-toolbar.js",
    "/alignment-guides.js",
    "/alignment-guides.css",
    "/node-layout.js",
    "/in-place-editing.css",
    "/camera-motion.js",
    "/viewport-cache.js",
    "/board-background.js",
    "/board-background.css",
    "/color-picker.js",
    "/color-picker.css",
    "/appearance.js",
    "/personal-settings.js",
    "/appearance.css",
    "/fonts.css",
    ...[
      "dmsans",
      "manrope",
      "spacegrotesk",
      "outfit",
      "sora",
      "worksans",
      "lora",
      "fraunces",
    ].map((id) => `/fonts/${id}/font.ttf`),
    "/styles.css",
    "/enhancements.css",
    "/icon.svg",
    "/features.js",
    "/canvas.js",
    "/canvas-tool-drag.js",
    "/kanban-drag.js",
    "/drag-feedback.css",
    "/selection-toolbar.js",
    "/selection-filter.js",
    "/selection-toolbar.css",
    "/selection-arrange.js",
    "/project-layout.js",
    "/project-layout.css",
    "/canvas-pro.js",
    "/canvas-rich-text.js",
    "/text-alignment.js",
    "/frame-model.js",
    "/task-description.js",
    "/vendor/turndown.js",
    "/vendor/turndown-gfm.js",
    "/canvas-controls.js",
    "/canvas-pro.css",
    "/canvas-format.js",
    "/canvas-geometry.js",
    "/grid.js",
    "/sync.js",
    "/markdown.js",
    "/planning.js",
    "/recovery-ui.js",
    "/vendor/marked.js",
    "/vendor/purify.js",
  ])
    assert.equal((await fetch(base + file)).status, 200);
  if (process.argv[2] === "write") {
    const response = await fetch(`${base}/api/projects`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Offline persistence check" }),
    });
    assert.equal(response.status, 201);
    const project = await response.json();
    const created = await fetch(`${base}/api/projects/${project.id}/tasks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: "Written without networking",
        body: "## Offline\n\nReal Markdown, persisted on the host.",
      }),
    });
    assert.equal(created.status, 201);
    const snapshot = await (
      await fetch(`${base}/api/projects/${project.id}`)
    ).json();
    assert.match(snapshot.tasks[0].key, new RegExp(`^${project.key}-1$`));
    const board = snapshot.boards[0];
    const saved = await fetch(
      `${base}/api/projects/${project.id}/boards/${board.id}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          revision: board.revision,
          settings: {
            snap: false,
            alignObjects: false,
            background: {
              pattern: "grid",
              color: "#f5f6ee",
              lineColor: "auto",
              spacing: 40,
            },
          },
          nodes: [
            ink,
            {
              id: "offline-note",
              frame: "offline-grid",
              gridCell: { row: 1, column: 0 },
              type: "sticky",
              text: "Native canvas without internet",
              x: 416,
              y: 320,
              w: 240,
              h: 180,
            },
            {
              id: "offline-grid",
              type: "grid",
              x: 400,
              y: 80,
              w: 840,
              h: 624,
              color: "#aed7dc",
              grid: newGrid(),
              text: gridMarkdown(newGrid()),
            },
          ],
        }),
      },
    );
    assert.equal(saved.status, 200);
    assert.match((await saved.json()).file, /\.canvas$/);
    console.log(
      "PASS: all local assets, project/task creation and native canvas editing with networking disabled.",
    );
  } else {
    const { projects } = await (await fetch(`${base}/api/projects`)).json();
    assert.equal(projects.length, 1);
    const snapshot = await (
      await fetch(`${base}/api/projects/${projects[0].id}`)
    ).json();
    assert.equal(snapshot.tasks[0].title, "Written without networking");
    assert.match(snapshot.tasks[0].body, /Real Markdown/);
    assert.equal(
      snapshot.boards[0].nodes.find((n) => n.id === "offline-note").text,
      "Native canvas without internet",
    );
    assert.deepEqual(
      snapshot.boards[0].nodes.find((n) => n.id === "offline-grid").grid,
      newGrid(),
    );
    const savedInk = snapshot.boards[0].nodes.find((n) => n.id === ink.id);
    for (const key of Object.keys(ink))
      assert.deepEqual(savedInk[key], ink[key]);
    assert.equal(
      snapshot.boards[0].nodes.find((n) => n.id === "offline-note").frame,
      "offline-grid",
    );
    assert.deepEqual(
      snapshot.boards[0].nodes.find((n) => n.id === "offline-note").gridCell,
      { row: 1, column: 0 },
    );
    assert.equal(
      snapshot.boards[0].nodes.find((n) => n.id === "offline-grid").color,
      "#aed7dc",
    );
    assert.ok(snapshot.boards[0].operations.length);
    assert.equal(snapshot.boards[0].settings.snap, false);
    assert.equal(snapshot.boards[0].settings.alignObjects, false);
    assert.equal(snapshot.boards[0].settings.background.pattern, "grid");
    console.log(
      "PASS: a fresh container reads the persisted project and task with networking disabled.",
    );
  }
} finally {
  await new Promise((resolve) => server.close(resolve));
}
