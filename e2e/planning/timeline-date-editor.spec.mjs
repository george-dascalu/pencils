// Timeline date editor: "Set dates" opens a compact, nonmodal popup beside the task that saves
// automatically, uses the shared calendar, validates the range, opens from the bar and the
// keyboard, closes with Escape, its Close button or a click outside, keeps the latest dates
// during a slow save, fits desktop and phone screens in both themes, protects source-owned
// due dates, keeps the board camera in an embedded Timeline and reports a failed save.
// Part of the cross-browser release gate.
import { test as base, expect, useApp } from "../fixtures.mjs";

// The suite uses a touch-capable desktop window (fine pointer plus touch events), so the
// popup can be tapped at desktop and phone widths in every gate browser.
const test = base.extend({
  context: async ({ browser, viewportSize }, use) => {
    const context = await browser.newContext({ viewport: viewportSize || { width: 1500, height: 1000 }, hasTouch: true, reducedMotion: "reduce" });
    await use(context);
    await context.close();
  },
});

async function sourced(store, project, fields) {
  const task = await store.createTask(project.id, fields);
  const file = store.file(project.id, "tasks", task.id), record = await store.read(file);
  await store.write(file, { ...record.data, source: { provider: "jira", external_id: "one" } }, record.body, record);
  return task;
}
async function seed(store, title, dates = {}) {
  const project = await store.createProject({ title });
  const work = await store.createTask(project.id, { title: "Plan this task", ...dates });
  const source = await sourced(store, project, { title: "Imported task", due: "2026-11-30" });
  return { project, work, source };
}
const app = useApp(async (store) => {
  const embedded = await seed(store, "Embedded scheduling");
  const board = (await store.snapshot(embedded.project.id)).boards[0];
  await store.updateBoard(embedded.project.id, board.id, {
    revision: board.revision,
    nodes: [{ id: "schedule", type: "query", x: 20, y: 20, w: 1100, h: 520, text: "Schedule", viewType: "timeline", timelineScale: "day", query: {} }],
    edges: [],
  });
  return {
    popup: await seed(store, "Inline scheduling"),
    entry: await seed(store, "Bar and keyboard entry", { start: "2026-10-20", due: "2026-10-26" }),
    typed: await seed(store, "Typed dates", { start: "2026-10-20", due: "2026-11-01" }),
    slow: await seed(store, "Slow saves", { start: "2026-10-21", due: "2026-11-01" }),
    layout: await seed(store, "Popup layout", { start: "2026-10-21", due: "2026-11-07" }),
    clearing: await seed(store, "Clearing dates", { due: "2026-11-07" }),
    owned: await seed(store, "Source-owned dates"),
    embedded,
  };
});

const panel = (page) => page.locator("#task-dates-popover");
const start = (page) => panel(page).getByLabel("Start date", { exact: true });
const due = (page) => panel(page).getByLabel("Due date", { exact: true });
const trigger = (page, task) => page.locator(`[data-task-dates="${task.id}"]`);
const current = async ({ project }, id) => (await app.store.snapshot(project.id)).tasks.find((t) => t.id === id);
const openTimeline = async (page, { project }) => {
  await page.goto(`${app.base}/#project/${project.id}/timeline`);
  await page.locator("[data-timeline]").first().waitFor();
};
async function closeEditor(page) {
  await panel(page).locator("form:not([aria-busy=true])").waitFor();
  await panel(page).getByRole("button", { name: "Close date editor" }).click();
  await panel(page).waitFor({ state: "detached" });
}
// Waits until the vault holds these dates (a missing date counts as null).
async function savedDates(seed, id, expected) {
  await expect.poll(async () => {
    const value = await current(seed, id);
    return Object.fromEntries(Object.keys(expected).map((field) => [field, value[field] || null]));
  }, { timeout: 10000 }).toEqual(expected);
}
// No task changes are waiting to be sent.
const settled = (page) => page.waitForFunction(() => Object.keys(localStorage).filter((k) => k.startsWith("pencils:pending:") && !k.endsWith(":lease")).every((k) => !JSON.parse(localStorage.getItem(k) || "[]").length));
async function within(page, locator) {
  const bounds = await locator.boundingBox(), size = page.viewportSize();
  expect(bounds.x >= 0 && bounds.y >= 0 && bounds.x + bounds.width <= size.width && bounds.y + bounds.height <= size.height, JSON.stringify(bounds)).toBe(true);
}

test("Set dates opens a compact nonmodal popup that autosaves, uses the shared calendar and validates the range", { tag: "@gate" }, async ({ page }) => {
  const seed = app.popup, { work } = seed;
  await openTimeline(page, seed);
  await trigger(page, work).click();
  await panel(page).waitFor();
  await expect(page.locator("#task-form"), "Set dates stays on the timeline").toHaveCount(0);
  await expect(panel(page)).toHaveAttribute("aria-modal", "false");
  await expect(panel(page)).toHaveAttribute("aria-label", /Dates for.*Plan this task/);
  await expect(panel(page).locator("strong,.task-dates-title,[type=submit],footer")).toHaveCount(0);
  expect(await panel(page).locator("header button").evaluateAll((buttons) => buttons.map((b) => b.textContent.trim() || b.getAttribute("aria-label")))).toEqual(["Clear dates", "Close date editor"]);
  await start(page).fill("2026-10-19");
  await panel(page).getByRole("button", { name: "Choose Start date", exact: true }).click();
  await page.locator('#shared-date-picker table [data-date-value="2026-10-20"]').click();
  await expect(start(page)).toHaveValue("2026-10-20");
  await due(page).fill("2026-10-23");
  await panel(page).getByRole("button", { name: "Choose Due date", exact: true }).click();
  await page.locator('#shared-date-picker table [data-date-value="2026-10-26"]').click();
  await savedDates(seed, work.id, { start: "2026-10-20", due: "2026-10-26" });
  await expect(panel(page), "Autosave keeps the popup open").toHaveCount(1);
  await start(page).fill("2026-10-27");
  await expect(panel(page).getByRole("alert")).toHaveText(/Due date must be on or after/);
  expect((await current(seed, work.id)).start).toBe("2026-10-20");
  await start(page).fill("2026-10-20");
  await closeEditor(page);
  expect((await current(seed, work.id)).start).toBe("2026-10-20");
  expect((await current(seed, work.id)).due).toBe("2026-10-26");
  // The saved dates come back after a reload.
  await page.reload();
  await page.locator(`[data-timeline-task="${work.id}"]`).click();
  await panel(page).waitFor();
  await expect(due(page)).toHaveValue("2026-10-26");
});

test("the bar and the keyboard open the popup; Escape and clicking outside close it", { tag: "@gate" }, async ({ page }) => {
  const seed = app.entry, { work } = seed;
  await openTimeline(page, seed);
  await page.locator(`[data-timeline-task="${work.id}"]`).click();
  await panel(page).waitFor();
  await expect(due(page)).toHaveValue("2026-10-26");
  await due(page).fill("2026-11-01");
  await page.keyboard.press("Escape");
  await panel(page).waitFor({ state: "detached" });
  await expect(trigger(page, work)).toBeFocused();
  await savedDates(seed, work.id, { due: "2026-11-01" });
  // The saved dates re-render the bar; focus it once that has happened.
  await expect(page.locator(`[data-timeline-task="${work.id}"]`)).toHaveAttribute("aria-valuetext", "2026-10-20 to 2026-11-01");
  await settled(page);
  await page.locator(`[data-timeline-task="${work.id}"]`).focus();
  await page.keyboard.press("Enter");
  await panel(page).waitFor();
  await page.locator(".timeline-header").click({ position: { x: 40, y: 20 } });
  await panel(page).waitFor({ state: "detached" });
});

test("closing captures a typed date even before the browser fires change", { tag: "@gate" }, async ({ page }) => {
  const seed = app.typed, { work } = seed;
  await openTimeline(page, seed);
  await trigger(page, work).click();
  await start(page).evaluate((input) => {
    input.value = "2026-10-21";
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await panel(page).getByRole("button", { name: "Close date editor" }).click();
  await savedDates(seed, work.id, { start: "2026-10-21", due: "2026-11-01" });
});

test("edits and Clear stay usable during a slow save, the latest dates win, and another task's popup is untouched", { tag: "@gate" }, async ({ page }) => {
  const seed = app.slow, { project, work, source } = seed;
  await openTimeline(page, seed);
  let release, requested;
  const gate = new Promise((r) => (release = r)), started = new Promise((r) => (requested = r));
  const endpoint = `**/api/projects/${project.id}/tasks/${work.id}`;
  const delay = async (route) => {
    if (route.request().method() === "PATCH") {
      requested();
      await gate;
    }
    await route.continue();
  };
  await page.route(endpoint, delay);
  await trigger(page, work).click();
  await start(page).fill("2026-10-22");
  await started;
  await due(page).fill("2026-11-04");
  await panel(page).getByRole("button", { name: "Clear dates" }).click();
  await due(page).fill("2026-11-07");
  await expect(start(page)).toBeEnabled();
  await panel(page).getByRole("button", { name: "Close date editor" }).click();
  await trigger(page, source).click();
  release();
  await savedDates(seed, work.id, { start: null, due: "2026-11-07" });
  await page.unroute(endpoint, delay);
  await expect(due(page), "An earlier save cannot overwrite another task's popup").toHaveValue("2026-11-30");
  await expect(start(page)).toHaveValue("");
  await closeEditor(page);
});

for (const width of [1500, 390]) {
  test.describe(`${width}px`, () => {
    test.use({ viewportSize: { width, height: 844 } });
    test("the popup and its calendar fit the screen in both themes, and Escape closes the calendar first", { tag: "@gate" }, async ({ page }) => {
      const seed = app.layout;
      await openTimeline(page, seed);
      for (const theme of ["light", "dark"]) {
        await page.evaluate((value) => (document.documentElement.dataset.theme = value), theme);
        await trigger(page, seed.work).tap();
        await panel(page).waitFor();
        await within(page, panel(page));
        await panel(page).getByRole("button", { name: "Choose Due date", exact: true }).tap();
        await page.locator("#shared-date-picker").waitFor();
        await within(page, page.locator("#shared-date-picker"));
        await page.keyboard.press("Escape");
        await expect(page.locator("#shared-date-picker")).toBeHidden();
        await expect(panel(page), "Escape closes the nested calendar first").toHaveCount(1);
        await panel(page).getByRole("button", { name: "Close date editor" }).tap();
        await panel(page).waitFor({ state: "detached" });
      }
    });
  });
}

test("Clear dates returns the task to the unplanned rows", { tag: "@gate" }, async ({ page }) => {
  const seed = app.clearing, { work } = seed;
  await openTimeline(page, seed);
  await trigger(page, work).click();
  await panel(page).getByRole("button", { name: "Clear dates", exact: true }).click();
  await savedDates(seed, work.id, { start: null, due: null });
  await closeEditor(page);
  expect((await current(seed, work.id)).start ?? null).toBeNull();
  expect((await current(seed, work.id)).due ?? null).toBeNull();
  await expect(page.locator(`[data-timeline-row="${work.id}"].timeline-unplanned`)).toHaveCount(1);
});

test("a source-owned due date is read-only while the start date stays editable", { tag: "@gate" }, async ({ page }) => {
  const seed = app.owned, { source } = seed;
  await openTimeline(page, seed);
  await trigger(page, source).click();
  await expect(due(page)).toBeDisabled();
  await expect(panel(page).locator("[data-task-dates-clear]")).toHaveCount(0);
  await start(page).fill("2026-10-20");
  await closeEditor(page);
  expect((await current(seed, source.id)).start).toBe("2026-10-20");
  expect((await current(seed, source.id)).due).toBe("2026-11-30");
});

test("an embedded Timeline schedules a due date without moving the board camera and reports a failed save", { tag: "@gate" }, async ({ page }) => {
  const seed = app.embedded, { project, work } = seed;
  await page.goto(`${app.base}/#project/${project.id}/board`);
  await trigger(page, work).waitFor();
  const camera = await page.locator("#canvas-world").getAttribute("style");
  await trigger(page, work).click();
  await due(page).fill("2026-10-30");
  await closeEditor(page);
  expect((await current(seed, work.id)).due).toBe("2026-10-30");
  expect((await current(seed, work.id)).start ?? null, "Due-only scheduling is allowed").toBeNull();
  await expect(page.locator("#canvas-world")).toHaveAttribute("style", camera);
  await trigger(page, work).click();
  await page.route(`**/api/projects/${project.id}/tasks/${work.id}`, (route) =>
    route.request().method() === "PATCH"
      ? route.fulfill({ status: 403, contentType: "application/json", body: JSON.stringify({ error: "Date edit rejected" }) })
      : route.continue(),
  );
  await start(page).fill("2026-10-19");
  await panel(page).locator(".form-error:not([hidden])").waitFor();
  await expect(panel(page).getByRole("alert")).toHaveText(/Date edit rejected/);
  await expect(start(page)).toHaveValue("2026-10-19");
  expect((await current(seed, work.id)).start ?? null).toBeNull();
  await panel(page).getByRole("button", { name: "Close date editor" }).click();
});
