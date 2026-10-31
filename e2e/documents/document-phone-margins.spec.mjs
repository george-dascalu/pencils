// Owner request, 28 October 2026: on phones, documents have no fold column
// and the same margin on both sides, in live preview and reading mode. Wider
// screens keep the fold arrows.
import { test, expect, onDevices, useApp } from "../fixtures.mjs";
import { chooseDocumentView } from "../helpers/documents.mjs";

const body = "# Heading\n\nA paragraph long enough to wrap across the whole width of a phone screen, so both of its edges show the margins.\n\n## Second\n\nMore text.\n";
const app = useApp(async (store) => {
  const project = await store.createProject({ title: "Margins", key: "MA" });
  return { project, doc: await store.createDocument(project.id, { title: "Margins", body }) };
});
const open = async (page) => {
  await page.goto(`${app.base}/#project/${app.project.id}/documents/${app.doc.id}`);
  await page.locator(".document-codemirror .cm-line", { hasText: "A paragraph" }).waitFor();
};
// Space between the text column and the edges of the document area.
const insets = (page, scope, text) => page.evaluate(([scope, text]) => {
  const area = document.querySelector(scope).getBoundingClientRect();
  const line = [...document.querySelectorAll(text)].find((el) => el.textContent.includes("A paragraph"));
  const range = document.createRange();
  range.selectNodeContents(line);
  const rects = [...range.getClientRects()];
  // The block's own box, not the wrapped text's ragged right edge.
  const box = line.getBoundingClientRect();
  return { left: Math.round(box.left - area.left), right: Math.round(area.right - box.right), lines: new Set(rects.map((r) => Math.round(r.top))).size };
}, [scope, text]);
const foldColumn = (page) => page.evaluate(() => {
  const gutter = document.querySelector(".document-codemirror .cm-gutters");
  const markers = [...document.querySelectorAll('.document-codemirror .cm-foldGutter span[title="Fold line"]')].filter((el) => el.getClientRects().length);
  return { width: gutter ? Math.round(gutter.getBoundingClientRect().width) : 0, markers: markers.length };
});

onDevices(["phone"], () => {
  test("live preview has no fold column and equal margins", async ({ page }) => {
    await open(page);
    expect(await foldColumn(page)).toEqual({ width: 0, markers: 0 });
    const i = await insets(page, ".document-codemirror", ".document-codemirror .cm-line");
    expect(i.lines, "the paragraph wraps").toBeGreaterThan(1);
    expect(i.left, `same margin on both sides ${JSON.stringify(i)}`).toBe(i.right);
    expect(i.left, `16px margins ${JSON.stringify(i)}`).toBe(16);
  });

  test("reading mode has the same equal margins", async ({ page }) => {
    await open(page);
    await chooseDocumentView(page, "Reading");
    await page.locator(".document-reading p").first().waitFor();
    const i = await insets(page, ".document-reading", ".document-reading p");
    expect(i.left, `same margin on both sides ${JSON.stringify(i)}`).toBe(i.right);
    expect(i.left, JSON.stringify(i)).toBe(16);
  });
});

onDevices(["phone", "desktop"], () => test("headings start at the same edge as paragraphs", async ({ page }) => {
  await open(page);
  const lefts = await page.evaluate(() => {
    // Left edge of the first visible letter, skipping any leading spaces.
    const textLeft = (line) => {
      const walker = document.createTreeWalker(line, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        const index = node.data.search(/\S/);
        if (index < 0) continue;
        const range = document.createRange();
        range.setStart(node, index); range.setEnd(node, index + 1);
        return Math.round(range.getBoundingClientRect().left);
      }
      return NaN;
    };
    const lines = [...document.querySelectorAll(".document-codemirror .cm-line")];
    return { heading: textLeft(lines.find((l) => l.textContent.includes("Heading"))), paragraph: textLeft(lines.find((l) => l.textContent.includes("A paragraph"))) };
  });
  expect(Math.abs(lefts.heading - lefts.paragraph), `no space before heading text ${JSON.stringify(lefts)}`).toBeLessThanOrEqual(1);
}));

onDevices(["ipad", "desktop"], () => test("wider screens keep the fold arrows", async ({ page }) => {
  await open(page);
  // The fold gutter fills in once CodeMirror has measured the headings.
  await page.waitForFunction(() => [...document.querySelectorAll('.document-codemirror .cm-foldGutter span[title="Fold line"]')].some((el) => el.getClientRects().length));
  const f = await foldColumn(page);
  expect(f.width >= 24 && f.markers >= 1, JSON.stringify(f)).toBe(true);
}));
