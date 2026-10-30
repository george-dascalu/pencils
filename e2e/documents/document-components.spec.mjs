// Inline document components: callouts, tables (rows, columns, undo), quotes,
// code and math are edited in place in Live preview and autosave as Markdown,
// without rewriting the rest of the file. Switching modes stays lossless, and the
// workspace passes accessibility checks on desktop and phone widths in both themes.
import { test, expect, useApp } from "../fixtures.mjs";
import { browserTabShortcuts } from "../helpers/browser-tab-shortcuts.mjs";
import { axeViolations, noHorizontalScroll, setTheme } from "../helpers/documents.mjs";

const body = [
  "# Notebook", "", "Keep **this paragraph** exactly as written.", "",
  "> [!note]+ Remember", "> A **formatted** callout with $x^2$. %%Private comment%%", "",
  "| Name | State |", "| :--- | ---: |", "| Editor | Ready |", "",
  "> An ordinary quote.", "",
  "```javascript", "const answer = 42;", "```", "",
  "$$", "x^2", "$$", "", "Untouched ending with [[Notebook|alias]].", "",
].join("\n");
const app = useApp(async (store) => ({ project: await store.createProject({ title: "Inline components" }) }));
test.use({ viewportSize: { width: 1440, height: 1050 } });

// Each test edits its own copy of the notebook.
async function open(page) {
  const record = await app.store.createDocument(app.project.id, { title: "Notebook", body });
  await page.goto(`${app.base}/#project/${app.project.id}/documents/${record.id}`);
  await page.getByRole("textbox", { name: "Callout content", exact: true }).waitFor();
  const saved = async () => (await app.store.getDocument(app.project.id, record.id)).body;
  return { record, saved };
}
const textbox = (page, name) => page.getByRole("textbox", { name, exact: true });
async function remainsLive(page, saved) {
  await expect(page.getByRole("button", { name: "Live preview", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".cm-line").filter({ hasText: "[!note]" })).toHaveCount(0);
  expect(await saved()).toMatch(/Keep \*\*this paragraph\*\* exactly as written\./);
  expect(await saved()).toMatch(/Untouched ending with \[\[Notebook\|alias\]\]\./);
}

test("rendering and saving an untouched component keeps the Markdown exactly", async ({ page }) => {
  const { saved } = await open(page);
  expect(await saved(), "Rendering components must not rewrite Markdown.").toBe(body);
  await textbox(page, "Callout content").click();
  await page.keyboard.press("Control+s");
  // Nothing should be written, so there is no change to wait for.
  await page.waitForTimeout(500);
  expect(await saved(), "Saving a focused but untouched component must preserve its exact Markdown.").toBe(body);
});

test("callout title and content edits autosave around formatting, math and comments", async ({ page }) => {
  const { saved } = await open(page);
  await textbox(page, "Callout title").fill("Updated heading");
  await expect.poll(saved).toContain("> [!note]+ Updated heading");
  expect(await saved()).toMatch(/> A \*\*formatted\*\* callout with \$x\^2\$\./);
  await textbox(page, "Callout content").click();
  await page.keyboard.press("End");
  await page.keyboard.type(" More text.");
  await expect.poll(saved).toContain("More text.");
  expect(await saved()).toMatch(/\$x\^2\$/);
  expect(await saved()).toMatch(/%%Private comment%%/);
  await remainsLive(page, saved);
});

test("table cells, undo, rows and columns save as Markdown", async ({ page }) => {
  const { saved } = await open(page);
  const cell = textbox(page, "Row 1, column 2");
  await browserTabShortcuts(cell);
  await cell.fill("In progress");
  await page.keyboard.type(" now");
  await expect.poll(saved).toContain("| Editor | In progress now |");
  expect(await saved()).toMatch(/\| :--- \| ---: \|/);
  await page.keyboard.press("Control+z");
  await expect.poll(saved).not.toContain("In progress now");
  await page.getByRole("button", { name: "Add row", exact: true }).click();
  await textbox(page, "Row 2, column 1").fill("Second row");
  await page.keyboard.press("Tab");
  await page.keyboard.type("Done");
  await expect.poll(saved).toContain("| Second row | Done |");
  await page.getByRole("button", { name: "Add column", exact: true }).click();
  await textbox(page, "Header, column 3").fill("Owner");
  await expect.poll(saved).toContain("| Name | State | Owner |");
});

// Tables research, 30 October 2026: a pipe inside a cell is escaped as `\|` (Obsidian link aliases
// and image sizes need it), and editing another cell used to save it unescaped, splitting the cell.
// `\\|` is an escaped backslash before the next cell. Both table layouts behave the same.
test("editing a table cell keeps escaped pipes and the other cells as written", async ({ page }) => {
  let saved;
  for (const layout of ["fit", "scroll"]) {
    const rows = ["| Name | Link | Note |", "| --- | --- | --- |", "| Editor | [[Notebook\\|alias]] | x |", "| Pipe | a \\| b | y |", "| Dir | C:\\\\| z |"];
    const body = `${layout === "scroll" ? "<!-- table: scroll -->\n" : ""}${rows.join("\n")}\n`;
    const record = await app.store.createDocument(app.project.id, { title: `Pipes ${layout}`, body });
    saved = async () => (await app.store.getDocument(app.project.id, record.id)).body;
    await page.goto(`${app.base}/#project/${app.project.id}/documents/${record.id}`);
    await textbox(page, "Row 1, column 1").fill("Writer");
    await expect.poll(saved, layout).toContain("| Writer | [[Notebook\\|alias]] | x |");
    expect(await saved(), layout).toContain("| Pipe | a \\| b | y |");
    expect(await saved(), layout).toContain("| Dir | C:\\\\ | z |");
    // Editing the link's own cell keeps the link.
    const link = textbox(page, "Row 1, column 2"), { width, height } = await link.boundingBox();
    await link.click({ position: { x: width - 4, y: height / 2 } }); // after the link, not on it
    await page.keyboard.type(" now");
    // The typed space may save as a no-break space.
    await expect.poll(saved, layout).toMatch(/\| Writer \| \[\[Notebook\\\|alias\]\]\s+now \| x \|/);
  }
  // A typed backslash before a pipe stays in its cell after a reload.
  await textbox(page, "Row 2, column 3").fill("q\\|r");
  await expect.poll(saved).toMatch(/q\\+\|r/);
  await page.reload();
  await expect(textbox(page, "Row 2, column 3")).toHaveText("q\\|r");
  await expect(textbox(page, "Row 2, column 4")).toHaveCount(0);
});

test("quote edits and toolbar formatting save, and search keeps Live preview", async ({ page }) => {
  const { saved } = await open(page);
  await textbox(page, "Quote content").fill("Edited in the quote.");
  await expect.poll(saved).toContain("> Edited in the quote.");
  await textbox(page, "Quote content").evaluate((node) => {
    node.focus();
    const text = document.createTreeWalker(node, NodeFilter.SHOW_TEXT).nextNode();
    const range = document.createRange(); range.setStart(text, 0); range.setEnd(text, 6);
    const selection = getSelection(); selection.removeAllRanges(); selection.addRange(range);
  });
  await page.getByRole("button", { name: "Bold", exact: true }).click();
  await expect.poll(saved).toContain("> **Edited** in the quote.");
  await textbox(page, "Quote content").click();
  await page.keyboard.press("Control+f");
  await page.locator(".cm-search").waitFor();
  await page.keyboard.press("Escape");
  await remainsLive(page, saved);
});

test("code and math blocks save, and switching modes stays lossless", async ({ page }) => {
  const { saved } = await open(page);
  await textbox(page, "Code block").fill("const answer = 43;");
  await expect.poll(saved).toContain("```javascript\nconst answer = 43;\n```");
  await textbox(page, "Math formula").fill("y^3");
  await expect.poll(saved).toContain("$$\ny^3\n$$");
  await remainsLive(page, saved);
  const current = await saved();
  for (const name of ["Source", "Reading", "Live preview"]) {
    await page.getByRole("button", { name, exact: true }).click();
    await expect(page.getByRole("button", { name, exact: true })).toHaveAttribute("aria-pressed", "true");
    expect(await saved(), "Switching modes remains lossless.").toBe(current);
  }
});

test("components stay accessible at desktop and phone widths in both themes", async ({ page }) => {
  const { saved } = await open(page);
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1050 });
    for (const theme of ["light", "dark"]) {
      await setTheme(page, theme);
      await textbox(page, "Callout title").fill(`Heading ${width} ${theme}`);
      await expect.poll(saved).toContain(`Heading ${width} ${theme}`);
      expect(await axeViolations(page, ".documents-workspace"), `${width} ${theme}`).toEqual([]);
      expect(await noHorizontalScroll(page), `${width} ${theme} fits`).toBe(true);
    }
  }
});
