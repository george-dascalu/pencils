// Owner requests: phones' View options lists each filter as one row, its name beside its control,
// so the panel is compact like Obsidian's menus, keeping 44px touch targets (T5, 0.20.77). Its
// button looks like the sort button beside it and, as sort shows the active sort, counts the
// active filters (T6, 0.20.78).
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
  test("the View options button looks like the sort button and counts active filters", async ({ page }) => {
    await page.goto(`${app.base}/#project/${app.project.id}/list`);
    const options = page.locator(".mobile-view-options > summary"), sort = page.locator("#sort-button");
    const look = (locator) => locator.evaluate((el) => {
      const cs = getComputedStyle(el);
      return { border: `${cs.borderTopWidth} ${cs.borderTopStyle}`, background: cs.backgroundColor, radius: cs.borderTopLeftRadius, width: el.offsetWidth, height: el.offsetHeight };
    });
    const color = (locator) => locator.evaluate((el) => getComputedStyle(el).color);
    expect(await look(options)).toEqual(await look(sort));
    // The default sort is active, so the sort button wears the active colour that filters take on.
    await expect(sort).toHaveClass(/sort-active/);
    await expect(options.locator(".filter-count")).toHaveCount(0);
    await options.click();
    await page.locator(".mobile-view-options-panel #filter-status").selectOption("todo");
    await expect(options.locator(".filter-count")).toHaveText("1");
    await expect(options).toHaveAccessibleName("View options (1 filter active)");
    expect(await color(options)).toBe(await color(sort));
    await page.locator(".mobile-view-options-panel #filter-status").selectOption("all");
    await expect(options.locator(".filter-count"), "no badge once the filters are clear").toHaveCount(0);
    await expect(options).toHaveAccessibleName("View options");
  });
});
