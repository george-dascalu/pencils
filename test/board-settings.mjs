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
async function snap(p, expected) {
  await p.getByRole("button", { name: "Board settings", exact: true }).click();
  const control = p.locator("#canvas-snap");
  assert.equal(await control.isChecked(), expected);
  await p.keyboard.press("Escape");
}
try {
  await enter(page);
  await page.locator("#board-select").selectOption(board.id);
  await snap(page, true);
  await page
    .getByRole("button", { name: "Board settings", exact: true })
    .click();
  await page
    .locator('#board-settings-form [name="title"]')
    .fill("Renamed from settings");
  await page.locator("#canvas-snap").uncheck();
  await page.locator("#canvas-align").uncheck();
  await page
    .getByRole("button", { name: "Apply settings", exact: true })
    .click();
  await page.waitForFunction(
    () =>
      document.querySelector("#board-save").textContent === "All changes saved",
  );
  assert.equal(
    (await store.snapshot(project.id)).boards.find((b) => b.id === board.id)
      .settings.snap,
    false,
  );
  assert.equal(
    (await store.snapshot(project.id)).boards.find((b) => b.id === board.id)
      .title,
    "Renamed from settings",
  );
  assert.equal(
    await page.locator("#board-select option:checked").textContent(),
    "Renamed from settings",
  );
  await page
    .getByRole("button", { name: "Board settings", exact: true })
    .click();
  await page.locator('#board-settings-form [name="title"]').fill("   ");
  await page
    .getByRole("button", { name: "Apply settings", exact: true })
    .click();
  assert.ok(
    await page
      .locator('#board-settings-form [name="title"]')
      .evaluate((el) => !el.validity.valid),
  );
  await page
    .locator('#board-settings-form [name="title"]')
    .fill("Renamed from settings");
  await page
    .getByRole("button", { name: "Apply settings", exact: true })
    .click();
  await page.locator("#canvas").click({ position: { x: 700, y: 400 } });
  await page.keyboard.press("g");
  await page.keyboard.press("m");
  await page.locator("#board-expand").click();
  await page
    .getByRole("button", { name: "Board settings", exact: true })
    .click();
  assert.ok(await page.locator("#board-settings-form").isVisible());
  assert.equal(await page.locator('[name="show-minimap"]').isChecked(), false);
  await page.locator('[name="show-minimap"]').check();
  await page
    .getByRole("button", { name: "Apply settings", exact: true })
    .click();
  assert.ok(await page.locator("#canvas-minimap").isVisible());
  await page
    .getByRole("button", { name: "Board settings", exact: true })
    .click();
  await page.locator('[name="show-minimap"]').uncheck();
  await page
    .getByRole("button", { name: "Apply settings", exact: true })
    .click();
  await page.reload();
  await page.locator("#canvas.board-expanded.grid-hidden").waitFor();
  assert.ok(await page.locator("#canvas-minimap").isHidden());
  await page.keyboard.press("Escape");
  await snap(page, false);
  await page.locator("#board-select").selectOption(other.id);
  await snap(page, true);
  assert.ok(await page.locator("#canvas-minimap").isVisible());
  assert.equal(
    await page
      .locator("#canvas")
      .evaluate((el) => el.classList.contains("grid-hidden")),
    false,
  );
  await page.locator("#board-select").selectOption(board.id);
  await snap(page, false);
  assert.ok(await page.locator("#canvas-minimap").isHidden());
  assert.ok(
    await page
      .locator("#canvas")
      .evaluate((el) => el.classList.contains("grid-hidden")),
  );
  const fresh = await browser.newPage({
    viewport: { width: 1400, height: 1000 },
  });
  await enter(fresh);
  await fresh.locator("#board-select").selectOption(board.id);
  await snap(fresh, false);
  assert.equal(
    await fresh.locator("#board-select option:checked").textContent(),
    "Renamed from settings",
  );
  assert.ok(await fresh.locator("#canvas-minimap").isVisible());
  await fresh.close();
  await page
    .getByRole("button", { name: "Board settings", exact: true })
    .click();
  await page.locator("#canvas-snap").check();
  await page
    .getByRole("button", { name: "Apply settings", exact: true })
    .click();
  await page.waitForFunction(
    () =>
      document.querySelector("#board-save").textContent === "All changes saved",
  );
  await page.reload();
  await snap(page, true);
  assert.deepEqual(errors, []);
  console.log(
    "PASS: Snap persists per board across reloads and fresh browsers; display preferences persist and stay isolated per board.",
  );
} catch (error) {
  await page.screenshot({
    path: "/tmp/pencils-settings-failure.png",
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
