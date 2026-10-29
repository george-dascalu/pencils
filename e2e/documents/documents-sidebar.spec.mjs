// Owner request, 28 October 2026 (mobile sidebar assessment): Documents no
// longer has a second sidebar. On iPad and desktop the document tree sits in
// the main sidebar under the projects while Documents is open; on phones the
// Documents tile drills the drawer down to the same tree, with a way back.
import { test, expect, onDevices, useApp } from "../fixtures.mjs";

const app = useApp(async (store) => {
  const project = await store.createProject({ title: "Docs sidebar", key: "DSB" });
  await store.createTask(project.id, { title: "A task", status: "todo" });
  const notes = await store.createDocument(project.id, { title: "Meeting notes", body: "# Meeting notes\n\nAgenda." });
  await store.createDocument(project.id, { title: "Project brief", body: "# Brief\n\nScope." });
  return { project, notes };
});
const base = () => `${app.base}/#project/${app.project.id}`;
const heading = (page) => page.locator('.topbar [role="heading"]');
const shown = (page, selector) => page.locator(selector).evaluateAll((els) => els.filter((el) => el.getClientRects().length && getComputedStyle(el).visibility !== "hidden").length);

onDevices(["desktop", "ipad-portrait"], () => test("the document tree sits in the main sidebar, with no second column", async ({ page }) => {
  await page.goto(`${base()}/documents/${app.notes.id}`);
  await page.locator(".documents-workspace #document-form").waitFor();
  const tree = page.locator(".sidebar .sidebar-documents");
  await tree.locator("[data-document-open]").first().waitFor();
  await expect(tree.locator("[data-document-open]")).toHaveText(["Meeting notes", "Project brief"]);
  await expect(page.locator(".documents-workspace .document-explorer"), "no explorer column in the workspace").toHaveCount(0);
  expect(await shown(page, '.document-heading [data-document-action="browse"]'), "no second menu button").toBe(0);
  // The tree follows the projects in the sidebar.
  const [projects, docs] = await Promise.all([page.locator(".sidebar .project-links").boundingBox(), tree.boundingBox()]);
  expect(docs.y, "documents follow the projects").toBeGreaterThanOrEqual(projects.y + projects.height - 1);
  // Opening another document from the sidebar.
  await tree.locator("[data-document-open]", { hasText: "Project brief" }).click();
  await expect(heading(page)).toHaveText("Project brief");
  await expect(tree.locator('[data-document-open][aria-current="page"]')).toHaveText("Project brief");
  // Search filters the sidebar tree.
  await tree.locator("#document-search").fill("brief");
  await expect(tree.locator("[data-document-open]")).toHaveText(["Project brief"]);
}));

test("other views hide the document tree", async ({ page }) => {
  await page.goto(`${base()}/documents/${app.notes.id}`);
  await page.locator(".sidebar .sidebar-documents [data-document-open]").first().waitFor();
  await page.goto(`${base()}/list`);
  await page.locator(".task-row").first().waitFor();
  expect(await shown(page, ".sidebar .sidebar-documents")).toBe(0);
});

test("New document and New folder live in the sidebar tree", async ({ page }) => {
  // A project of its own, so the new document does not change the lists the other tests check.
  const project = await app.store.createProject({ title: "Docs sidebar new", key: "DSN" });
  const doc = await app.store.createDocument(project.id, { title: "Meeting notes", body: "# Meeting notes\n\nAgenda." });
  await page.goto(`${app.base}/#project/${project.id}/documents/${doc.id}`);
  const tree = page.locator(".sidebar .sidebar-documents");
  await tree.locator('[data-document-action="create"]').click();
  await expect(heading(page)).toHaveText("Untitled document");
  await expect(tree.locator("[data-document-open]", { hasText: "Untitled document" })).toHaveCount(1);
  await expect(tree.locator('[data-document-action="new-folder"]')).toHaveCount(1);
});

onDevices(["phone"], () => {
  test("phones have one menu button; the drawer opens on the document list in Documents", async ({ page }) => {
    await page.goto(`${base()}/documents/${app.notes.id}`);
    await page.locator(".documents-workspace #document-form").waitFor();
    expect(await shown(page, '.document-heading [data-document-action="browse"]'), "no menu button in the document heading").toBe(0);
    await page.locator(".mobile-menu").click();
    await page.locator(".sidebar.open").waitFor();
    await expect(page.locator(".sidebar")).toHaveAttribute("data-drawer-level", "documents");
    await expect.poll(() => shown(page, ".sidebar .sidebar-documents [data-document-open]"), "the document list shows").toBeGreaterThanOrEqual(2);
    expect(await shown(page, ".sidebar .phone-project-navigation"), "the view tiles wait on the first level").toBe(0);
    // Back returns to the menu.
    await page.locator(".sidebar [data-drawer-back]").click();
    await expect(page.locator(".sidebar")).toHaveAttribute("data-drawer-level", "menu");
    await expect.poll(() => shown(page, ".sidebar .phone-project-navigation")).toBeGreaterThan(0);
    await expect.poll(() => shown(page, ".sidebar .sidebar-documents")).toBe(0);
  });

  test("from another view, the Documents tile drills down and a document opens", async ({ page }) => {
    await page.goto(`${base()}/list`);
    await page.locator(".task-row").first().waitFor();
    await page.locator(".mobile-menu").click();
    await page.locator(".sidebar.open").waitFor();
    const tile = page.locator('.sidebar .phone-project-navigation [data-view="documents"]');
    await expect(tile.locator(".drawer-tile-more svg"), "the tile shows it leads somewhere").toHaveCount(1);
    await tile.click();
    await page.locator(".sidebar .sidebar-documents [data-document-open]").first().waitFor();
    await expect(page.locator(".sidebar.open"), "the drawer stays open on the document list").toHaveCount(1);
    await page.locator(".sidebar .sidebar-documents [data-document-open]", { hasText: "Project brief" }).click();
    await expect(page.locator(".sidebar.open")).toHaveCount(0);
    await expect(heading(page)).toHaveText("Project brief");
  });
});
