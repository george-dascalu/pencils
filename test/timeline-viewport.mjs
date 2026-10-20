import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { chromium, firefox, webkit } from "playwright";
import { Store } from "../server/store.js";
import { createServer } from "../server/index.js";

const root = await fs.mkdtemp(path.join(os.tmpdir(), "pencils-timeline-"));
const store = new Store(root);
await store.init();
const project = await store.createProject({ title: "Timeline workspace" });
const planned = await store.createTask(project.id, {
  title: "Planned work",
  start: "2026-10-19",
  due: "2026-10-25",
});
const unplanned = await store.createTask(project.id, {
  title: "Unplanned idea",
});
const another = await store.createTask(project.id, { title: "Another idea" });
const server = createServer(store);
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const browser = await { chromium, firefox, webkit }[
  process.env.BROWSER || "chromium"
].launch();
const page = await browser.newPage({
  viewport: { width: 1600, height: 1000 },
  hasTouch: true,
});
page.setDefaultTimeout(10000);
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
const base = `http://127.0.0.1:${server.address().port}`;
const area = page.locator("#view-content > .task-timeline > .timeline-scroll");
const current = async (id) =>
  (await store.snapshot(project.id)).tasks.find((t) => t.id === id);
async function fits() {
  const size = await area.evaluate((el) => {
    const rect = el.getBoundingClientRect();
    const sheet = el.querySelector(".timeline-sheet");
    const rows = [...el.querySelectorAll(".timeline-row")];
    const style = getComputedStyle(el);
    return {
      bottom: rect.bottom,
      height: rect.height,
      viewport: innerHeight,
      width: el.clientWidth,
      sheet: sheet.offsetWidth,
      rowWidths: rows.map((row) => row.getBoundingClientRect().width),
      pageWidth: document.documentElement.scrollWidth,
      limit: innerWidth,
      pageHeight: document.documentElement.scrollHeight,
      overflowX: style.overflowX,
      overflowY: style.overflowY,
    };
  });
  assert.ok(
    size.bottom >= size.viewport - 20 && size.bottom <= size.viewport,
    "Timeline reaches the component bottom",
  );
  assert.ok(
    size.sheet >= size.width &&
      size.rowWidths.every((width) => Math.abs(width - size.sheet) <= 1),
    "Every row fills the sheet and available width",
  );
  assert.ok(
    size.pageWidth <= size.limit && size.pageHeight <= size.viewport + 1,
    "Scrolling stays inside the timeline",
  );
  assert.equal(size.overflowX, "auto");
  assert.equal(size.overflowY, "auto");
  assert.equal(await page.locator(".view-footnote").count(), 0);
}
try {
  await page.goto(`${base}/#project/${project.id}/timeline`);
  await area.waitFor();
  assert.equal(await area.locator(".timeline-row").count(), 3);
  assert.equal(await area.locator(".timeline-unplanned").count(), 2);
  for (const width of [1600, 390]) {
    await page.setViewportSize({ width, height: 844 });
    for (const theme of ["light", "dark"]) {
      await page.evaluate(
        (t) => (document.documentElement.dataset.theme = t),
        theme,
      );
      await fits();
      await page.screenshot({
        path: `/tmp/pencils-timeline-${process.env.BROWSER || "chromium"}-${width}-${theme}.png`,
        animations: "disabled",
      });
    }
    await area.locator(`[data-unscheduled="${unplanned.id}"]`).click();
    await page.locator("#task-form").waitFor();
    assert.equal(
      await page.locator('#task-form [name="title"]').inputValue(),
      "Unplanned idea",
    );
    await page.locator('[data-action="dialog-close"]').click();
  }
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.locator("[data-timeline-scale]").selectOption("day");
  const bar = page.locator(`[data-timeline-task="${planned.id}"]`);
  await bar.focus();
  await page.keyboard.press("Alt+ArrowRight");
  await page.waitForFunction(
    (id) =>
      document
        .querySelector(`[data-timeline-task="${id}"]`)
        ?.getAttribute("aria-valuetext") === "2026-10-20 to 2026-10-26",
    planned.id,
  );
  assert.equal((await current(planned.id)).start, "2026-10-20");
  const end = await bar.locator('[data-date-end="due"]').boundingBox();
  await page.mouse.move(end.x + end.width / 2, end.y + end.height / 2);
  await page.mouse.down();
  await page.mouse.move(end.x + end.width / 2 + 84, end.y + end.height / 2, {
    steps: 4,
  });
  await page.mouse.up();
  await page.waitForFunction(
    (id) =>
      document
        .querySelector(`[data-timeline-task="${id}"]`)
        ?.getAttribute("aria-valuetext") === "2026-10-20 to 2026-10-28",
    planned.id,
  );
  assert.equal((await current(planned.id)).due, "2026-10-28");
  const source = area.locator(`[data-unscheduled="${unplanned.id}"]`);
  await source.dragTo(area.locator(".timeline-track").first(), {
    targetPosition: { x: 100, y: 20 },
  });
  await page.locator(`[data-timeline-task="${unplanned.id}"]`).waitFor();
  assert.equal((await current(unplanned.id)).start, "2026-10-21");
  assert.equal((await current(another.id)).start ?? null, null);
  await fits();
  await page.locator("#search").fill("Nothing matches here");
  await area.locator(".empty").waitFor();
  await fits();
  await area.getByRole("button", { name: "Clear filters" }).click();
  await area.locator(".timeline-row").first().waitFor();
  for (let i = 0; i < 200; i++)
    await store.createTask(project.id, { title: `Unplanned ${i}` });
  await page.reload();
  await area.waitFor();
  assert.equal(await area.locator(".timeline-row").count(), 200);
  await area.evaluate((el) => {
    el.scrollTop = 400;
  });
  assert.ok(
    await area.evaluate((el) => el.scrollTop > 0),
    "Long timelines scroll inside the component",
  );
  await page.getByRole("button", { name: "Next tasks", exact: true }).click();
  assert.equal(await area.locator(".timeline-row").count(), 3);
  assert.equal(await area.locator(".timeline-unplanned").count(), 3);
  await fits();
  assert.deepEqual(errors, []);
  console.log(
    "PASS: full-height/full-width timeline, unplanned rows, mobile/themes, shared task editor, keyboard dates, drag scheduling, filtering and pagination.",
  );
} catch (error) {
  await page.screenshot({
    path: `/tmp/pencils-timeline-failure-${process.env.BROWSER || "chromium"}.png`,
  });
  throw error;
} finally {
  await browser.close();
  server.closeAllConnections();
  await new Promise((r) => server.close(r));
  await store.queue;
  await fs.rm(root, { recursive: true, force: true });
}
