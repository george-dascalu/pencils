import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { chromium, webkit } from "playwright";
import AxeBuilder from "@axe-core/playwright";
import { Store } from "../server/store.js";
import { createServer } from "../server/index.js";
import { browserTabShortcuts } from './browser-tab-shortcuts.mjs';

const root = await fs.mkdtemp(path.join(os.tmpdir(), "pencils-inline-components-"));
const store = new Store(root); await store.init();
const project = await store.createProject({ title: "Inline components" });
const body = [
  "# Notebook", "", "Keep **this paragraph** exactly as written.", "",
  "> [!note]+ Remember", "> A **formatted** callout with $x^2$. %%Private comment%%", "",
  "| Name | State |", "| :--- | ---: |", "| Editor | Ready |", "",
  "> An ordinary quote.", "",
  "```javascript", "const answer = 42;", "```", "",
  "$$", "x^2", "$$", "", "Untouched ending with [[Notebook|alias]].", "",
].join("\n");
const record = await store.createDocument(project.id, { title: "Notebook", body });
const server = createServer(store, { productionAssets: process.env.PRODUCTION_ASSETS === "1" });
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const browser = await ({ chromium, webkit }[process.env.BROWSER || "chromium"]).launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 1050 } });
const page = await context.newPage(), errors = [];
page.on("pageerror", error => { errors.push(error.message); console.error(error.stack); });
const current = () => store.getDocument(project.id, record.id);
async function until(fn) {
  for (let i = 0; i < 150; i++) { if (await fn()) return; await page.waitForTimeout(50); }
  throw new Error("Timed out waiting for component autosave.");
}
async function remainsLive() {
  assert.equal(await page.getByRole("button", { name: "Live preview", exact: true }).getAttribute("aria-pressed"), "true");
  assert.equal(await page.locator(".cm-line").filter({ hasText: "[!note]" }).count(), 0);
  assert.match((await current()).body, /Keep \*\*this paragraph\*\* exactly as written\./);
  assert.match((await current()).body, /Untouched ending with \[\[Notebook\|alias\]\]\./);
}
try {
  await page.goto(`http://127.0.0.1:${server.address().port}/#project/${project.id}/documents/${record.id}`);
  await page.getByRole("textbox", { name: "Callout content", exact: true }).waitFor();
  assert.equal((await current()).body, body, "Rendering components must not rewrite Markdown.");
  await page.getByRole("textbox", { name: "Callout content", exact: true }).click();
  await page.keyboard.press("Control+s");
  await page.waitForTimeout(500);
  assert.equal((await current()).body, body, "Saving a focused but untouched component must preserve its exact Markdown.");
  const title = page.getByRole("textbox", { name: "Callout title", exact: true });
  await title.fill("Updated heading");
  await until(async () => (await current()).body.includes("> [!note]+ Updated heading"));
  assert.match((await current()).body, /> A \*\*formatted\*\* callout with \$x\^2\$\./);
  const content = page.getByRole("textbox", { name: "Callout content", exact: true });
  await content.click();
  await page.keyboard.press("End");
  await page.keyboard.type(" More text.");
  await until(async () => (await current()).body.includes("More text."));
  assert.match((await current()).body, /\$x\^2\$/);
  assert.match((await current()).body, /%%Private comment%%/);
  await remainsLive();
  const cell = page.getByRole("textbox", { name: "Row 1, column 2", exact: true });
  await browserTabShortcuts(cell);
  await cell.fill("In progress");
  await page.keyboard.type(" now");
  await until(async () => (await current()).body.includes("| Editor | In progress now |"));
  assert.match((await current()).body, /\| :--- \| ---: \|/);
  await page.keyboard.press("Control+z");
  await until(async () => !(await current()).body.includes("In progress now"));
  await page.getByRole("button", { name: "Add row", exact: true }).click();
  await page.getByRole("textbox", { name: "Row 2, column 1", exact: true }).fill("Second row");
  await page.keyboard.press("Tab");
  await page.keyboard.type("Done");
  await until(async () => (await current()).body.includes("| Second row | Done |"));
  await page.getByRole("button", { name: "Add column", exact: true }).click();
  await page.getByRole("textbox", { name: "Header, column 3", exact: true }).fill("Owner");
  await until(async () => (await current()).body.includes("| Name | State | Owner |"));
  await page.getByRole("textbox", { name: "Quote content", exact: true }).fill("Edited in the quote.");
  await until(async () => (await current()).body.includes("> Edited in the quote."));
  await page.getByRole("textbox", { name: "Quote content", exact: true }).evaluate(node => {
    node.focus();
    const text = document.createTreeWalker(node, NodeFilter.SHOW_TEXT).nextNode();
    const range = document.createRange(); range.setStart(text, 0); range.setEnd(text, 6);
    const selection = getSelection(); selection.removeAllRanges(); selection.addRange(range);
  });
  await page.getByRole("button", { name: "Bold", exact: true }).click();
  await until(async () => (await current()).body.includes("> **Edited** in the quote."));
  await page.getByRole("textbox", { name: "Quote content", exact: true }).click();
  await page.keyboard.press("Control+f");
  await page.locator(".cm-search").waitFor();
  await page.keyboard.press("Escape");
  await remainsLive();
  await page.getByRole("textbox", { name: "Code block", exact: true }).fill("const answer = 43;");
  await until(async () => (await current()).body.includes("```javascript\nconst answer = 43;\n```"));
  await page.getByRole("textbox", { name: "Math formula", exact: true }).fill("y^3");
  await until(async () => (await current()).body.includes("$$\ny^3\n$$"));
  await remainsLive();
  const saved = (await current()).body;
  for (const name of ["Source", "Reading", "Live preview"]) {
    await page.getByRole("button", { name, exact: true }).click();
    assert.equal((await current()).body, saved, "Switching modes remains lossless.");
  }
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1050 });
    for (const theme of ["light", "dark"]) {
      await page.evaluate(theme => window.PencilsAppearance.write({ theme }), theme);
      await page.getByRole("textbox", { name: "Callout title", exact: true }).fill(`Heading ${width} ${theme}`);
      await until(async () => (await current()).body.includes(`Heading ${width} ${theme}`));
      const axe = await new AxeBuilder({ page }).include(".documents-workspace").withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
      assert.deepEqual(axe.violations.map(v => ({ id: v.id, nodes: v.nodes.map(n => n.target) })), []);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      await page.screenshot({ path: `/tmp/pencils-components-${width}-${theme}-${process.env.BROWSER || "chromium"}.png` });
    }
  }
  assert.deepEqual(errors, []);
  console.log("PASS: inline callouts, tables, rows/columns, quotes, code, math, undo, autosave, lossless modes, desktop/mobile themes and accessibility.");
} catch (error) {
  await page.screenshot({ path: "/tmp/pencils-components-failure.png" });
  console.error("Saved Markdown:", (await current()).body);
  throw error;
} finally {
  await browser.close(); server.closeAllConnections();
  await new Promise(resolve => server.close(resolve)); await fs.rm(root, { recursive: true, force: true });
}
