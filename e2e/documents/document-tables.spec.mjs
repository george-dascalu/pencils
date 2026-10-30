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
