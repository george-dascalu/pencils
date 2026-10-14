// Run inside the built image with --network none and a temporary /data mount.
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
await store.init();
const server = createServer(store);
await new Promise((resolve) => server.listen(3000, "127.0.0.1", resolve));
try {
  const base = "http://127.0.0.1:3000";
  assert.equal((await fetch(base)).status, 200);
  for (const file of [
    "/app.js",
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
    "/selection-toolbar.css",
    "/selection-arrange.js",
    "/project-layout.js",
    "/project-layout.css",
    "/canvas-pro.js",
    "/canvas-rich-text.js",
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
    const board = snapshot.boards[0];
    const saved = await fetch(
      `${base}/api/projects/${project.id}/boards/${board.id}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          revision: board.revision,
          nodes: [
            {
              id: "offline-note",
              type: "sticky",
              text: "Native canvas without internet",
              x: 80,
              y: 80,
              w: 240,
              h: 180,
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
      snapshot.boards[0].nodes[0].text,
      "Native canvas without internet",
    );
    assert.ok(snapshot.boards[0].operations.length);
    console.log(
      "PASS: a fresh container reads the persisted project and task with networking disabled.",
    );
  }
} finally {
  await new Promise((resolve) => server.close(resolve));
}
