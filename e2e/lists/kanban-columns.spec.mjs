// Kanban shows whole columns: at every width from wide desktop to phone, with or
// without swimlanes, horizontal scrolling snaps so whole columns fill the width and
// only the next column's 36px edge peeks in (public/kanban-layout.js, since 0.19.0).
// Snapping holds at both ends and in between, after wheel and keyboard scrolling,
// rotation, sidebar changes, rerenders and Back, and never traps the edge auto-scroll
// of a card drag.
import { test, expect, useApp } from "../fixtures.mjs";
import { reveal, selectProjectView, openSidebar, closeSidebar } from "../helpers/menu-controls.mjs";

const app = useApp(async (store) => {
  const project = await store.createProject({ title: "Whole Kanban columns" });
  const first = await store.createTask(project.id, { title: "Move this card across columns", status: "backlog", assignee: "George" });
  for (let i = 0; i < 30; i++)
    await store.createTask(project.id, {
      title: `Task ${i}: a longer title that should stay inside its column`,
      status: ["backlog", "todo", "in-progress", "review", "done"][i % 5],
      assignee: i % 2 ? "Pat" : "George",
    });
  return { project, first };
});
test.use({ viewportSize: { width: 1600, height: 1000 } });

const board = (page) => page.locator("#view-content > .kanban");
// Inspect actual column edges once scrolling and resizing have settled: whole columns fill
// the width and at most one partial column shows, by no more than the peek. The layout must
// hold for two animation frames in a row (a resize observer can still move the columns), and
// the result is read in the same frame that satisfied the check.
const PEEK = 36;
async function wholeColumns(page) {
  await page.evaluate(() => delete window.__wholeColumnsLast);
  const result = await page.waitForFunction((peek) => {
    const el = document.querySelector("#view-content > .kanban");
    if (!el) return false;
    const left = el.getBoundingClientRect().left;
    const right = left + el.clientWidth;
    const columns = [...el.querySelectorAll(el.classList.contains("kanban-swimlanes") ? ".kanban-lanes-header > .column-header" : ":scope > .kanban-column")];
    const shown = columns.map((c) => c.getBoundingClientRect()).filter((r) => r.right > left + 1 && r.left < right - 1);
    const whole = shown.filter((r) => r.left >= left - 1.5 && r.right <= right + 1.5);
    const partial = shown.filter((r) => !whole.includes(r));
    const leading = partial.length && partial[0].right <= whole[0]?.left;
    const valid = whole.length && partial.length <= 1 &&
      !(partial.length && Math.min(partial[0].right, right) - Math.max(partial[0].left, left) > peek + 1.5) &&
      (leading || Math.abs(whole[0].left - left) < 1.5) && ((partial.length && !leading) || Math.abs(whole.at(-1).right - right) < 1.5);
    const key = valid ? JSON.stringify([el.scrollLeft, el.clientWidth, columns.map((c) => c.getBoundingClientRect().left)]) : null;
    const stable = key && window.__wholeColumnsLast === key;
    window.__wholeColumnsLast = key;
    if (!stable) return false;
    const visible = columns.filter((c) => {
      const r = c.getBoundingClientRect();
      return r.left >= left - 1.5 && r.right <= right + 1.5;
    });
    const peeking = columns.some((c) => {
      const r = c.getBoundingClientRect();
      return !visible.includes(c) && r.right > left + 1 && r.left < right - 1;
    });
    return { visible: visible.length, total: columns.length, first: columns.indexOf(visible[0]), peek: peeking, x: el.scrollLeft, width: el.clientWidth, column: columns[0].getBoundingClientRect().width };
  }, PEEK, { polling: "raf" });
  return result.jsonValue();
}
async function setGroup(page, value) {
  await (await reveal(page.locator("#kanban-group"))).selectOption(value);
  await page.locator(".mobile-view-options").evaluateAll((els) => els.forEach((el) => (el.open = false)));
  await page.waitForFunction((v) => document.querySelector(".kanban")?.dataset.group === v, value);
}
async function open(page, group) {
  await page.goto(`${app.base}/#project/${app.project.id}/kanban`);
  await board(page).waitFor();
  await setGroup(page, group);
}

for (const group of ["none", "assignee"]) {
  test(`grouped by ${group}: every width shows whole columns with the next one peeking, at both ends and in between`, async ({ page }) => {
    await open(page, group);
    for (const width of [1600, 1194, 834, 767, 390, 320]) {
      await test.step(`${width}px`, async () => {
        await page.setViewportSize({ width, height: 1000 });
        await board(page).evaluate((el) => (el.scrollLeft = 0));
        const initial = await wholeColumns(page);
        expect(initial.column, "Columns remain readable").toBeGreaterThanOrEqual(Math.min(225, initial.width) - 1);
        if (width === 1600) expect(initial.visible, "Wide desktop fits every column").toBe(initial.total);
        if (width <= 390) expect(initial.visible, "Phone shows one full column").toBe(1);
        if (initial.visible < initial.total) {
          expect(initial.peek, "The next column's edge stays visible").toBe(true);
          // Real horizontal wheel input, plus arbitrary scrollbar positions and the end.
          const rect = await board(page).boundingBox();
          await page.mouse.move(rect.x + rect.width / 2, rect.y + 150);
          await page.mouse.wheel(initial.column * 1.2, 0);
          await page.waitForFunction(() => document.querySelector(".kanban").scrollLeft > 5);
          await wholeColumns(page);
          await board(page).evaluate((el) => (el.scrollLeft = el.scrollWidth * 0.43));
          await wholeColumns(page);
          await board(page).evaluate((el) => (el.scrollLeft = el.scrollWidth));
          const end = await wholeColumns(page);
          expect(end.first + end.visible, "Last columns fill the viewport too").toBe(end.total);
        }
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "No horizontal page overflow").toBe(true);
      });
    }
  });

  test(`grouped by ${group}: rotation, the sidebar, rerenders, Back and the keyboard keep a whole leading column`, async ({ page }) => {
    await open(page, group);
    // Rotation and sidebar changes preserve a valid leading column.
    await page.setViewportSize({ width: 834, height: 1194 });
    await wholeColumns(page);
    await board(page).evaluate((el) => (el.scrollLeft = el.scrollWidth));
    const portrait = await wholeColumns(page);
    await page.setViewportSize({ width: 1194, height: 834 });
    const landscape = await wholeColumns(page);
    expect(landscape.first).toBe(Math.min(portrait.first, landscape.total - landscape.visible));
    await openSidebar(page);
    await closeSidebar(page);
    await wholeColumns(page);

    await page.setViewportSize({ width: 834, height: 1000 });
    await board(page).evaluate((el) => (el.scrollLeft = el.scrollWidth));
    const before = await wholeColumns(page);
    await page.locator("#kanban-show-ids").check();
    expect((await wholeColumns(page)).first, "Rerender preserves the leading column").toBe(before.first);
    await page.waitForFunction(() => history.state?.scroll?.kanbanX > 0);
    await selectProjectView(page, "overview");
    await page.goBack();
    await board(page).waitFor();
    await page.waitForFunction(() => document.querySelector(".kanban").scrollLeft > 0);
    expect((await wholeColumns(page)).first, "Back restores horizontal position").toBe(before.first);

    await board(page).evaluate((el) => el.scrollTo(0, 0));
    await board(page).focus();
    await page.keyboard.press("ArrowRight");
    await page.waitForFunction(() => document.querySelector(".kanban").scrollLeft > 5);
    await wholeColumns(page);
    if (group === "assignee") {
      await board(page).evaluate((el) => (el.scrollTop = 400));
      expect(await board(page).evaluate((el) => el.scrollTop), "Horizontal snapping leaves vertical swimlane scrolling free").toBeGreaterThan(100);
      await wholeColumns(page);
      const top = await board(page).evaluate((el) => el.getBoundingClientRect().top);
      expect(Math.abs((await page.locator(".kanban-lanes-header").boundingBox()).y - top)).toBeLessThan(2);
    }
  });
}

test("snapping does not trap the edge auto-scroll while dragging a card", async ({ page }) => {
  await open(page, "none");
  await page.setViewportSize({ width: 767, height: 1000 });
  await board(page).evaluate((el) => (el.scrollLeft = 0));
  await wholeColumns(page);
  const card = await page.locator(`[data-drag-task="${app.first.id}"]`).boundingBox();
  const rect = await board(page).boundingBox();
  await page.mouse.move(card.x + 30, card.y + 20);
  await page.mouse.down();
  await page.mouse.move(card.x + 45, card.y + 25, { steps: 4 });
  await page.waitForFunction(() => document.body.classList.contains("kanban-dragging"));
  await page.mouse.move(rect.x + rect.width - 12, rect.y + 160, { steps: 12 });
  await page.mouse.move(rect.x + rect.width - 11, rect.y + 160);
  await page.waitForFunction(() => document.querySelector(".kanban").scrollLeft > 350);
  const save = page.waitForResponse((r) => r.request().method() === "PATCH" && r.url().endsWith(`/tasks/${app.first.id}`));
  await page.mouse.up();
  expect((await save).status()).toBe(200);
  await page.waitForFunction(() => !document.body.classList.contains("kanban-dragging"));
  await wholeColumns(page);
  expect((await app.store.snapshot(app.project.id)).tasks.find((t) => t.id === app.first.id).status).not.toBe("backlog");
});
