// Board text editors save automatically: an outside click (or switching views) saves, clicks in
// the editor and its toolbar keep editing, unchanged edits add no undo entry, and there are no
// Save or Cancel buttons. Board and linked task/note edits undo and redo in order, also after
// reload; native text undo works while editing; a save made offline is kept in this browser and
// retried on reconnect; undo refuses to overwrite someone else's newer task text; captions
// autosave without touching the drawing, also on a narrow screen.
// The steps edit the same note in turn, so the file runs in order. Undo history belongs to the
// browser tab, so every undo is checked in the test that made the edit. The board never reaches
// the internet.
import fs from "node:fs/promises";
import path from "node:path";
import { test, expect, useApp } from "../fixtures.mjs";
import { openBoardSearch, selectProjectView } from "../helpers/menu-controls.mjs";

const app = useApp(async (store) => {
  const project = await store.createProject({ title: "Board lab" });
  const a = await store.createTask(project.id, {
    title: "Write specification",
    assignee: "Alice",
    due: "2020-01-01",
    body: "## Scope\nOriginal scope.\n\n## Other\nKeep this.\n",
  });
  const b = await store.createTask(project.id, { title: "Build prototype", assignee: "Bob" });
  const file = `Projects/${project.id}/notes/linked.md`;
  await fs.mkdir(path.dirname(path.join(store.root, file)), { recursive: true });
  await fs.writeFile(path.join(store.root, file), "---\ntags: [planning]\n---\n## Scope\nOriginal section.\n\n## Other\nKeep this.\n");
  let board = (await store.snapshot(project.id)).boards[0];
  board = await store.updateBoard(project.id, board.id, {
    revision: board.revision,
    nodes: [
      { id: "draw", type: "draw", text: "Drawing caption", points: [[0, 0], [100, 100]], x: 500, y: 600, w: 300, h: 200 },
      { id: "file", type: "file", file, subpath: "#Scope", x: 80, y: 600, w: 350, h: 300 },
      { id: "note", type: "sticky", text: "First idea", x: 80, y: 150, w: 240, h: 200, color: "#f5e7a2" },
      { id: "task-a", type: "task", task: a.id, x: 420, y: 150, w: 310, h: 300 },
      { id: "task-b", type: "task", task: b.id, x: 830, y: 150, w: 300, h: 240 },
      { id: "far", type: "text", text: "A distant idea", x: 6000, y: 3000, w: 300, h: 150 },
    ],
    edges: [],
  });
  return { project, a, file, board };
});

test.describe.configure({ mode: "serial" });
test.use({ viewportSize: { width: 1600, height: 1100 } });

const snap = () => app.store.snapshot(app.project.id);
const current = async () => (await snap()).boards.find((x) => x.id === app.board.id);
const text = async () => (await current()).nodes.find((n) => n.id === "note").text;
const task = async () => (await snap()).tasks.find((t) => t.id === app.a.id);
const poll = (fn, message) => expect.poll(fn, { message, timeout: 12000 });
const node = (page, id) => page.locator(`[data-node="${id}"]`);
const rich = (page) => page.locator(".inline-rich");

async function enter(page) {
  await page.goto(`${app.base}/#project/${app.project.id}/board`);
  await page.locator("#canvas").waitFor();
}
async function saved(page) {
  // Board saves share the editors' save language (public/save-state.js).
  await expect(page.locator("#board-save")).toHaveText(/^\s*Saved automatically\s*$/, { timeout: 12000 });
}
async function find(page, id, text) {
  await openBoardSearch(page);
  await page.locator("#canvas-find").fill(text);
  await page.locator(`[data-pro=find-result][data-id="${id}"]`).click();
  await expect(node(page, id)).toBeVisible();
}
async function outside(page) {
  await page.locator('[data-pro="search-toggle"]').click();
}
const undo = (page) => page.getByRole("button", { name: "Undo canvas change", exact: true }).click();
const redo = (page) => page.getByRole("button", { name: "Redo canvas change", exact: true }).click();
// Edit the note's text and click outside to save it.
async function editNote(page, value) {
  await node(page, "note").dblclick();
  await rich(page).fill(value);
  await outside(page);
  await poll(text).toBe(value);
}

let external;
test.beforeEach(({ page }) => {
  external = [];
  page.on("request", (r) => {
    if (!r.url().startsWith(app.base) && !r.url().startsWith("data:")) external.push(r.url());
  });
});
test.afterEach(() => expect(external, "no internet requests").toEqual([]));

test("an unchanged edit closes without an undo entry, and the editor has no Save or Cancel buttons", async ({ page }) => {
  await enter(page);
  await find(page, "note", "First idea");
  const originalCount = (await current()).operations.length;
  await node(page, "note").dblclick();
  await rich(page).waitFor();
  await expect(page.locator('.inline-floating-tools [aria-label="Save"],.inline-floating-tools [aria-label="Cancel"]')).toHaveCount(0);
  await outside(page);
  await saved(page);
  expect((await current()).operations.length, "Unchanged edits produce no undo entry").toBe(originalCount);
});

test("an outside click saves while clicks in the editor and its toolbar keep editing, with undo, redo and reload", async ({ page }) => {
  await enter(page);
  await find(page, "note", "First idea");
  await node(page, "note").dblclick();
  await rich(page).fill("Automatically saved");
  await rich(page).click();
  await expect(rich(page), "Clicks within the component keep editing").toHaveCount(1);
  await page.getByRole("button", { name: "Bold", exact: true }).click();
  await expect(rich(page), "Toolbar clicks keep editing").toHaveCount(1);
  await page.getByRole("button", { name: "Bold", exact: true }).click();
  await outside(page);
  await poll(text).toBe("Automatically saved");
  await expect(rich(page)).toHaveCount(0);
  await undo(page);
  await poll(text).toBe("First idea");
  await redo(page);
  await poll(text).toBe("Automatically saved");
  await page.reload();
  await page.locator("#canvas").waitFor();
  await expect(node(page, "note")).toHaveText(/^\s*Automatically saved\s*$/);
});

test("the first outside click both saves and switches views, and undo during an edit restores the saved text", async ({ page }) => {
  await enter(page);
  await find(page, "note", "Automatically saved");
  await node(page, "note").dblclick();
  await rich(page).fill("Saved while navigating");
  await selectProjectView(page, "list");
  await poll(text).toBe("Saved while navigating");
  await expect(page.locator("#canvas")).toHaveCount(0);
  await page.locator(".tabs [data-view=board]").click();
  await find(page, "note", "Saved while navigating");
  await node(page, "note").dblclick();
  await rich(page).fill("Undo immediately");
  await undo(page);
  await poll(text).toBe("Saved while navigating");
});

test("a task's title and body save as one edit, and board and linked edits undo and redo in order across reload", async ({ page }) => {
  await enter(page);
  // Task title/body are one edit, without overwriting unrelated task fields.
  await find(page, "task-a", "Write specification");
  await node(page, "task-a").locator(".task-title").dblclick();
  await page.getByRole("textbox", { name: "Task title", exact: true }).fill("Revised specification");
  await page.locator("[data-rich-mode=source]").click();
  await page.locator(".inline-source").fill("Revised scope");
  await outside(page);
  await poll(async () => (await task()).body).toBe("Revised scope");
  await page.reload();
  await page.locator("#canvas").waitFor();
  await undo(page);
  await poll(async () => (await task()).title).toBe(app.a.title);
  expect((await task()).body).toBe(app.a.body);
  await redo(page);
  await poll(async () => (await task()).title).toBe("Revised specification");

  // A board edit after a linked edit is undone first, then the linked edit.
  await find(page, "note", "Saved while navigating");
  await editNote(page, "After linked edit");
  await undo(page);
  await poll(text).toBe("Saved while navigating");
  expect((await task()).title).toBe("Revised specification");
  await undo(page);
  await poll(async () => (await task()).title).toBe(app.a.title);
  await redo(page);
  await poll(async () => (await task()).title).toBe("Revised specification");
  await redo(page);
  await poll(text).toBe("After linked edit");
});

test("native text undo still works before leaving the editor", async ({ page }) => {
  await enter(page);
  await find(page, "note", "After linked edit");
  await node(page, "note").dblclick();
  await rich(page).press("Control+End");
  await page.keyboard.insertText(" added text");
  await page.keyboard.press("Control+z");
  await expect(rich(page)).toHaveText("After linked edit");
  await page.keyboard.press("Escape");
  await saved(page);
});

test("a save made offline stays in this browser and is retried after reconnecting", async ({ page }) => {
  await enter(page);
  await find(page, "note", "After linked edit");
  await node(page, "note").dblclick();
  await rich(page).fill("Saved after reconnect");
  await page.context().setOffline(true);
  await outside(page);
  // Save problems show as the header save warning beside the app version
  // (since 0.18.12); the board label stays blank while a warning is shown.
  await expect(page.locator("#save-warning-toggle")).toHaveAttribute("aria-label", "Save warning: Server unavailable", { timeout: 12000 });
  await expect(page.locator("#save-warning-details")).toContainText("Unsaved changes are kept in this browser");
  await expect(rich(page)).toHaveCount(0);
  expect(
    await page.evaluate(() =>
      Object.keys(localStorage).some((k) => k.startsWith("pencils:pending:") && (localStorage.getItem(k) || "").includes("Saved after reconnect")),
    ),
  ).toBe(true);
  await page.context().setOffline(false);
  await poll(text).toBe("Saved after reconnect");
});

test("undo refuses to overwrite someone else's newer task text", async ({ page }) => {
  await enter(page);
  // This tab's history: a linked task edit, then two board text edits.
  await find(page, "task-a", "Revised specification");
  await node(page, "task-a").locator(".task-title").dblclick();
  await page.getByRole("textbox", { name: "Task title", exact: true }).fill("Specification under review");
  await outside(page);
  await poll(async () => (await task()).title).toBe("Specification under review");
  await find(page, "note", "Saved after reconnect");
  await editNote(page, "First board edit");
  await editNote(page, "Second board edit");
  // Another writer changes the task title.
  const remote = await task();
  await app.store.updateTask(app.project.id, app.a.id, { title: "Another writer's title", revision: remote.revision });
  await undo(page); // latest board text edit
  await poll(text).toBe("First board edit");
  await undo(page); // previous board text edit
  await poll(text).toBe("Saved after reconnect");
  await undo(page); // linked text edit, now conflicting
  await page.locator(".toast.error").filter({ hasText: "preserve the newer text" }).waitFor();
  expect((await task()).title).toBe("Another writer's title");
});

test("a linked note's section saves with undo and redo, keeping the rest of the file", async ({ page }) => {
  await enter(page);
  await find(page, "file", "linked.md");
  const originalNote = await app.store.canvasNote(app.project.id, app.file);
  await node(page, "file").dblclick({ position: { x: 20, y: 20 } });
  await page.locator("[data-rich-mode=source]").click();
  await page.locator(".inline-source").fill("## Scope\nChanged section.\n\n");
  await outside(page);
  const body = async () => (await app.store.canvasNote(app.project.id, app.file)).body;
  await poll(body).toContain("Changed section.");
  expect(await body()).toContain("## Other\nKeep this.");
  await undo(page);
  await poll(body).toBe(originalNote.body);
  await redo(page);
  await poll(body).toContain("Changed section.");
  expect(await fs.readFile(path.join(app.root, app.file), "utf8")).toContain("tags: [planning]");
});

test("a drawing caption autosaves without changing the drawing", async ({ page }) => {
  await enter(page);
  await find(page, "draw", "Drawing caption");
  await node(page, "draw").locator(".object-caption").dblclick();
  await rich(page).fill("Updated drawing caption");
  await outside(page);
  await poll(async () => (await current()).nodes.find((n) => n.id === "draw").text).toBe("Updated drawing caption");
  await expect(node(page, "draw").locator("svg path"), "Caption autosave preserves the drawing").toHaveCount(1);
});

test("on a narrow screen an outside click still saves", async ({ page }) => {
  await enter(page);
  await page.setViewportSize({ width: 480, height: 800 });
  await find(page, "note", await text());
  await editNote(page, "Saved on mobile");
  await expect(rich(page)).toHaveCount(0);
});
