// Calendar scheduling: month cards move and resize by mouse, touch and keyboard (Escape
// cancels), source-owned dates stay fixed, filters live in the Filters menu, weekends can be
// hidden and are remembered, unscheduled cards are dropped on a day or dated in place, the
// agenda shares the month's date anchor, Timeline dependency arrows follow scale, weekends and
// custom ranges, and tablet and phone layouts fit with tappable agenda cards.
import { test as base, expect, useApp } from "../fixtures.mjs";
import { selectProjectView, reveal, setWeekends } from "../helpers/menu-controls.mjs";

// The suite uses a touch-capable desktop window (fine pointer plus touch events), as on a
// touch-screen laptop, so cards can be both dragged with the mouse and tapped.
const test = base.extend({
  context: async ({ browser, viewportSize }, use) => {
    const context = await browser.newContext({ viewport: viewportSize || { width: 1500, height: 1000 }, hasTouch: true, reducedMotion: "reduce" });
    await use(context);
    await context.close();
  },
});

async function seed(store, title) {
  const project = await store.createProject({ title });
  const work = await store.createTask(project.id, { title: "Design and review", start: "2026-10-06", due: "2026-10-08" });
  const dueOnly = await store.createTask(project.id, { title: "Deadline only", due: "2026-10-15", dependencies: [work.id] });
  const startOnly = await store.createTask(project.id, { title: "Start only", start: "2026-10-20" });
  const undated = await store.createTask(project.id, { title: "Unscheduled card with a long readable title" });
  const toDrop = await store.createTask(project.id, { title: "Drag from unscheduled" });
  const ongoing = await store.createTask(project.id, { title: "Ongoing into this month", start: "2026-09-30", due: "2026-10-20" });
  const weekend = await store.createTask(project.id, { title: "Weekend work", due: "2026-10-17" });
  const source = await store.createTask(project.id, { title: "Imported date", due: "2026-10-22" });
  const file = store.file(project.id, "tasks", source.id), record = await store.read(file);
  await store.write(file, { ...record.data, source: { provider: "jira", external_id: "one" } }, record.body, record);
  return { project, work, dueOnly, startOnly, undated, toDrop, ongoing, weekend, source };
}
const app = useApp(async (store) => ({
  filters: await seed(store, "Calendar filters"),
  mouse: await seed(store, "Calendar mouse"),
  touch: await seed(store, "Calendar touch"),
  weekends: await seed(store, "Calendar weekends"),
  unscheduled: await seed(store, "Calendar unscheduled"),
  agenda: await seed(store, "Calendar agenda"),
  arrows: await seed(store, "Timeline arrows"),
  small: await seed(store, "Calendar small screens"),
}));

const current = async ({ project }, id) => (await app.store.snapshot(project.id)).tasks.find((t) => t.id === id);
const card = (page, id) => page.locator(`.calendar-task[data-id="${id}"]`);
// Waits until the vault holds these dates (undefined for a date that must stay empty).
async function settled(seed, id, expected) {
  await expect.poll(async () => {
    const actual = await current(seed, id);
    return Object.fromEntries(Object.keys(expected).map((key) => [key, actual[key]]));
  }, { message: "Dates did not save" }).toEqual(expected);
}
// The month has re-rendered the card for these dates.
const shown = (page, id, start, end) => expect(card(page, id).first()).toHaveAttribute("title", new RegExp(` · ${start} – ${end} · `));
async function point(page, day) {
  const r = await page.locator(`.calendar-day[data-calendar-date="${day}"]`).boundingBox();
  return { x: r.x + r.width / 2, y: r.y + 20 };
}
async function dragTo(page, locator, day, cancel = false) {
  await locator.scrollIntoViewIfNeeded();
  const r = await locator.boundingBox(), end = await point(page, day);
  await page.mouse.move(r.x + r.width / 2, r.y + r.height / 2);
  await page.mouse.down();
  await page.mouse.move(end.x, end.y, { steps: 10 });
  await page.locator(".calendar-drag-preview").waitFor();
  if (cancel) await page.keyboard.press("Escape");
  await page.mouse.up();
  await page.locator(".calendar-drag-preview").waitFor({ state: "detached" });
}
async function closeOptions(page) {
  if (await page.locator(".mobile-view-options[open]").count()) await page.getByRole("button", { name: "Close view options", exact: true }).click();
}
// Month view anchored on October 2026.
async function setMonth(page) {
  await (await reveal(page.locator("#calendar-mode"))).selectOption("agenda");
  await (await reveal(page.locator("#agenda-date"))).fill("2026-10-01");
  await (await reveal(page.locator("#calendar-mode"))).selectOption("month");
  await closeOptions(page);
  await page.locator('.calendar-day[data-calendar-date="2026-10-01"]').waitFor();
}
async function openMonth(page, { project }) {
  await page.goto(`${app.base}/#project/${project.id}/calendar`);
  await setMonth(page);
}

test("filters live in the Filters menu, an empty filtered month still shows its dates, and source dates have no handles", async ({ page }) => {
  const seed = app.filters;
  await openMonth(page, seed);
  await expect(page.locator(".toolbar-left > #filter-status, .toolbar-left > #filter-type")).toHaveCount(0);
  await expect(page.locator('[data-board-menu="filters"] #filter-status')).toHaveCount(1);
  await (await reveal(page.locator("#filter-type"))).selectOption("bug");
  await expect(page.locator(".calendar-task")).toHaveCount(0);
  await expect(page.locator(".calendar-day"), "Empty filtered calendars still show dates").toHaveCount(42);
  await (await reveal(page.locator("#filter-type"))).selectOption("all");
  await card(page, seed.work.id).waitFor();
  await page.locator('[data-board-menu="filters"] > summary').click();
  await expect(page.getByText(/tasks have no due date/)).toHaveCount(0);
  await expect(card(page, seed.source.id).locator("[data-calendar-end]")).toHaveCount(0);
});

test("month cards move, resize, cancel with Escape and nudge with the keyboard", async ({ page }) => {
  const seed = app.mouse, { work } = seed;
  await openMonth(page, seed);
  // Grab the middle day of a three-day card, then move it a week forward.
  await dragTo(page, card(page, work.id).locator(".calendar-card-title"), "2026-10-14");
  await settled(seed, work.id, { start: "2026-10-13", due: "2026-10-15" });
  await shown(page, work.id, "2026-10-13", "2026-10-15");
  await dragTo(page, card(page, work.id).locator('[data-calendar-end="start"]'), "2026-10-12");
  await settled(seed, work.id, { start: "2026-10-12", due: "2026-10-15" });
  await shown(page, work.id, "2026-10-12", "2026-10-15");
  await dragTo(page, card(page, work.id).locator('[data-calendar-end="due"]'), "2026-10-16");
  await settled(seed, work.id, { start: "2026-10-12", due: "2026-10-16" });
  await shown(page, work.id, "2026-10-12", "2026-10-16");
  await dragTo(page, card(page, work.id).locator(".calendar-card-title"), "2026-10-21", true);
  expect((await current(seed, work.id)).due).toBe("2026-10-16");
  await shown(page, work.id, "2026-10-12", "2026-10-16");
  const handle = card(page, work.id).locator('[data-calendar-end="due"]');
  await handle.focus();
  await handle.press("ArrowLeft");
  await settled(seed, work.id, { due: "2026-10-15" });
  await shown(page, work.id, "2026-10-12", "2026-10-15");
  await expect(handle).toBeFocused();
});

test("touch drags move a due-only card and add a start date", async ({ page, browserName }) => {
  test.skip(browserName !== "chromium", "Touch input is sent through the Chrome DevTools Protocol");
  const seed = app.touch, { dueOnly } = seed;
  await openMonth(page, seed);
  const cdp = await page.context().newCDPSession(page);
  async function touchDrag(locator, day) {
    await locator.scrollIntoViewIfNeeded();
    const r = await locator.boundingBox(), end = await point(page, day), x = r.x + r.width / 2, y = r.y + r.height / 2;
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
    for (let i = 1; i <= 12; i++) await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: x + ((end.x - x) * i) / 12, y: y + ((end.y - y) * i) / 12 }] });
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  }
  await touchDrag(card(page, dueOnly.id).locator(".calendar-card-title"), "2026-10-16");
  await settled(seed, dueOnly.id, { due: "2026-10-16", start: undefined });
  await shown(page, dueOnly.id, "2026-10-16", "2026-10-16");
  await touchDrag(card(page, dueOnly.id).locator('[data-calendar-end="start"]'), "2026-10-15");
  await settled(seed, dueOnly.id, { start: "2026-10-15", due: "2026-10-16" });
});

test("hiding weekends removes weekend days and their cards, and is remembered after a reload", async ({ page }) => {
  const seed = app.weekends;
  await openMonth(page, seed);
  await card(page, seed.weekend.id).waitFor();
  await page.locator("[data-calendar-weekends]").click();
  await expect(page.locator(".calendar-day.weekend")).toHaveCount(0);
  await expect(card(page, seed.weekend.id)).toHaveCount(0);
  await page.reload();
  await card(page, seed.work.id).waitFor();
  await expect(page.locator(".calendar")).toHaveAttribute("data-weekends", "false");
  await page.locator("[data-calendar-weekends]").click();
  await expect(page.locator(".calendar")).toHaveAttribute("data-weekends", "true");
  await card(page, seed.weekend.id).waitFor();
});

test("unscheduled cards can be dropped on a day or given dates in place", async ({ page }) => {
  const seed = app.unscheduled, { toDrop, undated } = seed;
  await openMonth(page, seed);
  await page.locator(".calendar-unscheduled summary").click();
  await dragTo(page, page.locator(`.calendar-unscheduled [data-calendar-card="${toDrop.id}"] .calendar-move`), "2026-10-28");
  await settled(seed, toDrop.id, { due: "2026-10-28", start: undefined });
  const unscheduled = page.locator(`.calendar-unscheduled [data-calendar-card="${undated.id}"]`);
  await unscheduled.locator("[data-calendar-dates]").click();
  const dates = page.locator("#task-dates-popover");
  await dates.getByLabel("Start date", { exact: true }).fill("2026-10-09");
  await settled(seed, undated.id, { start: "2026-10-09" });
  await dates.waitFor({ state: "detached" });
  await expect(page.locator(`.calendar-unscheduled [data-calendar-card="${undated.id}"]`)).toHaveCount(0);
  await expect(card(page, undated.id)).toHaveCount(1);
});

test("the agenda lists ongoing and start-only work with readable titles and shares the month's anchor", async ({ page }) => {
  const seed = app.agenda;
  await openMonth(page, seed);
  await (await reveal(page.locator("#calendar-mode"))).selectOption("agenda");
  await (await reveal(page.locator("#agenda-period"))).selectOption("month");
  await expect(page.locator(`.calendar-agenda [data-id="${seed.ongoing.id}"]`)).toHaveCount(1);
  await expect(page.locator(`.calendar-agenda [data-id="${seed.startOnly.id}"]`)).toHaveCount(1);
  const titleWidth = await page.locator(".agenda-task").first().evaluate((e) => e.clientWidth);
  expect(titleWidth, "Agenda titles retain usable width").toBeGreaterThan(350);
  await page.getByRole("button", { name: "Next period", exact: true }).click();
  await expect(page.locator(".planning-period")).toHaveText(/November/);
  await (await reveal(page.locator("#agenda-period"))).selectOption("week");
  await expect(page.locator(".planning-period"), "Month and agenda share one date anchor").toHaveText(/Nov/);
});

test("Timeline dependency arrows follow the scale, hidden weekends and a custom range", async ({ page }) => {
  const seed = app.arrows, { work, dueOnly } = seed;
  await page.goto(`${app.base}/#project/${seed.project.id}/calendar`);
  await selectProjectView(page, "timeline");
  const edge = page.locator(`.timeline-dependency-path[data-from="${work.id}"][data-to="${dueOnly.id}"]`);
  await edge.waitFor();
  await expect(edge).toHaveAttribute("marker-end", /url\(#timeline-arrow-project\)/);
  expect(await page.locator(".timeline-dependencies").evaluate((e) => getComputedStyle(e).zIndex)).toBe("1");
  const oldPath = await edge.getAttribute("d");
  await page.locator("[data-timeline-scale]").selectOption("day");
  await expect(edge).not.toHaveAttribute("d", oldPath);
  await setWeekends(page, false);
  await expect(page.locator("[data-timeline]").first()).toHaveAttribute("data-weekends", "false");
  await edge.waitFor();
  expect(await edge.getAttribute("d")).not.toContain("NaN");
  await page.locator("[data-timeline-range]").click();
  await page.getByLabel("Timeline start date", { exact: true }).fill("2026-10-01");
  await page.getByLabel("Timeline end date", { exact: true }).fill("2026-10-20");
  await page.getByRole("button", { name: "Apply range", exact: true }).click();
  await expect(page.locator("[data-timeline]").first()).toHaveAttribute("data-range-end", "2026-10-20");
  await edge.waitFor();
  expect(await edge.getAttribute("d"), "Custom range arrows stay aligned").not.toContain("NaN");
});

for (const [width, height] of [[1180, 820], [390, 844]]) {
  test.describe(`${width}px`, () => {
    test.use({ viewportSize: { width, height } });
    test("month and agenda fit the screen and a tapped agenda card opens the editor", async ({ page }) => {
      const seed = app.small;
      await page.goto(`${app.base}/#project/${seed.project.id}/timeline`);
      await page.locator("[data-timeline]").first().waitFor();
      await selectProjectView(page, "calendar");
      await setMonth(page);
      await (await reveal(page.locator("#calendar-mode"))).selectOption("agenda");
      await (await reveal(page.locator("#agenda-period"))).selectOption("month");
      await closeOptions(page);
      await page.locator(".agenda-task").first().waitFor();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "No page overflow").toBe(true);
      expect(await page.locator(".agenda-task").first().evaluate((e) => e.clientWidth), "Readable agenda titles").toBeGreaterThan(180);
      await page.locator(".agenda-task").first().tap();
      await page.locator("#task-form").waitFor();
      await page.locator('[data-action="dialog-close"]').first().click();
      await expect(page.locator("#task-form")).toHaveCount(0);
    });
  });
}
