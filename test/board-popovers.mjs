import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { chromium, firefox } from "playwright";
import { Store } from "../server/store.js";
import { createServer } from "../server/index.js";
const root = await fs.mkdtemp(path.join(os.tmpdir(), "pencils-popovers-"));
const store = new Store(root);
await store.init();
const project = await store.createProject({ title: "Popover lab" });
const b = (await store.snapshot(project.id)).boards[0];
await store.updateBoard(project.id, b.id, {
  revision: b.revision,
  nodes: [
    {
      id: "note",
      type: "sticky",
      text: "Discuss this idea",
      x: 150,
      y: 120,
      w: 220,
      h: 220,
    },
  ],
  edges: [],
});
const server = createServer(store);
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const browser = await (
  process.env.BROWSER === "firefox" ? firefox : chromium
).launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const current = async () =>
  (await store.snapshot(project.id)).boards.find((x) => x.id === b.id);
const until = async (fn) => {
  for (let i = 0; i < 150; i++) {
    if (await fn()) return;
    await page.waitForTimeout(50);
  }
  throw Error("Timed out");
};
const saved = () =>
  page.waitForFunction(
    () =>
      document.querySelector("#board-save")?.textContent ===
      "Saved automatically",
  );
const keyboard = async (key) => {
  await page.keyboard.press(key);
  await page.waitForTimeout(80);
};
try {
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  await page.locator(".project-link").click();
  await page.locator("[data-view=board]").click();
  const camera = await page.locator("#canvas-world").getAttribute("style");
  await page
    .getByRole("button", { name: "Board settings", exact: true })
    .click();
  const form = page.locator("#board-settings-form"),
    snap = form.locator("[name=snap]");
  assert.equal(
    await form.getByRole("button", { name: /Apply settings|Cancel/ }).count(),
    0,
  );
  const reset = await form.locator("[data-board-settings-reset]").boundingBox(),
    close = await form.locator("[data-board-settings-close]").boundingBox();
  assert.ok(
    reset.x + reset.width <= close.x && Math.abs(reset.y - close.y) < 5,
  );
  await snap.uncheck();
  await saved();
  assert.equal((await current()).settings.snap, false);
  await keyboard("Control+z");
  await until(() => snap.isChecked());
  assert.ok(await form.isVisible());
  await keyboard("Control+Shift+z");
  await until(async () => !(await snap.isChecked()));
  await keyboard("Control+z");
  await until(() => snap.isChecked());
  const title = form.locator("[name=title]");
  await title.fill("Auto renamed");
  await until(
    async () =>
      (await page.locator("#board-select option:checked").textContent()) ===
      "Auto renamed",
  );
  await saved();
  await keyboard("Control+z");
  await until(async () => (await title.inputValue()) === b.title);
  await keyboard("Control+Shift+z");
  await until(async () => (await title.inputValue()) === "Auto renamed");
  // A continuous slider gesture is one saved edit, while the canvas paints immediately.
  const spacing = form.locator("[name=spacing]");
  for (const value of ["24", "28", "32"])
    await spacing.evaluate((el, v) => {
      el.value = v;
      el.dispatchEvent(new Event("input", { bubbles: true }));
    }, value);
  assert.match(
    await page.locator("#canvas").evaluate((el) => el.style.backgroundSize),
    /27.2/,
  );
  await spacing.dispatchEvent("change");
  await saved();
  await keyboard("Control+z");
  await until(async () => (await spacing.inputValue()) === "20");
  const minimap = form.locator("[name=show-minimap]");
  await minimap.uncheck();
  assert.ok(await page.locator("#canvas-minimap").isHidden());
  await keyboard("Control+z");
  await until(() => minimap.isChecked());
  assert.ok(await page.locator("#canvas-minimap").isVisible());
  await keyboard("Control+Shift+z");
  await until(async () => !(await minimap.isChecked()));
  // Reset shared and browser-local preferences together, and undo/redo the reset.
  await form.locator('[name=pattern][value="fine-grid"]').check();
  await saved();
  await form.locator("[data-board-settings-reset]").click();
  await saved();
  assert.ok(await minimap.isChecked());
  await keyboard("Control+z");
  await until(
    async () =>
      (await form.locator("[name=pattern]:checked").inputValue()) ===
        "fine-grid" && !(await minimap.isChecked()),
  );
  await keyboard("Control+Shift+z");
  await until(
    async () =>
      (await form.locator("[name=pattern]:checked").inputValue()) === "dots" &&
      (await minimap.isChecked()),
  );
  await form.locator("[data-board-settings-close]").click();
  assert.equal(
    await page.locator("#canvas-world").getAttribute("style"),
    camera,
  );
  await page.reload();
  await page.locator("#canvas").waitFor();
  assert.equal((await current()).title, "Auto renamed");
  // Compact comments remain beside the object and preserve the draft while reacting.
  const note = page.locator("[data-node=note]");
  await note.click();
  await page.locator("#selection-tools [data-pro=comments]").click();
  const panel = page.locator(".board-comments"),
    composer = panel.locator("textarea");
  assert.equal(await page.locator("dialog:modal").count(), 0);
  const pb = await panel.boundingBox(),
    nb = await note.boundingBox();
  assert.ok(pb.width <= 301 && pb.height > pb.width && pb.x >= nb.x + nb.width);
  await composer.fill("First comment");
  await composer.press("Control+Enter");
  await until(async () => (await current()).nodes[0].comments?.length === 1);
  assert.equal(await composer.inputValue(), "");
  await composer.fill("Draft to keep");
  await panel.getByRole("button", { name: "Thumbs up", exact: true }).click();
  assert.equal(await composer.inputValue(), "Draft to keep");
  await panel.getByRole("button", { name: "Thumbs up (1)", exact: true }).click();
  await panel.locator("[data-comments-close]").click();
  await page.locator("#selection-tools [data-pro=comments]").click();
  assert.equal(await composer.inputValue(), "Draft to keep");
  await composer.fill("Second comment");
  await panel.getByRole("button", { name: "Add comment", exact: true }).click();
  await until(async () => (await current()).nodes[0].comments.length === 2);
  assert.equal(await panel.locator(".board-comment").count(), 2);
  await page.screenshot({ path: "/tmp/pencils-comments-desktop.png" });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => window.PencilsAppearance.write({ theme: "dark" }));
  await page.waitForTimeout(250);
  const mobile = await panel.boundingBox();
  assert.ok(
    mobile.x >= 0 &&
      mobile.x + mobile.width <= 390 &&
      mobile.y >= 0 &&
      mobile.y + mobile.height <= 844,
  );
  await page.screenshot({
    path: "/tmp/pencils-comments-mobile-dark.png",
    animations: "disabled",
  });
  await composer.press("Escape");
  assert.equal(await panel.count(), 0);
  assert.deepEqual(errors, []);
  console.log(
    "PASS: automatic settings, live preview, undo/redo including local display and reset, persisted title, unchanged camera, anchored nonmodal comments, reaction toggling, draft retention and responsive themes.",
  );
} catch (error) {
  await page.screenshot({ path: "/tmp/pencils-popovers-failure.png" });
  throw error;
} finally {
  await browser.close();
  server.closeAllConnections();
  await new Promise((r) => server.close(r));
  await fs.rm(root, { recursive: true, force: true });
}
