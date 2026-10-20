import { clickControl } from "./menu-controls.mjs";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { chromium, firefox } from "playwright";
import { Store } from "../server/store.js";
import { createServer } from "../server/index.js";
const root = await fs.mkdtemp(path.join(os.tmpdir(), "pencils-note-style-"));
const store = new Store(root);
await store.init();
const project = await store.createProject({ title: "Note styles" });
let board = (await store.snapshot(project.id)).boards[0];
const styles = ["classic", "square", "rounded", "fold-top", "fold-bottom"];
board = await store.updateBoard(project.id, board.id, {
  revision: board.revision,
  nodes: styles.map((noteStyle, i) => ({
    id: `note-${i}`,
    type: "sticky",
    text: noteStyle + " note",
    x: 80 + (i % 3) * 280,
    y: 80 + Math.floor(i / 3) * 260,
    w: 240,
    h: 220,
    color: ["#f5e7a2", "#d6e4d3", "#aed7dc", "#d4bee5", "#f1a9a0"][i],
    noteStyle,
  })),
  edges: [],
});
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

const note = page.locator('[data-node="note-0"]');
async function choose(value) {
  const menu = page.locator('[data-selection-menu="geometry"]');
  if (!(await menu.evaluate((el) => el.open)))
    await menu.locator(":scope > summary").click();
  await page.locator(`[data-note-style="${value}"]`).click();
  await until(async () => (await nodes())[0].noteStyle === value);
}
try {
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  await page.locator(".project-link").click();
  await page.locator("[data-view=board]").click();
  await page.waitForTimeout(1800);
  await note.click();
  await choose("fold-top");
  await until(async () => (await nodes())[0].noteStyle === "fold-top");
  assert.equal(await note.locator(".note-style-art path").count(), 3);
  assert.equal((await nodes())[0].text, "classic note");
  assert.equal((await nodes())[0].color, "#f5e7a2");
  await page.locator('[data-action="board-undo"]').click();
  await until(async () => (await nodes())[0].noteStyle === "classic");
  assert.equal(await note.locator(".note-style-art").count(), 0);
  await page.locator('[data-action="board-redo"]').click();
  await until(async () => (await nodes())[0].noteStyle === "fold-top");
  for (const value of styles) {
    await choose(value);
    if (value === "classic")
      assert.equal(await note.locator(".note-style-art").count(), 0);
    else assert.equal(await note.locator(".note-style-art").count(), 1);
  }
  await page.locator('[data-selection-menu="geometry"] > summary').click();
  await page.screenshot({ path: "/tmp/pencils-note-styles.png" });
  await page.keyboard.press("Escape");
  await note.dblclick();
  await page
    .locator("#canvas-inline-form .inline-rich")
    .fill("Folded note content");
  await page.keyboard.press("Control+Enter");
  await until(async () =>
    (await nodes())[0].text.includes("Folded note content"),
  );
  assert.equal(await note.locator(".note-style-art").count(), 1);
  await note.click();
  await clickControl(page.locator('[data-object-style="copy"]'));
  await page.locator('[data-node="note-1"]').click();
  await clickControl(page.locator('[data-object-style="paste"]'));
  await until(async () => (await nodes())[1].noteStyle === "fold-bottom");
  await page.reload();
  await note.waitFor();
  assert.equal(await note.locator(".note-style-art path").count(), 3);
  const download = page.waitForEvent("download");
  await clickControl(page.locator('[data-feature="canvas-svg"]'));
  const svg = await fs.readFile(await (await download).path(), "utf8");
  assert.match(svg, /fill-opacity=".14"/);
  assert.match(svg, /<text[^>]+fill="#000000"/, "Exported note text keeps its readable foreground");
  // Unknown styles cannot be persisted through the backend.
  const saved = (await store.snapshot(project.id)).boards[0];
  await assert.rejects(
    store.updateBoard(project.id, saved.id, {
      revision: saved.revision,
      nodes: saved.nodes.map((n) => ({ ...n, noteStyle: "invalid" })),
      edges: saved.edges,
    }),
    /Invalid object geometry/,
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => window.PencilsAppearance.write({ theme: "dark" }));
  await page.waitForTimeout(500);
  // Find the note to bring the appearance menu into the mobile viewport.
  await page.locator('[data-pro="search-toggle"]').click();
  await page.locator("#canvas-find").fill("Folded note content");
  await page.locator('[data-pro="find-result"][data-id="note-0"]').click();
  await choose("fold-top");
  await until(async () => (await nodes())[0].noteStyle === "fold-top");
  const menu = page.locator('[data-selection-menu="geometry"]');
  if (!(await menu.evaluate((e) => e.open)))
    await menu.locator(":scope > summary").click();
  await page.waitForFunction(() => {
    const r = document
      .querySelector('[data-selection-menu="geometry"] > .selection-popover')
      .getBoundingClientRect();
    return r.x >= 0 && r.right <= innerWidth;
  });
  const bounds = await menu.locator(".selection-popover").boundingBox();
  assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= 391);
  await page.screenshot({ path: "/tmp/pencils-note-styles-mobile.png" });
  assert.deepEqual(errors, []);
  console.log(
    "PASS: five note styles, undo/redo, unchanged content/colour, editing, copy/paste formatting, reload, SVG export, validation and mobile dark palette.",
  );
} catch (error) {
  await page.screenshot({ path: "/tmp/pencils-note-styles-failure.png" });
  throw error;
} finally {
  await browser.close();
  server.closeAllConnections();
  await new Promise((r) => server.close(r));
  await fs.rm(root, { recursive: true, force: true });
}
