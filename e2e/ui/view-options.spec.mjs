// Owner requests (T5, 0.20.77): phones' View options lists each filter or setting as one row,
// its name beside its control, so the panel is compact like Obsidian's menus, keeping 44px
// touch targets.
import { test, expect, onDevices, useApp } from "../fixtures.mjs";

const app = useApp(async (store) => {
  const project = await store.createProject({ title: "View options", key: "VO" });
  await store.createTask(project.id, { title: "A task", status: "todo" });
  return { project };
});

onDevices(["phone"], () => {
  for (const view of ["list", "table"]) test(`${view}: View options lists each field as one row`, async ({ page }) => {
    await page.goto(`${app.base}/#project/${app.project.id}/${view}`);
    await page.locator(".mobile-view-options > summary").click();
    // Table's own grouping and column filters sit in menus inside the panel.
    if (view === "table") for (const menu of ["table-groups", "table-filters"]) await page.locator(`.mobile-view-options-panel [data-board-menu="${menu}"] > summary`).click();
    const rows = await page.locator(".mobile-view-options-panel .field").evaluateAll((els) => els.filter((el) => el.getClientRects().length).map((el) => {
      const control = el.querySelector("select, input"), r = el.getBoundingClientRect(), c = control.getBoundingClientRect();
      const name = document.createRange();
      name.selectNodeContents(el.firstChild);
      const n = name.getBoundingClientRect();
      return { name: el.firstChild.textContent.trim(), height: r.height, control: c.height, offset: c.left - r.left, nameHeight: n.height, nameEnd: n.right - r.left };
    }));
    expect(rows.length, "the filters are listed").toBeGreaterThan(4);
    for (const row of rows) {
      expect(row.height, `${row.name}: one line`).toBeLessThanOrEqual(row.control + 1);
      expect(row.nameHeight, `${row.name}: the name fits one line`).toBeLessThanOrEqual(20);
      expect(row.offset, `${row.name}: the name sits before the control`).toBeGreaterThan(row.nameEnd);
      expect(row.control, `${row.name}: a 44px target`).toBeGreaterThanOrEqual(44);
    }
  });
});
