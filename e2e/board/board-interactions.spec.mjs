// Board interactions: lossless Task/Note round trips (a note becomes a board-only draft before it
// is finalised as a project task; a task shown as a note keeps every task field and its Obsidian
// file link), linked inline editing, and connectors: curved previews, nearby ports, snapping and
// its Ctrl bypass, endpoint reconnection with undo, and cancellation without orphan lines.
// No request leaves the app.
import fs from "node:fs/promises";
import path from "node:path";
import { test, expect, useApp } from "../fixtures.mjs";

const app = useApp(async (store) => {
  const project = await store.createProject({ title: "Board lab" });
  const a = await store.createTask(project.id, { title: "Write specification", assignee: "Alice", due: "2020-01-01", body: "## Scope\nOriginal scope.\n\n## Other\nKeep this.\n" });
  const b = await store.createTask(project.id, { title: "Build prototype", assignee: "Bob" });
  const board = (await store.snapshot(project.id)).boards[0];
  const initial = [
    { id: "note", type: "sticky", text: "First idea\n\nFull **Markdown** body with [[Write specification]].", comments: [{ id: "c1", text: "Keep this comment", author: "Alice" }], group: "group-a", x: 80, y: 150, w: 240, h: 200, color: "#f5e7a2" },
    { id: "task-a", type: "task", task: a.id, x: 420, y: 150, w: 310, h: 300 },
    { id: "task-b", type: "task", task: b.id, x: 830, y: 150, w: 300, h: 240 },
  ];
  return { project, a, board, initial };
});
// The connector drags use fixed points of empty board at this size.
test.use({ viewportSize: { width: 1600, height: 1100 } });

const snap = () => app.store.snapshot(app.project.id);
const current = async () => (await snap()).boards.find((b) => b.id === app.board.id);
const currentNode = async (id) => (await current()).nodes.find((n) => n.id === id);
const currentTask = async (id) => (await snap()).tasks.find((t) => t.id === id);
const node = (page, id) => page.locator(`[data-node="${id}"]`);
const surface = (page, id) => node(page, id).evaluate((el) => {
  const s = getComputedStyle(el);
  return Object.fromEntries(["backgroundColor", "borderRadius", "padding", "justifyContent", "fontFamily", "color", "boxShadow"].map((k) => [k, s[k]]));
});
async function reseed() {
  const board = await current();
  await app.store.updateBoard(app.project.id, board.id, { revision: board.revision, nodes: app.initial, edges: [] });
}
async function openBoard(page) {
  await page.goto(`${app.base}/#project/${app.project.id}/board`);
  await page.locator("#canvas").waitFor();
  await node(page, "note").waitFor();
}
const saved = (page) => expect(page.locator("#board-save")).toHaveText("Saved automatically");
async function convert(page, id, target) {
  const heading = node(page, id).locator(".task-title,.note-title").first();
  if (await heading.count()) await heading.click();
  else await node(page, id).click();
  await page.locator('[data-selection-menu="convert"] summary').click();
  await page.locator(`#selection-tools [data-pro="${target === "Task" ? "convert" : "convert-note"}"]`).click();
  if (await page.locator("#draft-finalise-confirm").isVisible()) await page.locator("#draft-finalise-confirm").click();
  await saved(page);
}

let external;
test.beforeEach(async ({ page }) => {
  external = [];
  page.on("request", (r) => {
    if (!r.url().startsWith(app.base) && !r.url().startsWith("data:")) external.push(r.url());
  });
});
test.afterEach(() => expect(external, "no requests leave the app").toEqual([]));

test.describe("task and note conversion", () => {
  // One journey: the note becomes a draft, then a task, and the same task round-trips.
  test.describe.configure({ mode: "serial" });
  let original, noteSurface, before, taskCount;
  test.beforeAll(async () => {
    await reseed();
    taskCount = (await snap()).tasks.length;
  });

  test("converting a note to a task first makes a board-only draft, with undo and redo", async ({ page }) => {
    await openBoard(page);
    original = await currentNode("note");
    noteSurface = await surface(page, "note");
    const noteCamera = await page.locator("#canvas-world").getAttribute("style");
    await convert(page, "note", "Task");
    await expect.poll(async () => (await currentNode("note")).type).toBe("draft");
    const draft = await currentNode("note");
    expect((await snap()).tasks, "note conversion must not create a project task").toHaveLength(taskCount);
    expect(draft.task).toBeUndefined();
    expect(draft.draft.title).toBe("First idea");
    expect(draft.text, "new drafts start with a blank description").toBe("");
    expect(draft.comments).toEqual(original.comments);
    await expect(page.locator("#canvas-world")).toHaveAttribute("style", noteCamera);
    await page.reload();
    await expect(node(page, "note")).toHaveText(/Draft/, { useInnerText: true });
    await page.locator('[data-action="board-undo"]').click();
    await expect.poll(async () => (await currentNode("note")).type).toBe("sticky");
    expect((await snap()).tasks).toHaveLength(taskCount);
    expect((await currentNode("note")).text, "undo restores the original note text").toBe(original.text);
    await page.locator('[data-action="board-redo"]').click();
    await expect.poll(async () => (await currentNode("note")).type).toBe("draft");
  });

  test("finalising the draft creates a task with an ID that keeps the note's comments, group, colour and position", async ({ page }) => {
    await openBoard(page);
    await convert(page, "note", "Task");
    await expect.poll(async () => (await currentNode("note")).type).toBe("task");
    const converted = await currentNode("note");
    const created = await currentTask(converted.task);
    expect(created.body).toBe("");
    expect(created.key, "only finalised tasks receive a project ID").toBeTruthy();
    expect(converted.comments).toEqual(original.comments);
    expect(converted.group).toBe(original.group);
    expect(converted.color).toBe(original.color);
    expect(converted.x).toBe(original.x);
  });

  test("a task shown as a note keeps its data, uses the note surface and still links its Markdown file", async ({ page }) => {
    await openBoard(page);
    before = await currentTask(app.a.id);
    await convert(page, "task-a", "Note");
    await expect.poll(async () => (await currentNode("task-a")).displayAs).toBe("note");
    expect(await currentTask(app.a.id), "Task to Note does not change task metadata or Markdown").toEqual(before);
    const taskA = node(page, "task-a");
    await expect(taskA.locator(".live-card-heading,.live-card-state,.task-title,[data-pro=task-details],.embed-label")).toHaveCount(0);
    await expect(taskA).toHaveClass(/\bsticky\b/);
    expect(await taskA.evaluate((el) => !el.matches(".task,.overdue,.blocked-task"))).toBe(true);
    expect(await surface(page, "task-a"), "converted tasks use the same note surface").toEqual(noteSurface);
    await expect(taskA.locator(".note-title")).toHaveText(before.title);
    await expect(taskA.locator(".note-body")).toContainText("Original scope");
    await page.reload();
    await page.locator("#canvas").waitFor();
    await expect(taskA).toHaveClass(/task-as-note/);
    const native = JSON.parse(await fs.readFile(path.join(app.root, (await current()).file), "utf8"));
    const nativeNote = native.nodes.find((n) => n.id === "task-a");
    expect(nativeNote.type, "Obsidian still links the original Markdown file").toBe("file");
    expect(nativeNote.pencils.displayAs).toBe("note");
    // Editing it as a note edits the linked task.
    await taskA.locator(".note-title").dblclick();
    await page.getByRole("textbox", { name: "Note title", exact: true }).fill("Edited while a note");
    await expect(taskA.locator(".live-card-heading,.live-card-state,[data-pro=task-details]")).toHaveCount(0);
    expect(await surface(page, "task-a"), "editing keeps the note surface").toEqual(noteSurface);
    await page.locator("[data-rich-mode=source]").click();
    await page.locator(".inline-source").fill("Notes edited without losing task fields.");
    await page.locator('[data-pro="search-toggle"]').click();
    await expect.poll(async () => (await currentTask(app.a.id)).title).toBe("Edited while a note");
  });

  test("converting back to a task restores the card and preserves every task field", async ({ page }) => {
    await openBoard(page);
    await convert(page, "task-a", "Task");
    const taskA = node(page, "task-a");
    await expect(taskA.locator(".live-card-state")).toBeVisible();
    await expect(taskA).toHaveClass(/\btask\b/);
    await expect(taskA).not.toHaveClass(/\bsticky\b/);
    expect((await surface(page, "task-a")).backgroundColor).not.toBe(noteSurface.backgroundColor);
    const after = await currentTask(app.a.id);
    for (const field of ["assignee", "due", "type", "status", "priority", "tags", "parent", "fields", "dependencies", "comments"])
      expect(after[field], `${field} preserved`).toEqual(before[field]);
    expect(after.body).toBe("Notes edited without losing task fields.");
  });

  test("round trips reuse the task rather than creating duplicates", async ({ page }) => {
    await openBoard(page);
    await convert(page, "note", "Note");
    await convert(page, "note", "Task");
    expect((await snap()).tasks, "round trips reuse the task").toHaveLength(taskCount + 1);
  });
});

test.describe("connectors", () => {
  // One journey: the connector drawn first is reconnected and must survive the cancellations.
  test.describe.configure({ mode: "serial" });
  test.beforeAll(reseed);
  const draft = (page) => page.locator("#connection-draft");
  async function portPosition(page, id, side) {
    const r = await node(page, id).boundingBox();
    return {
      x: side === "left" ? r.x - 3 : side === "right" ? r.x + r.width + 3 : r.x + r.width / 2,
      y: side === "top" ? r.y - 3 : side === "bottom" ? r.y + r.height + 3 : r.y + r.height / 2,
    };
  }
  async function start(page, id, side) {
    await node(page, id).click();
    const p = await portPosition(page, id, side);
    await page.mouse.move(p.x, p.y);
    await page.mouse.down();
  }
  const edgePoint = (page, id) => page.locator(`path[data-edge="${id}"]`).evaluate((el) => {
    const p = el.getPointAtLength(el.getTotalLength() / 2), q = new DOMPoint(p.x, p.y).matrixTransform(el.getScreenCTM());
    return { x: q.x, y: q.y };
  });
  const edges = async () => (await current()).edges;
  let edge;

  test("dragging a connector shows a curved preview, nearby ports and snapping that Ctrl bypasses", async ({ page }) => {
    await openBoard(page);
    await start(page, "note", "right");
    const dest = await portPosition(page, "task-a", "left");
    await page.mouse.move(dest.x - 30, dest.y, { steps: 5 });
    await expect(draft(page)).toHaveAttribute("d", / C/);
    await expect(node(page, "task-a").locator(".connection-nearby-port")).toHaveCount(4);
    await expect(page.locator("#connection-draft.snapped")).toHaveCount(0);
    await page.mouse.move(dest.x - 5, dest.y);
    await expect(page.locator("#connection-draft.snapped")).toHaveCount(1);
    await expect(node(page, "task-a").locator(".connection-snapped")).toHaveAttribute("data-port", "left");
    await page.keyboard.down("Control");
    await expect(page.locator("#connection-draft.snapped")).toHaveCount(0);
    await page.keyboard.up("Control");
    await expect(page.locator("#connection-draft.snapped")).toHaveCount(1);
    const preview = await draft(page).getAttribute("d");
    await page.mouse.up();
    await expect.poll(async () => (await edges()).length).toBe(1);
    edge = (await edges())[0];
    expect(edge.toSide).toBe("left");
    await expect(page.locator(`path[data-edge="${edge.id}"]`), "the drawn line matches the preview").toHaveAttribute("d", preview);
    await expect(page.locator(".connection-nearby-port,#connection-draft,.connection-target")).toHaveCount(0);
  });

  test("dragging either end reconnects the connector, keeping its identity and style, and undo restores it", async ({ page }) => {
    await openBoard(page);
    // Reconnect the end.
    let p = await edgePoint(page, edge.id);
    await page.mouse.click(p.x, p.y);
    const handle = await page.locator('[data-edge-end="to"]').boundingBox();
    await page.mouse.move(handle.x + 2, handle.y + handle.height / 2);
    await page.mouse.down();
    const newEnd = await portPosition(page, "task-b", "left");
    await page.mouse.move(newEnd.x - 4, newEnd.y, { steps: 8 });
    await expect(page.locator("#connection-draft.snapped")).toHaveCount(1);
    await page.mouse.up();
    await expect.poll(async () => (await edges())[0].to).toBe("task-b");
    expect((await edges())[0].id).toBe(edge.id);
    expect((await edges())[0].routing).toBe(edge.routing);
    await page.getByRole("button", { name: "Undo canvas change", exact: true }).click();
    await expect.poll(async () => (await edges())[0].to).toBe("task-a");
    // Reconnect the start.
    p = await edgePoint(page, edge.id);
    await page.mouse.click(p.x, p.y);
    const fromHandle = await page.locator('[data-edge-end="from"]').boundingBox();
    await page.mouse.move(fromHandle.x + fromHandle.width - 2, fromHandle.y + fromHandle.height / 2);
    await page.mouse.down();
    const newStart = await portPosition(page, "task-b", "top");
    await page.mouse.move(newStart.x, newStart.y - 4, { steps: 8 });
    await expect(page.locator("#connection-draft.snapped")).toHaveCount(1);
    await page.mouse.up();
    await expect.poll(async () => (await edges())[0].from).toBe("task-b");
    expect((await edges())[0].to).toBe("task-a");
    expect((await edges())[0].fromSide).toBe("top");
    await page.getByRole("button", { name: "Undo canvas change", exact: true }).click();
    await expect.poll(async () => (await edges())[0].from).toBe("note");
  });

  test("Escape, an empty drop, window blur and pointer cancel all abandon a connector without an orphan line", async ({ page }) => {
    await openBoard(page);
    await start(page, "note", "bottom");
    await page.mouse.move(650, 760);
    await page.keyboard.press("Escape");
    await page.mouse.up();
    await expect(page.locator("#connection-draft,.connection-target,.connection-nearby-port")).toHaveCount(0);
    expect(await edges()).toHaveLength(1);
    await start(page, "note", "bottom");
    await page.mouse.move(650, 760);
    await page.mouse.up();
    expect(await edges(), "dropping on empty space cancels without an orphan line").toHaveLength(1);
    await start(page, "note", "bottom");
    await page.mouse.move(650, 760);
    await page.evaluate(() => window.dispatchEvent(new Event("blur")));
    await page.mouse.up();
    await expect(draft(page)).toHaveCount(0);
    await start(page, "note", "bottom");
    await page.mouse.move(650, 760);
    await page.locator("#canvas").dispatchEvent("pointercancel", { pointerId: 1, clientX: 650, clientY: 760 });
    await page.mouse.up();
    await expect(page.locator("#connection-draft,.connection-nearby-port")).toHaveCount(0);
  });
});
