// Timeline selection: a row is scheduled with two clicks or taps (or Enter, arrows, Enter),
// nothing saves until the end date is chosen, Escape and other controls cancel, the end can't
// precede the start and source-owned rows stay protected. A custom range clips bars, fills the
// component, survives a reload and rejects invalid bounds; hidden weekends and embedded board
// Timelines use the same selection without moving the board camera.
// Part of the cross-browser release gate.
import { test as base, expect, useApp } from "../fixtures.mjs";
import { clickControl, reveal, setWeekends } from "../helpers/menu-controls.mjs";
import { timelineAxis } from "../../public/timeline-dates.js";

// The suite uses a touch-capable desktop window (fine pointer plus touch events), so rows can
// be tapped as well as clicked in every gate browser.
const test = base.extend({
  context: async ({ browser, viewportSize }, use) => {
    const context = await browser.newContext({ viewport: viewportSize || { width: 1500, height: 1000 }, hasTouch: true, reducedMotion: "reduce" });
    await use(context);
    await context.close();
  },
});

// Every project has the same four rows, so the axis starts on 19 October.
async function seed(store, title, { work = {}, other = {} } = {}) {
  const project = await store.createProject({ title });
  const horizon = await store.createTask(project.id, { title: "Long task", start: "2026-10-19", due: "2026-11-20" });
  const workTask = await store.createTask(project.id, { title: "Unplanned work", ...work });
  const otherTask = await store.createTask(project.id, { title: "Another task", ...other });
  const source = await store.createTask(project.id, { title: "Source task", due: "2026-11-25" });
  const file = store.file(project.id, "tasks", source.id), record = await store.read(file);
  await store.write(file, { ...record.data, source: { provider: "jira", external_id: "one" } }, record.body, record);
  return { project, horizon, work: workTask, other: otherTask, source };
}
const app = useApp(async (store) => {
  const embedded = await seed(store, "Embedded selection", { work: { start: "2026-10-22", due: "2026-10-25" } });
  const board = (await store.snapshot(embedded.project.id)).boards[0];
  const updated = await store.updateBoard(embedded.project.id, board.id, { revision: board.revision, nodes: [{ id: "timeline", type: "query", text: "Embedded timeline", x: 20, y: 20, w: 1200, h: 620, viewType: "timeline", timelineScale: "day", query: {} }], edges: [] });
  return {
    twoTaps: await seed(store, "Two click scheduling"),
    picking: await seed(store, "Explicit picking"),
    cancelling: await seed(store, "Cancelled selections"),
    keyboard: await seed(store, "Keyboard selection"),
    range: await seed(store, "Custom range"),
    rangeEditing: await seed(store, "Custom range editing", { work: { start: "2026-10-21", due: "2026-10-24" } }),
    invalid: await seed(store, "Invalid range"),
    layout: await seed(store, "Range layout"),
    weekendOnly: await seed(store, "Weekend-only range"),
    embedded: { ...embedded, board: updated },
  };
});

const track = (page, id) => page.locator(`[data-timeline-row="${id}"] [data-schedule-target]`);
const current = async ({ project }, id) => (await app.store.snapshot(project.id)).tasks.find((t) => t.id === id);
const tasks = async ({ project }) => (await app.store.snapshot(project.id)).tasks;
const rangePanel = (page) => page.locator("#timeline-range-popover");
// No task changes are waiting to be sent.
const settle = (page) => page.waitForFunction(() => Object.keys(localStorage).filter((k) => k.startsWith("pencils:pending:") && !k.endsWith(":lease")).every((k) => !JSON.parse(localStorage.getItem(k) || "[]").length));
// The screen position of `date` on a row, scrolling the timeline to it when needed.
async function point(page, id, date) {
  const t = track(page, id);
  const info = await t.evaluate((el) => { const root = el.closest("[data-timeline]"); return { min: +root.dataset.min, unit: +root.dataset.unit, weekends: root.dataset.weekends !== "false" }; });
  const offset = timelineAxis(info.min, info.unit, info.weekends).x(date) + info.unit / 2;
  await t.evaluate((el, x) => { const scroll = el.closest(".timeline-scroll"); if (x > scroll.clientWidth - 280) scroll.scrollLeft = x - (scroll.clientWidth - 280) / 2; }, offset);
  const b = await t.boundingBox(), width = await t.evaluate((el) => el.clientWidth), zoom = b.width / width;
  return { x: b.x + offset * zoom, y: b.y + b.height / 2 };
}
async function tap(page, id, date) {
  const p = await point(page, id, date);
  await page.touchscreen.tap(p.x, p.y);
}
async function waitDates(page, seed, id, start, due) {
  await expect(page.locator(`[data-timeline-task="${id}"]`)).toHaveAttribute("aria-valuetext", `${start} to ${due}`);
  await settle(page);
  expect((await current(seed, id)).start).toBe(start);
  expect((await current(seed, id)).due).toBe(due);
}
async function custom(page, start, end) {
  await clickControl(page.locator("[data-timeline-range]"));
  await rangePanel(page).getByLabel("Timeline start date", { exact: true }).fill(start);
  await rangePanel(page).getByLabel("Timeline end date", { exact: true }).fill(end);
  await rangePanel(page).getByRole("button", { name: "Apply range", exact: true }).click();
  await rangePanel(page).waitFor({ state: "detached" });
  await expect(page.locator("[data-timeline]").first()).toHaveAttribute("data-range-start", start);
  await expect(page.locator("[data-timeline]").first()).toHaveAttribute("data-range-end", end);
}
async function openDays(page, { project }) {
  await page.goto(`${app.base}/#project/${project.id}/timeline`);
  await (await reveal(page.locator("[data-timeline-scale]"))).selectOption("day");
  if (await page.locator(".mobile-view-options[open]").count()) await page.getByRole("button", { name: "Close view options", exact: true }).click();
  await expect(page.locator("[data-timeline]").first()).toHaveAttribute("data-scale", "day");
}
const reload = (page) => Promise.all([page.waitForEvent("domcontentloaded"), page.evaluate(() => location.reload())]);

test("the vault rejects an embedded range that ends before it starts", async () => {
  const { project, board } = app.embedded;
  await expect(app.store.updateBoard(project.id, board.id, { revision: board.revision, nodes: [{ ...board.nodes[0], timelineRange: { start: "2026-12-01", end: "2026-11-01" } }] })).rejects.toThrow(/valid timeline/);
});

test("two taps schedule a row and the first one saves nothing", { tag: "@gate" }, async ({ page }) => {
  const seed = app.twoTaps;
  await openDays(page, seed);
  await tap(page, seed.work.id, "2026-10-21");
  await page.locator(".timeline-range-preview").waitFor();
  expect((await current(seed, seed.work.id)).start, "First click does not save a partial schedule").toBeUndefined();
  await expect(page.locator("#task-dates-popover,#task-form")).toHaveCount(0);
  await tap(page, seed.work.id, "2026-10-24");
  await waitDates(page, seed, seed.work.id, "2026-10-21", "2026-10-24");
});

test("Choose on timeline replaces dates even when a bar covers the whole row", { tag: "@gate" }, async ({ page }) => {
  const seed = app.picking;
  await openDays(page, seed);
  await page.locator(`[data-task-dates="${seed.horizon.id}"]`).click();
  await page.getByRole("button", { name: "Choose on timeline", exact: true }).click();
  await tap(page, seed.horizon.id, "2026-10-19");
  await tap(page, seed.horizon.id, "2026-11-20");
  await waitDates(page, seed, seed.horizon.id, "2026-10-19", "2026-11-20");
});

test("Escape and other controls cancel a selection, an earlier end is refused, and one day schedules", { tag: "@gate" }, async ({ page }) => {
  const seed = app.cancelling, { other } = seed;
  await openDays(page, seed);
  await page.locator(".timeline-scroll").evaluate((el) => (el.scrollLeft = 0));
  await tap(page, other.id, "2026-10-22");
  await page.locator(".timeline-range-preview").waitFor();
  await page.keyboard.press("Escape");
  await expect(page.locator(".timeline-range-preview")).toHaveCount(0);
  expect((await current(seed, other.id)).due ?? null).toBeNull();
  await tap(page, other.id, "2026-10-22");
  await page.locator(".timeline-range-preview").waitFor();
  await clickControl(page.locator("[data-timeline-range]"));
  await expect(page.locator(".timeline-range-preview"), "Other controls cancel unapplied selection").toHaveCount(0);
  await page.locator("[data-range-close]").click();
  await tap(page, other.id, "2026-10-22");
  await tap(page, other.id, "2026-10-20");
  await expect(page.locator(".timeline-hint")).toHaveText(/on or after/);
  expect((await current(seed, other.id)).start).toBeUndefined();
  await tap(page, other.id, "2026-10-22");
  await waitDates(page, seed, other.id, "2026-10-22", "2026-10-22");
});

test("the keyboard chooses start and end, and source-owned rows cannot be scheduled", { tag: "@gate" }, async ({ page }) => {
  const seed = app.keyboard, { other, source } = seed;
  await openDays(page, seed);
  await track(page, other.id).focus();
  await page.keyboard.press("Enter");
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("Enter");
  await waitDates(page, seed, other.id, "2026-10-19", "2026-10-21");
  const imported = await current(seed, source.id);
  await tap(page, source.id, "2026-10-23");
  await tap(page, source.id, "2026-10-26");
  await expect(page.locator(".timeline-range-preview")).toHaveCount(0);
  await settle(page);
  expect(await current(seed, source.id)).toEqual(imported);
});

test("a custom range clips bars, marks rows outside it, fills the component and survives a reload", { tag: "@gate" }, async ({ page }) => {
  const seed = app.range;
  await openDays(page, seed);
  const beforeRange = await tasks(seed);
  await custom(page, "2026-10-20", "2026-10-27");
  const full = page.locator(`[data-timeline-task="${seed.horizon.id}"]`), outside = page.locator(`[data-timeline-row="${seed.source.id}"] .timeline-outside`);
  await expect(full).toHaveClass(/clipped-start/);
  await expect(full).toHaveClass(/clipped-end/);
  await expect(outside).toHaveText("Outside range");
  await expect(outside).toBeVisible();
  expect(await tasks(seed)).toEqual(beforeRange);
  expect(await page.locator(".timeline-ruler").evaluate((el) => [...el.querySelectorAll("[data-date]")].every((e) => e.dataset.date <= "2026-10-27"))).toBe(true);
  // Ranges stretch to fill the component without extending the last date.
  const geometry = await page.locator("[data-timeline]").evaluate((el) => ({ unit: +el.dataset.unit, width: el.querySelector(".timeline-ruler").clientWidth }));
  expect(Math.abs(geometry.unit * 8 - geometry.width), JSON.stringify(geometry)).toBeLessThan(1);
  await reload(page);
  await page.locator('[data-range-end="2026-10-27"]').waitFor();
});

test("bars drag and rows schedule by keyboard inside a custom range with weekends hidden", { tag: "@gate" }, async ({ page }) => {
  const seed = app.rangeEditing, { work, other } = seed;
  await openDays(page, seed);
  await custom(page, "2026-10-20", "2026-10-27");
  // The existing bar editor and drags stay available with custom geometry.
  const moveBar = page.locator(`[data-timeline-task="${work.id}"]`), box = await moveBar.boundingBox();
  const unit = await page.locator("[data-timeline]").evaluate((el) => +el.dataset.unit);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + unit, box.y + box.height / 2, { steps: 6 });
  await page.mouse.up();
  await waitDates(page, seed, work.id, "2026-10-22", "2026-10-25");
  await setWeekends(page, false);
  await expect(page.locator("[data-timeline]").first()).toHaveAttribute("data-weekends", "false");
  await track(page, other.id).focus();
  await page.keyboard.press("Enter");
  for (let i = 0; i < 5; i++) await page.keyboard.press("ArrowRight");
  await page.keyboard.press("Enter");
  await waitDates(page, seed, other.id, "2026-10-20", "2026-10-27");
});

test("invalid range bounds stay editable and never alter the timeline", { tag: "@gate" }, async ({ page }) => {
  const seed = app.invalid;
  await openDays(page, seed);
  await custom(page, "2026-10-20", "2026-10-27");
  await clickControl(page.locator("[data-timeline-range]"));
  await rangePanel(page).getByLabel("Timeline start date", { exact: true }).fill("2026-11-01");
  await rangePanel(page).getByRole("button", { name: "Apply range", exact: true }).click();
  await expect(rangePanel(page).locator(".form-error")).toHaveText(/on or after/);
  await expect(page.locator("[data-timeline]").first()).toHaveAttribute("data-range-start", "2026-10-20");
  await page.keyboard.press("Escape");
  await expect(rangePanel(page)).toHaveCount(0);
});

for (const width of [1500, 390]) {
  test.describe(`${width}px`, () => {
    test.use({ viewportSize: { width, height: 844 } });
    test("the range popover and its calendar fit the screen in both themes", { tag: "@gate" }, async ({ page }) => {
      const seed = app.layout;
      await openDays(page, seed);
      await custom(page, "2026-10-20", "2026-10-27");
      await setWeekends(page, false);
      if (await page.locator(".mobile-view-options[open]").count()) await page.getByRole("button", { name: "Close view options", exact: true }).click();
      if (width <= 600) await page.locator(".mobile-view-options [data-timeline-range]").waitFor({ state: "attached" });
      for (const theme of ["light", "dark"]) {
        await page.evaluate((t) => (document.documentElement.dataset.theme = t), theme);
        await clickControl(page.locator("[data-timeline-range]"));
        const box = await rangePanel(page).boundingBox();
        expect(box.x >= 0 && box.x + box.width <= width && box.y + box.height <= 844, JSON.stringify(box)).toBe(true);
        await rangePanel(page).getByRole("button", { name: "Choose Timeline start date", exact: true }).click();
        await page.locator("#shared-date-picker").waitFor();
        await page.keyboard.press("Escape");
        await expect(page.locator("#shared-date-picker")).toBeHidden();
        await rangePanel(page).getByRole("button", { name: "Close timeline range" }).click();
        await expect(rangePanel(page)).toHaveCount(0);
      }
    });
  });
}

test("a range of only hidden weekend days cannot schedule an invisible Monday, and Automatic range resets it", { tag: "@gate" }, async ({ page }) => {
  const seed = app.weekendOnly;
  await openDays(page, seed);
  await setWeekends(page, false);
  const prior = await tasks(seed);
  await custom(page, "2026-10-24", "2026-10-25");
  await track(page, seed.other.id).focus();
  await page.keyboard.press("Enter");
  await page.keyboard.press("Enter");
  await settle(page);
  expect(await tasks(seed)).toEqual(prior);
  await expect(page.locator(".timeline-range-preview")).toHaveCount(0);
  await clickControl(page.locator("[data-timeline-range]"));
  await rangePanel(page).getByRole("button", { name: "Automatic range", exact: true }).click();
  await page.locator('[data-range-end=""]').waitFor();
});

test("an embedded Timeline keeps its own range and schedules rows without moving the board camera", { tag: "@gate" }, async ({ page }) => {
  const seed = app.embedded, { project, board, work } = seed;
  await page.goto(`${app.base}/#project/${project.id}/board/${board.id}`);
  await page.locator('[data-timeline="timeline"]').waitFor();
  await custom(page, "2026-10-19", "2026-10-30");
  await settle(page);
  await expect.poll(async () => (await app.store.snapshot(project.id)).boards.find((b) => b.id === board.id).nodes[0].timelineRange).toEqual({ start: "2026-10-19", end: "2026-10-30" });
  const camera = await page.locator("#canvas-world").getAttribute("style");
  await tap(page, work.id, "2026-10-26");
  await tap(page, work.id, "2026-10-29");
  await waitDates(page, seed, work.id, "2026-10-26", "2026-10-29");
  await expect(page.locator("#canvas-world")).toHaveAttribute("style", camera);
  await expect(page.locator("#task-form,dialog[open]")).toHaveCount(0);
});
