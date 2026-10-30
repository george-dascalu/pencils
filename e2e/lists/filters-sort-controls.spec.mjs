// Owner request, 29 October 2026 (iPad screenshots): Filters and Sort are icon buttons, the
// Filters popup labels every field above a control of one width with Clear filters in a
// footer, and dragging a Kanban card shows a plain copy of the card instead of a black box.
import { test, expect, onDevices, useApp } from "../fixtures.mjs";

const app = useApp(async (store) => {
  const project = await store.createProject({ title: "Filters and sort", key: "FS" });
  const first = await store.createTask(project.id, { title: "Drag me", status: "backlog" });
  for (let i = 0; i < 5; i++) await store.createTask(project.id, { title: `Task ${i}`, status: "todo" });
  return { project, first };
});
const open = async (page, view) => {
  await page.goto(`${app.base}/#project/${app.project.id}/${view}`);
  await page.locator(`.main[data-layout-view="${view}"] #view-content :is(.task-row, .kanban-card)`).first().waitFor();
};
const filters = (page) => page.locator('[data-board-menu="filters"]');

onDevices(["ipad", "desktop"], () => {
  test("Filters and Sort are icon buttons; the Filters badge counts active filters", async ({ page }) => {
    await open(page, "kanban");
    const summary = filters(page).locator("> summary"), sort = page.locator("[data-sort-menu]");
    for (const control of [summary, sort]) {
      await expect(control.locator(":scope > .icon")).toHaveCount(1);
      expect((await control.textContent()).trim(), "no text label").toBe("");
      const box = await control.boundingBox();
      expect(Math.abs(box.width - box.height), "square").toBeLessThanOrEqual(1);
    }
    await expect(summary).toHaveAttribute("aria-label", "Filters");
    await expect(page.locator("#sort")).toBeHidden();
    await expect(sort).toHaveAttribute("aria-label", "Sort: Date created");
    await sort.click();
    await page.locator("#shared-select-menu").getByRole("option", { name: "Title A–Z" }).click();
    await expect(page.locator("[data-sort-menu]")).toHaveAttribute("aria-label", "Sort: Title A–Z");
    await summary.click();
    await filters(page).locator("#filter-blocked").check();
    await expect(filters(page).locator("> summary")).toHaveAttribute("aria-label", "Filters (1 active)");
    await expect(filters(page).locator(".filter-count")).toHaveText("1");
  });

  test("the Filters popup labels every field and lines them up, with Clear filters in a footer", async ({ page }) => {
    await open(page, "list");
    await filters(page).locator("> summary").click();
    const panel = filters(page).locator(".board-menu-panel");
    await expect(panel.locator(":scope > .field")).toHaveText(["Status", "Type", "Assignee", "Tag", "Deadline", "Completion", "Group by"].map((name) => new RegExp(`^${name}`)));
    const edges = await panel.locator(":scope > .field > :is(input, select)").evaluateAll((els) => els.map((el) => { const r = el.getBoundingClientRect(); return [Math.round(r.left), Math.round(r.right)]; }));
    expect(new Set(edges.map(String)).size, `one width: ${JSON.stringify(edges)}`).toBe(1);
    const clear = panel.locator(".menu-footer > [data-action=filters-reset]");
    await expect(clear).toBeVisible();
    expect(await clear.evaluate((el) => getComputedStyle(el).borderTopStyle), "a bordered button, not a menu row").toBe("solid");
    await page.keyboard.press("Escape");
    await open(page, "kanban");
    await filters(page).locator("> summary").click();
    await expect(filters(page).locator("#group-by"), "Kanban groups with swimlanes instead").toHaveCount(0);
  });
});

test("keyboard: focus stays on Sort after choosing, arrows reach Clear filters, and Group by shows only where it works", async ({ page }) => {
  await open(page, "list");
  await page.locator("[data-sort-menu]").click();
  await page.locator("#shared-select-menu").getByRole("option", { name: "Priority" }).click();
  await expect(page.locator("[data-sort-menu]")).toHaveAttribute("aria-label", "Sort: Priority");
  await expect(page.locator("[data-sort-menu]"), "focus survives the toolbar rebuild").toBeFocused();
  await filters(page).locator("> summary").focus();
  await page.keyboard.press("ArrowDown");
  await expect(filters(page).locator("[data-action=filters-reset]")).toBeFocused();
  await page.keyboard.press("Escape");
  await open(page, "tree");
  await filters(page).locator("> summary").click();
  await expect(filters(page).locator("#group-by"), "Tree rows don't group").toHaveCount(0);
});

onDevices(["phone"], () => test("phone Table keeps only its own sort", async ({ page }) => {
  await page.goto(`${app.base}/#project/${app.project.id}/table`);
  await page.locator(".spreadsheet").waitFor();
  await expect(page.locator("[data-sort-menu]")).toHaveCount(0);
}));

test("a dragged Kanban card's preview has no tilt or shadow, which Safari paints black", async ({ page }) => {
  await open(page, "kanban");
  await page.evaluate(() => document.addEventListener("dragstart", () => {
    const ghost = document.querySelector(".kanban-drag-image"), style = ghost && getComputedStyle(ghost);
    window.__preview = style && [style.transform, style.boxShadow, style.backgroundColor];
  }));
  const card = await page.locator(`[data-drag-task="${app.first.id}"]`).boundingBox();
  await page.mouse.move(card.x + 30, card.y + 20);
  await page.mouse.down();
  await page.mouse.move(card.x + 45, card.y + 25, { steps: 4 });
  await page.waitForFunction(() => window.__preview);
  await page.mouse.up();
  const [transform, shadow, background] = await page.evaluate(() => window.__preview);
  expect(transform).toBe("none");
  expect(shadow).toBe("none");
  expect(background, "opaque").not.toMatch(/rgba\(.*, 0\)|transparent/);
});

// Owner request, 30 October 2026: the Sort button shows the active sort's own icon with its
// direction, tinted, and the plain sort icon for Manual order, which is no sort.
onDevices(["desktop", "phone"], () => test("the Sort button shows which sort is active, or none", async ({ page, device }) => {
  await open(page, "list");
  const sort = page.locator("[data-sort-menu]");
  const glyphs = [];
  for (const name of ["Date created", "Title A–Z", "Priority", "Due date", "Status"]) {
    await sort.click();
    await page.locator("#shared-select-menu").getByRole("option", { name, exact: true }).click();
    await expect(sort, `${device}: ${name}`).toHaveAttribute("aria-label", `Sort: ${name}`);
    await expect(sort, `${device}: ${name} is active`).toHaveClass(/sort-active/);
    await expect(sort.locator(".sort-direction .icon"), `${device}: ${name} shows its direction`).toHaveCount(1);
    glyphs.push(await sort.locator(":scope > .icon").evaluate((el) => el.innerHTML));
  }
  expect(new Set(glyphs).size, `${device}: each sort has its own icon`).toBe(glyphs.length);
  await sort.click();
  await page.locator("#shared-select-menu").getByRole("option", { name: "Manual order", exact: true }).click();
  await expect(sort).toHaveAttribute("aria-label", "Sort: Manual order");
  await expect(sort, `${device}: manual order is no sort`).not.toHaveClass(/sort-active/);
  await expect(sort.locator(".icon"), `${device}: the plain icon, no direction`).toHaveCount(1);
  expect(glyphs, `${device}: unlike any sort`).not.toContain(await sort.locator(":scope > .icon").evaluate((el) => el.innerHTML));
}));
