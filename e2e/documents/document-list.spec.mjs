// Owner request, 28 October 2026 (mobile sidebar assessment): Documents has no second sidebar or
// column. Since 0.20.96 (T25) the document tree has a page of its own (list-panel.js), opened from
// the open Documents tab or, on touch screens, the tray's Documents button; list-panel.spec.mjs
// covers its size, blur and closing.
import { test, expect, onDevices, useApp } from "../fixtures.mjs";
import { openList } from "../helpers/menu-controls.mjs";

const app = useApp(async (store) => {
  const project = await store.createProject({ title: "Docs sidebar", key: "DSB" });
  await store.createTask(project.id, { title: "A task", status: "todo" });
  const notes = await store.createDocument(project.id, { title: "Meeting notes", body: "# Meeting notes\n\nAgenda." });
  await store.createDocument(project.id, { title: "Project brief", body: "# Brief\n\nScope." });
  return { project, notes };
});
const base = () => `${app.base}/#project/${app.project.id}`;
const heading = (page) => page.locator('.topbar [role="heading"]');
const tree = (page) => page.locator("#list-panel");

onDevices(["desktop", "ipad-portrait"], () => test("the document tree has a page of its own, with no second column", async ({ page }) => {
  await page.goto(`${base()}/documents/${app.notes.id}`);
  await page.locator(".documents-workspace #document-form").waitFor();
  await openList(page);
  await expect(tree(page).locator("[data-document-open]")).toHaveText(["Meeting notes", "Project brief"]);
  await expect(page.locator(".documents-workspace .document-explorer"), "no explorer column in the workspace").toHaveCount(0);
  await expect(page.locator(".sidebar .document-explorer"), "none in the sidebar").toHaveCount(0);
  // Opening another document from the list.
  await tree(page).locator("[data-document-open]", { hasText: "Project brief" }).click();
  await expect(heading(page)).toHaveText("Project brief");
  await openList(page);
  await expect(tree(page).locator('[data-document-open][aria-current="page"]')).toHaveText("Project brief");
  // Search filters the tree.
  await tree(page).locator("#document-search").fill("brief");
  await expect(tree(page).locator("[data-document-open]")).toHaveText(["Project brief"]);
}));

test("other views have no document list", async ({ page }) => {
  await page.goto(`${base()}/documents/${app.notes.id}`);
  await openList(page);
  await page.goto(`${base()}/list`);
  await page.locator(".task-row").first().waitFor();
  await expect(page.locator("#list-panel")).toBeHidden();
  await expect(page.locator("#list-panel [data-document-open]")).toHaveCount(0);
});

test("New document and New folder live in the document list", async ({ page }) => {
  // A project of its own, so the new document does not change the lists the other tests check.
  const project = await app.store.createProject({ title: "Docs sidebar new", key: "DSN" });
  const doc = await app.store.createDocument(project.id, { title: "Meeting notes", body: "# Meeting notes\n\nAgenda." });
  await page.goto(`${app.base}/#project/${project.id}/documents/${doc.id}`);
  await openList(page);
  await expect(tree(page).locator('[data-document-action="new-folder"]')).toHaveCount(1);
  await tree(page).locator('[data-document-action="create"]').click();
  await expect(heading(page)).toHaveText("Untitled document");
  await openList(page);
  await expect(tree(page).locator("[data-document-open]", { hasText: "Untitled document" })).toHaveCount(1);
});

onDevices(["phone"], () => {
  test("from another view, the Documents tab opens Documents and a second tap lists them from its tray", async ({ page }) => {
    await page.goto(`${base()}/list`);
    await page.locator(".task-row").first().waitFor();
    const tab = page.locator('.topbar .tabs [data-view="documents"]');
    await tab.click();
    await page.locator('#document-form .cm-content').waitFor();
    await tab.click();
    await page.locator(".layout-tray[data-open]").getByRole("button", { name: "Documents", exact: true }).click();
    await expect(tree(page)).toBeVisible();
    await expect(page.locator(".sidebar.open"), "no drawer").toHaveCount(0);
    await tree(page).locator("[data-document-open]", { hasText: "Project brief" }).click();
    await expect(tree(page)).toBeHidden();
    await expect(heading(page)).toHaveText("Project brief");
  });
});
