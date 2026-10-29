// Documents workspace refinements: an outline panel (keyboard and outside-click
// friendly, with folding), icon-only view modes, a collapsible sidebar that is
// remembered, nested folders with Move, drag and rename, automatic page versions
// with restore, and the outline on phones. Also board task cards: collapsing and
// expanding the description is saved, keeps the plan flow and focus, survives a
// reload and can be undone, for task and draft cards.
import { test, expect, startApp } from "../fixtures.mjs";
import { updateProjectFrame } from "../../public/project-frame.js";
import { noHorizontalScroll, setTheme } from "../helpers/documents.mjs";

const markdown = "# Notebook\n\n## First section\n\n### Nested heading\n\nDetails.\n\n## Second section\n\nFinal paragraph.";
test.use({ viewportSize: { width: 1500, height: 1100 } });
test.beforeEach(({ page }) => page.setDefaultTimeout(15000));
// A server and vault per test, so each starts with one project and its notebook in the sidebar.
let app;
test.beforeEach(async () => { app = await startApp("document-workspace"); });
test.afterEach(async () => app.close());

async function seedNotebook({ folders, folder } = {}) {
  let project = await app.store.createProject({ title: "Workspace refinements" });
  if (folders) project = await app.store.updateProject(project.id, { revision: project.revision, document_folders: folders });
  const doc = await app.store.createDocument(project.id, { title: "Notebook", body: markdown, ...(folder ? { folder } : {}) });
  const current = () => app.store.getDocument(project.id, doc.id);
  const folderList = async () => (await app.store.snapshot(project.id)).project.document_folders || [];
  return { project, doc, current, folderList };
}
async function openNotebook(page, { project, doc }) {
  await page.goto(`${app.base}/#project/${project.id}/documents/${doc.id}`);
  await page.locator(".cm-content").waitFor();
}
const outlineButton = (page) => page.getByRole("button", { name: "Document outline", exact: true });
const outline = (page) => page.getByRole("dialog", { name: "Outline", exact: true });
const nestedFolders = [{ id: "research", title: "Research", parent: null }, { id: "meetings", title: "Meetings", parent: "research" }];

test("the outline opens and closes by click, Enter and Space, Escape and an outside click", async ({ page }) => {
  const s = await seedNotebook();
  await openNotebook(page, s);
  // The mode buttons are icon-only; the outline comes first among the view controls.
  expect((await page.locator("button[data-document-mode]").allTextContents()).join("")).toBe("");
  await expect(page.locator(".document-view-controls > :first-child")).toHaveAttribute("data-document-action", "outline");
  const button = outlineButton(page);
  await button.click();
  await expect(button).toHaveAttribute("aria-expanded", "true");
  await button.click();
  await expect(outline(page)).toBeHidden();
  await expect(button).toHaveAttribute("aria-expanded", "false");
  await expect(button).toBeFocused();
  await button.press("Enter");
  await outline(page).waitFor();
  await button.press("Enter");
  await expect(outline(page)).toBeHidden();
  await button.press("Space");
  await outline(page).waitFor();
  await page.keyboard.press("Escape");
  await expect(button).toHaveAttribute("aria-expanded", "false");
  await button.click();
  await page.getByLabel("Document title", { exact: true }).click();
  await outline(page).waitFor({ state: "hidden" });
  await expect(button).toHaveAttribute("aria-expanded", "false");
});

test("the outline tree folds sections and jumps to headings without changing the file", async ({ page }) => {
  const s = await seedNotebook();
  await openNotebook(page, s);
  await outlineButton(page).click();
  await expect(outline(page).locator("ul ul ul")).toHaveCount(1);
  await outline(page).getByRole("button", { name: "Toggle First section headings", exact: true }).click();
  await expect(outline(page).getByRole("button", { name: "Nested heading", exact: true })).toBeHidden();
  await outline(page).getByRole("button", { name: "Toggle First section headings", exact: true }).click();
  await outline(page).getByRole("button", { name: "Nested heading", exact: true }).click();
  expect((await s.current()).body).toBe(markdown);
});

test("collapsing the sidebar hides the document explorer, also after a reload", async ({ page }) => {
  const s = await seedNotebook();
  await openNotebook(page, s);
  // Since 0.19.27 the document explorer lives in the main sidebar, so the main
  // sidebar's collapse control hides and restores it (no separate Documents pane).
  const explorer = page.getByRole("complementary", { name: "Document explorer" });
  await page.getByRole("button", { name: "Collapse sidebar", exact: true }).click();
  await expect(explorer).toBeHidden();
  await page.reload();
  await page.locator(".cm-content").waitFor();
  await expect(explorer).toBeHidden();
  await page.getByRole("button", { name: "Expand sidebar", exact: true }).click();
  await expect(explorer).toBeVisible();
  expect((await s.current()).body, "the source stays untouched").toBe(markdown);
});

test("new folders nest, and Move to folder files the document", async ({ page }) => {
  const s = await seedNotebook();
  await openNotebook(page, s);
  for (const [name, count] of [["Research", 1], ["Meetings", 2]]) {
    await page.getByRole("button", { name: "New folder", exact: true }).click();
    await page.getByRole("textbox", { name: "Folder name", exact: true }).fill(name);
    await page.getByRole("button", { name: "Create folder", exact: true }).click();
    await expect.poll(async () => (await s.folderList()).length).toBe(count);
  }
  const nested = (await s.folderList()).find((f) => f.title === "Meetings");
  expect(nested.parent, "the second folder nests in the first").toBeTruthy();
  await page.getByRole("button", { name: "Document tools", exact: true }).click();
  await page.getByRole("button", { name: "Move to folder", exact: true }).click();
  // Native selects are upgraded by the shared menu.
  await page.getByRole("dialog", { name: "Move document" }).locator("select").selectOption(nested.id);
  await page.getByRole("button", { name: "Move", exact: true }).click();
  await expect.poll(async () => (await s.current()).folder).toBe(nested.id);
  await expect(page.locator("#document-list ul ul [data-document-open]")).toHaveCount(1);
  expect((await s.current()).version).toBe(2);
});

test("editing makes a page version, and restoring one keeps the folder and file", async ({ page }) => {
  const s = await seedNotebook({ folders: nestedFolders, folder: "meetings" });
  const start = (await s.current()).version;
  await openNotebook(page, s);
  // Editing produces a version; restoring produces another, preserving the folder.
  await page.getByRole("button", { name: "Source", exact: true }).click();
  await page.locator(".cm-content").fill("# Revised notebook\n\nNew content.");
  await expect.poll(async () => (await s.current()).version).toBe(start + 1);
  await page.getByRole("button", { name: "Page versions", exact: true }).click();
  const history = page.getByRole("dialog", { name: "Page versions", exact: true });
  await history.locator("[data-version-index]").filter({ hasText: `Version ${start}` }).click();
  await expect(history.locator("article")).toContainText("Final paragraph");
  await history.getByRole("button", { name: "Restore this version", exact: true }).click();
  await expect.poll(async () => (await s.current()).version).toBe(start + 2);
  const restored = await s.current();
  expect(restored.body).toBe(markdown);
  expect(restored.folder).toBe("meetings");
  expect(restored.file, "Folder moves preserve Markdown link targets").toBe(s.doc.file);
});

test("documents drag to the root and back into a folder", async ({ page }) => {
  const s = await seedNotebook({ folders: nestedFolders, folder: "meetings" });
  await openNotebook(page, s);
  const drag = await page.evaluateHandle(() => new DataTransfer());
  const item = page.locator(`[data-document-open="${s.doc.id}"]`);
  await item.dispatchEvent("dragstart", { dataTransfer: drag });
  await page.locator('[data-document-folder-drop=""]').dispatchEvent("dragover", { dataTransfer: drag });
  await page.locator('[data-document-folder-drop=""]').dispatchEvent("drop", { dataTransfer: drag });
  await expect.poll(async () => (await s.current()).folder).toBeNull();
  await item.dispatchEvent("dragstart", { dataTransfer: drag });
  await page.locator('[data-document-folder-drop="meetings"]').dispatchEvent("drop", { dataTransfer: drag });
  await expect.poll(async () => (await s.current()).folder).toBe("meetings");
});

test("a folder is renamed from its Edit panel", async ({ page }) => {
  const s = await seedNotebook({ folders: nestedFolders, folder: "meetings" });
  await openNotebook(page, s);
  await page.getByRole("button", { name: "Edit Meetings folder", exact: true }).click();
  await page.getByRole("textbox", { name: "Folder name", exact: true }).fill("Team meetings");
  await page.getByRole("dialog", { name: "Edit folder" }).getByRole("button", { name: "Save", exact: true }).click();
  await expect.poll(async () => (await s.folderList()).some((f) => f.title === "Team meetings")).toBe(true);
});

test("the outline fits desktop and phone screens in both themes, and phones open the document list", async ({ page }) => {
  const s = await seedNotebook({ folders: nestedFolders, folder: "meetings" });
  await openNotebook(page, s);
  const button = outlineButton(page);
  for (const width of [1500, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const theme of ["light", "dark"]) {
      await setTheme(page, theme);
      if (width === 390) {
        // Since 0.18.35 narrow editors keep the outline in the Document tools menu.
        await expect(button).toBeHidden();
        await page.getByRole("button", { name: "Document tools", exact: true }).click();
        await page.getByRole("dialog", { name: "Document tools", exact: true }).getByRole("button", { name: "Document outline", exact: true }).click();
      } else {
        await button.click();
        await button.click();
        await expect(outline(page)).toBeHidden();
        await expect(button).toHaveAttribute("aria-expanded", "false");
        await button.click();
      }
      await outline(page).waitFor();
      expect(await noHorizontalScroll(page), `${width} ${theme}`).toBe(true);
      const rect = await outline(page).boundingBox();
      expect(rect.x >= 0 && rect.x + rect.width <= width + 1, `${width} ${theme} ${JSON.stringify(rect)}`).toBe(true);
      await page.keyboard.press("Escape");
      await outline(page).waitFor({ state: "hidden" });
    }
  }
  // Since 0.19.27 phones have one menu button; in Documents it opens on the document list.
  await page.getByRole("button", { name: "Toggle sidebar", exact: true }).click();
  await expect(page.getByRole("button", { name: "New folder", exact: true })).toBeVisible();
  await page.locator(`[data-document-open="${s.doc.id}"]`).click();
});

test("board task cards collapse and expand their description, saved with the plan flow, focus, reload and undo", async ({ page }) => {
  const project = await app.store.createProject({ title: "Workspace refinements" });
  const parent = await app.store.createTask(project.id, { title: "Parent card", body: Array.from({ length: 12 }, (_, i) => `Paragraph ${i + 1} with **formatting**.`).join("\n\n") });
  const child = await app.store.createTask(project.id, { title: "Child card", parent: parent.id });
  const board = structuredClone((await app.store.snapshot(project.id)).boards[0]);
  const frame = { id: "frame", type: "frame", projectFrame: true, x: 40, y: 40, w: 640, h: 360 };
  board.nodes.push(frame); updateProjectFrame(board, frame, [parent, child], project.title);
  const parentId = board.nodes.find((n) => n.task === parent.id).id;
  board.nodes.push({ id: "draft", type: "draft", x: 900, y: 120, w: 340, h: 220, text: "Draft description", draft: { title: "Draft card", type: "task", priority: "medium" } });
  await app.store.updateBoard(project.id, board.id, { revision: board.revision, nodes: board.nodes, edges: board.edges });
  const canvas = async () => (await app.store.snapshot(project.id)).boards[0];
  const node = async (id) => (await canvas()).nodes.find((n) => n.id === id);

  await page.goto(`${app.base}/#project/${project.id}/board/${board.id}`);
  const card = page.locator(`[data-node="${parentId}"]`);
  await card.waitFor();
  expect(await card.locator(".live-card-actions button").evaluateAll((els) => els.map((e) => e.dataset.pro))).toEqual(["task-collapse", "comments", "task-details"]);
  await card.getByRole("button", { name: "Collapse task description", exact: true }).click();
  await expect.poll(async () => (await node(parentId)).taskCollapsed).toBe(true);
  await expect(card.locator(".task-card-description")).toBeHidden();
  expect((await node(parentId)).h).toBeLessThan(220);
  await page.reload();
  await card.waitFor();
  await card.getByRole("button", { name: "Expand task description", exact: true }).click();
  await expect.poll(async () => (await node(parentId)).taskCollapsed).toBe(false);
  const full = await card.locator(".task-card-description").evaluate((el) => ({ client: el.clientHeight, scroll: el.scrollHeight, text: el.textContent }));
  expect(full.text, "the whole description shows").toMatch(/Paragraph 12/);
  expect(full.scroll, JSON.stringify(full)).toBeLessThanOrEqual(full.client + 2);
  const savedBoard = await canvas(), rootCard = savedBoard.nodes.find((n) => n.id === parentId), childCard = savedBoard.nodes.find((n) => n.task === child.id);
  expect(childCard.y, "the child card flows below its parent").toBeGreaterThan(rootCard.y + rootCard.h);
  await expect(card.locator("[data-pro=task-collapse]")).toBeFocused();
  await page.locator("[data-action=board-undo]").click();
  await expect.poll(async () => (await node(parentId)).taskCollapsed).toBe(true);
  const draft = page.locator('[data-node="draft"]');
  await draft.getByRole("button", { name: "Collapse task description", exact: true }).click();
  await expect.poll(async () => (await node("draft")).taskCollapsed).toBe(true);
  await draft.getByRole("button", { name: "Expand task description", exact: true }).click();
  await expect(draft.getByText("Draft description", { exact: true })).toBeVisible();
});
