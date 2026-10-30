// The Documents view of a project: navigation and search, rich and Markdown
// editing with autosave, export and import, offline edits kept across a reload,
// conflict recovery, Trash, project isolation, and a full-height workspace in
// both themes, on desktop, a 768px tablet (document list in the drawer) and phones
// (view picker and Document tools for narrow editors).
import fs from "node:fs/promises";
import { test, expect, onDevices, useApp } from "../fixtures.mjs";
import { openSidebar } from "../helpers/menu-controls.mjs";
import { chooseDocumentView, documentName, noHorizontalScroll, renameDocument, setTheme } from "../helpers/documents.mjs";

const app = useApp(async (store) => {
  const project = await store.createProject({ title: "Documents studio" });
  const other = await store.createProject({ title: "Another project" });
  const starter = await store.createDocument(project.id, { title: "Project brief", body: "# Project brief\n\nOur **goals** and a [reference](https://example.com).\n" });
  const second = await store.createDocument(project.id, { title: "Meeting notes", body: "Decisions from the meeting." });
  return { project, other, starter, second };
});
const snapshot = () => app.store.snapshot(app.project.id);
const getDocument = (id) => app.store.getDocument(app.project.id, id);
// Since 0.19.31 the document's name shows in the top bar instead of a title field.
const title = documentName;
const rich = (page) => page.getByRole("textbox", { name: "Document content", exact: true });
// A label unique to this test run, for documents a test creates.
const tag = () => `${test.info().testId}-${test.info().repeatEachIndex}-${test.info().retry}`;

// Opens a document; narrow screens (780px and below) start with the sidebar closed.
async function open(page, id = app.starter.id) {
  await page.goto(`${app.base}/#project/${app.project.id}/documents/${id}`);
  await page.locator("#document-form").waitFor();
  if (page.viewportSize().width <= 780) await page.waitForFunction(() => document.querySelector(".sidebar").getBoundingClientRect().right <= 1);
}
const chooseMode = (page, name) => chooseDocumentView(page, name);
// Since 0.19.27 the document list is in the main sidebar; on narrow screens the one
// menu button opens the drawer on the document list while Documents is open.
async function browse(page) {
  if (page.viewportSize().width <= 780) {
    await page.getByRole("button", { name: "Toggle sidebar", exact: true }).click();
    await page.locator('.sidebar.open[data-drawer-level="documents"] #document-search').waitFor();
  }
}
// Since 0.18.35 editors up to 820px wide keep file actions such as Export and Delete in Document tools.
const toolsHoldFileActions = (page) => page.viewportSize().width <= 820;

function documentTests() {
  test("the Documents tab shows the document in a full-height workspace in both themes", async ({ page }) => {
    await open(page);
    const { width, height } = page.viewportSize();
    const tabs = await page.locator(".tabs [data-view]").evaluateAll((els) => els.map((el) => el.dataset.view));
    expect(tabs.slice(0, 3)).toEqual(["overview", "documents", "planning"]);
    await expect(page.locator("#search,#saved-view,.advanced-filters"), "no task filters").toHaveCount(0);
    await expect(page.locator("#document-form .cm-content")).toContainText("Project brief");
    await chooseMode(page, "Reading");
    await expect(page.locator(".document-reading strong")).toBeVisible();
    await chooseMode(page, "Live preview");
    for (const theme of ["light", "dark"]) {
      await setTheme(page, theme);
      expect(await noHorizontalScroll(page), theme).toBe(true);
      const bounds = await page.locator(".documents-workspace").boundingBox();
      expect(bounds.y + bounds.height <= height + 1 && bounds.height > 600, `${theme} workspace fills the screen ${JSON.stringify(bounds)}`).toBe(true);
      await expect(page.getByRole("complementary", { name: "Document explorer" }), "the explorer waits in the closed sidebar").toBeHidden();
    }
  });

  test("Find a document filters the list, and Back returns to the previous document", async ({ page }) => {
    await open(page);
    await browse(page);
    await openSidebar(page);
    await page.getByLabel("Find a document").fill("Decisions");
    await expect(page.locator("[data-document-open]")).toHaveCount(1);
    await page.locator(`[data-document-open="${app.second.id}"]`).click();
    await expect(title(page)).toHaveText("Meeting notes");
    await page.goBack();
    await expect(title(page)).toHaveText("Project brief");
  });

  test("a new document saves its title, rich text and Markdown, exports, and reloads", async ({ page }) => {
    await open(page);
    await browse(page);
    await openSidebar(page);
    await page.getByRole("button", { name: "New document", exact: true }).first().click();
    await expect(title(page)).toHaveText("Untitled document");
    // Since 0.19.31 a new document opens the Rename panel with its name ready to change.
    await expect(page.getByRole("dialog", { name: "Rename document", exact: true }).getByLabel("Document name", { exact: true })).toHaveValue("Untitled document");
    const name = `Notes ${tag()}`;
    await renameDocument(page, name);
    await expect(title(page)).toHaveText(name);
    await rich(page).fill("First paragraph\nSecond paragraph");
    await expect.poll(async () => (await snapshot()).documents.some((d) => d.title === name && d.body.includes("Second paragraph"))).toBe(true);
    const id = (await snapshot()).documents.find((d) => d.title === name).id;
    await chooseMode(page, "Source");
    const markdown = "## Heading\n\n**Bold** and *italic*.\n\n- One\n- Two\n\n<script>window.badDocument=true</script>";
    await page.getByLabel("Document Markdown", { exact: true }).fill(markdown);
    await expect.poll(async () => (await getDocument(id)).body).toBe(markdown);
    await chooseMode(page, "Live preview");
    await expect(rich(page)).toContainText("Heading");
    expect(await page.evaluate(() => window.badDocument)).toBeUndefined();
    await chooseMode(page, "Reading");
    await expect(page.locator(".document-reading strong")).toBeVisible();
    await chooseMode(page, "Live preview");
    const download = page.waitForEvent("download");
    if (toolsHoldFileActions(page)) await page.getByRole("button", { name: "Document tools", exact: true }).click();
    await page.getByRole("button", { name: "Export Markdown" }).filter({ visible: true }).click();
    await page.keyboard.press("Escape");
    expect(await fs.readFile(await (await download).path(), "utf8")).toBe(markdown);
    await page.reload();
    await page.locator("#document-form").waitFor();
    await expect(title(page)).toHaveText(name);
  });

  test("edits made offline are kept across a reload and saved once back online", async ({ page }) => {
    const doc = await app.store.createDocument(app.project.id, { title: `Offline ${tag()}`, body: "Online text." });
    await open(page, doc.id);
    // Unacknowledged edits remain available after reload and retry automatically.
    await page.route("**/api/projects/*/documents/*", (route) => (route.request().method() === "PATCH" ? route.abort() : route.continue()));
    await rich(page).fill("Offline draft retained");
    await expect(page.locator("[data-document-save]")).toContainText("Waiting");
    await page.reload();
    await page.locator("#document-form").waitFor();
    await expect(rich(page)).toContainText("Offline draft retained");
    await page.unroute("**/api/projects/*/documents/*");
    await expect.poll(async () => (await getDocument(doc.id)).body).toContain("Offline draft retained");
    // Since 0.18.1 the document shows save problems only when action is needed,
    // so a recovered save clears the message instead of saying "Saved automatically".
    await expect(page.locator("[data-document-save]")).toHaveText("");
    await expect(page.locator("[data-document-save-problem]")).toBeHidden();
  });

  test("a conflicting edit keeps the other editor's text until the conflict is resolved", async ({ page }) => {
    const doc = await app.store.createDocument(app.project.id, { title: `Conflict ${tag()}`, body: "Shared text." });
    await open(page, doc.id);
    // Same-field conflicts must not overwrite another editor's changes.
    const base = await getDocument(doc.id);
    await app.store.updateDocument(app.project.id, doc.id, { revision: base.revision, body: "Other editor's text" });
    await rich(page).fill("My conflicting edit");
    await expect(page.locator("[data-document-save]")).toContainText("changed elsewhere");
    expect((await getDocument(doc.id)).body).toBe("Other editor's text");
    await page.locator("[data-document-recovery]").click();
    await page.locator(`[data-feature="resolve-local"][data-url="/projects/${app.project.id}/documents/${doc.id}"]`).click();
    await page.locator('[data-action="dialog-close"]').first().click();
    await expect.poll(async () => (await getDocument(doc.id)).body).toContain("My conflicting edit");
  });

  test("deleting a document moves it to Trash", async ({ page }) => {
    const doc = await app.store.createDocument(app.project.id, { title: `Delete ${tag()}`, body: "To delete." });
    await open(page, doc.id);
    // Since 0.18.35 narrow editors move Delete into Document tools.
    if (toolsHoldFileActions(page)) {
      await page.getByRole("button", { name: "Document tools", exact: true }).click();
      await page.getByRole("dialog", { name: "Document tools", exact: true }).getByRole("button", { name: "Delete document", exact: true }).click();
    } else await page.locator(".document-delete > summary").click();
    await page.getByRole("button", { name: "Move to Trash", exact: true }).click();
    await expect.poll(async () => (await snapshot()).documents.some((d) => d.id === doc.id)).toBe(false);
    expect((await app.store.trash()).some((d) => d.id === doc.id)).toBe(true);
  });

  test("importing a Markdown file creates a document", async ({ page }) => {
    await open(page);
    await browse(page);
    const notes = `Portable notes ${tag()}`;
    await page.locator("#document-import").setInputFiles({ name: "Imported.md", mimeType: "text/markdown", buffer: Buffer.from(`# Imported\n\n${notes}`) });
    await expect.poll(async () => (await snapshot()).documents.some((d) => d.title === "Imported" && d.body.includes(notes))).toBe(true);
  });

  test("another project's Documents view shows none of these documents", async ({ page }) => {
    await page.goto(`${app.base}/#project/${app.other.id}/documents`);
    await page.locator(`.project-link.active[data-id="${app.other.id}"]`).waitFor({ state: "attached" });
    await page.locator(".documents-workspace").waitFor();
    await expect(page.locator("[data-document-open]")).toHaveCount(0);
    expect((await app.store.snapshot(app.other.id)).documents).toHaveLength(0);
  });
}

onDevices(["desktop", "phone"], documentTests);
// A 768px tablet: below the 780px breakpoint, so the document list lives in the drawer.
test.describe("tablet 768", () => {
  test.use({ device: "ipad-portrait", viewportSize: { width: 768, height: 950 } });
  documentTests();
});
