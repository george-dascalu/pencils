// Documents read at page width or full width. The choice applies to Live
// preview, Source and Reading alike (with the same column and heading type in
// Live preview and Reading), is kept on this device across reloads and
// documents, and never touches the file. Phones keep the switch in Document
// tools. Live preview hides escaping backslashes away from the cursor and shows
// dividers.
import { test, expect, useApp } from "../fixtures.mjs";
import { noHorizontalScroll, setTheme } from "../helpers/documents.mjs";

const body = "# A consistent page\n\nFirst paragraph with **bold**, _italic_ and `code`.\n\nSecond paragraph with escaped \\*asterisks\\* and \\[brackets\\].\n\n---\n\n## A section\n\nA paragraph underneath the section heading.\n\n### Smaller heading\n\nMore details.\n\n#### Small heading\n\nLast paragraph.";
const app = useApp(async (store) => {
  const project = await store.createProject({ title: "Document layout" });
  const doc = await store.createDocument(project.id, { title: "Layout example", body });
  const other = await store.createDocument(project.id, { title: "Another document", body: "# Another page\n\nNotes." });
  return { project, doc, other };
});
test.use({ viewportSize: { width: 1800, height: 1100 } });
test.afterEach(async () => {
  expect((await app.store.getDocument(app.project.id, app.doc.id)).revision, "the width never changes the file").toBe(app.doc.revision);
});

const open = async (page) => {
  await page.goto(`${app.base}/#project/${app.project.id}/documents/${app.doc.id}`);
  await page.locator(".cm-content").waitFor();
};
const toggle = (page) => page.getByRole("button", { name: "Full width", exact: true });
const form = (page) => page.locator("#document-form");
const choose = async (page, name) => {
  await page.getByRole("button", { name, exact: true }).click();
  await expect(page.getByRole("button", { name, exact: true })).toHaveAttribute("aria-pressed", "true");
};
const dimensions = (page, mode) => page.locator(mode === "Reading" ? ".document-page" : ".cm-content").evaluate((el) => {
  const style = getComputedStyle(el), rect = el.getBoundingClientRect();
  const heading = el.querySelector("h1") || el.querySelector(".document-heading-1");
  const headingStyle = heading && getComputedStyle(heading);
  return {
    left: rect.left + parseFloat(style.paddingLeft),
    width: rect.width - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight),
    font: style.fontSize, line: style.lineHeight,
    headingFont: headingStyle?.fontSize, headingLine: headingStyle?.lineHeight,
  };
});

test("page and full width apply to every mode, with matching Live preview and Reading columns", async ({ page }) => {
  await open(page);
  await expect(toggle(page)).toHaveAttribute("aria-pressed", "false");
  const metrics = {};
  for (const width of ["page", "full"]) {
    if (width === "full") {
      await toggle(page).focus();
      await page.keyboard.press("Enter");
      await expect(toggle(page)).toBeFocused();
    }
    metrics[width] = {};
    for (const mode of ["Live preview", "Source", "Reading"]) {
      await choose(page, mode);
      await expect(form(page)).toHaveAttribute("data-document-width", width);
      await page.locator(mode === "Reading" ? ".document-page h1" : ".cm-content .cm-line").first().waitFor();
      metrics[width][mode] = await dimensions(page, mode);
    }
    const live = metrics[width]["Live preview"], reading = metrics[width].Reading;
    expect(Math.abs(live.width - reading.width), JSON.stringify({ width, live, reading })).toBeLessThanOrEqual(2);
    expect(Math.abs(live.left - reading.left), JSON.stringify({ width, live, reading })).toBeLessThanOrEqual(2);
    expect(live.headingFont).toBe(reading.headingFont);
    expect(live.headingLine).toBe(reading.headingLine);
  }
  for (const mode of ["Live preview", "Source", "Reading"])
    expect(metrics.full[mode].width, mode).toBeGreaterThan(metrics.page[mode].width + 200);
});

test("full width is remembered across reloads and other documents", async ({ page }) => {
  await open(page);
  await toggle(page).click();
  await expect(toggle(page)).toHaveAttribute("aria-pressed", "true");
  await page.reload();
  await form(page).waitFor();
  await expect(toggle(page)).toHaveAttribute("aria-pressed", "true");
  await page.locator(`[data-document-open="${app.other.id}"]`).click();
  await expect(page.getByLabel("Document title", { exact: true })).toHaveValue(app.other.title);
  await expect(form(page)).toHaveAttribute("data-document-width", "full");
});

test("Live preview hides escapes away from the cursor, shows dividers and keeps the source exact", async ({ page }) => {
  await open(page);
  await choose(page, "Live preview");
  await page.locator(".document-block-preview hr").waitFor();
  const escaped = page.locator(".cm-line").filter({ hasText: "Second paragraph" });
  expect((await escaped.textContent()).includes("\\"), "Escape backslashes are hidden away from the cursor").toBe(false);
  await page.evaluate(async () => {
    const { EditorView } = await import("/vendor/editor/deps.js");
    const view = EditorView.findFromDOM(document.querySelector(".cm-editor"));
    view.focus();
    view.dispatch({ selection: { anchor: view.state.doc.toString().indexOf("\\*") + 1 } });
  });
  await expect(escaped, "The selected escape remains editable").toContainText("\\");
  await choose(page, "Source");
  expect((await page.locator(".cm-content .cm-line").allTextContents()).join("\n")).toBe(body);
});

test("tablet and phone widths keep the width switch on screen", async ({ page }) => {
  await open(page);
  for (const viewport of [1024, 390]) {
    await page.setViewportSize({ width: viewport, height: 1000 });
    // Since 0.18.35 narrow editors (phones) switch views from the Document view
    // picker and keep the width switch in the Document tools menu.
    const narrow = viewport === 390;
    if (narrow) await expect(toggle(page)).toBeHidden();
    for (const mode of ["Live preview", "Reading"]) {
      if (narrow) {
        await page.locator('[data-document-action="mode-menu"]').click();
        await page.getByRole("dialog", { name: "Document view", exact: true }).getByRole("button", { name: mode, exact: true }).click();
      } else await choose(page, mode);
      for (const full of [false, true]) {
        if (narrow) {
          if (((await form(page).getAttribute("data-document-width")) === "full") !== full) {
            await page.getByRole("button", { name: "Document tools", exact: true }).click();
            const tools = page.getByRole("dialog", { name: "Document tools", exact: true });
            const item = tools.locator('[data-document-action="width"]');
            await item.click();
            await expect(form(page)).toHaveAttribute("data-document-width", full ? "full" : "page");
            await expect(item).toHaveAttribute("aria-pressed", String(full));
            const bounds = await tools.boundingBox();
            expect(bounds.x >= 0 && bounds.x + bounds.width <= viewport, `tools on screen ${JSON.stringify(bounds)}`).toBe(true);
            await page.keyboard.press("Escape");
            await tools.waitFor({ state: "hidden" });
          }
          expect(await noHorizontalScroll(page), `${viewport} ${mode} full=${full}`).toBe(true);
          continue;
        }
        if (((await toggle(page).getAttribute("aria-pressed")) === "true") !== full) await toggle(page).click();
        await expect(toggle(page)).toHaveAttribute("aria-pressed", String(full));
        expect(await noHorizontalScroll(page), `${viewport} ${mode} full=${full}`).toBe(true);
        const bounds = await toggle(page).boundingBox();
        expect(bounds.x >= 0 && bounds.x + bounds.width <= viewport, `switch on screen ${JSON.stringify(bounds)}`).toBe(true);
      }
    }
    await setTheme(page, "dark");
  }
});
