import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { chromium, firefox } from "playwright";
import { Store } from "../server/store.js";
import { createServer } from "../server/index.js";
import { reveal } from "./menu-controls.mjs";
const root = await fs.mkdtemp(path.join(os.tmpdir(), "pencils-settings-"));
const store = new Store(root);
await store.init();
const project = await store.createProject({ title: "Settings" });
const board = (await store.snapshot(project.id)).boards[0];
const other = await store.createBoard(project.id, { title: "Other canvas" });
const server = createServer(store);
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await (
  process.env.BROWSER === "firefox" ? firefox : chromium
).launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } }),
  errors = [];
page.setDefaultTimeout(10000);
page.on("pageerror", (e) => errors.push(e.message));
async function enter(p) {
  await p.goto(base);
  await p.locator(".project-link").click();
  await p.locator("[data-view=board]").click();
  await p.locator("#canvas").waitFor();
}
try {
  await enter(page);
  await page.locator("#board-select").selectOption(board.id);
  const open = async () => {
    await page
      .getByRole("button", { name: "Board settings", exact: true })
      .click();
    await page.locator("#board-settings-form").waitFor();
  };
  const saved = () =>
    page.waitForFunction(
      () =>
        document.querySelector("#board-save").textContent ===
        "Saved automatically",
    );
  await open();
  await page.locator('[name="pattern"][value="grid"]').check();
  const picker = page.locator(".color-picker").first();
  await picker.locator("summary").click();
  await picker.getByRole("button", { name: "Peach", exact: true }).click();
  await page.locator('[name="spacing"]').fill("40");
  await page.locator('[name="spacing"]').dispatchEvent("input");
  assert.equal(
    await page.locator('input[name="theme-color"]').isChecked(),
    false,
  );
  assert.equal(
    await page
      .locator(".background-preview")
      .evaluate((el) => getComputedStyle(el).backgroundColor),
    "rgb(237, 196, 139)",
  );
  await page.screenshot({ path: "/tmp/pencils-background-desktop.png" });
  await page
    .getByRole("button", { name: "Close board settings", exact: true })
    .click();
  await saved();
  await page.reload();
  await page.locator("#canvas").waitFor();
  const appearance = () =>
    page.locator("#canvas").evaluate((el) => ({
      color: getComputedStyle(el).backgroundColor,
      image: getComputedStyle(el).backgroundImage,
      size: getComputedStyle(el).backgroundSize,
    }));
  assert.equal((await appearance()).color, "rgb(237, 196, 139)");
  assert.match((await appearance()).image, /linear-gradient/);
  const native = (await store.snapshot(project.id)).boards.find(
    (b) => b.id === board.id,
  );
  assert.deepEqual(native.settings.background, {
    pattern: "grid",
    color: "#edc48b",
    lineColor: "auto",
    spacing: 40,
  });
  await open();
  await page.getByRole("radio", { name: "Fine grid", exact: true }).check();
  assert.equal(
    await page
      .locator(".background-preview")
      .evaluate((el) => getComputedStyle(el).backgroundSize),
    "200px 200px, 200px 200px, 40px 40px, 40px 40px",
  );
  await page.screenshot({ path: "/tmp/pencils-fine-grid-preview.png" });
  await page
    .getByRole("button", { name: "Close board settings", exact: true })
    .click();
  await saved();
  await page.reload();
  await page.locator("#canvas").waitFor();
  assert.equal(
    (await store.snapshot(project.id)).boards.find((b) => b.id === board.id)
      .settings.background.pattern,
    "fine-grid",
  );
  const assertGrid = async () => {
    const values = await page.locator("#canvas").evaluate((el) => {
      const m = new DOMMatrix(
        getComputedStyle(document.querySelector("#canvas-world")).transform,
      );
      return {
        size: el.style.backgroundSize,
        position: el.style.backgroundPosition,
        x: m.e,
        y: m.f,
        z: m.a,
      };
    });
    const sizes = values.size.split(",").map((v) => parseFloat(v));
    assert.equal(sizes.length, 4);
    assert.ok(Math.abs(sizes[0] - 200 * values.z) < 0.02);
    assert.ok(Math.abs(sizes[2] - 40 * values.z) < 0.02);
    assert.ok(Math.abs(sizes[0] / sizes[2] - 5) < 0.001);
    const position = values.position.split(" ").map(parseFloat);
    assert.ok(
      Math.abs(position[0] - values.x) < 0.02 &&
        Math.abs(position[1] - values.y) < 0.02,
    );
  };
  await assertGrid();
  await page.locator('[data-action="zoom-in"]').click();
  await page.waitForFunction(
    () => !document.querySelector("#canvas").classList.contains("zooming"),
  );
  await assertGrid();
  const bounds = await page.locator("#canvas").boundingBox();
  await page.keyboard.down("Space");
  await page.mouse.move(bounds.x + 500, bounds.y + 300);
  await page.mouse.down();
  await page.mouse.move(bounds.x + 570, bounds.y + 350, { steps: 4 });
  await page.mouse.up();
  await page.keyboard.up("Space");
  await assertGrid();
  await page.screenshot({ path: "/tmp/pencils-fine-grid-board.png" });
  await page.locator("#board-select").selectOption(other.id);
  assert.match((await appearance()).image, /radial-gradient/);
  await page.locator("#board-select").selectOption(board.id);
  await open();
  await page.locator('[name="pattern"][value="plain"]').check();
  await page.getByRole("button", { name: "Close board settings", exact: true }).click();
  assert.equal((await appearance()).image, "none");
  await page.setViewportSize({ width: 390, height: 844 });
  await open();
  const box = await page.locator("#board-settings-form").boundingBox();
  assert.ok(box.x >= 0 && box.x + box.width <= 390);
  await page.locator('[name="pattern"][value="fine-grid"]').check();
  await page.screenshot({ path: "/tmp/pencils-background-mobile.png" });
  await page
    .getByRole("button", { name: "Close board settings", exact: true })
    .click();
  await saved();
  await page.setViewportSize({ width: 1400, height: 1000 });
  await page.locator("#canvas").click({ position: { x: 700, y: 400 } });
  await page.keyboard.press("g");
  assert.equal((await appearance()).image, "none");
  await open();
  await page.locator('[name="pattern"][value="dots"]').check();
  await page
    .getByRole("button", { name: "Close board settings", exact: true })
    .click();
  await saved();
  assert.match((await appearance()).image, /radial-gradient/);
  const fresh = await browser.newPage({
    viewport: { width: 1400, height: 1000 },
  });
  await enter(fresh);
  await fresh.locator("#board-select").selectOption(board.id);
  assert.equal(
    await fresh
      .locator("#canvas")
      .evaluate((el) => getComputedStyle(el).backgroundColor),
    "rgb(237, 196, 139)",
  );
  await fresh.close();
  await open();
  await page.locator("[data-board-settings-reset]").click();
  await page
    .getByRole("button", { name: "Close board settings", exact: true })
    .click();
  await saved();
  await page
    .getByRole("button", { name: "Personal settings", exact: true })
    .click();
  await page.locator('[name="personal-theme"][value="dark"]').check();
  await page.locator('[data-action="dialog-close"]').first().click();
  assert.equal((await appearance()).color, "rgb(23, 34, 28)");
  await open();
  await page.getByRole("radio", { name: "Fine grid", exact: true }).check();
  await page.screenshot({ path: "/tmp/pencils-fine-grid-dark.png" });
  await page
    .getByRole("button", { name: "Close board settings", exact: true })
    .click();
  await saved();
  assert.equal((await appearance()).image.match(/linear-gradient/g).length, 4);
  assert.deepEqual(errors, []);
  console.log(
    "PASS: patterns, shared colour picker, preview/cancel, per-board persistence, fresh browsers, mobile and theme-aware reset.",
  );
} catch (error) {
  await page.screenshot({
    path: "/tmp/pencils-background-failure.png",
    fullPage: true,
  });
  console.error(errors);
  throw error;
} finally {
  await browser.close();
  server.closeAllConnections();
  await new Promise((r) => server.close(r));
  await fs.rm(root, { recursive: true, force: true });
}
