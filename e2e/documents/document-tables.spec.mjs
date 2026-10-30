// Owner request, 30 October 2026 (tables research): Live preview edits a table's structure without
// Source. Table options, beside Add row and Add column, inserts, moves, aligns and deletes rows and
// columns at the cell you are in.
import { test, expect, onDevices, useApp } from "../fixtures.mjs";

const app = useApp(async (store) => ({ project: await store.createProject({ title: "Tables" }) }));
const lines = (...rows) => `${rows.join("\n")}\n`;
async function open(page, body = lines("| A | B |", "| --- | --- |", "| 1 | 2 |", "| 3 | 4 |")) {
  const record = await app.store.createDocument(app.project.id, { title: `Table ${Date.now()}-${Math.random()}`, body });
  await page.goto(`${app.base}/#project/${app.project.id}/documents/${record.id}`);
  await cell(page, "Row 1, column 1").waitFor();
  return async () => (await app.store.getDocument(app.project.id, record.id)).body;
}
const cell = (page, name) => page.getByRole("textbox", { name, exact: true });
const tableMenu = (page) => page.getByRole("dialog", { name: "Table", exact: true });
async function choose(page, at, item) {
  await cell(page, at).click();
  await page.getByRole("button", { name: "Table options", exact: true }).click();
  await tableMenu(page).getByRole("button", { name: item, exact: true }).click();
  await expect(tableMenu(page), "the menu closes after a choice").toBeHidden();
}

onDevices(["desktop", "phone"], () => test("Table options inserts, moves, aligns and deletes rows and columns at the cell you are in", async ({ page, device }) => {
  const saved = await open(page);
  await choose(page, "Row 1, column 1", "Insert row below");
  await expect.poll(saved, device).toBe(lines("| A | B |", "| --- | --- |", "| 1 | 2 |", "|  |  |", "| 3 | 4 |"));
  await choose(page, "Row 3, column 2", "Move row up");
  await expect.poll(saved, device).toBe(lines("| A | B |", "| --- | --- |", "| 1 | 2 |", "| 3 | 4 |", "|  |  |"));
  await choose(page, "Row 3, column 1", "Delete row");
  await expect.poll(saved, device).toBe(lines("| A | B |", "| --- | --- |", "| 1 | 2 |", "| 3 | 4 |"));
  await choose(page, "Row 1, column 2", "Insert column left");
  await expect.poll(saved, device).toBe(lines("| A |  | B |", "| --- | --- | --- |", "| 1 |  | 2 |", "| 3 |  | 4 |"));
  await choose(page, "Row 1, column 3", "Move column left");
  await expect.poll(saved, device).toBe(lines("| A | B |  |", "| --- | --- | --- |", "| 1 | 2 |  |", "| 3 | 4 |  |"));
  await choose(page, "Row 2, column 1", "Align centre");
  await expect.poll(saved, device).toBe(lines("| A | B |  |", "| :---: | --- | --- |", "| 1 | 2 |  |", "| 3 | 4 |  |"));
  await page.getByRole("button", { name: "Add row", exact: true }).click();
  await expect(cell(page, "Row 3, column 1"), "a new row follows its column's alignment").toHaveCSS("text-align", "center");
  await choose(page, "Row 1, column 3", "Delete column");
  await expect.poll(saved, device).toBe(lines("| A | B |", "| :---: | --- |", "| 1 | 2 |", "| 3 | 4 |", "|  |  |"));
  // The header stays first, and the first column can't move further left.
  await cell(page, "Header, column 1").click();
  await page.getByRole("button", { name: "Table options", exact: true }).click();
  for (const name of ["Insert row above", "Move row up", "Delete row", "Move column left"])
    await expect(tableMenu(page).getByRole("button", { name, exact: true }), name).toBeDisabled();
  await expect(tableMenu(page).getByRole("button", { name: "Align centre", exact: true })).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("Escape");
  await expect(tableMenu(page)).toBeHidden();
}));

// Spreadsheet keys: Enter moves down a row and adds one after the last (Shift+Enter breaks the line),
// Tab past the last cell adds a row, and the arrows cross into the next cell at a cell's edges.
// On phones the keyboard's return key moves down the same way.
onDevices(["desktop", "phone"], () => test("spreadsheet keys move between cells and add rows", async ({ page, device }) => {
  const saved = await open(page, lines("| A | B |", "| --- | --- |", "| 1 | 2 |"));
  await cell(page, "Header, column 1").click();
  await page.keyboard.press("Enter");
  await expect(cell(page, "Row 1, column 1"), device).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(cell(page, "Row 2, column 1"), `${device}: Enter on the last row adds one`).toBeFocused();
  await expect.poll(saved, device).toBe(lines("| A | B |", "| --- | --- |", "| 1 | 2 |", "|  |  |"));
  await page.keyboard.type("x");
  await page.keyboard.press("Shift+Enter");
  await page.keyboard.type("y");
  await expect.poll(saved, `${device}: Shift+Enter breaks the line`).toContain("| x<br>y |  |");
  await page.keyboard.press("ArrowRight");
  await expect(cell(page, "Row 2, column 2"), `${device}: right from the end of a cell`).toBeFocused();
  await page.keyboard.press("ArrowLeft");
  await expect(cell(page, "Row 2, column 1"), `${device}: left from the start of a cell`).toBeFocused();
  await page.keyboard.press("ArrowUp");
  await expect(cell(page, "Row 2, column 1"), `${device}: up within a two-line cell stays in it`).toBeFocused();
  await page.keyboard.press("ArrowUp");
  await expect(cell(page, "Row 1, column 1"), `${device}: up from the first line`).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(cell(page, "Row 2, column 1"), device).toBeFocused();
  await cell(page, "Row 2, column 2").click();
  await page.keyboard.press("Shift+Enter");
  await page.keyboard.type("z");
  await expect.poll(saved, `${device}: a line break at the start of a cell`).toContain("| x<br>y | <br>z |");
  await page.keyboard.press("Tab");
  await expect(cell(page, "Row 3, column 1"), `${device}: Tab past the last cell adds a row`).toBeFocused();
  await expect.poll(saved, device).toBe(lines("| A | B |", "| --- | --- |", "| 1 | 2 |", "| x<br>y | <br>z |", "|  |  |"));
}));

// Paste from spreadsheets: cells copied from Excel, Sheets or Numbers arrive as tab-separated text.
// In a cell they fill the cells from there, adding rows and columns; in the text they become a table.
const paste = (page, text) => page.evaluate(text => {
  const data = new DataTransfer(); data.setData("text/plain", text);
  document.activeElement.dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }));
}, text);

test("cells pasted from a spreadsheet fill the table from the cell you are in", async ({ page }) => {
  const saved = await open(page);
  await cell(page, "Row 2, column 2").click();
  await paste(page, "x\ty\tz\r\nu\tv\tw\r\n");
  await expect.poll(saved).toBe(lines("| A | B |  |  |", "| --- | --- | --- | --- |", "| 1 | 2 |  |  |", "| 3 | x | y | z |", "|  | u | v | w |"));
  await expect(cell(page, "Row 3, column 4"), "the last pasted cell has focus").toBeFocused();
  await page.keyboard.type("!");
  await expect.poll(saved, "typing continues after the pasted value").toContain("| u | v | w! |");
  await cell(page, "Row 1, column 1").click();
  await paste(page, "p\nq\r\n");
  await expect.poll(saved, "text without tabs stays in one cell, without a spreadsheet's final line break").toContain("| 1p<br>q | 2 |  |  |");
});

test("spreadsheet cells pasted into the text become a table", async ({ page }) => {
  const record = await app.store.createDocument(app.project.id, { title: `Paste ${Date.now()}`, body: "Intro\n" });
  await page.goto(`${app.base}/#project/${app.project.id}/documents/${record.id}`);
  await page.getByRole("textbox", { name: "Document content" }).click();
  await page.keyboard.press("Control+End");
  await paste(page, "Name\tQty\nApples\t3\n");
  await expect(cell(page, "Row 1, column 1")).toHaveText("Apples");
  await expect.poll(async () => (await app.store.getDocument(app.project.id, record.id)).body).toContain("Intro\n\n| Name | Qty |\n| --- | --- |\n| Apples | 3 |");
});
