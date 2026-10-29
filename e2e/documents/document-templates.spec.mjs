// Owner request, 29 October 2026 (note-taking research, idea 3; Obsidian's Templates):
// documents in a "Templates" folder start new documents from New → From template, with
// {{title}}, {{date}}, {{time}}, {{project}}, {{prompt:…}} and {{cursor}} filled in.
import { test, expect, onDevices, useApp } from "../fixtures.mjs";

const app = useApp(async (store) => {
  let project = await store.createProject({ title: "Templates", key: "TM" });
  project = await store.updateProject(project.id, { revision: project.revision, document_folders: [{ id: "folder-templates", title: "Templates", parent: null }] });
  await store.createDocument(project.id, { title: "Meeting", folder: "folder-templates", body: "# {{title}}\n\nProject: {{project}}\nDate: {{date:D MMMM YYYY}}\nWith: {{prompt:Who}}\n\n{{cursor}}\n\n## Actions" });
  return { project };
});

onDevices(["desktop", "phone"], () => test("New → From template fills in the variables and opens the new document at {{cursor}}", async ({ page, device }) => {
  await page.goto(`${app.base}/#project/${app.project.id}/list`);
  await page.locator(".topbar [data-new-menu] > summary:visible").click();
  await page.getByRole("button", { name: "From template", exact: true }).click();
  await page.getByRole("button", { name: "Meeting", exact: true }).click();
  await page.getByRole("textbox", { name: "Document name", exact: true }).fill(`Standup ${device}`);
  await page.getByRole("textbox", { name: "Who", exact: true }).fill("Sam");
  await page.getByRole("button", { name: "Create document", exact: true }).click();
  await page.locator('.main[data-layout-view="documents"] .cm-content').waitFor();
  const made = (await app.store.snapshot(app.project.id)).documents.find((d) => d.title === `Standup ${device}`);
  expect(made.body).toMatch(new RegExp(`^# Standup ${device}\\n\\nProject: Templates\\nDate: \\d{1,2} [A-Z][a-z]+ \\d{4}\\nWith: Sam\\n\\n\\n\\n## Actions$`));
  expect(made.folder ?? null, "new documents do not land in the Templates folder").toBeNull();
  await expect.poll(() => page.evaluate(async () => {
    const { EditorView } = await import("/vendor/editor/deps.js");
    const view = EditorView.findFromDOM(document.querySelector(".cm-editor"));
    const text = view.state.doc.toString();
    return view.state.selection.main.head === text.indexOf("\n\n## Actions");
  }), "the caret starts where {{cursor}} was").toBe(true);
}));

test("without templates, the panel says how to add them", async ({ page }) => {
  const other = await app.store.createProject({ title: "No templates", key: "NT" });
  await page.goto(`${app.base}/#project/${other.id}/list`);
  await page.locator(".topbar [data-new-menu] > summary:visible").click();
  await page.getByRole("button", { name: "From template", exact: true }).click();
  await expect(page.getByText("folder named Templates")).toBeVisible();
});
