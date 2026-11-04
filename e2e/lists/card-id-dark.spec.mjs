// Owner request (F0.22-4, 4 November 2026, dark-theme List and Table screenshots): the card ID had
// a background of its own in dark mode. It sits on the row like the title, as in light mode.
import { test, expect, useApp } from "../fixtures.mjs";

const app = useApp(async (store) => {
  const project = await store.createProject({ title: "Card IDs", key: "ID" });
  await store.createTask(project.id, { title: "An ID on its row", assignee: "George", status: "todo", priority: "medium" });
  return { project };
});

for (const view of ["list", "tree", "table"]) test(`${view}: the card ID has no fill of its own in light or dark mode`, async ({ page }) => {
  await page.goto(`${app.base}/#project/${app.project.id}/${view}`);
  const ids = page.locator(".main .task-id:visible");
  await expect(ids.first()).toBeVisible();
  for (const theme of ["light", "dark"]) {
    await page.evaluate((t) => (document.documentElement.dataset.theme = t), theme);
    const fills = await ids.evaluateAll((els) => els.map((el) => getComputedStyle(el).backgroundColor));
    expect(fills, theme).toEqual(fills.map(() => "rgba(0, 0, 0, 0)"));
  }
});
