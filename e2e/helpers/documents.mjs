// Helpers for the document editor specs (e2e/documents). The editor is CodeMirror: blocks
// outside the viewport are not rendered, so scroll a position into view before checking it.
import AxeBuilder from "@axe-core/playwright";

// Creates a document in the project and opens it; `waitFor` is the selector that marks it ready.
export async function openNewDocument(page, app, projectId, { title, body = "", folder, waitFor = ".cm-content" } = {}) {
  const doc = await app.store.createDocument(projectId, { title: title || `Document ${Date.now()}-${Math.random()}`, body, ...(folder ? { folder } : {}) });
  await page.goto(`${app.base}/#project/${projectId}/documents/${doc.id}`);
  await page.locator(waitFor).first().waitFor();
  return doc;
}

// The Markdown in the open editor (CodeMirror's state, not the saved file).
export const editorSource = (page) => page.evaluate(async () => {
  const { EditorView } = await import("/vendor/editor/deps.js");
  return EditorView.findFromDOM(document.querySelector(".cm-editor")).state.doc.toString();
});

// Scrolls the editor so the line holding `text` is rendered.
export const scrollEditorTo = (page, text) => page.evaluate(async (text) => {
  const { EditorView } = await import("/vendor/editor/deps.js");
  const view = EditorView.findFromDOM(document.querySelector(".cm-editor"));
  view.scrollDOM.scrollTop = view.lineBlockAt(view.state.doc.toString().indexOf(text)).top;
}, text);

export const setTheme = (page, theme) => page.evaluate((theme) => window.PencilsAppearance.write({ theme }), theme);

// axe-core violations inside the given selectors, as { id, nodes } for readable failures.
// Pass `tags: null` to run every rule rather than the WCAG A/AA sets.
export async function axeViolations(page, selectors, tags = ["wcag2a", "wcag2aa", "wcag21aa"]) {
  let builder = new AxeBuilder({ page });
  for (const selector of [selectors].flat()) builder = builder.include(selector);
  if (tags) builder = builder.withTags(tags);
  const result = await builder.analyze();
  return result.violations.map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.target) }));
}

export const noHorizontalScroll = (page) => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);

// Since 0.19.31 the document bar has no title field: the open document's name shows in the
// top bar, and Document tools → Rename changes it.
export const documentName = (page) => page.locator('.topbar [role="heading"][aria-level="1"]');

// Renames the open document through Document tools → Rename (a new document opens this panel itself).
export async function renameDocument(page, name) {
  const panel = page.getByRole("dialog", { name: "Rename document", exact: true });
  if (!(await panel.isVisible())) {
    await page.locator('.document-heading [data-document-action="tools"]').click();
    await page.getByRole("dialog", { name: "Document tools", exact: true }).getByRole("button", { name: "Rename", exact: true }).click();
  }
  await panel.getByLabel("Document name", { exact: true }).fill(name);
  await panel.getByRole("button", { name: "Rename", exact: true }).click();
  await panel.waitFor({ state: "hidden" });
}
// Chooses a document's view (Live preview, Source or Reading). Phones use the Documents tab's
// tray above the bottom bar (owner request, 30 October 2026), after dismissing the keyboard,
// which hides the bar; other narrow editors use the Document view menu; wider ones the bar.
export async function chooseDocumentView(page, name, { tap = false } = {}) {
  const press = (locator) => (tap ? locator.tap() : locator.click());
  // The bottom bar (phones and touch screens) holds the views in the Documents tab's tray.
  if (await page.evaluate(() => matchMedia("(max-width: 600px), (pointer: coarse)").matches)) {
    await page.evaluate(() => document.activeElement?.blur());
    await press(page.locator('.tabs [data-view="documents"]'));
    await press(page.locator(".layout-tray").getByRole("button", { name, exact: true }));
  } else if (await page.locator("#document-form .document-mode-picker").isVisible()) {
    await press(page.locator("#document-form .document-mode-picker"));
    await press(page.getByRole("dialog", { name: "Document view", exact: true }).getByRole("button", { name, exact: true }));
  } else await press(page.locator("#document-form").getByRole("button", { name, exact: true }));
}
