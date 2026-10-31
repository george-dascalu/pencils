// Document controls: the view controls share the document bar with a formatting
// toolbar that holds only text controls, Insert groups its elements by category with
// icons, and Find (in Document tools) shows a compact search and replace panel on the right (with
// regular-expression errors announced). Formatting marks reveal only around the
// focused or hovered word. Phones keep the search panel inside the screen with
// 44px targets, and Reading mode keeps its own search.
import { test, expect, onDevices, useApp } from "../fixtures.mjs";
import { axeViolations, chooseDocumentView, documentTool, editorSource, noHorizontalScroll, openNewDocument, setTheme } from "../helpers/documents.mjs";

const app = useApp(async (store) => ({ project: await store.createProject({ title: "Document controls" }) }));
const body = "# Notebook\n\n- [ ] Switch to **Source** and find `inline code` with *emphasis*.\n\nAnother **bold** word.\n\n| One | Two |\n| --- | --- |\n| Alpha | Beta |\n";
// After the search-and-replace step the notebook reads "Live preview" instead of "Source".
const replaced = body.replace("**Source**", "**Live preview**");
const open = (page, text = body) => openNewDocument(page, app, app.project.id, { title: "Notebook", body: text });
const button = (page, name) => page.getByRole("button", { name, exact: true });
const click = (page, name) => button(page, name).click();
const find = (page) => page.locator(".cm-search input[name=search]");

test.describe("desktop", () => {
  test.use({ viewportSize: { width: 1500, height: 1000 } });

  // Since 0.19.31 the formatting toolbar and the document's controls share one bar (no
  // separate formatting row): formatting on the left, the view controls after it.
  test("view controls share one bar with a formatting toolbar of text controls", async ({ page }) => {
    await open(page);
    const positioning = await page.evaluate(() => {
      const box = (s) => document.querySelector(s).getBoundingClientRect().toJSON();
      return { format: box(".document-formatting"), views: box(".document-view-controls"), footer: box(".document-save"), tools: box(".document-heading [data-document-action=tools]") };
    });
    const middle = (r) => r.y + r.height / 2;
    expect(Math.abs(middle(positioning.views) - middle(positioning.format)), "Document controls share the formatting bar's row").toBeLessThan(8);
    expect(positioning.format.x + positioning.format.width, "Formatting comes before the document controls").toBeLessThanOrEqual(positioning.views.x + 1);
    await expect(page.locator(".document-heading .document-view-controls")).toHaveCount(1);
    await expect(page.locator(".document-heading > .document-formatting")).toHaveCount(1);
    await expect(page.locator("#document-form .document-controls"), "no separate formatting bar remains").toHaveCount(0);
    await expect(page.locator(".document-formatting [data-document-action]:not([data-document-action=insert])"), "The formatting toolbar contains only text controls").toHaveCount(0);
    expect(positioning.views.x, "⋯ comes after the view controls").toBeLessThan(positioning.tools.x);
    expect(positioning.footer.height <= 24 && positioning.footer.width < 250, JSON.stringify(positioning.footer)).toBe(true);
    await expect(page.locator(".document-save")).not.toHaveText(/Saved|Version/);
  });

  test("formatting marks reveal only around the focused or hovered word", async ({ page }) => {
    await open(page);
    // Use CodeMirror's actual selection and coordinates to test token-level reveal.
    await page.evaluate(async () => {
      const { EditorView } = await import("/vendor/editor/deps.js");
      const view = EditorView.findFromDOM(document.querySelector(".cm-editor"));
      view.focus(); view.dispatch({ selection: { anchor: view.state.doc.toString().indexOf("Source") + 2 } });
    });
    const line = page.locator(".cm-line").filter({ hasText: "Switch to" });
    await expect(line).toHaveText(/\*\*Source\*\*/);
    await expect(line).not.toHaveText(/\[ \]|`inline code`|\*emphasis\*/);
    await expect(line.locator("input[type=checkbox]")).toHaveCount(1);
    const point = await page.evaluate(async () => {
      const { EditorView } = await import("/vendor/editor/deps.js");
      const view = EditorView.findFromDOM(document.querySelector(".cm-editor"));
      const p = view.coordsAtPos(view.state.doc.toString().indexOf("emphasis") + 3);
      return { x: p.left + 1, y: (p.top + p.bottom) / 2 };
    });
    await page.mouse.move(point.x, point.y);
    await expect(line).toHaveText(/\*emphasis\*/);
    await expect(line).not.toHaveText(/\[ \]|`inline code`/);
  });

  test("Insert groups its elements by category, each with an icon", async ({ page }) => {
    await open(page);
    await click(page, "Insert");
    for (const label of ["Structure", "Formatting", "Components", "References & files"]) await expect(page.getByRole("region", { name: label, exact: true })).toHaveCount(1);
    await expect(page.locator(".document-insert-options button:not(:has(svg))")).toHaveCount(0);
    await page.keyboard.press("Escape");
  });

  test("Find opens a compact search and replace panel on the right", async ({ page }) => {
    await open(page);
    await documentTool(page, "Find in document");
    await find(page).fill("Source");
    await find(page).press("Enter");
    const bar = await page.locator(".cm-panels").boundingBox(), close = await page.locator(".cm-search button[name=close]").boundingBox();
    expect(bar.width <= 502 && bar.height < 50, `compact bar ${JSON.stringify(bar)}`).toBe(true);
    expect(close.width >= 30 && close.height >= 30, `close button ${JSON.stringify(close)}`).toBe(true);
    expect(bar.x, "Search should stay on the right").toBeGreaterThan(800);
    await button(page, "Show replace").focus();
    await page.keyboard.press("Enter");
    await page.getByRole("textbox", { name: "Replace with", exact: true }).fill("Live preview");
    await click(page, "Replace next");
    await expect(page.locator("textarea[name=body]")).toHaveValue(/\*\*Live preview\*\*/);
    await page.getByLabel("Search options", { exact: true }).click();
    await click(page, "Regular expression");
    await find(page).fill("[");
    await expect(find(page)).toHaveAttribute("aria-invalid", "true");
    await expect(page.locator(".cm-search [role=status]")).toHaveText(/Invalid/);
    await click(page, "Regular expression");
    await find(page).fill("preview");
    await page.getByLabel("Search options", { exact: true }).click();
    await click(page, "Hide replace");
    expect(await editorSource(page)).toBe(replaced);
  });

  test("the controls and search panel pass accessibility checks in both themes", async ({ page }) => {
    await open(page, replaced);
    for (const theme of ["light", "dark"]) {
      await setTheme(page, theme);
      await documentTool(page, "Find in document");
      await find(page).fill("preview");
      // Since 0.19.31 the document bar (.document-heading) also holds the formatting controls.
      expect(await axeViolations(page, [".document-heading", ".cm-search"]), theme).toEqual([]);
    }
  });

  test("Page versions opens from Document tools, and Find in Reading stays in Reading", async ({ page }) => {
    await open(page, replaced);
    await documentTool(page, "Find in document");
    await find(page).fill("preview");
    await click(page, "Close search");
    await documentTool(page, "Page versions");
    await page.getByRole("dialog", { name: "Page versions", exact: true }).waitFor();
    await page.keyboard.press("Escape");
    await chooseDocumentView(page, "Reading");
    await documentTool(page, "Find in document");
    await expect(page.getByRole("searchbox", { name: "Find in document", exact: true })).toBeVisible();
    await expect(page.locator("#document-form")).toHaveAttribute("data-document-mode", "reading");
  });
});

onDevices(["phone"], () => test("on phones search fits the screen with 44px targets, in Live preview and Reading", async ({ page }) => {
  await open(page, replaced);
  await documentTool(page, "Find in document", { tap: true });
  await find(page).fill("preview");
  expect(await noHorizontalScroll(page)).toBe(true);
  expect((await button(page, "Close search").boundingBox()).height).toBeGreaterThanOrEqual(44);
  expect(await page.locator(".cm-panels").evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
  await chooseDocumentView(page, "Reading", { tap: true });
  await documentTool(page, "Find in document", { tap: true });
  await page.getByRole("searchbox", { name: "Find in document", exact: true }).fill("preview");
  expect(await noHorizontalScroll(page)).toBe(true);
  await expect(page.locator("#document-form")).toHaveAttribute("data-document-mode", "reading");
}));
