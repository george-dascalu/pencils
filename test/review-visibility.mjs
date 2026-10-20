import { clickControl, selectProjectView } from "./menu-controls.mjs";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { chromium, firefox, webkit } from "playwright";
import { Store } from "../server/store.js";
import { createServer } from "../server/index.js";

const root = await fs.mkdtemp(path.join(os.tmpdir(), "pencils-visibility-"));
const store = new Store(root);
await store.init();
const project = await store.createProject({ title: "Visibility regression" });
const records = [];
for (let i = 0; i < 205; i++)
  records.push(
    await store.createTask(project.id, {
      title: i === 0 ? "needle child" : `Task ${i}`,
      start: "2026-10-01",
      due: "2026-10-20",
      status: i < 103 ? "todo" : "done",
    }),
  );
const parent = await store.createTask(project.id, { title: "Parent context" });
await store.updateTask(project.id, records[0].id, {
  parent: parent.id,
  revision: records[0].revision,
});
const server = createServer(store);
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const browser = await { chromium, firefox, webkit }[
  process.env.BROWSER || "chromium"
].launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
try {
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  // Opening an already visible project still fetches a fresh snapshot. Wait
  // for it before changing view; tabs are present during that request.
  await Promise.all([
    page.waitForResponse(
      (response) =>
        response.url().endsWith(`/api/projects/${project.id}`) &&
        response.request().method() === "GET",
    ),
    page.locator(".project-link").first().click(),
  ]);
  await selectProjectView(page, "timeline");
  await page.locator(".timeline-row").first().waitFor();
  assert.equal(await page.locator(".timeline-row").count(), 200);
  assert.match(
    await page.locator(".timeline-page-summary").innerText(),
    /Page 1 of 2 · 206 tasks/,
  );
  await page.getByRole("button", { name: "Next tasks", exact: true }).click();
  assert.equal(await page.locator(".timeline-row").count(), 6);
  assert.equal(await page.locator(".timeline-unplanned").count(), 1);
  await selectProjectView(page, "kanban");
  assert.match(
    await page.locator('[data-drop-status="done"] .column-header').innerText(),
    /102/,
  );
  assert.equal(
    await page.locator('[data-drop-status="done"] .kanban-card').count(),
    100,
  );
  await page.locator('[data-kanban-more="done"]').click();
  assert.equal(
    await page.locator('[data-drop-status="done"] .kanban-card').count(),
    102,
  );
  await store.updateTask(project.id, records[1].id, {
    title: "Updated from another client",
    revision: records[1].revision,
  });
  await page
    .getByRole("button", { name: "Updated from another client", exact: true })
    .waitFor();
  await selectProjectView(page, "tree");
  await page.locator("#search").fill("needle");
  await page.waitForFunction(
    () => document.querySelectorAll(".tree-row").length === 2,
  );
  assert.match(
    await page.locator(".tree-context .task-title").inputValue(),
    /Parent context/,
  );
  await clickControl(page.locator('[data-action="filters-reset"]').first());
  await page.setViewportSize({ width: 390, height: 844 });
  await selectProjectView(page, "calendar");
  await page.locator("#calendar-mode").selectOption("agenda");
  assert.equal(await page.locator(".calendar-agenda").count(), 1);
  assert.equal(await page.locator(".calendar-unscheduled").count(), 1);
  await page.locator("#project-view-switcher").selectOption("overview");
  await page.locator('[data-query="done"]').click();
  assert.equal(await page.locator("#filter-completion").inputValue(), "done");
  assert.equal(await page.locator(".task-row").count(), 100);
  assert.match(await page.locator("#pagination").innerText(), /Page 1 of 2/);
  await page.keyboard.press("Control+k");
  await page.locator("#global-search-input").fill("open table");
  await page
    .getByRole("button", { name: "Open Table view", exact: true })
    .click();
  await page.locator(".spreadsheet").waitFor();
  assert.equal(await page.locator(".spreadsheet").count(), 1);
  const identity = page.locator('[data-cell="0,0"]');
  await identity.focus();
  await page.keyboard.press("ArrowRight");
  assert.equal(
    await page
      .locator('[data-cell="0,1"]')
      .evaluate((el) => el === document.activeElement),
    true,
  );
  await page.keyboard.press("Enter");
  const title = page.locator('[data-cell="0,1"] input');
  const before = await title.inputValue();
  await title.fill("Discard this edit");
  await page.keyboard.press("Escape");
  assert.equal(await title.inputValue(), before);
  await page.keyboard.press("Enter");
  await title.evaluate((el) => {
    const e = new Event("paste", { bubbles: true, cancelable: true });
    Object.defineProperty(e, "clipboardData", {
      value: { getData: () => "New title\tDescription\tinvalid-type" },
    });
    el.dispatchEvent(e);
  });
  assert.equal(await page.locator("#paste-apply").isDisabled(), true);
  await page.locator("#paste-cancel").click();
  await page.locator("[data-table-task] .table-open").first().click();
  assert.equal(
    await page
      .locator(".project-task-editor")
      .evaluate((el) => el.matches(":modal")),
    false,
  );
  const panel = await page.locator(".project-task-editor").boundingBox();
  assert.ok(panel.x >= 0 && panel.x + panel.width <= 391);
  await page.locator('[data-action="dialog-close"]').click();
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth + 1,
    ),
    false,
  );
  assert.deepEqual(errors, []);
  console.log(
    "PASS: complete Kanban counts, Timeline paging, ancestor context, mobile view switcher/agenda, metric queries and commands",
  );
} catch (error) {
  await page.screenshot({
    path: `/tmp/pencils-visibility-failure-${process.env.BROWSER || "chromium"}.png`,
  });
  console.error(
    "Current view",
    await page.locator(".tab.active").textContent(),
  );
  console.error("Browser errors:", errors);
  console.error(await page.locator("#toasts").innerText());
  throw error;
} finally {
  await browser.close();
  store.close();
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
  await fs.rm(root, { recursive: true, force: true });
}
