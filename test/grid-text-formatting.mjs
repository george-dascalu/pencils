import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { chromium, firefox } from "playwright";
import { Store } from "../server/store.js";
import { createServer } from "../server/index.js";
import { newGrid, syncGrid, gridSVG, validGrid } from "../public/grid-model.js";
const root = await fs.mkdtemp(path.join(os.tmpdir(), "pencils-grid-text-"));
const store = new Store(root);
await store.init();
const project = await store.createProject({ title: "Grid typography" });
let board = (await store.snapshot(project.id)).boards[0];
const grid = {
  id: "grid",
  type: "grid",
  x: 140,
  y: 180,
  w: 600,
  h: 360,
  grid: newGrid(3, 3),
};
grid.grid.cells.forEach((row, r) =>
  row.forEach((cell, c) => (cell.text = `Cell ${r + 1}-${c + 1}`)),
);
grid.grid.cells[1][0].fontSize = 18;
syncGrid(grid);
board = await store.updateBoard(project.id, board.id, {
  revision: board.revision,
  nodes: [grid],
  edges: [],
});
const server = createServer(store);
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const browser = await (
  process.env.BROWSER === "firefox" ? firefox : chromium
).launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1600, height: 1100 } }),
  errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const current = async () =>
  (await store.snapshot(project.id)).boards[0].nodes[0];
async function until(fn) {
  for (let i = 0; i < 100; i++) {
    if (await fn()) return;
    await page.waitForTimeout(60);
  }
  throw Error("Formatting not saved");
}
async function formatting() {
  const m = page.locator('[data-selection-menu="text-align"]');
  if ((await m.getAttribute("open")) === null)
    await m.locator("summary").click();
}
async function toggle(key) {
  await formatting();
  await page.locator(`[data-cell-text-toggle="${key}"]`).click();
}
try {
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  await page.locator(".project-link").click();
  await page.locator("[data-view=board]").click();
  await page.locator("[data-node=grid] .grid-grip").click();
  await page.getByRole("button", { name: "Select row 2", exact: true }).click();
  assert.equal(await page.locator(".grid-cell.active-cell").count(), 3);
  assert.equal(await page.locator(".grid-cell-address").textContent(), "Row 2");
  await formatting();
  assert.equal(
    await page.getByLabel("Font size", { exact: true }).inputValue(),
    "",
  );
  await page.getByLabel("Object font", { exact: true }).selectOption("Lora");
  await page.getByLabel("Font size", { exact: true }).selectOption("24");
  await page
    .getByRole("button", { name: "Align text middle", exact: true })
    .click();
  await toggle("bold");
  await toggle("italic");
  await toggle("strike");
  await formatting();
  await page.locator("[data-text-align=center]").click();
  await until(async () => {
    const g = (await current()).grid;
    return g.cells[1].every(
      (c) =>
        c.fontFamily === "Lora" &&
        c.fontSize === 24 &&
        c.bold &&
        c.italic &&
        c.strike &&
        c.align === "center" &&
        c.verticalAlign === "middle",
    );
  });
  let n = await current();
  assert.equal(n.grid.cells[0][0].fontFamily, undefined);
  assert.equal(n.grid.cells[2][0].bold, undefined);
  const text = page.locator(
    '[data-grid-row="1"][data-grid-column="2"] .grid-cell-text',
  );
  const style = await text.evaluate((el) => {
    const s = getComputedStyle(el);
    return {
      size: s.fontSize,
      weight: s.fontWeight,
      style: s.fontStyle,
      decoration: s.textDecorationLine,
    };
  });
  assert.deepEqual(style, {
    size: "24px",
    weight: "700",
    style: "italic",
    decoration: "line-through",
  });
  const axis = page.getByRole("button", {
    name: "Select column C",
    exact: true,
  });
  await axis.focus();
  await axis.press("Enter");
  assert.equal(
    await page.locator(".grid-cell-address").textContent(),
    "Column C",
  );
  await formatting();
  await page.getByLabel("Font size", { exact: true }).selectOption("32");
  await until(async () =>
    (await current()).grid.cells.every((row) => row[2].fontSize === 32),
  );
  await page
    .getByRole("button", { name: "Undo canvas change", exact: true })
    .click();
  await until(async () => {
    const g = (await current()).grid;
    return g.cells[1][2].fontSize === 24 && !g.cells[0][2].fontSize;
  });
  await page.reload();
  await page.locator("[data-node=grid]").waitFor();
  n = await current();
  assert.ok(
    n.grid.cells[1].every(
      (c) => c.bold && c.italic && c.strike && c.fontSize === 24,
    ),
  );
  assert.ok(validGrid(n.grid));
  const invalid = structuredClone(n.grid);
  invalid.cells[1][0].bold = "true";
  assert.equal(validGrid(invalid), false);
  const svg = gridSVG(n, (s) => s);
  assert.match(svg, /font-weight="700"/);
  assert.match(svg, /font-style="italic"/);
  assert.match(svg, /text-decoration="line-through"/);
  await page.locator("[data-node=grid] .grid-grip").click();
  await page.getByRole("button", { name: "Select row 2", exact: true }).click();
  await formatting();
  assert.equal(await page.locator('[data-text-style="autoFit"]').count(), 0);
  const family = await page.getByLabel("Object font", { exact: true }).boundingBox(), size = await page.getByLabel("Font size", { exact: true }).boundingBox();
  assert.ok(family.width > size.width * 2 && size.width <= 56, "Formatting menu gives more width to the font name");
  await page.screenshot({ path: "/tmp/pencils-grid-formatting.png" });
  assert.deepEqual(errors, []);
  console.log(
    "PASS: full row/column formatting, mixed values, emphasis, keyboard selection, neighbouring cells, undo, reload and export.",
  );
} catch (e) {
  await page.screenshot({ path: "/tmp/pencils-grid-formatting-failure.png" });
  throw e;
} finally {
  await browser.close();
  server.closeAllConnections();
  await new Promise((r) => server.close(r));
  await fs.rm(root, { recursive: true, force: true });
}
