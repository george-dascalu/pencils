// Owner request (F0.21-88, 3 November 2026): spreadsheets get a document's views. Live preview is the
// grid as before; Source shows what each cell holds (its formula or plain text) and edits it; Reading
// shows the values without editing, the formatting bar or the formula bar. The view is shared with
// Markdown documents and chosen the same way (Document tools, or the Documents tab's tray on touch).
import { test, expect, onDevices, useApp } from "../fixtures.mjs";
import { blankTable } from "../../public/document-sheet-model.js";
import { chooseDocumentView } from "../helpers/documents.mjs";

const app = useApp(async (store) => {
  const project = await store.createProject({ title: "Sheet views", key: "SV" });
  let table = await store.createDocument(project.id, { title: "Budget", document_type: "table" });
  const data = blankTable(table.id, "Budget"), sheet = data.workbook.sheets["sheet-1"];
  sheet.cellData = { 0: { 0: { v: "Item" }, 1: { v: "Cost" } }, 1: { 0: { v: "Design" }, 1: { v: 80 } }, 2: { 0: { v: "Total" }, 1: { f: "=B2*2" } } };
  table = await store.updateDocument(project.id, table.id, { revision: table.revision, table: data });
  return { project, table };
});
const cell = (page, name) => page.locator(`#document-form .document-sheet [data-sheet-cell="${name}"]`);
const saved = async (page) => (await (await page.request.get(`${app.base}/api/projects/${app.project.id}/documents/${app.table.id}`)).json()).table.workbook.sheets["sheet-1"].cellData;

onDevices(["desktop", "phone"], () => test("a spreadsheet has Live preview, Source and Reading views like a document's", async ({ page, device }) => {
  await page.goto(`${app.base}/#project/${app.project.id}/documents/${app.table.id}`);
  await expect(page.locator("#document-form .document-sheet")).toHaveAttribute("data-ready", "true");
  await expect(page.locator("#document-form")).toHaveAttribute("data-document-mode", "live");
  await expect(cell(page, "B3")).toHaveText("160");
  const tools = page.locator('#document-form [data-document-action="tools"]');
  await expect(tools).toHaveAttribute("aria-description", "Current view: Live preview");

  // Source: each cell's own content, still editable.
  await chooseDocumentView(page, "Source", { tap: device === "phone" });
  await expect(cell(page, "B3")).toHaveText("=B2*2");
  await expect(cell(page, "B2")).toHaveText("80");
  await expect(tools).toHaveAttribute("aria-description", "Current view: Source");
  await expect(page.locator("#document-formatting")).toBeVisible();
  await expect(page.locator("#document-form .sheet-formula-bar")).toBeVisible();

  // A cell being edited is kept when Reading starts.
  await cell(page, "A3").click();
  await page.keyboard.press("F2");
  await page.locator("#document-form [data-sheet-editor]").fill("Sum");
  // Reading: values, and nothing to edit them with.
  await chooseDocumentView(page, "Reading", { tap: device === "phone" });
  await expect(cell(page, "A3"), "the edit is kept").toHaveText("Sum");
  await expect.poll(async () => (await saved(page))[2][0].v).toBe("Sum");
  await expect(cell(page, "B3")).toHaveText("160");
  await expect(page.locator("#document-formatting")).toBeHidden();
  await expect(page.locator("#document-form .sheet-formula-bar")).toBeHidden();
  await expect(page.locator('#document-form [data-sheet-action="add-sheet"]')).toBeHidden();
  await cell(page, "A2").click();
  await cell(page, "A2").dblclick();
  await page.keyboard.press("x");
  await page.keyboard.press("Delete");
  await expect(page.locator("#document-form [data-sheet-editor]"), "no cell editor opens").toHaveCount(0);
  await expect(cell(page, "A2")).toHaveText("Design");
  const heading = page.locator('#document-form [data-sheet-axis="column"][data-axis-index="0"]');
  await expect(heading).toHaveAccessibleName("Select column A");
  await heading.click();
  await expect(page.getByRole("dialog", { name: /Column A/ }), "no column menu").toHaveCount(0);
  await expect(cell(page, "A3"), "the heading still selects its column").toHaveAttribute("aria-selected", "true");
  // Document tools offers nothing that changes the table.
  await page.locator('#document-form [data-document-action="tools"]').click();
  await expect(page.getByRole("dialog", { name: "Document tools" }).getByRole("button", { name: "Import CSV", exact: true })).toBeDisabled();
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);
  expect((await saved(page))[1][0].v, "nothing changed").toBe("Design");

  // Remembered, like a document's view; Live preview edits again.
  await page.reload();
  await expect(page.locator("#document-form")).toHaveAttribute("data-document-mode", "reading");
  await expect(cell(page, "B3")).toHaveText("160");
  await chooseDocumentView(page, "Live preview", { tap: device === "phone" });
  await expect(page.locator("#document-form .sheet-formula-bar")).toBeVisible();
  await cell(page, "A2").click();
  await page.keyboard.press("F2");
  await expect(page.locator("#document-form [data-sheet-editor]")).toHaveCount(1);
  await page.keyboard.press("Escape");
  // Ctrl/⌘ E switches Source and Live preview, as in a document (touch screens move the focus to the
  // Documents tab after a switch, as they do for a document).
  if (device === "phone") return;
  await page.keyboard.press("ControlOrMeta+e");
  await expect(page.locator("#document-form")).toHaveAttribute("data-document-mode", "source");
  await expect(cell(page, "B3")).toHaveText("=B2*2");
  await page.keyboard.press("ControlOrMeta+e");
  await expect(page.locator("#document-form")).toHaveAttribute("data-document-mode", "live");
}));
