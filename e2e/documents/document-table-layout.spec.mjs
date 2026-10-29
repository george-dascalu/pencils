// Owner request, 28 October 2026: choose per table whether it fits the page
// width or keeps its columns and scrolls sideways. The choice is saved in the
// Markdown as an HTML comment before the table ("<!-- table: scroll -->"), so it
// stays invisible in other Markdown apps.
import { test, expect, onDevices, useApp } from "../fixtures.mjs";
import { editorSource, openNewDocument } from "../helpers/documents.mjs";

const app = useApp(async (store) => ({ project: await store.createProject({ title: "Tables", key: "TL" }) }));
const table = "| Component | Example | Alignment | Description | Remarks |\n| :--- | :---: | ---: | --- | --- |\n| Plain text | Ready | 1 | Something longer here | Note |\n| Bold text | Done | 2 | Another description | Extra |";
const fitBody = `# Tables\n\n${table}\n\nAfter.\n`;
const scrollBody = `# Tables\n\n<!-- table: scroll -->\n${table}\n\nAfter.\n`;
const open = (page, body = fitBody) => openNewDocument(page, app, app.project.id, { body, waitFor: '.document-editable-component[data-component-type="table"] table' });
// How the live-preview table sits in its block.
const layout = (page, scope = ".document-codemirror") => page.evaluate((scope) => {
  const tableEl = document.querySelector(`${scope} table`);
  const box = tableEl.closest(".document-table-scroll") || tableEl.parentElement;
  const header = [...tableEl.rows[0].cells].map((cell) => ({ text: cell.textContent.trim(), lines: Math.round(cell.getBoundingClientRect().height / parseFloat(getComputedStyle(cell).lineHeight || "20")) }));
  return { scrolls: getComputedStyle(box).overflowX === "auto" && box.scrollWidth > box.clientWidth + 1, scrollClass: box.classList.contains("document-table-scroll"), tableWidth: tableEl.getBoundingClientRect().width, boxWidth: box.clientWidth, header };
}, scope);
const pressed = (page) => page.locator(".document-codemirror .document-table-layout button").evaluateAll((els) => els.map((el) => [el.textContent.trim(), el.getAttribute("aria-pressed")]));
const layoutButton = (page, name) => page.locator(".document-codemirror .document-table-layout button", { hasText: name });

onDevices(["desktop", "phone"], () => test("a table fits the page width by default, with a Fit/Scroll switch", async ({ page }) => {
  await open(page);
  expect(await pressed(page)).toEqual([["Fit width", "true"], ["Scroll", "false"]]);
  const l = await layout(page);
  expect(!l.scrolls && l.tableWidth <= l.boxWidth + 1, `fits ${JSON.stringify(l)}`).toBe(true);
}));

onDevices(["phone"], () => {
  test("choosing Scroll keeps whole words and scrolls sideways, and saves the choice", async ({ page }) => {
    await open(page);
    await layoutButton(page, "Scroll").tap();
    await expect(layoutButton(page, "Scroll")).toHaveAttribute("aria-pressed", "true");
    expect(await pressed(page)).toEqual([["Fit width", "false"], ["Scroll", "true"]]);
    await expect.poll(async () => (await layout(page)).scrolls, "scrolls sideways").toBe(true);
    const l = await layout(page);
    expect(l.scrollClass, JSON.stringify(l)).toBe(true);
    for (const cell of l.header) expect(cell.lines, `"${cell.text}" stays on one line ${JSON.stringify(l.header)}`).toBe(1);
    await expect.poll(() => editorSource(page), "the choice is saved before the table").toMatch(/\n<!-- table: scroll -->\n\| Component \|/);
    // The marker never shows as text in the document.
    expect(await page.locator(".document-codemirror").evaluate((el) => el.innerText.includes("table: scroll"))).toBe(false);
  });

  test("a saved Scroll table opens scrolling, and Fit width removes the marker", async ({ page }) => {
    await open(page, scrollBody);
    expect(await pressed(page)).toEqual([["Fit width", "false"], ["Scroll", "true"]]);
    await expect.poll(async () => (await layout(page)).scrolls).toBe(true);
    await layoutButton(page, "Fit width").tap();
    await expect.poll(() => editorSource(page)).not.toMatch(/table: scroll/);
    expect(await editorSource(page)).toMatch(/\n\n\| Component \|/);
    await expect.poll(async () => (await layout(page)).scrolls, "fits again").toBe(false);
  });

  test("reading mode keeps the table's layout", async ({ page }) => {
    await open(page, scrollBody);
    await page.locator('[data-document-mode="reading"]').first().evaluate((el) => el.click());
    await page.locator(".document-reading table").waitFor();
    const l = await layout(page, ".document-reading");
    expect(l.scrollClass && l.scrolls, JSON.stringify(l)).toBe(true);
    expect(await page.locator(".document-reading").evaluate((el) => el.innerText.includes("table: scroll"))).toBe(false);
  });
});

test("editing a cell of a Scroll table keeps the marker", async ({ page }) => {
  await open(page, scrollBody);
  await page.locator(".document-codemirror table td").first().click();
  await page.keyboard.press("End");
  await page.keyboard.type(" edited");
  await expect.poll(() => editorSource(page)).toMatch(/<!-- table: scroll -->\n\| Component \|[^\n]*\n[^\n]*\n\| Plain text edited \|/);
});
