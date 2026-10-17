import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { chromium, firefox } from "playwright";
import { Store } from "../server/store.js";
import { createServer } from "../server/index.js";
const root = await fs.mkdtemp(path.join(os.tmpdir(), "pencils-grid-drag-"));
const store = new Store(root);
await store.init();
const project = await store.createProject({ title: "Grid drag" });
const server = createServer(store);
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const isFirefox = process.env.BROWSER === "firefox";
const browser = await (isFirefox ? firefox : chromium).launch({
  headless: true,
});
const context = await browser.newContext({
  viewport: { width: 1500, height: 1000 },
  hasTouch: true,
});
const page = await context.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const nodes = async () => (await store.snapshot(project.id)).boards[0].nodes;
const until = async (fn) => {
  for (let i = 0; i < 120; i++) {
    if (await fn()) return;
    await page.waitForTimeout(50);
  }
  throw Error("Timed out waiting for board persistence");
};
const source = page.locator(".board-tools [data-tool=grid]");
const preview = page.locator(".grid-drop-preview");
async function start() {
  const r = await source.boundingBox();
  await page.mouse.move(r.x + r.width / 2, r.y + r.height / 2);
  await page.mouse.down();
}
try {
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  await page.locator(".project-link").click();
  await page.locator("[data-view=board]").click();
  await page.waitForTimeout(1800);
  const c = await page.locator("#canvas").boundingBox();
  const x = c.x + c.width * 0.4,
    y = c.y + c.height * 0.35;
  for (const delta of [240, -440]) {
    await page.mouse.move(x, y);
    await page.mouse.wheel(0, delta);
    await page.waitForTimeout(250);
    const count = (await nodes()).length;
    await start();
    await page.mouse.move(x, y, { steps: 10 });
    await preview.waitFor();
    assert.equal(await preview.locator(".grid-cell").count(), 9);
    assert.equal(
      (await nodes()).length,
      count,
      "Dragging does not persist a grid",
    );
    const before = await preview.boundingBox();
    await page.screenshot({ path: "/tmp/pencils-grid-drop-preview.png" });
    await page.mouse.up();
    await until(async () => (await nodes()).length === count + 1);
    const grid = (await nodes()).at(-1);
    const after = await page.locator(`[data-node="${grid.id}"]`).boundingBox();
    for (const key of ["x", "y", "width", "height"])
      assert.ok(
        Math.abs(before[key] - after[key]) < 3,
        `${key} matches preview at zoom (${before[key]}, ${after[key]})`,
      );
    assert.equal(grid.grid.rows.length, 3);
    assert.equal(await preview.count(), 0);
    await page.locator("[data-action=board-undo]").click();
    await until(async () => (await nodes()).length === count);
    await page.locator("[data-action=board-redo]").click();
    await until(async () => (await nodes()).length === count + 1);
  }
  for (const cancel of ["escape", "outside"]) {
    const count = (await nodes()).length;
    await start();
    await page.mouse.move(x, y, { steps: 6 });
    await preview.waitFor();
    if (cancel === "escape") await page.keyboard.press("Escape");
    else await page.mouse.move(10, 10, { steps: 5 });
    await page.mouse.up();
    await page.waitForTimeout(350);
    assert.equal(await preview.count(), 0);
    assert.equal((await nodes()).length, count);
  }
  // Clicking the same sidebar tool still supports click-to-place.
  const count = (await nodes()).length;
  await source.click();
  await page.mouse.click(x, y);
  await until(async () => (await nodes()).length === count + 1);
  const grid = (await nodes()).at(-1);
  await page.locator(`[data-node="${grid.id}"] .grid-grip`).click();
  await page
    .getByRole("button", { name: "Select column A", exact: true })
    .click();
  const menu = page.locator('[data-selection-menu="text-align"]');
  await menu.locator("summary").click();
  assert.ok(
    (await menu.locator(".selection-popover").boundingBox()).width <= 210,
  );
  for (const name of [
    "Align text left",
    "Centre text",
    "Align text right",
    "Align text top",
    "Align text middle",
    "Align text bottom",
  ]) {
    const button = menu.getByRole("button", { name, exact: true });
    assert.equal(
      (await button.textContent()).trim(),
      "",
      "Icon-only alignment",
    );
    assert.equal(await button.locator("svg").count(), 1);
  }
  await menu
    .getByRole("button", { name: "Align text bottom", exact: true })
    .click();
  await until(async () =>
    (await nodes())
      .find((n) => n.id === grid.id)
      .grid.cells.every((row) => row[0].verticalAlign === "bottom"),
  );
  await menu.locator("summary").click();
  await page.screenshot({ path: "/tmp/pencils-grid-alignment-icons.png" });
  await page.reload();
  await page.locator(`[data-node="${grid.id}"]`).waitFor();
  if (!isFirefox) {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForFunction(
      () =>
        document.querySelector(".sidebar").getBoundingClientRect().right <= 1,
    );
    await page.evaluate(() =>
      window.PencilsAppearance.write({ theme: "dark" }),
    );
    const r = await source.boundingBox();
    const session = await context.newCDPSession(page);
    const before = (await nodes()).length;
    await session.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ x: r.x + r.width / 2, y: r.y + r.height / 2 }],
    });
    await session.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ x: 160, y: 450 }],
    });
    await preview.waitFor();
    await page.screenshot({ path: "/tmp/pencils-grid-drop-mobile.png" });
    await session.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
    await until(async () => (await nodes()).length === before + 1);
  }
  assert.deepEqual(errors, []);
  console.log(
    "PASS: grid preview at multiple zooms, single persisted drop, undo/redo, cancel, click fallback, column alignment icons, reload and mobile touch/dark mode",
  );
} catch (error) {
  await page.screenshot({ path: "/tmp/pencils-grid-drag-failure.png" });
  throw error;
} finally {
  await browser.close();
  server.closeAllConnections();
  await new Promise((r) => server.close(r));
  await fs.rm(root, { recursive: true, force: true });
}
