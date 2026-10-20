import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { chromium, webkit } from "playwright";
import { Store } from "../server/store.js";
import { createServer } from "../server/index.js";

const root = await fs.mkdtemp(path.join(os.tmpdir(), "pencils-folder-drag-"));
const store = new Store(root); await store.init();
let project = await store.createProject({ title: "Folder organisation" });
project = await store.updateProject(project.id, {
  revision: project.revision,
  document_folders: [
    { id: "research", title: "Research", parent: null },
    { id: "meetings", title: "Meetings", parent: "research" },
    { id: "deep", title: "Decisions", parent: "meetings" },
    { id: "archive", title: "Archive", parent: null },
    { id: "duplicate", title: "Meetings", parent: null },
  ],
});
const doc = await store.createDocument(project.id, { title: "Meeting notes", body: "# Notes\n\nKeep these notes.", folder: "deep" });
const loose = await store.createDocument(project.id, { title: "Loose notes", body: "To file." });
const server = createServer(store, { productionAssets: process.env.PRODUCTION_ASSETS === "1" });
await new Promise(r => server.listen(0, "127.0.0.1", r));
const browserName = process.env.BROWSER || "chromium";
const browser = await ({ chromium, webkit }[browserName]).launch();
const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } });
page.setDefaultTimeout(12000);
const errors = []; page.on("pageerror", e => errors.push(e.message));
let projectWrites = 0;
page.on("request", req => {
  if (req.method() === "PATCH" && req.url().endsWith(`/api/projects/${project.id}`)) projectWrites++;
});
const folder = id => page.locator(`[data-document-folder="${id}"]`);
const target = id => page.locator(`[data-document-folder-drop="${id}"]`);
const snapshot = () => store.snapshot(project.id);
async function until(fn) {
  for (let i = 0; i < 150; i++) { if (await fn()) return; await page.waitForTimeout(50); }
  throw Error("Folder change did not settle");
}
const parent = async id => (await snapshot()).project.document_folders.find(f => f.id === id).parent;
async function syntheticDrag(id) {
  const transfer = await page.evaluateHandle(() => new DataTransfer());
  await folder(id).dispatchEvent("dragstart", { dataTransfer: transfer });
  return transfer;
}
try {
  await page.goto(`http://127.0.0.1:${server.address().port}/#project/${project.id}/documents/${doc.id}`);
  await page.locator(".cm-content").waitFor();
  assert.equal(await folder("research").getAttribute("draggable"), "true");
  // Native dragging moves a whole tree into a collapsed destination and reveals it.
  await folder("archive").click();
  assert.equal(await folder("archive").getAttribute("aria-expanded"), "false");
  await folder("research").dragTo(folder("archive"));
  await until(async () => await parent("research") === "archive");
  await until(async () => await folder("archive").getAttribute("aria-expanded") === "true");
  assert.equal(await parent("meetings"), "research");
  assert.equal(await parent("deep"), "meetings");
  assert.equal(await target("archive").locator("..").locator('[data-document-open]').count(), 1);
  assert.equal((await store.getDocument(project.id, doc.id)).revision, doc.revision);
  assert.equal((await store.getDocument(project.id, doc.id)).file, doc.file);
  // Root is a real drop target; reload retains the move.
  await folder("research").dragTo(page.locator("[data-document-root]"));
  await until(async () => await parent("research") === null);
  await page.reload(); await page.locator(".cm-content").waitFor();
  assert.equal(await page.locator('#document-list > li > [data-document-folder-drop="research"]').count(), 1);
  const writesBeforeInvalid = projectWrites;
  // Invalid destinations do not highlight or save, including descendants and no-ops.
  for (const destination of ["research", "meetings", "deep", ""]) {
    const transfer = await syntheticDrag("research");
    await target(destination).dispatchEvent("dragover", { dataTransfer: transfer });
    assert.equal(await page.locator(".document-drop-target").count(), 0);
    await target(destination).dispatchEvent("drop", { dataTransfer: transfer });
    await folder("research").dispatchEvent("dragend", { dataTransfer: transfer });
    await transfer.dispose();
  }
  assert.equal(projectWrites, writesBeforeInvalid);
  // Leaving/cancelling a valid drag clears feedback.
  const transfer = await syntheticDrag("research");
  await target("archive").dispatchEvent("dragover", { dataTransfer: transfer });
  assert.ok(await target("archive").evaluate(el => el.classList.contains("document-drop-target")));
  await page.screenshot({ path: `/tmp/pencils-folder-drag-desktop-${browserName}.png` });
  await page.locator(".document-editor").dispatchEvent("dragover", { dataTransfer: transfer });
  assert.equal(await page.locator(".document-drop-target").count(), 0);
  await target("archive").dispatchEvent("dragover", { dataTransfer: transfer });
  await folder("research").dispatchEvent("dragend", { dataTransfer: transfer });
  assert.equal(await page.locator(".document-drop-target").count(), 0);
  await transfer.dispose();
  // The existing document drag path still works.
  await page.locator(`[data-document-open="${loose.id}"]`).dragTo(folder("archive"));
  await until(async () => (await store.getDocument(project.id, loose.id)).folder === "archive");
  // Server validation leaves duplicate names untouched and reports the problem.
  await folder("duplicate").dragTo(folder("research"));
  await page.locator("#toasts").getByText("A folder with this name already exists here.", { exact: true }).waitFor();
  assert.equal(await parent("duplicate"), null);
  assert.equal(await parent("meetings"), "research");
  // A failed save does not move anything; a second attempt can succeed.
  const route = `**/api/projects/${project.id}`;
  await page.route(route, request => request.request().method() === "PATCH"
    ? request.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "Could not save this folder move. Try again." }) })
    : request.continue());
  await folder("research").dragTo(folder("archive"));
  await page.locator("#toasts").getByText("Could not save this folder move. Try again.", { exact: true }).waitFor();
  assert.equal(await parent("research"), null);
  await page.unroute(route);
  // Move while editing: the editor and Markdown remain intact.
  await page.getByRole("button", { name: "Source", exact: true }).click();
  const revised = "# Notes\n\nKeep these notes.\n\nAn unsaved thought.";
  await page.locator(".cm-content").fill(revised);
  await folder("research").dragTo(folder("archive"));
  await until(async () => await parent("research") === "archive");
  await until(async () => (await store.getDocument(project.id, doc.id)).body === revised);
  assert.equal((await page.locator(".cm-line").allTextContents()).join("\n"), revised);
  assert.equal((await store.getDocument(project.id, doc.id)).folder, "deep");
  // The keyboard/touch alternative uses the same hierarchy, excluding descendants.
  for (const width of [1500, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    if (width === 390) await page.getByRole("button", { name: "Browse documents", exact: true }).click();
    await page.getByRole("button", { name: "Edit Research folder", exact: true }).click();
    const panel = page.getByRole("dialog", { name: "Edit folder", exact: true });
    const values = await panel.locator('select[name="parent"] option').evaluateAll(els => els.map(el => el.value));
    for (const id of ["research", "meetings", "deep"]) assert.equal(values.includes(id), false);
    assert.ok(values.includes("") && values.includes("archive"));
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    if (width === 390) {
      await page.evaluate(() => window.PencilsAppearance.write({ theme: "dark" }));
      await page.screenshot({ path: `/tmp/pencils-folder-drag-mobile-${browserName}.png` });
      await panel.locator("select").selectOption("");
      await panel.getByRole("button", { name: "Save", exact: true }).click();
      await until(async () => await parent("research") === null);
    } else await page.keyboard.press("Escape");
  }
  assert.deepEqual(errors, []);
  console.log("PASS: native folder/tree dragging, root moves, persistence, valid/invalid drop feedback, cancellation, duplicate/error recovery, document dragging, preserved edits and mobile/keyboard move controls.");
} catch (error) {
  await page.screenshot({ path: `/tmp/pencils-folder-drag-failure-${browserName}.png` });
  throw error;
} finally {
  await browser.close(); server.closeAllConnections(); await new Promise(r => server.close(r));
  await store.close(); await fs.rm(root, { recursive: true, force: true });
}
