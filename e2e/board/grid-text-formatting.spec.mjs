// Grid text formatting for whole rows and columns: font, size, alignment and emphasis apply
// to the selected cells only, mixed values show as blank, columns can be chosen from the
// keyboard, one undo restores mixed sizes, and formatting persists, validates and exports.
import { test, expect, useApp } from "../fixtures.mjs";
import { newGrid, syncGrid, gridSVG, validGrid } from "../../public/grid-model.js";
import { savedBoard, seedBoard, savesSettled } from "../helpers/board-canvas.mjs";

const app = useApp(async (store) => {
  const project = await store.createProject({ title: "Grid typography" });
  return { project };
});

test.use({ viewportSize: { width: 1600, height: 1100 } });

// A 3×3 grid; `formatRow2` starts the second row already formatted.
function gridNode(formatRow2 = false) {
  const grid = { id: "grid", type: "grid", x: 140, y: 180, w: 600, h: 360, grid: newGrid(3, 3) };
  grid.grid.cells.forEach((row, r) => row.forEach((cell, c) => (cell.text = `Cell ${r + 1}-${c + 1}`)));
  grid.grid.cells[1][0].fontSize = 18;
  if (formatRow2) for (const cell of grid.grid.cells[1]) Object.assign(cell, { fontFamily: "Lora", fontSize: 24, bold: true, italic: true, strike: true, align: "center", verticalAlign: "middle" });
  syncGrid(grid);
  return grid;
}

const current = async () => (await savedBoard(app.store, app.project.id)).nodes[0];
async function open(page, formatRow2) {
  await seedBoard(app.store, app.project.id, { nodes: [gridNode(formatRow2)], edges: [] });
  await page.goto(`${app.base}/#project/${app.project.id}/board`);
  await page.locator("[data-node=grid]").waitFor();
}
async function formatting(page) {
  const m = page.locator('[data-selection-menu="text-align"]');
  if ((await m.getAttribute("open")) === null) await m.locator("summary").click();
}
async function toggle(page, key) {
  await formatting(page);
  await page.locator(`[data-cell-text-toggle="${key}"]`).click();
}
async function selectRow2(page) {
  await page.locator("[data-node=grid] .grid-grip").click();
  await page.getByRole("button", { name: "Select row 2", exact: true }).click();
}

test("formatting a whole row applies font, size, alignment and emphasis to its cells only, and persists, validates and exports", async ({ page }) => {
  await open(page);
  await selectRow2(page);
  await expect(page.locator(".grid-cell.active-cell")).toHaveCount(3);
  await expect(page.locator(".grid-cell-address")).toHaveText("Row 2");
  await formatting(page);
  // The row has mixed sizes, so the size shows blank.
  await expect(page.getByLabel("Font size", { exact: true })).toHaveValue("");
  await page.getByLabel("Object font", { exact: true }).selectOption("Lora");
  await page.getByLabel("Font size", { exact: true }).selectOption("24");
  await page.getByRole("button", { name: "Align text middle", exact: true }).click();
  await toggle(page, "bold");
  await toggle(page, "italic");
  await toggle(page, "strike");
  await formatting(page);
  await page.locator("[data-text-align=center]").click();
  await expect
    .poll(async () => (await current()).grid.cells[1].every((c) => c.fontFamily === "Lora" && c.fontSize === 24 && c.bold && c.italic && c.strike && c.align === "center" && c.verticalAlign === "middle"))
    .toBe(true);
  let n = await current();
  expect(n.grid.cells[0][0].fontFamily).toBeUndefined();
  expect(n.grid.cells[2][0].bold).toBeUndefined();
  const text = page.locator('[data-grid-row="1"][data-grid-column="2"] .grid-cell-text');
  await expect(text).toHaveCSS("font-size", "24px");
  await expect(text).toHaveCSS("font-weight", "700");
  await expect(text).toHaveCSS("font-style", "italic");
  await expect(text).toHaveCSS("text-decoration-line", "line-through");

  await savesSettled(page);
  await page.reload();
  await page.locator("[data-node=grid]").waitFor();
  n = await current();
  expect(n.grid.cells[1].every((c) => c.bold && c.italic && c.strike && c.fontSize === 24)).toBe(true);
  expect(validGrid(n.grid)).toBe(true);
  const invalid = structuredClone(n.grid);
  invalid.cells[1][0].bold = "true";
  expect(validGrid(invalid)).toBe(false);
  const svg = gridSVG(n, (s) => s);
  expect(svg).toMatch(/font-weight="700"/);
  expect(svg).toMatch(/font-style="italic"/);
  expect(svg).toMatch(/text-decoration="line-through"/);
});

test("a column chosen from the keyboard takes a new size, and one undo restores the mixed sizes", async ({ page }) => {
  await open(page, true);
  await page.locator("[data-node=grid] .grid-grip").click();
  const axis = page.getByRole("button", { name: "Select column C", exact: true });
  await axis.focus();
  await axis.press("Enter");
  await expect(page.locator(".grid-cell-address")).toHaveText("Column C");
  await formatting(page);
  await page.getByLabel("Font size", { exact: true }).selectOption("32");
  await expect.poll(async () => (await current()).grid.cells.every((row) => row[2].fontSize === 32)).toBe(true);
  await page.getByRole("button", { name: "Undo canvas change", exact: true }).click();
  await expect.poll(async () => {
    const g = (await current()).grid;
    return g.cells[1][2].fontSize === 24 && !g.cells[0][2].fontSize;
  }).toBe(true);
});

test("the formatting menu has no auto-fit control and gives the font name more room than the size", async ({ page }) => {
  await open(page, true);
  await selectRow2(page);
  await formatting(page);
  await expect(page.locator('[data-text-style="autoFit"]')).toHaveCount(0);
  const family = await page.getByLabel("Object font", { exact: true }).boundingBox(), size = await page.getByLabel("Font size", { exact: true }).boundingBox();
  expect(family.width > size.width * 2 && size.width <= 56, "Formatting menu gives more width to the font name").toBe(true);
});
