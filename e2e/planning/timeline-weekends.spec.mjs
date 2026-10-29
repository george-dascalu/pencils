// Timeline weekends: month and week headers, a Weekends toggle that only changes the view
// (task dates never change) and is remembered, a layout that fits at desktop and phone
// widths in both themes, a compressed weekday axis that still resizes, moves, nudges and
// drops onto weekdays, and an embedded board Timeline that keeps its own preference.
// Part of the cross-browser release gate.
import { test, expect, useApp } from "../fixtures.mjs";
import { setWeekends, weekendsShown } from "../helpers/menu-controls.mjs";

const seedTimeline = async (store, title) => {
  const project = await store.createProject({ title });
  await store.createTask(project.id, { title: "Project horizon", start: "2026-09-21", due: "2026-12-10" });
  const planned = await store.createTask(project.id, { title: "Weekend crossing", start: "2026-10-02", due: "2026-10-05" });
  const weekend = await store.createTask(project.id, { title: "Weekend work", start: "2026-10-03", due: "2026-10-04" });
  const unplanned = await store.createTask(project.id, { title: "Unplanned idea" });
  return { project, planned, weekend, unplanned };
};
const app = useApp(async (store) => {
  const viewing = await seedTimeline(store, "Timeline dates");
  const editing = await seedTimeline(store, "Timeline editing");
  const embedded = await seedTimeline(store, "Embedded timeline");
  const board = (await store.snapshot(embedded.project.id)).boards[0];
  await store.updateBoard(embedded.project.id, board.id, {
    revision: board.revision,
    nodes: [{ id: "live-timeline", type: "query", x: 20, y: 20, w: 1200, h: 500, text: "Embedded Timeline", viewType: "timeline", timelineScale: "day", query: {} }],
    edges: [],
  });
  return { viewing, editing, embedded: { ...embedded, board } };
});

test.use({ viewportSize: { width: 1600, height: 1000 } });

const tasks = async ({ project }) => (await app.store.snapshot(project.id)).tasks;
const task = async (seed, id) => (await tasks(seed)).find((t) => t.id === id);
const timeline = (page) => page.locator('#view-content > [data-timeline="project"]');
// Since 0.19.31 the Timeline's own controls sit on the right of the toolbar row above 600px.
const options = (page) => page.locator('#view-toolbar .view-controls [data-timeline-options="project"]');
const open = async (page, { project }) => {
  await page.goto(`${app.base}/#project/${project.id}/timeline`);
  await timeline(page).locator(".timeline-months span").first().waitFor();
};
async function dates(page, seed, start, due) {
  await expect(page.locator(`[data-timeline-task="${seed.planned.id}"]`)).toHaveAttribute("aria-valuetext", `${start} to ${due}`);
  await expect.poll(async () => (await task(seed, seed.planned.id)).start).toBe(start);
  expect((await task(seed, seed.planned.id)).due).toBe(due);
}

test("the header names months and weeks, and hiding weekends persists without editing dates", { tag: "@gate" }, async ({ page }) => {
  await open(page, app.viewing);
  await expect(timeline(page).locator(".timeline-months span").first()).toHaveText("Sept");
  await expect(timeline(page).locator('.timeline-ticks [data-date="2026-10-05"]')).toHaveAttribute("title", "Week 41 05/10/2026 to 11/10/2026");
  const original = await tasks(app.viewing);
  await setWeekends(page, false);
  await expect(timeline(page)).toHaveAttribute("data-weekends", "false");
  expect(await tasks(app.viewing), "Hiding weekends does not edit task dates").toEqual(original);
  await page.reload();
  await page.locator("[data-timeline-weekends]").first().waitFor();
  expect(await weekendsShown(page), "Weekend visibility persists").toBe(false);
});

for (const width of [1600, 390]) {
  test.describe(`${width}px`, () => {
    test.use({ viewportSize: { width, height: 844 } });
    test("the timeline fits the window with weekends shown or hidden, in both themes", { tag: "@gate" }, async ({ page }) => {
      await open(page, app.viewing);
      for (const theme of ["light", "dark"]) {
        await page.evaluate((value) => (document.documentElement.dataset.theme = value), theme);
        for (const show of [true, false]) {
          await setWeekends(page, show);
          if (await page.locator(".mobile-view-options[open]").count()) await page.getByRole("button", { name: "Close view options", exact: true }).click();
          await expect(timeline(page)).toHaveAttribute("data-weekends", String(show));
          await timeline(page).locator(".timeline-months span").first().waitFor();
          const fit = await timeline(page).evaluate((el) => ({
            pageWidth: document.documentElement.scrollWidth,
            pageHeight: document.documentElement.scrollHeight,
            bottom: el.querySelector(".timeline-scroll").getBoundingClientRect().bottom,
            width: innerWidth,
            height: innerHeight,
          }));
          expect(fit.pageWidth <= fit.width && fit.pageHeight <= fit.height + 1 && fit.bottom > fit.height - 20, `${theme}, weekends ${show}: ${JSON.stringify(fit)}`).toBe(true);
        }
      }
    });
  });
}

test("hidden weekends compress the axis while resizing, moving, nudging and dropping onto weekdays", { tag: "@gate" }, async ({ page }) => {
  const seed = app.editing;
  await open(page, seed);
  const original = await tasks(seed);
  await setWeekends(page, false);
  await options(page).locator("[data-timeline-scale]").selectOption("day");
  await timeline(page).locator('.timeline-ticks [data-date="2026-09-21"]').waitFor();
  expect(await timeline(page).locator(".timeline-ticks [data-date]").evaluateAll((els) => els.every((el) => ![0, 6].includes(new Date(el.dataset.date).getUTCDay()))), "no weekend ticks").toBe(true);
  const bar = page.locator(`[data-timeline-task="${seed.planned.id}"]`);
  const width = (locator) => locator.evaluate((el) => parseFloat(el.style.width));
  expect(await width(bar), "Friday to Monday occupies two weekdays").toBe(84);
  expect(await width(page.locator(`[data-timeline-task="${seed.weekend.id}"]`)), "Weekend-only work retains a marker and row").toBe(12);
  await setWeekends(page, true);
  await expect.poll(() => width(bar)).toBe(168);
  await setWeekends(page, false);
  await expect.poll(() => width(bar)).toBe(84);
  expect(await tasks(seed)).toEqual(original);
  await bar.scrollIntoViewIfNeeded();
  const end = await bar.locator('[data-date-end="due"]').boundingBox();
  await page.mouse.move(end.x + 4, end.y + 12);
  await page.mouse.down();
  await page.mouse.move(end.x + 46, end.y + 12, { steps: 4 });
  await page.mouse.up();
  await dates(page, seed, "2026-10-02", "2026-10-06");
  const bounds = await bar.boundingBox();
  await page.mouse.move(bounds.x + 25, bounds.y + 14);
  await page.mouse.down();
  await page.mouse.move(bounds.x + 67, bounds.y + 14, { steps: 4 });
  await page.mouse.up();
  await dates(page, seed, "2026-10-05", "2026-10-09");
  await bar.focus();
  await page.keyboard.press("Alt+ArrowLeft");
  await dates(page, seed, "2026-10-02", "2026-10-06");
  await timeline(page).locator(".timeline-scroll").evaluate((el) => (el.scrollLeft = 0));
  await timeline(page).locator(`[data-unscheduled="${seed.unplanned.id}"]`).dragTo(timeline(page).locator(".timeline-track").first(), { targetPosition: { x: 430, y: 20 } });
  await page.locator(`[data-timeline-task="${seed.unplanned.id}"]`).waitFor();
  await expect.poll(async () => (await task(seed, seed.unplanned.id)).start, "Dropping after ten weekdays lands on Monday").toBe("2026-10-05");
  expect((await task(seed, seed.weekend.id)).start).toBe("2026-10-03");
  expect((await task(seed, seed.weekend.id)).due).toBe("2026-10-04");
});

test("an embedded Timeline saves its own weekend preference with the board", { tag: "@gate" }, async ({ page }) => {
  const { project, board } = app.embedded;
  await page.goto(`${app.base}/#project/${project.id}/board`);
  const embedded = page.locator('[data-timeline="live-timeline"]');
  await embedded.waitFor();
  const embeddedToggle = embedded.locator("[data-timeline-weekends]").first();
  if ((await embeddedToggle.getAttribute("aria-pressed")) === "true") await embeddedToggle.click();
  await expect(embedded).toHaveAttribute("data-weekends", "false");
  await expect.poll(async () => (await app.store.snapshot(project.id)).boards.find((b) => b.id === board.id).nodes.find((n) => n.id === "live-timeline").timelineShowWeekends).toBe(false);
  await page.reload();
  await embedded.waitFor();
  await expect(embedded.locator("[data-timeline-weekends]").first()).toHaveAttribute("aria-pressed", "false");
});
