// Document folders are organised by dragging: a folder moves with its whole tree,
// onto another folder (which opens to show it) or the root. Invalid drops (onto
// itself, a descendant, or where it already is) neither highlight nor save, and
// leaving or cancelling a drag clears the highlight. Duplicate names and failed
// saves leave folders where they were, and open edits survive a move. Edit
// folder offers the same choices without dragging, on desktop and phones.
import { test, expect, startApp } from "../fixtures.mjs";
import { setTheme, noHorizontalScroll } from "../helpers/documents.mjs";

test.use({ viewportSize: { width: 1500, height: 1000 } });
// A server and vault per test: each starts from the same folders, with one project in the
// sidebar so the document tree has room (drags must not scroll the tree under the pointer).
let app;
test.beforeEach(async () => { app = await startApp("folder-drag"); });
test.afterEach(async () => app.close());

// Research › Meetings › Decisions (holding "Meeting notes"), Archive, and a second "Meetings".
async function seed({ researchParent = null } = {}) {
  let project = await app.store.createProject({ title: "Folder organisation" });
  project = await app.store.updateProject(project.id, {
    revision: project.revision,
    document_folders: [
      { id: "research", title: "Research", parent: researchParent },
      { id: "meetings", title: "Meetings", parent: "research" },
      { id: "deep", title: "Decisions", parent: "meetings" },
      { id: "archive", title: "Archive", parent: null },
      { id: "duplicate", title: "Meetings", parent: null },
    ],
  });
  const doc = await app.store.createDocument(project.id, { title: "Meeting notes", body: "# Notes\n\nKeep these notes.", folder: "deep" });
  const loose = await app.store.createDocument(project.id, { title: "Loose notes", body: "To file." });
  const parent = async (id) => (await app.store.snapshot(project.id)).project.document_folders.find((f) => f.id === id).parent;
  return { project, doc, loose, parent };
}
async function open(page, { project, doc }) {
  await page.goto(`${app.base}/#project/${project.id}/documents/${doc.id}`);
  await page.locator(".cm-content").waitFor();
}
const folder = (page, id) => page.locator(`[data-document-folder="${id}"]`);
const target = (page, id) => page.locator(`[data-document-folder-drop="${id}"]`);
async function syntheticDrag(page, id) {
  const transfer = await page.evaluateHandle(() => new DataTransfer());
  await folder(page, id).dispatchEvent("dragstart", { dataTransfer: transfer });
  return transfer;
}

test("dragging a folder moves its whole tree into a collapsed folder and opens it", async ({ page }) => {
  const s = await seed();
  await open(page, s);
  await expect(folder(page, "research")).toHaveAttribute("draggable", "true");
  await folder(page, "archive").click();
  await expect(folder(page, "archive")).toHaveAttribute("aria-expanded", "false");
  await folder(page, "research").dragTo(folder(page, "archive"));
  await expect.poll(() => s.parent("research")).toBe("archive");
  await expect(folder(page, "archive")).toHaveAttribute("aria-expanded", "true");
  expect(await s.parent("meetings")).toBe("research");
  expect(await s.parent("deep")).toBe("meetings");
  await expect(target(page, "archive").locator("..").locator("[data-document-open]")).toHaveCount(1);
  const doc = await app.store.getDocument(s.project.id, s.doc.id);
  expect(doc.revision, "moving folders does not touch the documents").toBe(s.doc.revision);
  expect(doc.file).toBe(s.doc.file);
});

test("the root is a drop target, and the move survives a reload", async ({ page }) => {
  const s = await seed({ researchParent: "archive" });
  await open(page, s);
  await folder(page, "research").dragTo(page.locator("[data-document-root]"));
  await expect.poll(() => s.parent("research")).toBeNull();
  await page.reload();
  await page.locator(".cm-content").waitFor();
  await expect(page.locator('#document-list > li > [data-document-folder-drop="research"]')).toHaveCount(1);
});

test("invalid destinations neither highlight nor save", async ({ page }) => {
  const s = await seed();
  await open(page, s);
  let projectWrites = 0;
  page.on("request", (req) => { if (req.method() === "PATCH" && req.url().endsWith(`/api/projects/${s.project.id}`)) projectWrites++; });
  // Itself, its descendants, and the root it already sits in.
  for (const destination of ["research", "meetings", "deep", ""]) {
    const transfer = await syntheticDrag(page, "research");
    await target(page, destination).dispatchEvent("dragover", { dataTransfer: transfer });
    await expect(page.locator(".document-drop-target"), destination || "root").toHaveCount(0);
    await target(page, destination).dispatchEvent("drop", { dataTransfer: transfer });
    await folder(page, "research").dispatchEvent("dragend", { dataTransfer: transfer });
    await transfer.dispose();
  }
  // Any save would have been sent straight away; let one slip in before counting.
  await page.waitForTimeout(300);
  expect(projectWrites).toBe(0);
  expect(await s.parent("research")).toBeNull();
});

test("leaving or cancelling a valid drag clears the highlight", async ({ page }) => {
  const s = await seed();
  await open(page, s);
  const transfer = await syntheticDrag(page, "research");
  await target(page, "archive").dispatchEvent("dragover", { dataTransfer: transfer });
  await expect(target(page, "archive")).toHaveClass(/document-drop-target/);
  await page.locator(".document-editor").dispatchEvent("dragover", { dataTransfer: transfer });
  await expect(page.locator(".document-drop-target")).toHaveCount(0);
  await target(page, "archive").dispatchEvent("dragover", { dataTransfer: transfer });
  await folder(page, "research").dispatchEvent("dragend", { dataTransfer: transfer });
  await expect(page.locator(".document-drop-target")).toHaveCount(0);
  await transfer.dispose();
});

test("documents still drag into folders", async ({ page }) => {
  const s = await seed();
  await open(page, s);
  await page.locator(`[data-document-open="${s.loose.id}"]`).dragTo(folder(page, "archive"));
  await expect.poll(async () => (await app.store.getDocument(s.project.id, s.loose.id)).folder).toBe("archive");
});

test("a duplicate folder name is refused with a message, leaving folders in place", async ({ page }) => {
  const s = await seed();
  await open(page, s);
  await folder(page, "duplicate").dragTo(folder(page, "research"));
  await page.locator("#toasts").getByText("A folder with this name already exists here.", { exact: true }).waitFor();
  expect(await s.parent("duplicate")).toBeNull();
  expect(await s.parent("meetings")).toBe("research");
});

test("a failed save moves nothing, and a later attempt succeeds", async ({ page }) => {
  const s = await seed();
  await open(page, s);
  const route = `**/api/projects/${s.project.id}`;
  await page.route(route, (request) => request.request().method() === "PATCH"
    ? request.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "Could not save this folder move. Try again." }) })
    : request.continue());
  await folder(page, "research").dragTo(folder(page, "archive"));
  await page.locator("#toasts").getByText("Could not save this folder move. Try again.", { exact: true }).waitFor();
  expect(await s.parent("research")).toBeNull();
  await page.unroute(route);
  await folder(page, "research").dragTo(folder(page, "archive"));
  await expect.poll(() => s.parent("research")).toBe("archive");
});

test("moving a folder while editing keeps the editor and Markdown intact", async ({ page }) => {
  const s = await seed();
  await open(page, s);
  await page.getByRole("button", { name: "Source", exact: true }).click();
  const revised = "# Notes\n\nKeep these notes.\n\nAn unsaved thought.";
  await page.locator(".cm-content").fill(revised);
  await folder(page, "research").dragTo(folder(page, "archive"));
  await expect.poll(() => s.parent("research")).toBe("archive");
  await expect.poll(async () => (await app.store.getDocument(s.project.id, s.doc.id)).body).toBe(revised);
  expect((await page.locator(".cm-line").allTextContents()).join("\n")).toBe(revised);
  expect((await app.store.getDocument(s.project.id, s.doc.id)).folder).toBe("deep");
});

test("Edit folder offers the same destinations, without descendants, on desktop and phone widths", async ({ page }) => {
  const s = await seed({ researchParent: "archive" });
  await open(page, s);
  for (const width of [1500, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    // At phone width the document list is the drawer's Documents level (0.19.27).
    if (width === 390) await page.locator(".mobile-menu").click();
    await page.getByRole("button", { name: "Edit Research folder", exact: true }).click();
    const panel = page.getByRole("dialog", { name: "Edit folder", exact: true });
    const values = await panel.locator('select[name="parent"] option').evaluateAll((els) => els.map((el) => el.value));
    for (const id of ["research", "meetings", "deep"]) expect(values, `${width}: no ${id}`).not.toContain(id);
    expect(values).toEqual(expect.arrayContaining(["", "archive"]));
    expect(await noHorizontalScroll(page), `${width} fits`).toBe(true);
    if (width === 390) {
      await setTheme(page, "dark");
      await panel.locator("select").selectOption("");
      await panel.getByRole("button", { name: "Save", exact: true }).click();
      await expect.poll(() => s.parent("research")).toBeNull();
    } else await page.keyboard.press("Escape");
  }
});
