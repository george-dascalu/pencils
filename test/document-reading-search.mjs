import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { chromium, webkit } from "playwright";
import AxeBuilder from "@axe-core/playwright";
import { Store } from "../server/store.js";
import { createServer } from "../server/index.js";

const root = await fs.mkdtemp(path.join(os.tmpdir(), "pencils-reading-search-"));
const store = new Store(root); await store.init();
const project = await store.createProject({ title: "Reading search" });
const linked = await store.createDocument(project.id, { title: "Linked note", body: "# Another document" });
const body = [
  "# Finding your notes", "", "A **formatted** phrase.", "", "ALPHA and alpha.", "", "alpha", "", "Beta", "",
  "Literal `a+b [test]` and CAFÉ.", "", "> [!note]- A folded note", "> Hidden discovery.", "",
  `[[${linked.file.replace(/\.md$/, "")}|Linked note]]`, "",
  ...Array.from({ length: 30 }, (_, i) => `Paragraph ${i + 1} with ordinary text.\n`),
  "A distant discovery.",
].join("\n");
const doc = await store.createDocument(project.id, { title: "Finding your notes", body });
const server = createServer(store, { productionAssets: process.env.PRODUCTION_ASSETS === "1" });
await new Promise(r => server.listen(0, "127.0.0.1", r));
const url = `http://127.0.0.1:${server.address().port}/#project/${project.id}/documents/${doc.id}`;
const browserName = process.env.BROWSER || "chromium";
const browser = await ({ chromium, webkit }[browserName]).launch();
const context = await browser.newContext({ viewport: { width: 1500, height: 1000 } });
const page = await context.newPage();
page.setDefaultTimeout(12000);
const errors = []; page.on("pageerror", e => errors.push(e.message));
const choose = name => page.getByRole("button", { name, exact: true }).click();
const input = page.getByRole("searchbox", { name: "Find in document", exact: true });
const bar = page.getByRole("search", { name: "Search document", exact: true });
const count = bar.getByRole("status");
const reading = page.locator(".document-reading");
const isReading = async () => {
  assert.equal(await page.getByRole("button", { name: "Reading", exact: true }).getAttribute("aria-pressed"), "true");
  assert.equal(await page.locator(".document-codemirror").isVisible(), false);
};
try {
  await page.goto(url); await page.locator(".cm-content").waitFor();
  await choose("Reading");
  const originalText = await reading.textContent();
  await choose("Find in document");
  await input.waitFor();
  await isReading();
  assert.ok(await input.evaluate(el => el === document.activeElement));
  await input.fill("alpha");
  assert.equal(await count.textContent(), "1 of 3");
  assert.equal(await reading.locator(".document-find-match").count(), 3);
  await bar.getByRole("button", { name: "Next match", exact: true }).click();
  assert.equal(await count.textContent(), "2 of 3");
  await input.press("Enter");
  assert.equal(await count.textContent(), "3 of 3");
  await input.press("Enter");
  assert.equal(await count.textContent(), "1 of 3");
  await input.press("Shift+Enter");
  assert.equal(await count.textContent(), "3 of 3");
  await bar.getByRole("button", { name: "Previous match", exact: true }).click();
  assert.equal(await count.textContent(), "2 of 3");
  // The query crosses formatting boundaries without changing those elements.
  await input.fill("formatted phrase");
  assert.equal(await count.textContent(), "1 of 1");
  assert.equal((await reading.locator(".document-find-current").allTextContents()).join(""), "formatted phrase");
  assert.ok(await reading.locator("strong .document-find-current").count());
  for (const query of ["a+b [test]", "café"]) {
    await input.fill(query);
    assert.equal(await count.textContent(), "1 of 1");
  }
  await input.fill("alphaBeta");
  assert.equal(await count.textContent(), "No matches", "Separate paragraphs must not concatenate");
  assert.equal(await bar.getByRole("button", { name: "Next match", exact: true }).isDisabled(), true);
  await input.fill("discovery");
  assert.equal(await count.textContent(), "1 of 2");
  assert.equal(await reading.locator("details").getAttribute("open"), "");
  await input.press("Enter");
  assert.ok(await reading.evaluate(el => el.scrollTop > 0));
  await input.fill("");
  assert.equal(await count.textContent(), "");
  assert.equal(await reading.locator(".document-find-match").count(), 0);
  await input.fill("alpha");
  await page.keyboard.press("Escape");
  assert.equal(await bar.isVisible(), false);
  assert.equal(await reading.locator(".document-find-match").count(), 0);
  assert.equal(await reading.textContent(), originalText);
  assert.ok(await page.getByRole("button", { name: "Find in document", exact: true }).evaluate(el => el === document.activeElement));
  // Both common shortcut variants stay in Reading and retain the last query.
  for (const shortcut of ["Control+f", "Meta+f"]) {
    await reading.focus(); await page.keyboard.press(shortcut);
    await input.waitFor(); await isReading();
    assert.equal(await input.inputValue(), "alpha");
    await page.getByRole("button", { name: "Close search", exact: true }).focus();
    await page.keyboard.press("Enter");
    assert.equal(await bar.isVisible(), false);
  }
  for (const mode of ["Live preview", "Source"]) {
    await choose(mode); await choose("Find in document");
    await page.locator(".cm-search input[name=search]").waitFor();
    assert.equal(await page.getByRole("button", { name: mode, exact: true }).getAttribute("aria-pressed"), "true");
    await choose("Reading");
    assert.equal(await page.locator(".cm-search").count(), 0);
    await choose("Find in document"); await input.fill("formatted phrase");
    await isReading();
  }
  // Desktop and touch layouts share controls and readable highlights.
  for (const theme of ["light", "dark"]) {
    await page.evaluate(theme => window.PencilsAppearance.write({ theme }), theme);
    assert.deepEqual((await new AxeBuilder({ page }).include(".document-reading-search").include(".document-reading")
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze()).violations.map(v => ({ id: v.id, nodes: v.nodes.map(n => n.target) })), []);
  }
  await page.evaluate(() => window.PencilsAppearance.write({ theme: "light" }));
  await page.screenshot({ path: `/tmp/pencils-reading-search-desktop-${browserName}.png` });
  await choose("Close search");
  await reading.getByRole("link", { name: "Linked note", exact: true }).click();
  await page.getByRole("heading", { name: "Another document", exact: true }).waitFor();
  assert.equal(await bar.isVisible(), false);
  const mobileContext = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const mobile = await mobileContext.newPage();
  mobile.on("pageerror", e => errors.push(e.message));
  await mobile.goto(url); await mobile.locator(".cm-content").waitFor();
  await mobile.getByRole("button", { name: "Reading", exact: true }).tap();
  await mobile.getByRole("button", { name: "Find in document", exact: true }).tap();
  await mobile.getByRole("searchbox", { name: "Find in document", exact: true }).fill("alpha");
  await mobile.getByRole("button", { name: "Next match", exact: true }).tap();
  assert.equal(await mobile.locator(".document-find-count").textContent(), "2 of 3");
  assert.equal(await mobile.getByRole("button", { name: "Reading", exact: true }).getAttribute("aria-pressed"), "true");
  assert.ok(await mobile.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await mobile.evaluate(() => window.PencilsAppearance.write({ theme: "dark" }));
  assert.deepEqual((await new AxeBuilder({ page: mobile }).include(".document-reading-search").include(".document-reading")
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze()).violations.map(v => v.id), []);
  await mobile.screenshot({ path: `/tmp/pencils-reading-search-mobile-${browserName}.png` });
  await mobile.getByRole("button", { name: "Close search", exact: true }).tap();
  assert.equal(await mobile.locator(".document-reading-search").isVisible(), false);
  await mobileContext.close();
  const saved = await store.getDocument(project.id, doc.id);
  assert.equal(saved.revision, doc.revision);
  assert.equal(saved.body, body);
  assert.equal(saved.version, doc.version);
  assert.deepEqual(errors, []);
  console.log("PASS: Reading search stays in mode, rendered/case-insensitive/literal/inline matches, counts and navigation, folded/distant content, shortcuts, cleanup, links, unchanged Markdown/version and desktop/mobile accessibility.");
} catch (error) {
  await page.screenshot({ path: `/tmp/pencils-reading-search-failure-${browserName}.png` });
  throw error;
} finally {
  await browser.close(); server.closeAllConnections(); await new Promise(r => server.close(r));
  await store.close(); await fs.rm(root, { recursive: true, force: true });
}
