// Sheets-style Table tools: column menus with hover, pressed and focus states and
// keyboard navigation, focus restored after sorting, grouping and hiding, natural and
// multi-column sorting, touch menus, and both themes. Grouping and filters are in
// table-tools-filters.spec.mjs (split so the two run side by side, F0.22-6).
// Desktop tests belong to the cross-browser release gate.
import { test, expect, onDevices, useApp } from "../fixtures.mjs";
import { seedTable, tableHelpers } from "./table-tools-setup.mjs";

const gate = { tag: "@gate" };
const app = useApp(seedTable);
const { rows, firstTitle, columnMenu, action, background, groupBy, thenBy, resetGrouping, open, reset, addFilter } = tableHelpers(app);

test.describe("desktop", () => {
  test.use({ viewportSize: { width: 1500, height: 1000 } });

  // One test per theme, side by side in two workers (F0.22-6).
  test.describe(() => {
    test.describe.configure({ mode: "parallel" });
    for (const theme of ["light", "dark"]) test(`${theme}: column menus show hover, pressed and focus states, navigate by keyboard and restore focus after sorting and grouping`, gate, async ({ page }) => {
      await open(page);
      await expect(rows(page)).toHaveCount(100);
      await expect(page.locator(".pagination")).toHaveText(/Page 1 of 2/);
      // Column actions share real feedback and keep keyboard focus across redraws.
      await page.evaluate((theme) => window.PencilsAppearance.write({ theme }), theme);
      const trigger = columnMenu(page, "title").locator("summary");
      await trigger.click();
      await page.mouse.move(2, 2);
      const ascending = action(page, "title", "asc");
      const resting = await background(ascending);
      await ascending.hover();
      await expect.poll(() => background(ascending), `${theme}: row hover is visible`).not.toBe(resting);
      const hover = await background(ascending);
      await page.mouse.down();
      await expect.poll(() => background(ascending), `${theme}: pressed state is distinct`).not.toBe(hover);
      await page.mouse.move(2, 2);
      await page.mouse.up();
      if (!(await columnMenu(page, "title").evaluate((el) => el.open))) await trigger.click();
      await trigger.focus();
      await page.keyboard.press("ArrowDown");
      await expect(ascending).toBeFocused();
      await expect(ascending).toHaveCSS("outline-style", "solid");
      await page.keyboard.press("ArrowDown");
      await expect(action(page, "title", "desc")).toBeFocused();
      await page.keyboard.press("End");
      await expect(action(page, "title", "hide")).toBeFocused();
      await page.keyboard.press("Home");
      await expect(ascending).toBeFocused();
      await page.keyboard.press("Escape");
      await expect(trigger).toBeFocused();
      await page.keyboard.press("ArrowUp");
      await expect(action(page, "title", "hide")).toBeFocused();
      await page.keyboard.press("Tab");
      await page.waitForFunction(() => !document.querySelector('th[data-column-key="title"] .table-header-menu').open);
      await trigger.click();
      const panel = await columnMenu(page, "title").locator(".board-menu-panel").boundingBox();
      expect(panel.width <= 241 && panel.x >= 0, JSON.stringify(panel)).toBe(true);
      // Clicking the far edge of a row activates the same action as its label.
      const b = await ascending.boundingBox();
      await page.mouse.click(b.x + b.width - 8, b.y + b.height / 2);
      await expect(page.locator('th[data-column-key="title"]')).toHaveAttribute("aria-sort", "ascending");
      await expect(trigger, "Sorting restores focus to the rebuilt trigger").toBeFocused();
      await trigger.click();
      await expect(ascending).toHaveAttribute("data-applied", "true");
      await page.keyboard.press("ArrowDown");
      await page.keyboard.press("ArrowDown");
      await page.keyboard.press("Enter");
      await expect(page.locator('th[data-column-key="title"]')).toHaveAttribute("aria-sort", "descending");
      await expect(trigger, "Keyboard activation restores focus").toBeFocused();
      await trigger.click();
      await action(page, "title", "group").click();
      await expect(page.locator(".table-group-row").first()).toBeAttached();
      await expect(trigger).toBeFocused();
      await reset(page);
    });
  });

  test("hiding a column focuses a remaining header, and a column's Filter action focuses its own field", gate, async ({ page }) => {
    await open(page);
    await columnMenu(page, "priority").locator("summary").click();
    await action(page, "priority", "hide").click();
    await expect(columnMenu(page, "priority")).toHaveCount(0);
    await expect.poll(() => page.locator(".table-header-menu > summary").evaluateAll((els) => els.includes(document.activeElement)), "Hiding a column focuses a remaining header").toBe(true);
    await page.locator('[data-board-menu="table-columns"] > summary').click();
    await page.locator('[data-column-visible="priority"]').check();
    await page.locator('[data-feature="columns-close"]').click();
    await addFilter(page, "assignee");
    await page.keyboard.press("Escape");
    await columnMenu(page, "priority").locator("summary").click();
    await action(page, "priority", "filter").click();
    await expect.poll(() => page.locator('[data-table-filter="1"]').evaluateAll((els) => els.includes(document.activeElement)), "Filter action focuses its own field, not an earlier filter").toBe(true);
    await reset(page);
  });

  // Owner request T40 (1 November 2026; T74): Sort is an icon menu like the other views', with a
  // badge counting its sorts.
  test("Sort is an icon menu with a badge counting the sorts", async ({ page }) => {
    await open(page);
    const sort = page.locator('[data-board-menu="table-sorts"] > summary');
    await expect(sort).toHaveAttribute("aria-label", "Sort");
    expect(await sort.evaluate((el) => el.innerText.trim()), "an icon, no text").toBe("");
    await sort.click();
    await page.locator('[data-table-action="add-sort"]').click();
    await expect(sort).toHaveAttribute("aria-label", "Sort (1 active)");
    await expect(sort.locator(".filter-count")).toHaveText("1");
    await page.locator('[data-table-action="clear-sorts"]').click();
    await expect(sort).toHaveAttribute("aria-label", "Sort");
  });

  test("titles sort naturally, Shift adds a second sort, and a third click clears sorting", gate, async ({ page }) => {
    await open(page);
    const sortBy = (name) => page.getByRole("button", { name: `Sort by ${name}`, exact: true });
    await sortBy("Title").click();
    await expect(firstTitle(page)).toHaveValue("Needle after page one");
    await sortBy("Priority").click({ modifiers: ["Shift"] });
    await expect(page.locator(".table-sort-indicator")).toHaveCount(2);
    await sortBy("Title").click();
    await expect(firstTitle(page)).toHaveValue("Task 109");
    await sortBy("Title").click();
    await expect(page.locator(".table-sort-indicator")).toHaveCount(0);
  });
});

onDevices(["phone"], () => {
  test("on phones the column menu fits the screen with 44px actions, and Reset grouping fits the touch menu", async ({ page }) => {
    await open(page);
    const { width, height } = page.viewportSize();
    await columnMenu(page, "title").locator("summary").tap();
    const bounds = await columnMenu(page, "title").locator(".board-menu-panel").boundingBox();
    expect(bounds.x >= 0 && bounds.x + bounds.width <= width && bounds.y + bounds.height <= height, JSON.stringify(bounds)).toBe(true);
    expect((await action(page, "title", "desc").boundingBox()).height, "Touch action rows have a generous target").toBeGreaterThanOrEqual(44);
    await action(page, "title", "desc").tap();
    await expect(page.locator('th[data-column-key="title"]')).toHaveAttribute("aria-sort", "descending");
    expect(await columnMenu(page, "title").evaluate((el) => el.open)).toBe(false);
    await page.locator(".mobile-view-options > summary").tap();
    await page.locator('[data-board-menu="table-groups"] > summary').tap();
    await groupBy(page).selectOption("assignee");
    await thenBy(page).selectOption("priority");
    const resetBounds = await resetGrouping(page).boundingBox();
    expect(resetBounds.height >= 44 && resetBounds.x >= 0 && resetBounds.x + resetBounds.width <= width, `Grouping reset fits the touch menu ${JSON.stringify(resetBounds)}`).toBe(true);
    await resetGrouping(page).tap();
    await expect(page.locator(".table-group-row")).toHaveCount(0);
    await expect(page.locator('th[data-column-key="title"]')).toHaveAttribute("aria-sort", "descending");
    await expect(resetGrouping(page)).toBeDisabled();
  });
});
