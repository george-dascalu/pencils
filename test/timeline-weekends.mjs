import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { chromium, firefox, webkit } from "playwright";
import { Store } from "../server/store.js";
import { createServer } from "../server/index.js";

const root = await fs.mkdtemp(path.join(os.tmpdir(), "pencils-weekends-"));
const store = new Store(root);
await store.init();
const project = await store.createProject({ title: "Timeline dates" });
await store.createTask(project.id, {
  title: "Project horizon",
  start: "2026-09-21",
  due: "2026-12-10",
});
const planned = await store.createTask(project.id, {
  title: "Weekend crossing",
  start: "2026-10-02",
  due: "2026-10-05",
});
const weekend = await store.createTask(project.id, {
  title: "Weekend work",
  start: "2026-10-03",
  due: "2026-10-04",
});
const unplanned = await store.createTask(project.id, {
  title: "Unplanned idea",
});
let board = (await store.snapshot(project.id)).boards[0];
board = await store.updateBoard(project.id, board.id, {
  revision: board.revision,
  nodes: [
    {
      id: "live-timeline",
      type: "query",
      x: 20,
      y: 20,
      w: 1200,
      h: 500,
      text: "Embedded Timeline",
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
  viewport: { width: 1600, height: 1000 },
  hasTouch: true,
});
page.setDefaultTimeout(10000);
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const base = `http://127.0.0.1:${server.address().port}`;
const tasks = async () => (await store.snapshot(project.id)).tasks;
const task = async (id) => (await tasks()).find((t) => t.id === id);
const timeline = page.locator('#view-content > [data-timeline="project"]');
const toggle = timeline.getByRole("checkbox", { name: "Show weekends" });
const bar = page.locator(`[data-timeline-task="${planned.id}"]`);
async function dates(start, due) {
  await page.waitForFunction(
    ({ id, value }) =>
      document
        .querySelector(`[data-timeline-task="${id}"]`)
        ?.getAttribute("aria-valuetext") === value,
    { id: planned.id, value: `${start} to ${due}` },
  );
  assert.equal((await task(planned.id)).start, start);
  assert.equal((await task(planned.id)).due, due);
}
try {
  await page.goto(`${base}/#project/${project.id}/timeline`);
  await timeline.locator(".timeline-months span").first().waitFor();
  assert.equal(
    await timeline.locator(".timeline-months span").first().textContent(),
    "Sept",
  );
  assert.equal(
    await timeline
      .locator('.timeline-ticks [data-date="2026-10-05"]')
      .getAttribute("title"),
    "Week 41 05/10/2026 to 11/10/2026",
  );
  const original = await tasks();
  await toggle.uncheck();
  assert.equal(await timeline.getAttribute("data-weekends"), "false");
  assert.deepEqual(
    await tasks(),
    original,
    "Hiding weekends does not edit task dates",
  );
  await page.reload();
  await toggle.waitFor();
  assert.equal(await toggle.isChecked(), false, "Weekend visibility persists");
  for (const width of [1600, 390]) {
    await page.setViewportSize({ width, height: 844 });
    for (const theme of ["light", "dark"]) {
      await page.evaluate((value) => {
        document.documentElement.dataset.theme = value;
      }, theme);
      for (const show of [true, false]) {
        await toggle.setChecked(show);
        await timeline.locator(".timeline-months span").first().waitFor();
        assert.ok(
          await timeline.evaluate(
            (el) =>
              document.documentElement.scrollWidth <= innerWidth &&
              document.documentElement.scrollHeight <= innerHeight + 1 &&
              el.querySelector(".timeline-scroll").getBoundingClientRect()
                .bottom >
                innerHeight - 20,
          ),
        );
        await page.screenshot({
          path: `/tmp/pencils-weekends-${browserName}-${width}-${theme}-${show}.png`,
        });
      }
    }
  }
  await page.setViewportSize({ width: 1600, height: 1000 });
  await timeline.locator("[data-timeline-scale]").selectOption("day");
  await timeline.locator('.timeline-ticks [data-date="2026-09-21"]').waitFor();
  assert.ok(
    await timeline
      .locator(".timeline-ticks [data-date]")
      .evaluateAll((els) =>
        els.every(
          (el) => ![0, 6].includes(new Date(el.dataset.date).getUTCDay()),
        ),
      ),
  );
  assert.equal(
    await bar.evaluate((el) => parseFloat(el.style.width)),
    84,
    "Friday to Monday occupies two weekdays",
  );
  assert.equal(
    await page
      .locator(`[data-timeline-task="${weekend.id}"]`)
      .evaluate((el) => parseFloat(el.style.width)),
    12,
    "Weekend-only work retains a marker and row",
  );
  await toggle.check();
  assert.equal(await bar.evaluate((el) => parseFloat(el.style.width)), 168);
  await toggle.uncheck();
  assert.deepEqual(await tasks(), original);
  await bar.scrollIntoViewIfNeeded();
  const end = await bar.locator('[data-date-end="due"]').boundingBox();
  await page.mouse.move(end.x + 4, end.y + 12);
  await page.mouse.down();
  await page.mouse.move(end.x + 46, end.y + 12, { steps: 4 });
  await page.mouse.up();
  await dates("2026-10-02", "2026-10-06");
  const bounds = await bar.boundingBox();
  await page.mouse.move(bounds.x + 25, bounds.y + 14);
  await page.mouse.down();
  await page.mouse.move(bounds.x + 67, bounds.y + 14, { steps: 4 });
  await page.mouse.up();
  await dates("2026-10-05", "2026-10-09");
  await bar.focus();
  await page.keyboard.press("Alt+ArrowLeft");
  await dates("2026-10-02", "2026-10-06");
  await timeline.locator(".timeline-scroll").evaluate((el) => {
    el.scrollLeft = 0;
  });
  await timeline
    .locator(`[data-unscheduled="${unplanned.id}"]`)
    .dragTo(timeline.locator(".timeline-track").first(), {
      targetPosition: { x: 430, y: 20 },
    });
  await page.locator(`[data-timeline-task="${unplanned.id}"]`).waitFor();
  assert.equal(
    (await task(unplanned.id)).start,
    "2026-10-05",
    "Dropping after ten weekdays lands on Monday",
  );
  assert.equal((await task(weekend.id)).start, "2026-10-03");
  assert.equal((await task(weekend.id)).due, "2026-10-04");
  await page.goto(`${base}/#project/${project.id}/board`);
  const embedded = page.locator('[data-timeline="live-timeline"]');
  await embedded.waitFor();
  await embedded.getByRole("checkbox", { name: "Show weekends" }).uncheck();
  await page.waitForFunction(
    () =>
      document.querySelector('[data-timeline="live-timeline"]')?.dataset
        .weekends === "false",
  );
  await page.waitForFunction(
    async ({ project, board }) => {
      const data = await (await fetch(`/api/projects/${project}`)).json();
      return (
        data.boards
          .find((b) => b.id === board)
          .nodes.find((n) => n.id === "live-timeline").timelineShowWeekends ===
        false
      );
    },
    { project: project.id, board: board.id },
  );
  await page.reload();
  await embedded.waitFor();
  assert.equal(
    await embedded.getByRole("checkbox", { name: "Show weekends" }).isChecked(),
    false,
  );
  assert.deepEqual(errors, []);
  console.log(
    "PASS: month/week headers, weekend visibility and persistence, mobile/themes, dates unchanged on toggle, weekend markers, compressed-axis resize/move/keyboard/drop, and embedded Timeline preferences.",
  );
} catch (error) {
  await page.screenshot({
    path: `/tmp/pencils-weekends-failure-${browserName}.png`,
  });
  throw error;
} finally {
  await browser.close();
  server.closeAllConnections();
  await new Promise((r) => server.close(r));
  await store.queue;
  await fs.rm(root, { recursive: true, force: true });
}
