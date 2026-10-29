// Board lab (canvas-pro): inline Markdown on objects and culling of distant ones, linked task
// headings edited on the canvas, connectors that become real task dependencies, anchored
// comments, sticky-to-task conversion, live task queries, templates, the frame outline and
// presentation, two-tab presence with concurrent edits and durable activity, object search and a
// full-fidelity native export. The board never reaches the internet.
// The steps form one journey on one board (the note becomes a task, the activity log grows), so
// the file runs in order.
import fs from "node:fs/promises";
import { test, expect, useApp } from "../fixtures.mjs";
import { clickControl, openBoardSearch } from "../helpers/menu-controls.mjs";

const app = useApp(async (store) => {
  const project = await store.createProject({ title: "Board lab" });
  const a = await store.createTask(project.id, {
    title: "Write specification",
    assignee: "Alice",
    due: "2020-01-01",
    body: "## Scope\nOriginal scope.\n\n## Other\nKeep this.\n",
  });
  const b = await store.createTask(project.id, { title: "Build prototype", assignee: "Bob" });
  let board = (await store.snapshot(project.id)).boards[0];
  board = await store.updateBoard(project.id, board.id, {
    revision: board.revision,
    nodes: [
      { id: "note", type: "sticky", text: "First idea", x: 80, y: 150, w: 240, h: 200, color: "#f5e7a2" },
      { id: "task-a", subpath: "#Scope", type: "task", task: a.id, x: 420, y: 150, w: 310, h: 300 },
      { id: "task-b", type: "task", task: b.id, x: 830, y: 150, w: 300, h: 240 },
      { id: "far", type: "text", text: "A distant idea", x: 6000, y: 3000, w: 300, h: 150 },
    ],
    edges: [],
  });
  return { project, a, b, board };
});

test.describe.configure({ mode: "serial" });
test.use({ viewportSize: { width: 1600, height: 1100 } });

const snap = () => app.store.snapshot(app.project.id);
const current = async () => (await snap()).boards.find((x) => x.id === app.board.id);
const nodeOf = async (id) => (await current()).nodes.find((n) => n.id === id);
const taskOf = async (id) => (await snap()).tasks.find((t) => t.id === id);
const pro = (page, name) => page.locator(`[data-pro="${name}"]`).first();
const poll = (fn, message) => expect.poll(fn, { message, timeout: 12000 });

async function enter(page) {
  await page.goto(`${app.base}/#project/${app.project.id}/board`);
  await page.locator("#canvas").waitFor();
  await page.locator('[data-node="note"]').waitFor();
}
async function find(page, id, text) {
  await openBoardSearch(page);
  await page.locator("#canvas-find").fill(text);
  await page.locator(`[data-pro=find-result][data-id="${id}"]`).click();
  await expect(page.locator(`[data-node="${id}"]`)).toBeVisible();
}

// Every request stays on the app's own server (or data: URLs), in every tab of the test.
let external;
test.beforeEach(({ page }) => {
  external = [];
  page.context().on("request", (r) => {
    if (!r.url().startsWith(app.base) && !r.url().startsWith("data:")) external.push(r.url());
  });
});
test.afterEach(() => expect(external, "no internet requests").toEqual([]));

test("inline Markdown renders on a sticky and offscreen objects are culled", async ({ page }) => {
  await enter(page);
  await expect(page.locator("[data-node=far]")).toHaveCount(0);
  await page.locator("[data-node=note]").dblclick();
  await page.locator("[data-rich-mode=source]").click();
  await page.locator("#canvas-inline-form textarea").fill("An **inline** idea");
  await page.locator("#canvas-inline-form textarea").press("Control+Enter");
  await poll(async () => (await nodeOf("note")).text).toBe("An **inline** idea");
  await expect(page.locator("[data-node=note] strong")).toHaveText("inline");
});

test("editing a linked heading on the canvas keeps the rest of the source note", async ({ page }) => {
  await enter(page);
  await page.locator("[data-node=task-a]").click();
  await expect(page.locator('[data-pro="embed"],[data-pro="backlinks"]')).toHaveCount(0);
  await page.locator("[data-node=task-a] .task-title").dblclick();
  await page.locator("[data-rich-mode=source]").click();
  await page.locator("#canvas-inline-form textarea").fill("## Scope\nEdited from canvas.\n\n");
  await page.locator("#canvas-inline-form textarea").press("Control+Enter");
  await poll(async () => (await taskOf(app.a.id)).body).toContain("Edited from canvas.");
  expect((await taskOf(app.a.id)).body).toMatch(/## Other\nKeep this/);
});

test("a connection handle draws a connector whose route and dependency become real", async ({ page }) => {
  await enter(page);
  await page.locator("[data-node=task-a]").click();
  const port = await page.locator("[data-source=task-a][data-port=right]").boundingBox();
  const target = await page.locator("[data-node=task-b]").boundingBox();
  await page.mouse.move(port.x + port.width / 2, port.y + port.height / 2);
  await page.mouse.down();
  await page.mouse.move(target.x + 10, target.y + 80, { steps: 8 });
  await page.mouse.up();
  await poll(async () => (await current()).edges.length, "connector").toBe(1);
  const edge = (await current()).edges[0];
  const edgePoint = await page.locator(`path[data-edge="${edge.id}"]`).evaluate((el) => {
    const p = el.getPointAtLength(el.getTotalLength() / 2);
    const r = new DOMPoint(p.x, p.y).matrixTransform(el.getScreenCTM());
    return { x: r.x, y: r.y };
  });
  await page.mouse.dblclick(edgePoint.x, edgePoint.y);
  await page.locator('[data-selection-menu="connection"] summary').click();
  await page.locator('[data-edge-field="relationship"]').selectOption("blocks");
  await page.locator('[data-selection-menu="routing"] summary').click();
  await page.locator('[data-edge-choice="routing"][data-value="elbow"]').click();
  await page.locator('[data-selection-menu="dependency"] summary').click();
  await page.locator('[data-pro="edge-dependency"]').click();
  await poll(async () => (await taskOf(app.b.id)).dependencies?.includes(app.a.id), "dependency").toBe(true);
  await page.locator("dialog").waitFor({ state: "detached" });
  await poll(async () => (await current()).edges[0].routing).toBe("elbow");
});

test("comments stay anchored when a sticky becomes a task, and a live query lists matching tasks", async ({ page }) => {
  await enter(page);
  await page.locator("[data-node=note]").click();
  await clickControl(page.locator("#selection-tools [data-pro=comments]"));
  await page.locator('#board-comment-form [contenteditable="true"]').fill("Discuss this idea in the next planning session.");
  await page.locator("#board-comment-form button[type=submit]").click();
  await poll(async () => (await nodeOf("note")).comments?.length).toBe(1);
  await page.locator("[data-comments-close]").click();
  await page.locator("[data-node=note]").click();
  await clickControl(pro(page, "convert"));
  await poll(async () => (await nodeOf("note")).type).toBe("draft");
  await page.locator("[data-node=note]").getByRole("button", { name: "Finalise task", exact: true }).click();
  await page.locator("#draft-finalise-confirm").click();
  await poll(async () => (await nodeOf("note")).type).toBe("task");
  expect((await nodeOf("note")).comments.length).toBe(1);
  await clickControl(pro(page, "query-add"));
  await page.locator("#canvas-query-form [name=title]").fill("Alice’s work");
  await page.locator("#canvas-query-form [name=assignee]").fill("Alice");
  await page.locator("#canvas-query-form button[type=submit]").click();
  await poll(async () => (await current()).nodes.some((n) => n.type === "query")).toBe(true);
  await expect(page.locator(".query-rows")).toContainText("Write specification");
});

test("templates insert frames that the outline collapses and presentation steps through", async ({ page }) => {
  await enter(page);
  await clickControl(pro(page, "templates"));
  await page.locator("[data-pro=template-insert][data-id=roadmap]").click();
  await poll(async () => (await current()).nodes.filter((n) => n.type === "frame").length).toBe(3);
  await page.locator("[data-action=board-fit]").click();
  await clickControl(pro(page, "outline"));
  const frame = (await current()).nodes.find((n) => n.type === "frame" && n.text === "Now");
  await page.locator(`#canvas-outline [data-pro=collapse][data-id="${frame.id}"]`).click();
  await expect(page.locator("#board-save")).toHaveText("Saved automatically", { timeout: 12000 });
  await poll(async () => (await nodeOf(frame.id)).collapsed).toBeTruthy();
  await clickControl(pro(page, "present"));
  await page.locator("#presentation-controls").waitFor();
  await page.locator("#canvas").focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.locator("#presentation-controls")).toContainText(/2 \/ 3/);
  await page.keyboard.press("Escape");
  await page.locator('#canvas-outline [aria-label="Close outline"]').click();
});

// Closed tabs from earlier tests stay present for 15 seconds; start from an empty board room.
async function emptyRoom() {
  const presence = `${app.base}/api/projects/${app.project.id}/boards/${app.board.id}/presence`;
  for (const { client } of (await (await fetch(presence)).json()).members)
    await fetch(presence, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ client, leave: true }) });
}

test("two tabs share presence and selections, edit at once and record durable activity", async ({ page }) => {
  await emptyRoom();
  await enter(page);
  // A second tab of the same browser: its own pending-write queue and client.
  const second = await page.context().newPage();
  const secondErrors = [];
  second.on("pageerror", (e) => secondErrors.push(e.message));
  await enter(second);
  await expect(page.locator("#canvas-presence")).toContainText("2 here", { timeout: 12000 });
  const client = (p) => p.evaluate(() => sessionStorage.getItem("pencils:client"));
  expect(await client(second), "each tab has its own client").not.toBe(await client(page));
  await find(page, "task-a", "Write specification");
  await page.locator("[data-node=task-a]").click();
  await expect(second.locator(".participant-selection").first(), "selection presence").toBeAttached({ timeout: 12000 });
  await openBoardSearch(second);
  await second.locator("#canvas-find").fill("Build prototype");
  await second.locator("[data-pro=find-result][data-id=task-b]").click();
  await second.locator("[data-node=task-b]").click();
  await Promise.all([page.keyboard.press("ArrowRight"), second.keyboard.press("ArrowDown")]);
  await poll(async () => {
    const c = await current();
    return c.nodes.find((n) => n.id === "task-a").x > 420 && c.nodes.find((n) => n.id === "task-b").y > 150;
  }, "simultaneous edits").toBe(true);
  await clickControl(pro(page, "activity"));
  await page.locator(".operation-list article").first().waitFor();
  await poll(() => page.locator(".operation-list article").count()).toBeGreaterThan(5);
  await clickControl(pro(page, "activity-close"));
  await second.close();
  expect(secondErrors, "no page errors in the second tab").toEqual([]);
});

test("search reaches a distant object and the native export keeps file cards and connector ports", async ({ page }) => {
  await enter(page);
  await find(page, "far", "distant");
  await expect(page.locator("[data-node=far]")).toHaveCount(1);
  const download = page.waitForEvent("download");
  await clickControl(page.locator("[data-feature=canvas-json]"));
  const data = JSON.parse(await fs.readFile(await (await download).path(), "utf8"));
  expect(data.nodes.some((n) => n.type === "file")).toBe(true);
  expect(data.edges[0].fromSide).toBeTruthy();
  expect(data.pencils.operations.length).toBeGreaterThan(0);
});
