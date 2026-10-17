import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { chromium, firefox, webkit } from "playwright";
import { Store } from "../server/store.js";
import { createServer } from "../server/index.js";
import { DEFAULT_SCHEMA } from "../server/model.js";
import { clickControl, reveal, selectProjectView } from "./menu-controls.mjs";

const root = await fs.mkdtemp(path.join(os.tmpdir(), "pencils-column-drag-"));
const store = new Store(root);
await store.init();
const project = await store.createProject({ title: "Column drag", schema: {
  ...DEFAULT_SCHEMA, fields: [{ id: "points", name: "Points", type: "number" }],
} });
const task = await store.createTask(project.id, { title: "Alpha", priority: "high", fields: { points: 3 } });
await store.createTask(project.id, { title: "Beta", priority: "low", fields: { points: 7 } });
const server = createServer(store);
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const kind = process.env.BROWSER || "chromium";
const browser = await ({ chromium, firefox, webkit }[kind]).launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
page.setDefaultTimeout(12000);
const errors = [];
page.on("pageerror", error => errors.push(error.message));
const url = `http://127.0.0.1:${server.address().port}`;
const header = (key, p = page) => p.locator(`[data-table-sort-column="${key}"]`);
const order = (p = page) => p.locator(".spreadsheet thead th[data-column-key]").evaluateAll(els => els.map(el => el.dataset.columnKey));
const sort = () => page.locator(".spreadsheet thead th[data-column-key]").evaluateAll(els => els.map(el => [el.dataset.columnKey, el.getAttribute("aria-sort")]).sort());
const scroll = (left, p = page) => p.locator(".table-scroll").evaluate((el, x) => el.scrollLeft = x, left);
const point = async locator => { const b = await locator.boundingBox(); assert.ok(b); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; };
async function open(p) {
  await p.goto(url);
  if (await p.locator(".mobile-menu").isVisible()) await p.locator(".mobile-menu").click();
  await p.locator(".project-link").click();
  await selectProjectView(p, "table");
  await p.locator("[data-table-task]").first().waitFor();
}
async function startDrag(key) {
  const p = await point(header(key));
  await page.mouse.move(p.x, p.y);
  await page.mouse.down();
  await page.mouse.move(p.x + 10, p.y, { steps: 3 });
  await page.locator(".table-column-drag-ghost").waitFor();
  return p;
}
async function dragBefore(key, beforeKey) {
  await startDrag(key);
  const box = await page.locator(`.spreadsheet th[data-column-key="${beforeKey}"]`).boundingBox();
  await page.mouse.move(box.x + box.width * 0.2, box.y + box.height / 2, { steps: 10 });
  assert.equal(await page.locator(".table-column-drop-marker").isVisible(), true);
  await page.mouse.up();
}
async function columns() {
  const menu = page.locator('[data-board-menu="table-columns"]');
  if (!(await menu.evaluate(el => el.open))) await menu.locator(":scope > summary").click();
  return menu;
}
async function waitFor(fn) {
  for (let i = 0; i < 100; i++) {
    if (await fn()) return;
    await page.waitForTimeout(60);
  }
  throw new Error("Condition did not become true");
}
try {
  await open(page);
  await header("title").click();
  const sorted = await sort();
  await dragBefore("priority", "type");
  assert.deepEqual((await order()).slice(0, 5), ["key", "title", "priority", "type", "status"]);
  assert.deepEqual(await sort(), sorted, "Dragging must not change sorting");
  assert.equal(await header("priority").evaluate(el => el === document.activeElement), true);
  assert.deepEqual(await page.locator(`[data-table-task="${task.id}"] td[data-column-key]`).evaluateAll(els => els.map(el => el.dataset.columnKey)), await order());
  assert.match(await page.locator("[data-table-reorder-status]").textContent(), /Priority moved to column 3/);
  await header("priority").click();
  assert.equal(await header("priority").locator("xpath=ancestor::th").getAttribute("aria-sort"), "ascending");

  // Header edges still resize, and widths travel with columns.
  const beforeResize = await order();
  const handle = page.locator('[data-resize-column="priority"]');
  const handlePoint = await point(handle);
  const oldWidth = await header("priority").locator("xpath=ancestor::th").evaluate(el => el.offsetWidth);
  await page.mouse.move(handlePoint.x, handlePoint.y);
  await page.mouse.down();
  await page.mouse.move(handlePoint.x + 50, handlePoint.y, { steps: 5 });
  await page.mouse.up();
  const width = await header("priority").locator("xpath=ancestor::th").evaluate(el => el.offsetWidth);
  assert.ok(width >= oldWidth + 45);
  assert.deepEqual(await order(), beforeResize);
  await dragBefore("priority", "title");
  assert.equal(await header("priority").locator("xpath=ancestor::th").evaluate(el => el.offsetWidth), width);

  // All cancellation routes leave ordering and sort unchanged.
  const original = await order(), originalSort = await sort();
  const pos = await startDrag("type");
  await page.mouse.move(pos.x - 170, pos.y);
  await page.keyboard.press("Escape");
  await page.mouse.up();
  assert.deepEqual(await order(), original);
  assert.deepEqual(await sort(), originalSort);
  await startDrag("type");
  await page.mouse.move(10, 10);
  assert.equal(await page.locator(".table-column-drop-marker").isVisible(), false);
  await page.mouse.up();
  assert.deepEqual(await order(), original);
  await startDrag("type");
  await header("type").dispatchEvent("pointercancel", { pointerId: 1 });
  await page.mouse.up();
  assert.equal(await page.locator(".table-column-drag-ghost").count(), 0);
  assert.deepEqual(await order(), original);

  // Keyboard controls and the existing popover use exactly the same ordering.
  await header("priority").focus();
  await page.keyboard.press("Alt+ArrowRight");
  assert.equal((await order())[2], "priority");
  await page.keyboard.press("Alt+ArrowLeft");
  assert.equal((await order())[1], "priority");
  await columns();
  await page.locator('[data-column-visible="status"]').uncheck();
  await page.locator('[data-column-setting="type"] [data-feature="column-up"]').click();
  await page.locator('[data-feature="columns-close"]').click();
  assert.ok(!(await order()).includes("status"));

  // Auto-scroll reaches the last custom field; hidden columns are not discarded.
  await scroll(10000);
  await startDrag("fields.points");
  const area = await page.locator(".table-scroll").boundingBox();
  const h = await point(header("fields.points"));
  await page.mouse.move(area.x + 5, h.y, { steps: 10 });
  await waitFor(async () => (await page.locator(".table-scroll").evaluate(el => el.scrollLeft)) === 0);
  await page.mouse.up();
  assert.equal((await order())[0], "fields.points");
  await columns();
  const allColumns = await page.locator("[data-column-setting]").evaluateAll(els => els.map(el => el.dataset.columnSetting));
  assert.ok(allColumns.includes("status"));
  assert.equal(await page.locator('[data-column-visible="status"]').isChecked(), false);
  await page.locator('[data-feature="columns-close"]').click();
  await page.locator(`[data-table-task="${task.id}"] [data-task-field="fields.points"]`).fill("42");
  await page.locator(`[data-table-task="${task.id}"] [data-task-field="fields.points"]`).press("Tab");
  await waitFor(async () => (await store.snapshot(project.id)).tasks.find(t => t.id === task.id).fields.points === 42);

  const finalOrder = await order();
  await clickControl(page.locator('[data-feature="view-save"]'));
  await page.locator('#view-form [name="name"]').fill("Reordered columns");
  await page.locator('#view-form [name="scope"]').selectOption("project");
  await page.locator('#view-form [type="submit"]').click();
  await page.locator("dialog").waitFor({ state: "detached" });
  const view = (await store.snapshot(project.id)).project.views[0];
  assert.deepEqual(view.columns.filter(c => c.visible !== false).map(c => c.key), finalOrder);
  assert.equal(view.columns.find(c => c.key === "priority").width, width);
  await page.reload();
  await page.locator("[data-table-task]").first().waitFor();
  await (await reveal(page.locator("#saved-view"))).selectOption(view.id);
  assert.deepEqual(await order(), finalOrder);
  await page.keyboard.press("Escape");
  await page.screenshot({ path: "/tmp/pencils-column-drag-desktop.png" });

  // Smaller touch layout, with a real Chromium touch stream (not mouse events).
  const mobile = await browser.newPage({ viewport: { width: 760, height: 1024 }, hasTouch: true,
    ...(kind !== "firefox" ? { isMobile: true } : {}) });
  mobile.setDefaultTimeout(12000);
  mobile.on("pageerror", error => errors.push(error.message));
  await open(mobile);
  await mobile.evaluate(() => window.PencilsAppearance.write({ theme: "dark" }));
  await scroll(480, mobile);
  const from = await point(header("status", mobile));
  const to = await point(header("type", mobile));
  const touchBefore = await order(mobile);
  if (kind === "chromium") {
    const cdp = await mobile.context().newCDPSession(mobile);
    const touch = (type, p) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: p ? [{ ...p, id: 1, radiusX: 4, radiusY: 4 }] : [] });
    await touch("touchStart", from);
    for (let i = 1; i <= 10; i++) await touch("touchMove", { x: from.x + (to.x - from.x) * i / 10, y: from.y });
    await mobile.locator(".table-column-drag-ghost").waitFor();
    await mobile.screenshot({ path: "/tmp/pencils-column-drag-mobile.png" });
    await touch("touchEnd");
    const afterDrop = await order(mobile);
    const again = await point(header("status", mobile));
    await touch("touchStart", again);
    await touch("touchMove", { x: again.x + 30, y: again.y });
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [
      { x: again.x + 30, y: again.y, id: 1 }, { x: again.x + 80, y: again.y + 40, id: 2 },
    ] });
    await touch("touchEnd");
    assert.deepEqual(await order(mobile), afterDrop, "A second finger cancels a column drag");
    assert.equal(await mobile.locator(".table-column-drag-ghost").count(), 0);
    await cdp.detach();
  } else {
    // These drivers do not expose touch-move; check real pointer input in the touch layout.
    await mobile.mouse.move(from.x, from.y);
    await mobile.mouse.down();
    await mobile.mouse.move(to.x, to.y, { steps: 10 });
    await mobile.mouse.up();
  }
  const touchAfter = await order(mobile);
  assert.notDeepEqual(touchAfter, touchBefore);
  assert.ok(touchAfter.indexOf("status") < touchAfter.indexOf("type"));
  assert.equal(await mobile.locator(".table-column-drag-ghost").count(), 0);
  assert.equal(await mobile.locator(".table-sort-indicator").count(), 0);
  const touchHeight = await mobile.locator(".spreadsheet th").first().evaluate(el => el.getBoundingClientRect().height);
  assert.ok(touchHeight >= 44 && touchHeight <= 45);
  assert.deepEqual(errors, []);
  console.log(`PASS (${kind}): header drag, insertion marker, sorting, resizing, cancellation, keyboard and popover order, edge scrolling, hidden/custom columns, editing, saved views and mobile touch.`);
} finally {
  await browser.close();
  server.closeAllConnections?.();
  await new Promise(resolve => server.close(resolve));
  await fs.rm(root, { recursive: true, force: true });
}
