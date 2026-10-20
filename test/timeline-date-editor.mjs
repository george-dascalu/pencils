import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { chromium, firefox, webkit } from "playwright";
import { Store } from "../server/store.js";
import { createServer } from "../server/index.js";

const root = await fs.mkdtemp(path.join(os.tmpdir(), "pencils-date-editor-"));
const store = new Store(root);
await store.init();
const project = await store.createProject({ title: "Inline scheduling" });
const work = await store.createTask(project.id, { title: "Plan this task" });
const source = await store.createTask(project.id, {
  title: "Imported task",
  due: "2026-11-30",
});
const file = store.file(project.id, "tasks", source.id),
  record = await store.read(file);
await store.write(
  file,
  { ...record.data, source: { provider: "jira", external_id: "one" } },
  record.body,
  record,
);
let board = (await store.snapshot(project.id)).boards[0];
board = await store.updateBoard(project.id, board.id, {
  revision: board.revision,
  nodes: [
    {
      id: "schedule",
      type: "query",
      x: 20,
      y: 20,
      w: 1100,
      h: 520,
      text: "Schedule",
      viewType: "timeline",
      timelineScale: "day",
      query: {},
    },
  ],
  edges: [],
});
const server = createServer(store);
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const browserName = process.env.BROWSER || "chromium";
const browser = await { chromium, firefox, webkit }[browserName].launch();
const page = await browser.newPage({
  viewport: { width: 1500, height: 1000 },
  hasTouch: true,
});
page.setDefaultTimeout(10000);
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const base = `http://127.0.0.1:${server.address().port}`;
const panel = page.locator("#task-dates-popover");
const start = panel.getByLabel("Start date", { exact: true });
const due = panel.getByLabel("Due date", { exact: true });
const trigger = () => page.locator(`[data-task-dates="${work.id}"]`);
const current = async (id) =>
  (await store.snapshot(project.id)).tasks.find((t) => t.id === id);
async function closeEditor() {
  await panel.locator("form:not([aria-busy=true])").waitFor();
  await panel.getByRole("button", { name: "Close date editor" }).click();
  await panel.waitFor({ state: "detached" });
}
async function savedDates(id, expected) {
  for (let i = 0; i < 200; i++) {
    const value = await current(id);
    if (Object.entries(expected).every(([field, date]) => (value[field] || null) === date)) return;
    await new Promise(r => setTimeout(r, 50));
  }
  const value = await current(id);
  for (const [field, date] of Object.entries(expected)) assert.equal(value[field] || null, date);
}
async function within(locator) {
  const bounds = await locator.boundingBox(),
    size = page.viewportSize();
  assert.ok(
    bounds.x >= 0 &&
      bounds.y >= 0 &&
      bounds.x + bounds.width <= size.width &&
      bounds.y + bounds.height <= size.height,
    JSON.stringify(bounds),
  );
}
try {
  await page.goto(`${base}/#project/${project.id}/timeline`);
  await trigger().click();
  await panel.waitFor();
  assert.equal(
    await page.locator("#task-form").count(),
    0,
    "Set dates stays on the timeline",
  );
  assert.equal(await panel.getAttribute("aria-modal"), "false");
  assert.match(await panel.getAttribute("aria-label"), /Dates for.*Plan this task/);
  assert.equal(await panel.locator("strong,.task-dates-title,[type=submit],footer").count(), 0);
  assert.deepEqual(await panel.locator("header button").evaluateAll(buttons => buttons.map(b => b.textContent.trim() || b.getAttribute("aria-label"))), ["Clear dates", "Close date editor"]);
  await start.fill("2026-10-19");
  await panel
    .getByRole("button", { name: "Choose Start date", exact: true })
    .click();
  await page
    .locator('#shared-date-picker table [data-date-value="2026-10-20"]')
    .click();
  assert.equal(await start.inputValue(), "2026-10-20");
  await due.fill("2026-10-23");
  await panel
    .getByRole("button", { name: "Choose Due date", exact: true })
    .click();
  await page
    .locator('#shared-date-picker table [data-date-value="2026-10-26"]')
    .click();
  await savedDates(work.id, { start: "2026-10-20", due: "2026-10-26" });
  assert.equal(await panel.count(), 1, "Autosave keeps the popup open");
  await start.fill("2026-10-27");
  assert.match(
    await panel.getByRole("alert").textContent(),
    /Due date must be on or after/,
  );
  assert.equal((await current(work.id)).start, "2026-10-20");
  await start.fill("2026-10-20");
  await closeEditor();
  assert.equal((await current(work.id)).start, "2026-10-20");
  assert.equal((await current(work.id)).due, "2026-10-26");
  await page.reload();
  await page.locator(`[data-timeline-task="${work.id}"]`).click();
  await panel.waitFor();
  assert.equal(await due.inputValue(), "2026-10-26");
  await due.fill("2026-11-01");
  await page.keyboard.press("Escape");
  await panel.waitFor({ state: "detached" });
  assert.ok(await trigger().evaluate((el) => el === document.activeElement));
  await savedDates(work.id, { due: "2026-11-01" });
  await page.locator(`[data-timeline-task="${work.id}"]`).focus();
  await page.keyboard.press("Enter");
  await panel.waitFor();
  await page.locator(".timeline-header").click({ position: { x: 40, y: 20 } });
  await panel.waitFor({ state: "detached" });

  // Closing captures a typed value even if the browser has not fired change yet.
  await trigger().click();
  await start.evaluate(input => {
    input.value = "2026-10-21";
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await panel.getByRole("button", { name: "Close date editor" }).click();
  await savedDates(work.id, { start: "2026-10-21", due: "2026-11-01" });

  // Further edits and Clear remain usable during a slow save; the latest dates win.
  let release, requested;
  const gate = new Promise(r => release = r), started = new Promise(r => requested = r);
  const endpoint = `**/api/projects/${project.id}/tasks/${work.id}`;
  const delay = async route => {
    if (route.request().method() === "PATCH") { requested(); await gate; }
    await route.continue();
  };
  await page.route(endpoint, delay);
  await trigger().click();
  await start.fill("2026-10-22");
  await started;
  await due.fill("2026-11-04");
  await panel.getByRole("button", { name: "Clear dates" }).click();
  await due.fill("2026-11-07");
  assert.ok(await start.isEnabled());
  await panel.getByRole("button", { name: "Close date editor" }).click();
  await page.locator(`[data-task-dates="${source.id}"]`).click();
  release();
  await savedDates(work.id, { start: null, due: "2026-11-07" });
  await page.unroute(endpoint, delay);
  assert.equal(await due.inputValue(), "2026-11-30", "An earlier save cannot overwrite another task's popup");
  assert.equal(await start.inputValue(), "");
  await closeEditor();

  for (const width of [1500, 390]) {
    await page.setViewportSize({ width, height: 844 });
    for (const theme of ["light", "dark"]) {
      await page.evaluate((value) => {
        document.documentElement.dataset.theme = value;
      }, theme);
      await trigger().tap();
      await panel.waitFor();
      await within(panel);
      await page.screenshot({
        path: `/tmp/pencils-date-editor-${browserName}-${width}-${theme}.png`,
      });
      await panel
        .getByRole("button", { name: "Choose Due date", exact: true })
        .tap();
      await page.locator("#shared-date-picker").waitFor();
      await within(page.locator("#shared-date-picker"));
      await page.keyboard.press("Escape");
      assert.equal(
        await panel.count(),
        1,
        "Escape closes the nested calendar first",
      );
      await panel.getByRole("button", { name: "Close date editor" }).tap();
    }
  }
  await page.setViewportSize({ width: 1500, height: 1000 });
  await trigger().click();
  await panel.getByRole("button", { name: "Clear dates", exact: true }).click();
  await savedDates(work.id, { start: null, due: null });
  await closeEditor();
  assert.equal((await current(work.id)).start ?? null, null);
  assert.equal((await current(work.id)).due ?? null, null);
  assert.equal(
    await page
      .locator(`[data-timeline-row="${work.id}"].timeline-unplanned`)
      .count(),
    1,
  );

  await page.locator(`[data-task-dates="${source.id}"]`).click();
  assert.ok(await due.isDisabled());
  assert.equal(await panel.locator("[data-task-dates-clear]").count(), 0);
  await start.fill("2026-10-20");
  await closeEditor();
  assert.equal((await current(source.id)).start, "2026-10-20");
  assert.equal((await current(source.id)).due, "2026-11-30");

  await page.goto(`${base}/#project/${project.id}/board`);
  await trigger().waitFor();
  const camera = await page.locator("#canvas-world").getAttribute("style");
  await trigger().click();
  await due.fill("2026-10-30");
  await closeEditor();
  assert.equal((await current(work.id)).due, "2026-10-30");
  assert.equal(
    (await current(work.id)).start ?? null,
    null,
    "Due-only scheduling is allowed",
  );
  assert.equal(
    await page.locator("#canvas-world").getAttribute("style"),
    camera,
  );
  await trigger().click();
  await page.route(`**/api/projects/${project.id}/tasks/${work.id}`, (route) =>
    route.request().method() === "PATCH"
      ? route.fulfill({
          status: 403,
          contentType: "application/json",
          body: JSON.stringify({ error: "Date edit rejected" }),
        })
      : route.continue(),
  );
  await start.fill("2026-10-19");
  await panel.locator(".form-error:not([hidden])").waitFor();
  assert.match(
    await panel.getByRole("alert").textContent(),
    /Date edit rejected/,
  );
  assert.equal(await start.inputValue(), "2026-10-19");
  assert.equal((await current(work.id)).start ?? null, null);
  await panel.getByRole("button", { name: "Close date editor" }).click();
  assert.deepEqual(errors, []);
  console.log(
    "PASS: compact Timeline date popup, automatic save/reload/clear, shared calendars, range validation, bar and keyboard entry, nonmodal dismissal, mobile/themes, source-owned due dates, embedded Timeline/camera preservation and failed-save feedback.",
  );
} catch (error) {
  await page.screenshot({
    path: `/tmp/pencils-date-editor-failure-${browserName}.png`,
  });
  throw error;
} finally {
  await browser.close();
  server.closeAllConnections();
  await new Promise((r) => server.close(r));
  await store.queue;
  await fs.rm(root, { recursive: true, force: true });
}
