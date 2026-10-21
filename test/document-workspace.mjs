import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { chromium, webkit } from "playwright";
import { Store } from "../server/store.js";
import { createServer } from "../server/index.js";
import { updateProjectFrame } from "../public/project-frame.js";

const root = await fs.mkdtemp(path.join(os.tmpdir(), "pencils-workspace-ui-"));
const store = new Store(root); await store.init();
const project = await store.createProject({ title: "Workspace refinements" });
const markdown = "# Notebook\n\n## First section\n\n### Nested heading\n\nDetails.\n\n## Second section\n\nFinal paragraph.";
const document = await store.createDocument(project.id, { title: "Notebook", body: markdown });
const parent = await store.createTask(project.id, { title: "Parent card", body: Array.from({ length: 12 }, (_, i) => `Paragraph ${i + 1} with **formatting**.`).join("\n\n") });
const child = await store.createTask(project.id, { title: "Child card", parent: parent.id });
const board = structuredClone((await store.snapshot(project.id)).boards[0]);
const frame = { id: "frame", type: "frame", projectFrame: true, x: 40, y: 40, w: 640, h: 360 };
board.nodes.push(frame); updateProjectFrame(board, frame, [parent, child], project.title);
const parentId = board.nodes.find(n => n.task === parent.id).id;
board.nodes.push({ id: "draft", type: "draft", x: 900, y: 120, w: 340, h: 220, text: "Draft description", draft: { title: "Draft card", type: "task", priority: "medium" } });
await store.updateBoard(project.id, board.id, { revision: board.revision, nodes: board.nodes, edges: board.edges });
const server = createServer(store, { productionAssets: process.env.PRODUCTION_ASSETS === "1" });
await new Promise(r => server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await ({ chromium, webkit }[process.env.BROWSER || "chromium"]).launch();
const page = await browser.newPage({ viewport: { width: 1500, height: 1100 } });
page.setDefaultTimeout(15000);
const errors = []; page.on("pageerror", error => errors.push(error.message));
const current = () => store.getDocument(project.id, document.id);
const canvas = async () => (await store.snapshot(project.id)).boards[0];
async function until(fn) {
  for (let i = 0; i < 150; i++) { if (await fn()) return; await page.waitForTimeout(60); }
  throw Error("Change did not settle");
}
try {
  await page.goto(`${base}/#project/${project.id}/documents/${document.id}`);
  await page.locator(".cm-content").waitFor();
  assert.equal(await page.locator("[data-document-mode]").allTextContents().then(t => t.join("")), "");
  assert.equal(await page.locator(".document-view-controls > :first-child").getAttribute("data-document-action"), "outline");
  const outlineButton = page.getByRole("button", { name: "Document outline", exact: true });
  await outlineButton.click();
  const outline = page.getByRole("dialog", { name: "Outline", exact: true });
  assert.equal(await outlineButton.getAttribute("aria-expanded"), "true");
  await outlineButton.click();
  assert.equal(await outline.isVisible(), false);
  assert.equal(await outlineButton.getAttribute("aria-expanded"), "false");
  assert.ok(await outlineButton.evaluate(el => el === document.activeElement));
  await outlineButton.press("Enter");
  await outline.waitFor();
  await outlineButton.press("Enter");
  assert.equal(await outline.isVisible(), false);
  await outlineButton.press("Space");
  await outline.waitFor();
  await page.keyboard.press("Escape");
  assert.equal(await outlineButton.getAttribute("aria-expanded"), "false");
  await outlineButton.click();
  await page.getByLabel("Document title", { exact: true }).click();
  await outline.waitFor({ state: "hidden" });
  await until(async () => await outlineButton.getAttribute("aria-expanded") === "false");
  await outlineButton.click();
  assert.equal(await outline.locator("ul ul ul").count(), 1);
  await outline.getByRole("button", { name: "Toggle First section headings", exact: true }).click();
  assert.equal(await outline.getByRole("button", { name: "Nested heading", exact: true }).isVisible(), false);
  await outline.getByRole("button", { name: "Toggle First section headings", exact: true }).click();
  await outline.getByRole("button", { name: "Nested heading", exact: true }).click();
  assert.equal((await current()).body, markdown);
  // Sidebar preference persists while the source remains untouched.
  await page.getByRole("button", { name: "Collapse Documents sidebar", exact: true }).click();
  assert.equal(await page.getByRole("complementary", { name: "Document explorer" }).isVisible(), false);
  await page.reload(); await page.locator(".cm-content").waitFor();
  assert.equal(await page.getByRole("complementary", { name: "Document explorer" }).isVisible(), false);
  await page.getByRole("button", { name: "Browse documents", exact: true }).click();
  await page.getByRole("button", { name: "New folder", exact: true }).click();
  await page.getByRole("textbox", { name: "Folder name", exact: true }).fill("Research");
  await page.getByRole("button", { name: "Create folder", exact: true }).click();
  await until(async () => (await store.snapshot(project.id)).project.document_folders?.length === 1);
  await page.getByRole("button", { name: "New folder", exact: true }).click();
  await page.getByRole("textbox", { name: "Folder name", exact: true }).fill("Meetings");
  await page.getByRole("button", { name: "Create folder", exact: true }).click();
  await until(async () => (await store.snapshot(project.id)).project.document_folders?.length === 2);
  let snapshot = await store.snapshot(project.id);
  const nested = snapshot.project.document_folders.find(f => f.title === "Meetings");
  assert.ok(nested.parent);
  await page.getByRole("button", { name: "Document tools", exact: true }).click();
  await page.getByRole("button", { name: "Move to folder", exact: true }).click();
  // Native selects are upgraded by the shared menu.
  await page.getByRole("dialog", { name: "Move document" }).locator("select").selectOption(nested.id);
  await page.getByRole("button", { name: "Move", exact: true }).click();
  await until(async () => (await current()).folder === nested.id);
  assert.equal(await page.locator("#document-list ul ul [data-document-open]").count(), 1);
  assert.equal((await current()).version, 2);
  // Editing produces a version; restoring produces another, preserving the folder.
  await page.getByRole("button", { name: "Source", exact: true }).click();
  await page.locator(".cm-content").fill("# Revised notebook\n\nNew content.");
  await until(async () => (await current()).version === 3);
  await page.getByRole("button", { name: "Page versions", exact: true }).click();
  const history = page.getByRole("dialog", { name: "Page versions", exact: true });
  await history.locator("[data-version-index]").filter({ hasText: "Version 1" }).click();
  assert.match(await history.locator("article").textContent(), /Final paragraph/);
  await history.getByRole("button", { name: "Restore this version", exact: true }).click();
  await until(async () => (await current()).version === 4);
  assert.equal((await current()).body, markdown); assert.equal((await current()).folder, nested.id);
  assert.equal((await current()).file, document.file, "Folder moves preserve Markdown link targets");
  const drag = await page.evaluateHandle(() => new DataTransfer());
  await page.locator(`[data-document-open="${document.id}"]`).dispatchEvent("dragstart", { dataTransfer: drag });
  await page.locator('[data-document-folder-drop=""]').dispatchEvent("dragover", { dataTransfer: drag });
  await page.locator('[data-document-folder-drop=""]').dispatchEvent("drop", { dataTransfer: drag });
  await until(async () => (await current()).folder === null);
  await page.locator(`[data-document-open="${document.id}"]`).dispatchEvent("dragstart", { dataTransfer: drag });
  await page.locator(`[data-document-folder-drop="${nested.id}"]`).dispatchEvent("drop", { dataTransfer: drag });
  await until(async () => (await current()).folder === nested.id);
  await page.getByRole("button", { name: "Edit Meetings folder", exact: true }).click();
  await page.getByRole("textbox", { name: "Folder name", exact: true }).fill("Team meetings");
  await page.getByRole("dialog", { name: "Edit folder" }).getByRole("button", { name: "Save", exact: true }).click();
  await until(async () => (await store.snapshot(project.id)).project.document_folders.some(f => f.title === "Team meetings"));
  for (const width of [1500, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const theme of ["light", "dark"]) {
      await page.evaluate(theme => window.PencilsAppearance.write({ theme }), theme);
      await outlineButton.click();
      await outlineButton.click();
      assert.equal(await outline.isVisible(), false);
      assert.equal(await outlineButton.getAttribute("aria-expanded"), "false");
      await outlineButton.click();
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      const rect = await page.getByRole("dialog", { name: "Outline" }).boundingBox();
      assert.ok(rect.x >= 0 && rect.x + rect.width <= width + 1);
      await page.screenshot({ path: `/tmp/pencils-workspace-${width}-${theme}-${process.env.BROWSER || "chromium"}.png` });
      await page.keyboard.press("Escape");
    }
    if (width === 390) {
      await page.getByRole("button", { name: "Browse documents", exact: true }).click();
      assert.ok(await page.getByRole("button", { name: "New folder", exact: true }).isVisible());
      await page.locator(`[data-document-open="${document.id}"]`).click();
    }
  }
  // Board card state, full description, flow, keyboard focus, persistence and undo.
  await page.setViewportSize({ width: 1500, height: 1100 });
  await page.goto(`${base}/#project/${project.id}/board/${board.id}`);
  const card = page.locator(`[data-node="${parentId}"]`);
  await card.waitFor();
  assert.deepEqual(await card.locator(".live-card-actions button").evaluateAll(els => els.map(e => e.dataset.pro)), ["task-collapse", "comments", "task-details"]);
  await card.getByRole("button", { name: "Collapse task description", exact: true }).click();
  await until(async () => (await canvas()).nodes.find(n => n.id === parentId).taskCollapsed === true);
  assert.equal(await card.locator(".task-card-description").isVisible(), false);
  assert.ok((await canvas()).nodes.find(n => n.id === parentId).h < 220);
  await page.reload(); await card.waitFor();
  await card.getByRole("button", { name: "Expand task description", exact: true }).click();
  await until(async () => (await canvas()).nodes.find(n => n.id === parentId).taskCollapsed === false);
  const full = await card.locator(".task-card-description").evaluate(el => ({ client: el.clientHeight, scroll: el.scrollHeight, text: el.textContent }));
  assert.match(full.text, /Paragraph 12/); assert.ok(full.scroll <= full.client + 2, JSON.stringify(full));
  const savedBoard = await canvas(), rootCard = savedBoard.nodes.find(n => n.id === parentId), childCard = savedBoard.nodes.find(n => n.task === child.id);
  assert.ok(childCard.y > rootCard.y + rootCard.h);
  assert.equal(await card.locator("[data-pro=task-collapse]").evaluate(el => el === document.activeElement), true);
  await page.locator("[data-action=board-undo]").click();
  await until(async () => (await canvas()).nodes.find(n => n.id === parentId).taskCollapsed === true);
  const draft = page.locator('[data-node="draft"]');
  await draft.getByRole("button", { name: "Collapse task description", exact: true }).click();
  await until(async () => (await canvas()).nodes.find(n => n.id === "draft").taskCollapsed === true);
  await draft.getByRole("button", { name: "Expand task description", exact: true }).click();
  assert.ok(await draft.getByText("Draft description", { exact: true }).isVisible());
  await page.screenshot({ path: `/tmp/pencils-card-disclosure-${process.env.BROWSER || "chromium"}.png` });
  assert.deepEqual(errors, []);
  console.log("PASS: outline tree, icon modes, sidebar, nested folders/moves, automatic versions/restore, desktop/mobile themes, task/draft collapse, full description, plan flow, focus, reload and undo.");
} catch (error) {
  await page.screenshot({ path: `/tmp/pencils-workspace-failure-${process.env.BROWSER || "chromium"}.png` });
  throw error;
} finally {
  await browser.close(); server.closeAllConnections(); await new Promise(r => server.close(r));
  await store.close(); await fs.rm(root, { recursive: true, force: true });
}
