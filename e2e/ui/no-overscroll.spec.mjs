// Owner request (F0.22-78): on iPad a list or the Week board could be dragged past its edges, bouncing
// back (iOS's rubber band). No view scrolls past its edges: every scroll container a view has stops
// there (overscroll-behavior: none on each axis it scrolls), on iPad and phones.
import { test, expect, onDevices, useApp } from "../fixtures.mjs";
import { reveal } from "../helpers/menu-controls.mjs";

const app = useApp(async (store) => {
  const project = await store.createProject({ title: "Bounds", key: "BD" });
  // Enough cards, dated in the week shown and with a parent, that every view has more than fits.
  let parent = null;
  for (let i = 0; i < 40; i++) {
    const card = await store.createTask(project.id, { title: `Card ${i} with a title long enough to fill the row`, status: ["todo", "in-progress", "done"][i % 3], assignee: ["Ann", "Bo"][i % 2], start: "2026-11-02", due: `2026-11-0${2 + (i % 5)}`, estimate: 3, parent: i % 4 ? parent?.id : undefined });
    if (i % 4 === 0) parent = card;
  }
  return { project };
});
const VIEWS = ["overview", "list", "tree", "table", "kanban", "calendar", "timeline", "capacity"];

// Each scroll container in the view, with the axes it scrolls that still bounce.
const bouncing = (page) => page.evaluate(() => [document.querySelector("#view-content"), ...document.querySelectorAll("#view-content *")].flatMap((el) => {
  const style = getComputedStyle(el), scrolls = (overflow) => /auto|scroll/.test(overflow);
  const axes = [
    scrolls(style.overflowX) && el.scrollWidth > el.clientWidth + 1 && style.overscrollBehaviorX !== "none" && "x",
    scrolls(style.overflowY) && el.scrollHeight > el.clientHeight + 1 && style.overscrollBehaviorY !== "none" && "y",
  ].filter(Boolean);
  return axes.length ? [`${el.id ? `#${el.id}` : `.${[...el.classList].join(".")}`} (${axes.join(", ")})`] : [];
}));

onDevices(["ipad", "phone"], () => {
  test("no view or list scrolls past its edges", async ({ page }) => {
    await page.clock.setFixedTime(new Date("2026-11-04T12:00:00"));
    for (const view of VIEWS) {
      await page.goto(`${app.base}/#project/${app.project.id}/${view}`);
      await expect(page.locator(`#view-content[data-layout-view="${view}"]`)).toBeVisible();
      await expect.poll(() => bouncing(page), view).toEqual([]);
    }
    // Every Calendar layout, the Week board's Unscheduled board included.
    await page.goto(`${app.base}/#project/${app.project.id}/calendar`);
    for (const layout of ["month", "week", "board", "agenda"]) {
      await (await reveal(page.locator("#calendar-mode"))).selectOption(layout);
      await expect(page.locator("#view-content .calendar-scroll, #view-content .calendar-agenda").first()).toBeVisible();
      await expect.poll(() => bouncing(page), layout).toEqual([]);
      // The Week board and its Unscheduled board, however full.
      if (layout === "board") expect(await page.locator(".week-board-scroll, .week-board-backlog-board").evaluateAll((els) => els.map((el) => getComputedStyle(el).overscrollBehavior))).toEqual(["none", "none"]);
    }
  });
});
