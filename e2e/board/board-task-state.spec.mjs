// Board: linked cards show the state of their task. Archived tasks get a badge with
// Unarchive, deleted tasks become placeholders (cards and notes) with Restore, a missing task
// file reads "Task unavailable", a deletion elsewhere reaches the open board without a reload,
// connectors survive, and the board fits desktop and phone screens in both themes.
import { test, expect, onDevices, useApp } from "../fixtures.mjs";
import { selectProjectView } from "../helpers/menu-controls.mjs";

const app = useApp();

// A fresh project per test: one archived card, one card and one note on a live task, one card
// on a task file that does not exist, and a connector.
async function seed({ deleteLive = false } = {}) {
  const { store } = app;
  const project = await store.createProject({ title: "Card availability" });
  const archived = await store.createTask(project.id, { title: "Archived card" });
  const live = await store.createTask(project.id, { title: "Soon deleted" });
  const board = (await store.snapshot(project.id)).boards[0];
  await store.updateTask(project.id, archived.id, { revision: archived.revision, archived: true });
  await store.updateBoard(project.id, board.id, {
    revision: board.revision,
    nodes: [
      { id: "archived-card", type: "task", task: archived.id, x: 100, y: 100, w: 340, h: 270 },
      { id: "deleted-card", type: "task", task: live.id, x: 500, y: 100, w: 340, h: 270 },
      { id: "note-card", type: "task", task: live.id, displayAs: "note", x: 100, y: 420, w: 340, h: 270 },
      { id: "missing-card", type: "task", task: "t-missing", x: 500, y: 420, w: 340, h: 270 },
    ],
    edges: [{ id: "link", from: "archived-card", to: "deleted-card" }],
  });
  if (deleteLive) await store.deleteTask(project.id, live.id, live.revision);
  return { project, archived, live };
}
const openBoard = async (page, project) => {
  await page.goto(`${app.base}/#project/${project.id}/board`);
  await page.locator("#canvas").waitFor();
};
const node = (page, id) => page.locator(`[data-node="${id}"]`);
// Since 0.18.35 the view tabs are icons; the active task count is in the Task views tab's
// hover label ("… · N tasks") instead of a .tab-count badge.
const taskViewsTab = (page) => page.locator(".tabs [data-view=tasks]");

test("archived and missing cards show their state, and a deletion elsewhere reaches the open board", async ({ page }) => {
  const { project, live } = await seed();
  await openBoard(page, project);
  await expect(taskViewsTab(page), "archived tasks are not counted").toHaveAttribute("title", /· 1 tasks$/);
  await expect(node(page, "archived-card").getByText("Archived", { exact: true })).toBeVisible();
  await expect(node(page, "missing-card").getByText("Task unavailable", { exact: true }).first()).toBeVisible();
  await expect(node(page, "deleted-card").locator("select[data-canvas-status]")).toHaveCount(1);
  await app.store.deleteTask(project.id, live.id, live.revision);
  // Polling replaces the rendered card without a manual reload.
  await expect(node(page, "deleted-card").getByText("Deleted task", { exact: true })).toBeVisible();
  await expect(node(page, "note-card").getByText("Deleted task", { exact: true })).toBeVisible();
  await expect(node(page, "deleted-card")).toContainText(live.key);
  await expect(node(page, "deleted-card")).toContainText(live.title);
  await expect(node(page, "deleted-card").locator("select,[data-inline-title],[data-pro=task-details]"), "a deleted card cannot be edited").toHaveCount(0);
  await expect(page.locator('[data-edge="link"] .canvas-edge'), "the connector survives").toHaveCount(1);
});

onDevices(["desktop", "phone"], () => test("placeholder cards fit the screen in both themes", async ({ page }) => {
  const { project } = await seed({ deleteLive: true });
  await openBoard(page, project);
  await expect(node(page, "deleted-card").getByText("Deleted task", { exact: true })).toBeAttached();
  for (const theme of ["light", "dark"]) {
    await page.evaluate((t) => (document.documentElement.dataset.theme = t), theme);
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), `${theme}: no horizontal scroll`).toBe(false);
  }
}));

test("Restore and Unarchive bring the cards back and the task count follows", async ({ page }) => {
  const { project, archived } = await seed({ deleteLive: true });
  await openBoard(page, project);
  await node(page, "deleted-card").getByRole("button", { name: "Restore task", exact: true }).click();
  await expect(node(page, "deleted-card").locator("select[data-canvas-status]")).toBeVisible();
  await expect(node(page, "deleted-card").locator(".board-task-availability")).toHaveCount(0);
  await expect(node(page, "note-card").locator(".node-text")).toBeAttached();
  await expect(node(page, "note-card").locator(".board-task-availability")).toHaveCount(0);
  await node(page, "archived-card").getByRole("button", { name: "Unarchive", exact: true }).click();
  await expect(node(page, "archived-card").locator(".board-task-availability")).toHaveCount(0);
  await selectProjectView(page, "list");
  await expect(taskViewsTab(page)).toHaveAttribute("title", /· 2 tasks$/);
  await page.reload();
  await expect(taskViewsTab(page)).toHaveAttribute("title", /· 2 tasks$/);
  const saved = await app.store.snapshot(project.id);
  expect(saved.tasks.find((t) => t.id === archived.id).archived).toBe(false);
  expect(saved.boards[0].nodes).toHaveLength(4);
  expect(saved.boards[0].edges[0].id).toBe("link");
});
