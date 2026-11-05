// Board, split by tier (F0.22-21) from board-task-state.spec.mjs: a board of placeholder cards (the
// task was deleted) fits desktop and phone screens in both themes.
import { test, expect, onDevices, useApp } from "../fixtures.mjs";

const app = useApp();
const node = (page, id) => page.locator(`[data-node="${id}"]`);

onDevices(["desktop", "phone"], () => test("placeholder cards fit the screen in both themes", async ({ page }) => {
  const { store } = app;
  const project = await store.createProject({ title: "Card availability" });
  const live = await store.createTask(project.id, { title: "Soon deleted" });
  const board = (await store.snapshot(project.id)).boards[0];
  await store.updateBoard(project.id, board.id, { revision: board.revision, nodes: [
    { id: "deleted-card", type: "task", task: live.id, x: 500, y: 100, w: 340, h: 270 },
    { id: "note-card", type: "task", task: live.id, displayAs: "note", x: 100, y: 420, w: 340, h: 270 },
    { id: "missing-card", type: "task", task: "t-missing", x: 500, y: 420, w: 340, h: 270 },
  ], edges: [] });
  await store.deleteTask(project.id, live.id, live.revision);
  await page.goto(`${app.base}/#project/${project.id}/board`);
  await page.locator("#canvas").waitFor();
  await expect(node(page, "deleted-card").getByText("Deleted card", { exact: true })).toBeAttached();
  for (const theme of ["light", "dark"]) {
    await page.evaluate((t) => (document.documentElement.dataset.theme = t), theme);
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), `${theme}: no horizontal scroll`).toBe(false);
  }
}));

