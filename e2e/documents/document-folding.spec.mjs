// Bug found 28 October 2026: the fold arrows beside document headings sat
// 16-24px below their headings, and clicking one did nothing, because the click
// was read against the line below. On iPad and desktop the arrows now line up
// with their headings and fold or unfold the section.
import { test, expect, onDevices, useApp } from "../fixtures.mjs";
import { openNewDocument } from "../helpers/documents.mjs";

const app = useApp(async (store) => ({ project: await store.createProject({ title: "Folding", key: "FD" }) }));
const body = "# First\n\nFirst section text.\n\n## Inner\n\nInner text with `code`.\n\n# Second\n\nSecond section text.\n";
// Opens a fresh document once its three heading arrows are drawn.
async function open(page) {
  await openNewDocument(page, app, app.project.id, { body });
  await page.waitForFunction(() => document.querySelectorAll(".document-codemirror .cm-foldGutter .cm-gutterElement span[title]").length >= 3);
}
const marker = (page, heading) => page.evaluate((heading) => {
  // A folded heading also shows the fold placeholder ("…") after its text.
  const line = [...document.querySelectorAll(".document-codemirror .cm-line")].find((l) => l.textContent.trim().replace(/…$/, "").trim() === heading);
  const lineBox = line.getBoundingClientRect();
  const markers = [...document.querySelectorAll(".document-codemirror .cm-foldGutter .cm-gutterElement")].filter((el) => el.querySelector("span[title]") && el.getClientRects().length && getComputedStyle(el).visibility !== "hidden");
  const row = markers.map((el) => ({ el, box: el.getBoundingClientRect() })).sort((a, b) => Math.abs((a.box.top + a.box.bottom) / 2 - (lineBox.top + lineBox.bottom) / 2) - Math.abs((b.box.top + b.box.bottom) / 2 - (lineBox.top + lineBox.bottom) / 2))[0];
  const box = row.box;
  return { lineTop: lineBox.top, lineBottom: lineBox.bottom, rowTop: box.top, rowBottom: box.bottom, x: box.left + box.width / 2, y: (box.top + box.bottom) / 2, title: row.el.querySelector("span[title]").title };
}, heading);
const content = (page) => page.locator(".document-codemirror .cm-content");

onDevices(["ipad", "desktop"], () => {
  test("each fold arrow lines up with its heading", async ({ page }) => {
    await open(page);
    for (const heading of ["First", "Inner", "Second"]) {
      // CodeMirror lines the gutter up with the text after measuring, so poll until it settles.
      await expect.poll(async () => {
        const m = await marker(page, heading);
        return Math.abs(m.rowTop - m.lineTop) <= 2 && m.y < m.lineBottom ? "aligned" : `arrow row ${m.rowTop}-${m.rowBottom} vs heading ${m.lineTop}-${m.lineBottom}`;
      }, heading).toBe("aligned");
    }
  });

  test("tapping or clicking an arrow folds and unfolds its section", async ({ page, device }) => {
    await open(page);
    const press = (m) => (device === "ipad" ? page.touchscreen.tap(m.x, m.y) : page.mouse.click(m.x, m.y));
    await press(await marker(page, "First"));
    await expect(page.locator(".document-codemirror .cm-foldPlaceholder"), "a fold placeholder shows").toHaveCount(1);
    await expect(content(page), "the section is hidden").not.toContainText(/First section text|Inner text/);
    await expect(content(page), "the next section stays").toContainText("Second section text");
    expect((await marker(page, "First")).title).toBe("Unfold line");
    await press(await marker(page, "First"));
    await expect(content(page), "unfolded again").toContainText("First section text");
  });
});
