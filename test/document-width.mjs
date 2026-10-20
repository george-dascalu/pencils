import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { chromium, webkit } from "playwright";
import { Store } from "../server/store.js";
import { createServer } from "../server/index.js";

const root = await fs.mkdtemp(path.join(os.tmpdir(), "pencils-document-width-"));
const store = new Store(root); await store.init();
const project = await store.createProject({ title: "Document layout" });
const body = "# A consistent page\n\nFirst paragraph with **bold**, _italic_ and `code`.\n\nSecond paragraph with escaped \\*asterisks\\* and \\[brackets\\].\n\n---\n\n## A section\n\nA paragraph underneath the section heading.\n\n### Smaller heading\n\nMore details.\n\n#### Small heading\n\nLast paragraph.";
const doc = await store.createDocument(project.id, { title: "Layout example", body });
const other = await store.createDocument(project.id, { title: "Another document", body: "# Another page\n\nNotes." });
const server = createServer(store, { productionAssets: process.env.PRODUCTION_ASSETS === "1" });
await new Promise(r => server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${server.address().port}/#project/${project.id}/documents/`;
const browserName = process.env.BROWSER || "chromium";
const browser = await ({ chromium, webkit }[browserName]).launch();
const page = await browser.newPage({ viewport: { width: 1800, height: 1100 } });
page.setDefaultTimeout(12000);
const errors = []; page.on("pageerror", e => errors.push(e.message));
const toggle = () => page.getByRole("button", { name: "Full width", exact: true });
const choose = name => page.getByRole("button", { name, exact: true }).click();
const dimensions = async mode => page.locator(mode === "Reading" ? ".document-page" : ".cm-content").evaluate(el => {
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
try {
  await page.goto(base + doc.id);
  await page.locator(".cm-content").waitFor();
  assert.equal(await toggle().getAttribute("aria-pressed"), "false");
  const metrics = {};
  for (const width of ["page", "full"]) {
    if (width === "full") {
      await toggle().focus(); await page.keyboard.press("Enter");
      assert.ok(await toggle().evaluate(el => el === document.activeElement));
    }
    metrics[width] = {};
    for (const mode of ["Live preview", "Source", "Reading"]) {
      await choose(mode);
      await page.waitForTimeout(100);
      metrics[width][mode] = await dimensions(mode);
      assert.equal(await page.locator("#document-form").getAttribute("data-document-width"), width);
      assert.equal((await store.getDocument(project.id, doc.id)).revision, doc.revision);
    }
    const live = metrics[width]["Live preview"], reading = metrics[width].Reading;
    assert.ok(Math.abs(live.width - reading.width) <= 2, JSON.stringify({ width, live, reading }));
    assert.ok(Math.abs(live.left - reading.left) <= 2, JSON.stringify({ width, live, reading }));
    assert.equal(live.headingFont, reading.headingFont);
    assert.equal(live.headingLine, reading.headingLine);
    await page.screenshot({ path: `/tmp/pencils-document-${width}-${browserName}.png` });
  }
  for (const mode of ["Live preview", "Source", "Reading"])
    assert.ok(metrics.full[mode].width > metrics.page[mode].width + 200);
  await page.reload(); await page.locator("#document-form").waitFor();
  assert.equal(await toggle().getAttribute("aria-pressed"), "true");
  await page.locator(`[data-document-open="${other.id}"]`).click();
  assert.equal(await page.locator("#document-form").getAttribute("data-document-width"), "full");
  await page.locator(`[data-document-open="${doc.id}"]`).click();
  await choose("Live preview");
  await page.locator(".document-block-preview hr").waitFor();
  const escaped = page.locator(".cm-line").filter({ hasText: "Second paragraph" });
  assert.equal((await escaped.textContent()).includes("\\"), false, "Escape backslashes are hidden away from the cursor");
  await escaped.click();
  assert.ok((await escaped.textContent()).includes("\\"), "Escapes remain editable in the active line");
  await choose("Source");
  assert.equal((await page.locator(".cm-content .cm-line").allTextContents()).join("\n"), body);
  for (const viewport of [1024, 390]) {
    await page.setViewportSize({ width: viewport, height: 1000 });
    for (const mode of ["Live preview", "Reading"]) {
      await choose(mode);
      for (const full of [false, true]) {
        if ((await toggle().getAttribute("aria-pressed") === "true") !== full) await toggle().click();
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
        const bounds = await toggle().boundingBox();
        assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= viewport);
      }
    }
    await page.evaluate(() => window.PencilsAppearance.write({ theme: "dark" }));
    await page.screenshot({ path: `/tmp/pencils-document-width-${viewport}-${browserName}.png` });
  }
  assert.equal((await store.getDocument(project.id, doc.id)).revision, doc.revision);
  assert.deepEqual(errors, []);
  console.log("PASS: page/full widths in all modes, matching live/reading columns and type, keyboard toggle, persisted preference across reload/documents, escaped punctuation, divider preview, unchanged Markdown and desktop/tablet/mobile layouts.");
} catch (error) {
  await page.screenshot({ path: `/tmp/pencils-document-width-failure-${browserName}.png` });
  throw error;
} finally {
  await browser.close(); server.closeAllConnections(); await new Promise(r => server.close(r));
  store.close(); await fs.rm(root, { recursive: true, force: true });
}
