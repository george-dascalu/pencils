import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { chromium, webkit } from "playwright";
import { Store } from "../server/store.js";
import { createServer } from "../server/index.js";

const root = await fs.mkdtemp(path.join(os.tmpdir(), "pencils-documents-browser-"));
const store = new Store(root);
await store.init();
const project = await store.createProject({ title: "Documents studio" });
const other = await store.createProject({ title: "Another project" });
const starter = await store.createDocument(project.id, { title: "Project brief", body: "# Project brief\n\nOur **goals** and a [reference](https://example.com).\n" });
const second = await store.createDocument(project.id, { title: "Meeting notes", body: "Decisions from the meeting." });
const server = createServer(store);
await new Promise(r => server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${server.address().port}`, kind = process.env.BROWSER || "chromium";
const browser = await { chromium, webkit }[kind].launch();
const errors = [];
const snapshot = () => store.snapshot(project.id);
async function until(fn) {
  for (let i = 0; i < 160; i++) { if (await fn()) return; await new Promise(r => setTimeout(r, 50)); }
  throw Error("Timed out");
}
try {
  for (const width of [1500, 768, 390]) {
    const context = await browser.newContext({ viewport: { width, height: 950 }, hasTouch: width < 1000 });
    const page = await context.newPage();
    page.setDefaultTimeout(12000);
    page.on("pageerror", e => errors.push(e.message));
    await page.goto(`${base}/#project/${project.id}/documents/${starter.id}`);
    await page.locator("#document-form").waitFor();
    if (width <= 780) await page.waitForFunction(() => document.querySelector(".sidebar").getBoundingClientRect().right <= 1);
    const tabs = await page.locator(".tabs [data-view]").evaluateAll(els => els.map(el => el.dataset.view));
    assert.deepEqual(tabs.slice(0, 3), ["overview", "documents", "planning"]);
    assert.equal(await page.locator("#search,#saved-view,.advanced-filters").count(), 0);
    assert.match(await page.locator("#document-form .cm-content").textContent(), /Project brief/);
    await page.getByRole("button", {name: "Reading", exact: true}).click();
    assert.ok(await page.locator(".document-reading strong").isVisible());
    await page.getByRole("button", {name: "Live preview", exact: true}).click();
    const browse = async () => {
      if (width <= 780) await page.getByRole("button", { name: "Browse documents", exact: true }).click();
    };
    for (const theme of ["light", "dark"]) {
      await page.evaluate(theme => window.PencilsAppearance.write({ theme }), theme);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      const bounds = await page.locator(".documents-workspace").boundingBox();
      assert.ok(bounds.y + bounds.height <= 951 && bounds.height > 600);
      if (width > 780) assert.ok(await page.getByRole("complementary", { name: "Document explorer" }).isVisible());
      await page.screenshot({ path: `/tmp/pencils-documents-${width}-${theme}-${kind}.png` });
    }
    await browse();
    await page.getByLabel("Find a document").fill("Decisions");
    assert.equal(await page.locator("[data-document-open]").count(), 1);
    await page.locator(`[data-document-open="${second.id}"]`).click();
    assert.equal(await page.getByLabel("Document title", { exact: true }).inputValue(), "Meeting notes");
    await page.goBack();
    await until(() => page.getByLabel("Document title", { exact: true }).inputValue().then(v => v === "Project brief"));
    await browse();
    await page.getByLabel("Find a document").fill("");
    await page.getByRole("button", { name: "New document", exact: true }).first().click();
    await until(() => page.getByLabel("Document title", { exact: true }).inputValue().then(v => v === "Untitled document"));
    const title = `Notes ${width} ${kind}`;
    await page.getByLabel("Document title", { exact: true }).fill(title);
    const rich = page.getByRole("textbox", { name: "Document content", exact: true });
    await rich.fill("First paragraph\nSecond paragraph");
    await until(async () => (await snapshot()).documents.some(d => d.title === title && d.body.includes("Second paragraph")));
    let saved = (await snapshot()).documents.find(d => d.title === title);
    const id = saved.id;
    await page.getByRole("button", {name: "Source", exact: true}).click();
    const source = page.getByLabel("Document Markdown", { exact: true });
    const markdown = "## Heading\n\n**Bold** and *italic*.\n\n- One\n- Two\n\n<script>window.badDocument=true</script>";
    await source.fill(markdown);
    await until(async () => (await store.getDocument(project.id, id)).body === markdown);
    await page.getByRole("button", {name: "Live preview", exact: true}).click();
    assert.match(await rich.textContent(), /Heading/);
    assert.equal(await page.evaluate(() => window.badDocument), undefined);
    await page.getByRole("button", {name: "Reading", exact: true}).click();
    assert.ok(await page.locator(".document-reading strong").isVisible());
    await page.getByRole("button", {name: "Live preview", exact: true}).click();
    const download = page.waitForEvent("download");
    if (width < 600) await page.getByRole("button", {name:"Document tools",exact:true}).click();
    await page.getByRole("button", { name: "Export Markdown" }).filter({visible:true}).click();
    await page.keyboard.press("Escape");
    assert.equal(await fs.readFile(await (await download).path(), "utf8"), markdown);
    await page.reload();
    await page.locator("#document-form").waitFor();
    assert.equal(await page.getByLabel("Document title", { exact: true }).inputValue(), title);
    // Unacknowledged edits remain available after reload and retry automatically.
    await page.route("**/api/projects/*/documents/*", route => route.request().method() === "PATCH" ? route.abort() : route.continue());
    await page.getByRole("textbox", { name: "Document content", exact: true }).fill("Offline draft retained");
    await until(() => page.locator("[data-document-save]").textContent().then(t => t.includes("Waiting")));
    await page.reload();
    await page.locator("#document-form").waitFor();
    assert.match(await page.getByRole("textbox", { name: "Document content", exact: true }).textContent(), /Offline draft retained/);
    await page.unroute("**/api/projects/*/documents/*");
    await until(async () => (await store.getDocument(project.id, id)).body.includes("Offline draft retained"));
    await until(() => page.locator("[data-document-save]").textContent().then(t => t === "Saved automatically"));
    // Same-field conflicts must not overwrite another editor's changes.
    const baseDoc = await store.getDocument(project.id, id);
    await store.updateDocument(project.id, id, { revision: baseDoc.revision, body: "Other editor's text" });
    await page.getByRole("textbox", { name: "Document content", exact: true }).fill("My conflicting edit");
    await until(() => page.locator("[data-document-save]").textContent().then(t => t.includes("changed elsewhere")));
    assert.equal((await store.getDocument(project.id, id)).body, "Other editor's text");
    await page.locator("[data-document-recovery]").click();
    await page.locator(`[data-feature="resolve-local"][data-url="/projects/${project.id}/documents/${id}"]`).click();
    await page.locator('[data-action="dialog-close"]').first().click();
    await until(async () => (await store.getDocument(project.id, id)).body.includes("My conflicting edit"));
    await page.locator(".document-delete > summary").click();
    await page.getByRole("button", { name: "Move to Trash", exact: true }).click();
    await until(async () => !(await snapshot()).documents.some(d => d.id === id));
    assert.ok((await store.trash()).some(d => d.id === id));
    await browse();
    await page.locator("#document-import").setInputFiles({ name: "Imported.md", mimeType: "text/markdown", buffer: Buffer.from("# Imported\n\nPortable notes") });
    await until(async () => (await snapshot()).documents.some(d => d.title === "Imported" && d.body.includes("Portable notes")));
    await page.goto(`${base}/#project/${other.id}/documents`);
    await page.locator(`.project-link.active[data-id="${other.id}"]`).waitFor({ state: "attached" });
    await page.locator(".documents-workspace").waitFor();
    assert.equal(await page.locator("[data-document-open]").count(), 0);
    assert.equal((await store.snapshot(other.id)).documents.length, 0);
    await context.close();
  }
  assert.deepEqual(errors, []);
  console.log(`${kind}: Documents navigation, rich/Markdown editing, autosave, offline/reload, conflict recovery, search, import/export, trash, project isolation and responsive themes passed`);
} finally {
  await browser.close();
  await new Promise(r => server.close(r));
  await store.close();
  await fs.rm(root, { recursive: true, force: true });
}
