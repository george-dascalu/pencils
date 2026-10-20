import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { chromium, webkit } from "playwright";
import AxeBuilder from "@axe-core/playwright";
import { Store } from "../server/store.js";
import { createServer } from "../server/index.js";

const root = await fs.mkdtemp(path.join(os.tmpdir(), "pencils-markdown-editor-"));
const store = new Store(root); await store.init();
const project = await store.createProject({ title: "Markdown workspace" });
const target = await store.createDocument(project.id, { title: "Linked note", body: "# Linked note\n\n## Details\n\nEmbedded text.\n" });
const body = [
  "# Project notebook", "", "## Formatting", "",
  "**Bold** and _italic_, ~~struck~~, ==highlighted==, `inline code`.", "",
  "- [ ] Review the document", "- [x] Keep Markdown", "",
  "> [!note]+ Remember", "> This is a **callout**.", "",
  "| Name | State |", "| :--- | ---: |", "| Editor | Ready |", "",
  "A footnote[^one] and math $x^2 + y^2$.", "", "[^one]: Footnote details.", "",
  "$$", "\\frac{a}{b}", "$$", "",
  `[[${target.file.replace(/\.md$/, "")}|Linked note]]`, "",
  `![[${target.file.replace(/\.md$/, "")}#Details]]`, "",
  "%%Private comment stays in the Markdown.%%", "",
  "```mermaid", "flowchart LR", "  Write --> Read", "```", "",
  "```javascript", "const preserved = '**not bold**';", "```", "",
  "<script>window.documentAttack=true</script>", "",
  '<button data-document-action="delete" data-action="project-delete">Untrusted control</button>', "",
  "[Unsafe](javascript:alert(1))", "",
].join("\n");
const record = await store.createDocument(project.id, { title: "Project notebook", body });
const server = createServer(store, { productionAssets: process.env.PRODUCTION_ASSETS === "1" });
await new Promise(r => server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await ({ chromium, webkit }[process.env.BROWSER || "chromium"]).launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await context.newPage();
page.setDefaultTimeout(15000);
const errors = []; page.on("pageerror", e => { errors.push(e.message); console.error(e.stack); });
const current = () => store.getDocument(project.id, record.id);
const mode = name => page.getByRole("button", { name, exact: true }).click();
async function until(fn) {
  for (let n = 0; n < 150; n++) { if (await fn()) return; await new Promise(r => setTimeout(r, 50)); }
  throw Error("Timed out waiting for editor change.");
}
try {
  await page.goto(`${base}/#project/${project.id}/documents/${record.id}`);
  await page.locator(".cm-content").waitFor();
  for (const name of ["Source", "Reading", "Live preview", "Source", "Live preview"]) {
    await mode(name);
    assert.equal((await current()).body, body, "Changing modes must never rewrite Markdown.");
  }
  // Checklists update exactly the selected Markdown marker.
  await page.getByRole("checkbox", { name: "Review the document", exact: true }).check();
  await until(async () => (await current()).body.includes("- [x] Review the document"));
  assert.equal((await current()).body, body.replace("- [ ] Review", "- [x] Review"));
  await page.getByRole("button", { name: "Document tools", exact: true }).click();
  await page.locator('[data-document-format="undo"]').click();
  await until(async () => (await current()).body === body);
  await mode("Reading");
  const reading = page.locator(".document-reading");
  assert.ok(await reading.locator("mark").isVisible());
  assert.ok(await reading.locator("table").isVisible());
  assert.ok(await reading.locator(".document-callout").isVisible());
  assert.equal(await reading.locator("math").count(), 2);
  assert.match(await reading.textContent(), /Footnote details/);
  assert.match(await reading.textContent(), /Embedded text/);
  assert.match(await reading.locator(".document-transclusion").textContent(), /Embedded text/);
  assert.doesNotMatch(await reading.textContent(), /Private comment/);
  assert.equal(await reading.locator("script,a[href^='javascript:']").count(), 0);
  assert.equal(await reading.locator("[data-document-action],[data-action]").count(), 0);
  assert.equal(await page.evaluate(() => window.documentAttack), undefined);
  await reading.locator("[data-document-diagram] svg").waitFor();
  assert.equal((await current()).body, body);
  // Theme/responsive/accessibility checks cover the real rendered Markdown.
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const theme of ["light", "dark"]) {
      await page.evaluate(theme => window.PencilsAppearance.write({ theme }), theme);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      const accessibility = await new AxeBuilder({ page }).include(".documents-workspace")
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
      assert.deepEqual(accessibility.violations.map(v => ({ id: v.id, nodes: v.nodes.map(n => n.target) })), []);
      await page.screenshot({ path: `/tmp/pencils-markdown-${width}-${theme}-${process.env.BROWSER || "chromium"}.png` });
    }
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole("link", { name: "Open in Obsidian", exact: true }).click();
  await page.getByLabel("Obsidian vault name", { exact: true }).fill("Work & notes");
  await page.getByRole("button", { name: "Save settings", exact: true }).click();
  const uri = new URL(await page.getByRole("link", { name: "Open in Obsidian", exact: true }).getAttribute("href"));
  assert.equal(uri.protocol, "obsidian:");
  assert.equal(uri.searchParams.get("vault"), "Work & notes");
  assert.equal(uri.searchParams.get("file"), record.file);
  await page.reload(); await page.locator("#document-form").waitFor();
  assert.equal(await page.getByRole("link", { name: "Open in Obsidian", exact: true }).getAttribute("href"), uri.href);
  // Outline jumps into source-backed editing; it never changes the file.
  await page.getByRole("button", { name: "Document outline", exact: true }).click();
  await page.getByRole("button", { name: "Formatting", exact: true }).click();
  assert.equal(await page.getByRole("button", { name: "Live preview", exact: true }).getAttribute("aria-pressed"), "true");
  await page.getByRole("button", { name: "Find in document", exact: true }).click();
  await page.locator(".cm-search input[name=search]").fill("callout");
  await page.keyboard.press("Escape");
  await mode("Reading");
  await page.locator(".document-reading [data-document-ref]").first().click();
  await until(() => page.getByLabel("Document title", { exact: true }).inputValue().then(t => t === target.title));
  await page.getByRole("button", { name: "Document tools", exact: true }).click();
  await page.getByRole("dialog", { name: "Document tools" }).getByRole("button", { name: record.title, exact: true }).click();
  await until(() => page.getByLabel("Document title", { exact: true }).inputValue().then(t => t === record.title));
  // Attachment upload inserts a portable relative Markdown path.
  await page.locator("#document-attachment").setInputFiles({
    name: "Notes.txt", mimeType: "text/plain", buffer: Buffer.from("Local attachment."),
  });
  await until(async () => /\[Notes\.txt\]\(\.\.\/attachments\/a-[\w-]+\.txt\)/.test((await current()).body));
  assert.deepEqual(errors, []);
  console.log("PASS: lossless modes, live checklist/undo, callouts, tables, math, Mermaid, links/embeds/backlinks, outline/search, Obsidian URI, attachments, XSS protection and responsive accessibility.");
} catch (error) {
  console.error("Browser errors:", errors);
  console.error("Checkboxes:", await page.locator('input[type="checkbox"]').evaluateAll(els => els.map(e => e.outerHTML)));
  await page.screenshot({ path: "/tmp/pencils-markdown-failure.png" });
  throw error;
} finally {
  await browser.close(); server.closeAllConnections();
  await new Promise(r => server.close(r)); await store.close();
  await fs.rm(root, { recursive: true, force: true });
}
