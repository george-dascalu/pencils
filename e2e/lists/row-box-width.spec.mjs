// Owner report, 30 October 2026 (iPad): List rows' field boxes varied in width and the priority sat
// outside its box, over the due date. Every row's box has one width and holds its three fields.
// Chromium never showed it; Firefox (and Safari) shrank the box, so this runs in the @gate engines.
import { test, expect, useApp } from "../fixtures.mjs";

const app = useApp(async (store) => {
  const project = await store.createProject({ title: "Row boxes", key: "RB" });
  for (const [i, status] of ["done", "review", "in-progress", "todo", "backlog"].entries())
    await store.createTask(project.id, { title: `What if project planning felt a little less like work ${i}?`, status, priority: ["low", "medium", "high", "urgent", "none"][i], assignee: i % 2 ? "Alex" : "", due: i % 2 ? `2026-11-0${i}` : "" });
  return { project };
});

for (const width of [1000, 1440])
  test(`at ${width}px every List row's field box has one width and holds its fields @gate`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await page.goto(`${app.base}/#project/${app.project.id}/list`);
    await expect(page.locator(".task-row")).toHaveCount(5);
    await page.locator(".desktop-sidebar-toggle").click();
    await expect(page.locator(":root")).toHaveAttribute("data-sidebar", "collapsed");
    const rows = await page.locator(".task-row").evaluateAll((rows) => rows.map((row) => {
      const box = (s) => row.querySelector(s).getBoundingClientRect();
      const fields = box(".row-fields");
      return {
        width: Math.round(fields.width),
        inside: [".row-assignee", ".row-status", ".row-priority"].every((s) => { const r = box(s); return r.left >= fields.left - 1 && r.right <= fields.right + 1; }),
        clearOfDue: box(".row-priority").right <= box(".row-due").left + 1,
      };
    }));
    const facts = JSON.stringify(rows);
    expect(new Set(rows.map((r) => r.width)).size, `one box width ${facts}`).toBe(1);
    expect(rows.every((r) => r.inside && r.clearOfDue), `fields inside their box, clear of the date ${facts}`).toBe(true);
  });
