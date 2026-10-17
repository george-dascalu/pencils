import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { chromium, firefox } from "playwright";
import { Store } from "../server/store.js";
import { createServer } from "../server/index.js";
import { newGrid, syncGrid } from "../public/grid-model.js";
const root = await fs.mkdtemp(path.join(os.tmpdir(), "pencils-live-type-"));
const store = new Store(root);
await store.init();
const project = await store.createProject({ title: "Live typography" });
const task = await store.createTask(project.id, {
  title: "Task typography",
  body: "Task description",
});
const board = (await store.snapshot(project.id)).boards[0];
const grid = {
  id: "grid",
  type: "grid",
  x: 140,
  y: 200,
  w: 600,
  h: 360,
  grid: newGrid(2, 2),
};
grid.grid.cells[0][0].autoFit = true; // Legacy files keep the chosen font size too.
grid.grid.cells[0][0].text = "Draft\n\n- First item\n- Second item";
grid.grid.cells[0][1] = { text: "Neighbour", fontSize: 18, fontFamily: "Lora" };
syncGrid(grid);
const fixtures = [
  grid,
  ...["sticky", "text", "shape", "frame", "task"].map((type, i) => ({
    id: type,
    type,
    text: `Type ${type}`,
    ...(type === "task" ? { task: task.id } : {}),
    x: 900 + i * 400,
    y: 200,
    w: 320,
    h: 240,
  })),
];
await store.updateBoard(project.id, board.id, {
  revision: board.revision,
  nodes: fixtures,
  edges: [],
});
const server = createServer(store);
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const browser = await (
  process.env.BROWSER === "firefox" ? firefox : chromium
).launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1600, height: 1100 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const current = async () => (await store.snapshot(project.id)).boards[0];
const node = (id) => page.locator(`[data-node="${id}"]`);
const control = (key) =>
  page.locator(`.inline-floating-tools [data-text-style="${key}"]`);
const rich = () => page.locator(".inline-rich");
async function until(fn) {
  for (let i = 0; i < 100; i++) {
    if (await fn()) return;
    await page.waitForTimeout(60);
  }
  throw Error("Change did not settle");
}
async function find(id, text) {
  const search = page.locator("#canvas-find");
  if (!(await search.isVisible()))
    await page.locator('[data-pro="search-toggle"]').click();
  await search.fill(text);
  await page.locator(`[data-pro="find-result"][data-id="${id}"]`).click();
  await page.waitForTimeout(200);
}
async function styles(locator = rich()) {
  return locator.evaluate((el) => {
    const s = getComputedStyle(el);
    return {
      size: s.fontSize,
      font: s.fontFamily,
      line: s.lineHeight,
      align: s.justifyContent,
    };
  });
}
async function change(key, value, inputOnly = false) {
  const field =
    key === "verticalAlign"
      ? page.locator(
          `.inline-floating-tools [data-text-style="verticalAlign"][value="${value}"]`,
        )
      : control(key);
  await field.focus();
  if (key === "verticalAlign") await field.click();
  else if (inputOnly)
    await field.evaluate((el, value) => {
      el.value = value;
      el.dispatchEvent(new Event("input", { bubbles: true }));
    }, value);
  else if (typeof value === "boolean") await field.setChecked(value);
  else await field.selectOption(value);
  assert.equal(
    await page.locator(".board-node.inline-editing").count(),
    1,
    "Editor stays open",
  );
  assert.equal(
    await field.evaluate((el) => el === document.activeElement),
    true,
    "Toolbar keeps focus",
  );
}
try {
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  await page.locator(".project-link").click();
  await page.locator("[data-view=board]").click();
  await find("grid", "Draft");
  await node("grid")
    .locator('[data-grid-row="0"][data-grid-column="0"]')
    .dblclick();
  await rich().evaluate((el) => {
    el.dataset.testEditor = "same";
    const r = document.createRange();
    r.selectNodeContents(el);
    const s = getSelection();
    s.removeAllRanges();
    s.addRange(r);
  });
  const selectedText = await page.evaluate(() => getSelection().toString());
  await change("fontSize", "28", true);
  assert.equal(
    (await styles()).size,
    "28px",
    "Input updates visible cell before change/blur",
  );
  assert.equal(
    (await styles()).line,
    "42px",
    "Line height scales with the font",
  );
  await change("fontFamily", "Work Sans");
  assert.match((await styles()).font, /Work Sans/);
  assert.equal(
    await rich().getAttribute("data-test-editor"),
    "same",
    "Typing surface is preserved",
  );
  assert.equal(
    await page.evaluate(() => getSelection().toString()),
    selectedText,
    "Text selection survives styling",
  );
  const sibling = node("grid").locator(
    '[data-grid-row="0"][data-grid-column="1"] .grid-cell-text',
  );
  assert.equal((await styles(sibling)).size, "18px");
  assert.match((await styles(sibling)).font, /^"?Lora"?$/);
  await change("verticalAlign", "bottom");
  assert.equal((await styles()).align, "flex-end");
  await change("verticalAlign", "top");
  await change("fontSize", "96");
  assert.equal(await page.locator('[data-text-style="autoFit"]').count(), 0);
  assert.equal((await styles()).size, "96px", "Text keeps the chosen size even in a small object");
  await change("fontSize", "28");
  await page.locator('[data-pro="inline-preview"]').click();
  assert.equal((await styles(page.locator(".inline-preview"))).size, "28px");
  await change("fontSize", "24");
  assert.equal(
    (await styles(page.locator(".inline-preview"))).size,
    "24px",
    "Preview shares current typography",
  );
  await page.locator('[data-pro="inline-preview"]').click();
  assert.equal((await styles()).size, "24px");
  await rich().fill("Unsaved draft survives styling");
  const draft = await rich().textContent();
  await change("fontSize", "28");
  assert.equal(await rich().textContent(), draft);
  // Keyboard selection in the shared dropdown must not be intercepted by toolbar navigation.
  await control("fontSize").focus();
  await page.keyboard.press("ArrowDown");
  await page.locator("#shared-select-menu").waitFor();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  assert.equal(await control("fontSize").inputValue(), "32");
  assert.equal((await styles()).size, "32px");
  await rich().focus();
  await page.keyboard.press("Escape");
  await until(
    async () =>
      (await current()).nodes
        .find((n) => n.id === "grid")
        .grid.cells[0][0].text.trim() === "Unsaved draft survives styling",
  );
  await page.reload();
  await find("grid", "Unsaved draft");
  assert.equal(
    (await current()).nodes.find((n) => n.id === "grid").grid.cells[0][0]
      .fontSize,
    32,
  );
  assert.equal(
    await node("grid")
      .locator('[data-grid-row="0"][data-grid-column="0"] .grid-cell-text')
      .evaluate((el) => getComputedStyle(el).fontSize),
    "32px",
  );
  for (const id of ["sticky", "text", "shape", "frame", "task"]) {
    await find(id, id === "task" ? "Task typography" : `Type ${id}`);
    const target = id === "frame" ? node(id).locator(".frame-title") : node(id);
    await target.dblclick();
    await change("fontSize", "28");
    await change("fontFamily", "Work Sans");
    assert.equal((await styles()).size, "28px", `${id} updates immediately`);
    assert.match((await styles()).font, /Work Sans/);
    await page.keyboard.press("Escape");
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => (document.documentElement.dataset.theme = "dark"));
  await find("grid", "Unsaved draft");
  await node("grid")
    .locator('[data-grid-row="0"][data-grid-column="0"]')
    .dblclick();
  await change("fontSize", "20");
  assert.equal((await styles()).size, "20px");
  const family = await control("fontFamily").boundingBox(), size = await control("fontSize").boundingBox();
  assert.ok(family.width > size.width * 2 && size.width <= 56, "Font name has more room than the compact size control");
  await page.screenshot({ path: "/tmp/pencils-live-typography-mobile.png" });
  await page.keyboard.press("Escape");
  assert.deepEqual(errors, []);
  console.log(
    "PASS: live font family/size, keyboard controls, line spacing, vertical alignment, fixed font size, preview, preserved draft/selection, grid neighbours, reload and mobile/dark across board components.",
  );
} catch (e) {
  await page.screenshot({ path: "/tmp/pencils-live-typography-failure.png" });
  throw e;
} finally {
  await browser.close();
  server.closeAllConnections();
  await new Promise((r) => server.close(r));
  await fs.rm(root, { recursive: true, force: true });
}
