import { openBoardSearch, selectProjectView } from "./menu-controls.mjs";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { chromium, firefox } from "playwright";
import { Store } from "../server/store.js";
import { createServer } from "../server/index.js";
const root = await fs.mkdtemp(path.join(os.tmpdir(), "pencils-canvas-ui-")),
  store = new Store(root);
await store.init();
const project = await store.createProject({ title: "Board lab" }),
  a = await store.createTask(project.id, {
    title: "Write specification",
    assignee: "Alice",
    due: "2020-01-01",
    body: "## Scope\nOriginal scope.\n\n## Other\nKeep this.\n",
  }),
  b = await store.createTask(project.id, {
    title: "Build prototype",
    assignee: "Bob",
  });
const file = `Projects/${project.id}/notes/linked.md`;
await fs.mkdir(path.dirname(path.join(root, file)), { recursive: true });
await fs.writeFile(
  path.join(root, file),
  "---\ntags: [planning]\n---\n## Scope\nOriginal section.\n\n## Other\nKeep this.\n",
);
let board = (await store.snapshot(project.id)).boards[0];
board = await store.updateBoard(project.id, board.id, {
  revision: board.revision,
  nodes: [
    {
      id: "draw",
      type: "draw",
      text: "Drawing caption",
      points: [
        [0, 0],
        [100, 100],
      ],
      x: 500,
      y: 600,
      w: 300,
      h: 200,
    },
    {
      id: "file",
      type: "file",
      file,
      subpath: "#Scope",
      x: 80,
      y: 600,
      w: 350,
      h: 300,
    },
    {
      id: "note",
      type: "sticky",
      text: "First idea",
      x: 80,
      y: 150,
      w: 240,
      h: 200,
      color: "#f5e7a2",
    },
    { id: "task-a", type: "task", task: a.id, x: 420, y: 150, w: 310, h: 300 },
    { id: "task-b", type: "task", task: b.id, x: 830, y: 150, w: 300, h: 240 },
    {
      id: "far",
      type: "text",
      text: "A distant idea",
      x: 6000,
      y: 3000,
      w: 300,
      h: 150,
    },
  ],
  edges: [],
});
const server = createServer(store);
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await (
  process.env.BROWSER === "firefox" ? firefox : chromium
).launch({
  headless: true,
  args: process.env.BROWSER === "firefox" ? [] : ["--no-sandbox"],
});
const context = await browser.newContext({
    viewport: { width: 1600, height: 1100 },
  }),
  page = await context.newPage(),
  errors = [],
  external = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("request", (r) => {
  if (!r.url().startsWith(base) && !r.url().startsWith("data:"))
    external.push(r.url());
});
page.setDefaultTimeout(12000);
const pro = (name, p = page) => p.locator(`[data-pro="${name}"]`).first();
const snap = () => store.snapshot(project.id);
const current = async () =>
  (await snap()).boards.find((x) => x.id === board.id);
async function until(fn, label = "condition") {
  for (let i = 0; i < 120; i++) {
    if (await fn()) return;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error("Timed out: " + label);
}
async function enter(p = page) {
  await p.goto(base);
  await p.locator(".project-link").click();
  await p.locator("[data-view=board]").click();
  await p.locator("#canvas").waitFor();
}
async function saved() {
  await until(
    () =>
      page
        .locator("#board-save")
        .textContent()
        .then((t) => /All (canvas )?changes saved/.test(t)),
    "save",
  );
}
async function find(id, text) {
  await openBoardSearch(page);
  await page.locator("#canvas-find").fill(text);
  await page.locator(`[data-pro=find-result][data-id="${id}"]`).click();
  await page.waitForTimeout(100);
}
const node = (id) => page.locator(`[data-node="${id}"]`);
const rich = page.locator(".inline-rich");
const outside = () => page.locator('[data-pro="search-toggle"]').click();
const text = async () =>
  (await current()).nodes.find((n) => n.id === "note").text;
const undo = async () => {
  await page
    .getByRole("button", { name: "Undo canvas change", exact: true })
    .click();
};
const redo = async () => {
  await page
    .getByRole("button", { name: "Redo canvas change", exact: true })
    .click();
};
try {
  await enter();
  await find("note", "First idea");
  const originalCount = (await current()).operations.length;
  await node("note").dblclick();
  assert.equal(
    await page
      .locator(
        '.inline-floating-tools [aria-label="Save"],.inline-floating-tools [aria-label="Cancel"]',
      )
      .count(),
    0,
  );
  await outside();
  await saved();
  assert.equal(
    (await current()).operations.length,
    originalCount,
    "Unchanged edits produce no undo entry",
  );

  await node("note").dblclick();
  await rich.fill("Automatically saved");
  await rich.click();
  assert.equal(
    await rich.count(),
    1,
    "Clicks within the component keep editing",
  );
  await page.getByRole("button", { name: "Bold", exact: true }).click();
  assert.equal(await rich.count(), 1, "Toolbar clicks keep editing");
  await page.getByRole("button", { name: "Bold", exact: true }).click();
  await outside();
  await until(async () => (await text()) === "Automatically saved");
  assert.equal(await rich.count(), 0);
  await undo();
  await until(async () => (await text()) === "First idea");
  await redo();
  await until(async () => (await text()) === "Automatically saved");
  await page.reload();
  await page.locator("#canvas").waitFor();
  assert.equal(
    (await node("note").textContent()).trim(),
    "Automatically saved",
  );

  // The first outside click both saves and switches views.
  await node("note").dblclick();
  await rich.fill("Saved while navigating");
  await selectProjectView(page, "list");
  await until(async () => (await text()) === "Saved while navigating");
  assert.equal(await page.locator("#canvas").count(), 0);
  await page.locator("[data-view=board]").click();
  await find("note", "Saved while navigating");
  await node("note").dblclick();
  await rich.fill("Undo immediately");
  await undo();
  await until(async () => (await text()) === "Saved while navigating");

  // Task title/body are one edit, without overwriting unrelated task fields.
  await find("task-a", "Write specification");
  await node("task-a").locator(".task-title").dblclick();
  await page
    .getByRole("textbox", { name: "Task title", exact: true })
    .fill("Revised specification");
  await page.locator("[data-rich-mode=source]").click();
  await page.locator(".inline-source").fill("Revised scope");
  await outside();
  await until(
    async () =>
      (await snap()).tasks.find((t) => t.id === a.id).body === "Revised scope",
  );
  await page.reload();
  await page.locator("#canvas").waitFor();
  await undo();
  await until(
    async () =>
      (await snap()).tasks.find((t) => t.id === a.id).title === a.title,
  );
  assert.equal((await snap()).tasks.find((t) => t.id === a.id).body, a.body);
  await redo();
  await until(
    async () =>
      (await snap()).tasks.find((t) => t.id === a.id).title ===
      "Revised specification",
  );

  // A board edit after a linked edit is undone first, then the linked edit.
  await find("note", "Saved while navigating");
  await node("note").dblclick();
  await rich.fill("After linked edit");
  await outside();
  await until(async () => (await text()) === "After linked edit");
  await undo();
  await until(async () => (await text()) === "Saved while navigating");
  assert.equal(
    (await snap()).tasks.find((t) => t.id === a.id).title,
    "Revised specification",
  );
  await undo();
  await until(
    async () =>
      (await snap()).tasks.find((t) => t.id === a.id).title === a.title,
  );
  await redo();
  await until(
    async () =>
      (await snap()).tasks.find((t) => t.id === a.id).title ===
      "Revised specification",
  );
  await redo();
  await until(async () => (await text()) === "After linked edit");

  // Native text undo still works before leaving the editor.
  await find("note", "After linked edit");
  await node("note").dblclick();
  await rich.press("Control+End");
  await page.keyboard.insertText(" added text");
  await page.keyboard.press("Control+z");
  assert.equal(await rich.innerText(), "After linked edit");
  await page.keyboard.press("Escape");
  await saved();

  // A disconnected save remains in durable local storage and retries after reconnect.
  await node("note").dblclick();
  await rich.fill("Saved after reconnect");
  await context.setOffline(true);
  await outside();
  await until(() =>
    page
      .locator("#board-save")
      .textContent()
      .then((s) => s.includes("Draft retained")),
  );
  assert.equal(await rich.count(), 0);
  assert.ok(
    await page.evaluate(() =>
      Object.keys(localStorage).some(
        (k) =>
          k.startsWith("pencils:pending:") &&
          (localStorage.getItem(k) || "").includes("Saved after reconnect"),
      ),
    ),
  );
  await context.setOffline(false);
  await until(async () => (await text()) === "Saved after reconnect");

  // Conflict guard refuses to undo over someone else's newer task text.
  const remote = (await snap()).tasks.find((t) => t.id === a.id);
  await store.updateTask(project.id, a.id, {
    title: "Another writer's title",
    revision: remote.revision,
  });
  await undo(); // latest board text edit
  await until(async () => (await text()) === "After linked edit");
  await undo(); // previous board text edit
  await until(async () => (await text()) === "Saved while navigating");
  await undo(); // linked text edit, now conflicting
  await page
    .locator(".toast.error")
    .filter({ hasText: "preserve the newer text" })
    .waitFor();
  assert.equal(
    (await snap()).tasks.find((t) => t.id === a.id).title,
    "Another writer's title",
  );
  await find("file", "linked.md");
  const originalNote = await store.canvasNote(project.id, file);
  await node("file").dblclick({ position: { x: 20, y: 20 } });
  await page.locator("[data-rich-mode=source]").click();
  await page.locator(".inline-source").fill("## Scope\nChanged section.\n\n");
  await outside();
  await until(async () =>
    (await store.canvasNote(project.id, file)).body.includes(
      "Changed section.",
    ),
  );
  assert.ok(
    (await store.canvasNote(project.id, file)).body.includes(
      "## Other\nKeep this.",
    ),
  );
  await undo();
  await until(
    async () =>
      (await store.canvasNote(project.id, file)).body === originalNote.body,
  );
  await redo();
  await until(async () =>
    (await store.canvasNote(project.id, file)).body.includes(
      "Changed section.",
    ),
  );
  assert.ok(
    (await fs.readFile(path.join(root, file), "utf8")).includes(
      "tags: [planning]",
    ),
  );
  await find("draw", "Drawing caption");
  await node("draw").locator(".object-caption").dblclick();
  await rich.fill("Updated drawing caption");
  await outside();
  await until(
    async () =>
      (await current()).nodes.find((n) => n.id === "draw").text ===
      "Updated drawing caption",
  );
  assert.equal(
    await node("draw").locator("svg path").count(),
    1,
    "Caption autosave preserves the drawing",
  );

  await page.setViewportSize({ width: 480, height: 800 });
  await find("note", "Saved while navigating");
  await node("note").dblclick();
  await rich.fill("Saved on mobile");
  await outside();
  await until(async () => (await text()) === "Saved on mobile");
  assert.equal(await rich.count(), 0);
  assert.deepEqual(errors, []);
  assert.deepEqual(external, []);
  console.log(
    "PASS: outside-click autosave, toolbar scope, navigation, unchanged edits, native undo, board/task undo and redo, reload, offline retry and conflict protection",
  );
} catch (error) {
  await page.screenshot({
    path: "/tmp/pencils-autosave-failure.png",
    fullPage: true,
  });
  console.error(errors);
  throw error;
} finally {
  await browser.close();
  server.closeAllConnections();
  await new Promise((r) => server.close(r));
  await fs.rm(root, { recursive: true, force: true });
}
