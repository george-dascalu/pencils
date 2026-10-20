import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { chromium, firefox } from "playwright";
import { Store } from "../server/store.js";
import { createServer } from "../server/index.js";
import { selectProjectView } from "./menu-controls.mjs";
const root = await fs.mkdtemp(
  path.join(os.tmpdir(), "pencils-table-viewport-"),
);
const store = new Store(root);
await store.init();
const project = await store.createProject({
  title: "Table viewport",
  default_view: "table",
});
await store.createTask(project.id, { title: "First row" });
await store.createTask(project.id, { title: "Second row" });
const server = createServer(store);
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const browser = await (
  process.env.BROWSER === "firefox" ? firefox : chromium
).launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const area = page.locator("#view-content > .table-scroll");
const base = `http://127.0.0.1:${server.address().port}`;
async function fits() {
  assert.equal(await page.locator(".table-result-summary,.view-footnote").count(), 0);
  const actual = await area.evaluate((el) => {
    const r = el.getBoundingClientRect(),
      parent = el.parentElement.getBoundingClientRect(),
      style = getComputedStyle(el),
      ps = getComputedStyle(el.parentElement);
    return {
      width: r.width,
      height: r.height,
      bottom: r.bottom,
      parentBottom: parent.bottom,
      availableWidth:
        parent.width - parseFloat(ps.paddingLeft) - parseFloat(ps.paddingRight),
      x: style.overflowX,
      y: style.overflowY,
      documentWidth: document.documentElement.scrollWidth,
      viewportWidth: innerWidth,
      viewportHeight: innerHeight,
      footer: document.querySelector(".add-row").getBoundingClientRect().bottom,
    };
  });
  assert.ok(
    Math.abs(actual.width - actual.availableWidth) < 2,
    "Scroll area spans component width",
  );
  assert.ok(
    Math.abs(actual.parentBottom - actual.viewportHeight) < 2,
    "Component fills remaining viewport height",
  );
  assert.ok(
    actual.parentBottom - actual.bottom < 140,
    "Scrollbar stays near the bottom, above the footer",
  );
  assert.ok(
    actual.footer <= actual.viewportHeight + 1,
    "New row action remains visible",
  );
  assert.ok(
    actual.documentWidth <= actual.viewportWidth,
    "No horizontal page scrolling",
  );
  assert.equal(actual.x, "auto");
  assert.equal(actual.y, "auto");
}
try {
  await page.goto(`${base}/#project/${project.id}/table`);
  await area.waitFor();
  for (const width of [1600, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const theme of ["light", "dark"]) {
      await page.evaluate(
        (t) => (document.documentElement.dataset.theme = t),
        theme,
      );
      await fits();
      const body = await page.locator(".spreadsheet tbody").boundingBox();
      const box = await area.boundingBox();
      assert.ok(
        box.height > body.height + 120,
        "Few rows leave blank space inside the table viewport",
      );
      await page.screenshot({
        path: `/tmp/pencils-table-viewport-${width}-${theme}.png`,
        animations: "disabled",
      });
    }
  }
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.locator("[data-board-menu=table-columns] > summary").click();
  const keys = await page
    .locator("[data-column-visible]")
    .evaluateAll((els) => els.map((el) => el.dataset.columnVisible));
  for (const key of keys)
    if (key !== "title")
      await page.locator(`[data-column-visible="${key}"]`).uncheck();
  await page.locator("[data-feature=columns-close]").click();
  await fits();
  assert.equal(
    await page
      .locator(".spreadsheet th[data-column-key=title]")
      .evaluate((el) => Math.round(el.getBoundingClientRect().width)),
    300,
    "Narrow data keeps its own column width",
  );
  assert.ok(
    await area.evaluate((el) => el.scrollWidth === el.clientWidth),
    "Few columns leave space rather than stretching",
  );
  await page.locator("#search").fill("No matching rows");
  await page.locator(".table-no-results").waitFor();
  await fits();
  await page.screenshot({ path: "/tmp/pencils-table-viewport-empty.png" });
  // Enough compact rows to scroll 600px even on a tall desktop viewport.
  for (let i = 0; i < 60; i++)
    await store.createTask(project.id, { title: `Overflow row ${i}` });
  // A fresh location starts without the prior history entry's column/filter preferences.
  await page.goto(base);
  await page.locator("[data-table-task]").nth(61).waitFor();
  await fits();
  const head = page.locator(".spreadsheet thead th").first();
  const before = await head.boundingBox();
  await area.evaluate((el) => {
    el.scrollTop = 600;
    el.scrollLeft = 500;
  });
  await page.waitForFunction(() => history.state.scroll?.tableY >= 600);
  const after = await head.boundingBox();
  assert.ok(
    Math.abs(after.y - before.y) < 2,
    "Column headers stay visible during vertical scrolling",
  );
  await selectProjectView(page, "kanban");
  await page.goBack();
  await page.waitForFunction(
    () => document.querySelector(".table-scroll")?.scrollTop >= 600,
  );
  assert.ok(
    await area.evaluate((el) => el.scrollLeft >= 500),
    "Back restores table scroll position",
  );
  await page.locator("[data-table-task]").last().scrollIntoViewIfNeeded();
  await fits();
  assert.deepEqual(errors, []);
  console.log(
    "PASS: full-size table viewport with few rows/columns, empty results, overflow, fixed scrollbar edges, sticky headers, scroll restoration, desktop/mobile and both themes.",
  );
} finally {
  await browser.close();
  server.closeAllConnections();
  await new Promise((r) => server.close(r));
  await fs.rm(root, { recursive: true, force: true });
}
