// Owner request, 29 October 2026: documents had three bars (app, document, formatting).
// Formatting and the document's controls now share one bar, without the title; the name
// shows in the top bar and changes through Document tools → Rename.
import { test, expect, onDevices, useApp } from "../fixtures.mjs";
import { openSidebar, clickControl } from "../helpers/menu-controls.mjs";

const app = useApp(async (store) => {
  const project = await store.createProject({ title: "Bars", key: "BA" });
  const doc = await store.createDocument(project.id, { title: "Weekly notes", body: "# Notes\n\nAgenda." });
  return { project, doc };
});
const bar = (page) => page.locator("#document-form .document-heading");
const heading = (page) => page.locator('.topbar [role="heading"]');

onDevices(["desktop", "ipad"], () => test("formatting and document controls share one bar with no title", async ({ page }) => {
  await page.goto(`${app.base}/#project/${app.project.id}/documents/${app.doc.id}`);
  await expect(bar(page).locator(".rich-toolbar")).toBeVisible();
  await expect(bar(page).locator('[data-document-action="tools"]')).toBeVisible();
  await expect(page.locator('#document-form input[name="title"]:not([type=hidden])')).toHaveCount(0);
  await expect(page.locator("#document-form .document-controls")).toHaveCount(0);
  const [format, tools] = await Promise.all([bar(page).locator(".rich-toolbar").boundingBox(), bar(page).locator('[data-document-action="tools"]').boundingBox()]);
  expect(Math.abs(format.y + format.height / 2 - (tools.y + tools.height / 2)), "one row").toBeLessThan(8);
}));

test("Document tools renames the document, and the top bar follows", async ({ page }) => {
  const doc = await app.store.createDocument(app.project.id, { title: "Draft name", body: "Text." });
  await page.goto(`${app.base}/#project/${app.project.id}/documents/${doc.id}`);
  await expect(heading(page)).toHaveText("Draft name");
  await bar(page).locator('[data-document-action="tools"]').click();
  await page.getByRole("button", { name: "Rename", exact: true }).click();
  await page.getByLabel("Document name").fill("Final name");
  await page.getByRole("button", { name: "Rename", exact: true }).click();
  await expect(heading(page)).toHaveText("Final name");
  await expect.poll(async () => (await app.store.snapshot(app.project.id)).documents.find((d) => d.id === doc.id).title).toBe("Final name");
});

test("a new document opens with its name ready to type", async ({ page }) => {
  await page.goto(`${app.base}/#project/${app.project.id}/documents/${app.doc.id}`);
  await openSidebar(page);
  await clickControl(page.locator('.sidebar [data-document-action="create"]').first());
  await expect(page.getByLabel("Document name")).toBeFocused();
});

onDevices(["phone"], () => test("on phones formatting opens in the same bar", async ({ page }) => {
  await page.goto(`${app.base}/#project/${app.project.id}/documents/${app.doc.id}`);
  await expect(bar(page).locator(".document-formatting")).toBeHidden();
  await bar(page).locator('[data-document-action="format-toggle"]').click();
  await expect(bar(page).locator(".document-formatting")).toBeVisible();
  await expect(page.locator("#document-form > .document-heading")).toHaveCount(1);
}));
