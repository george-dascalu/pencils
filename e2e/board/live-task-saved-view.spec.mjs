// Board has no saved views since 0.20.70, but a Live task view made from a project's saved view
// keeps showing that view's cards.
import { test, expect, useApp } from "../fixtures.mjs";
import { seedBoard } from "../helpers/board-canvas.mjs";

const app = useApp(async (store) => {
  const project = await store.createProject({ title: "Live views", key: "LV" });
  await store.createTask(project.id, { title: "Ship the release" });
  await store.createTask(project.id, { title: "Write the notes" });
  await store.updateProject(project.id, {
    revision: (await store.snapshot(project.id)).project.revision,
    views: [{ id: "shipping", name: "Shipping", view: "list", search: "Ship" }],
  });
  await seedBoard(store, project.id, { nodes: [{ id: "query", type: "query", text: "Shipping work", x: 150, y: 150, w: 600, h: 400, view: "shipping" }], edges: [] });
  return { project };
});

test("a Live task view keeps the saved view it was made from", async ({ page }) => {
  await page.goto(`${app.base}/#project/${app.project.id}/board`);
  const rows = page.locator('[data-node="query"] .query-rows');
  await expect(rows).toContainText("Ship the release");
  await expect(rows).not.toContainText("Write the notes");
});
