// The Connect tool: hovering an unselected object reveals its connection points, dragging
// joins exact points with a curved preview, clicking a start point then an end point also
// connects, no accidental objects are created, Escape and switching tools clean up, and
// locked objects offer no connection points.
import { test, expect, useApp } from "../fixtures.mjs";
import { savedBoard, seedBoard } from "../helpers/board-canvas.mjs";

const app = useApp(async (store) => {
  const project = await store.createProject({ title: "Board lab" });
  const a = await store.createTask(project.id, {
    title: "Write specification",
    assignee: "Alice",
    due: "2020-01-01",
    body: "## Scope\nOriginal scope.\n\n## Other\nKeep this.\n",
  });
  const b = await store.createTask(project.id, { title: "Build prototype", assignee: "Bob" });
  const nodes = [
    {
      id: "note",
      type: "sticky",
      text: "First idea\n\nFull **Markdown** body with [[Write specification]].",
      comments: [{ id: "c1", text: "Keep this comment", author: "Alice" }],
      group: "group-a",
      x: 80, y: 150, w: 240, h: 200,
      color: "#f5e7a2",
    },
    { id: "task-a", type: "task", task: a.id, x: 420, y: 150, w: 310, h: 300 },
    { id: "task-b", type: "task", task: b.id, x: 830, y: 150, w: 300, h: 240 },
  ];
  return { project, nodes, board: (await store.snapshot(project.id)).boards[0] };
});

test.use({ viewportSize: { width: 1600, height: 1100 } });

const current = () => savedBoard(app.store, app.project.id, app.board.id);
const node = (page, id) => page.locator(`[data-node="${id}"]`);
const handle = (page, id, side) => node(page, id).locator(`[data-port="${side}"]`);
const tool = (page) => page.locator(".board-tools [data-tool=connect]").click();
async function hover(page, id) {
  const r = await node(page, id).boundingBox();
  await page.mouse.move(r.x + r.width / 2, r.y + r.height / 2);
}
async function center(locator) {
  const r = await locator.boundingBox();
  return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
}

async function open(page, nodes = app.nodes) {
  await seedBoard(app.store, app.project.id, { nodes, edges: [] }, app.board.id);
  await page.goto(`${app.base}/#project/${app.project.id}/board`);
  await node(page, "note").waitFor();
  await page.locator("#zoom-label").dblclick();
}

test("hovering an unselected object shows its points, and dragging joins exact points with a curved preview", async ({ page }) => {
  await open(page);
  await tool(page);
  await hover(page, "note");
  await expect(node(page, "note").locator(".connection-hover-port")).toHaveCount(4);
  await expect(node(page, "note")).not.toHaveClass(/\bselected\b/);
  // Drag from an unselected object's revealed point onto a specific target point.
  const start = await center(handle(page, "note", "right"));
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await hover(page, "task-a");
  await expect(node(page, "task-a").locator("[data-port]")).toHaveCount(4);
  const end = await center(handle(page, "task-a", "left"));
  await page.mouse.move(end.x, end.y, { steps: 5 });
  await expect(page.locator("#connection-draft")).toHaveAttribute("d", /C/);
  await page.mouse.up();
  await expect.poll(async () => (await current()).edges.length).toBe(1);
  const edge = (await current()).edges[0];
  expect([edge.from, edge.fromSide, edge.to, edge.toSide]).toEqual(["note", "right", "task-a", "left"]);
});

test("clicking a start point and then an end point connects them without creating objects", async ({ page }) => {
  await open(page);
  await tool(page);
  await hover(page, "note");
  await handle(page, "note", "bottom").click();
  await hover(page, "task-b");
  await expect(page.locator("#connection-draft")).toBeVisible();
  const clickedEnd = await center(handle(page, "task-b", "top"));
  await page.mouse.click(clickedEnd.x, clickedEnd.y);
  await expect.poll(async () => (await current()).edges.length).toBe(1);
  const edge = (await current()).edges[0];
  expect([edge.from, edge.fromSide, edge.to, edge.toSide]).toEqual(["note", "bottom", "task-b", "top"]);
  expect((await current()).nodes).toHaveLength(3);
});

test("Escape cancels a pending click connection, and switching tools clears the hover points", async ({ page }) => {
  await open(page);
  await tool(page);
  await hover(page, "note");
  await handle(page, "note", "left").click();
  await hover(page, "task-a");
  await expect(page.locator("#connection-draft")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator("#connection-draft")).toHaveCount(0);
  expect((await current()).edges).toHaveLength(0);
  await tool(page);
  await hover(page, "note");
  await expect(page.locator(".connection-hover-port")).toHaveCount(4);
  await page.locator(".board-tools [data-tool=hand]").click();
  await expect(page.locator(".connection-hover-port")).toHaveCount(0);
});

test("locked objects never offer new connection points", async ({ page }) => {
  await open(page, app.nodes.map((n) => (n.id === "task-b" ? { ...n, locked: true } : n)));
  await tool(page);
  // Points appear on an unlocked object first, so moving on shows the hover is live.
  await hover(page, "note");
  await expect(node(page, "note").locator(".connection-hover-port")).toHaveCount(4);
  await hover(page, "task-b");
  await expect(node(page, "note").locator(".connection-hover-port")).toHaveCount(0);
  await expect(node(page, "task-b").locator("[data-port]")).toHaveCount(0);
  await expect(page.locator(".connection-hover-port")).toHaveCount(0);
});
