// Owner request, 29 October 2026 (note-taking research, idea 6): a personal space outside every
// project, holding documents only, with a Today note in its Daily folder from a "Daily" template.
import { test, expect, onDevices, useApp } from "../fixtures.mjs";
import { openNewDocument } from "../helpers/documents.mjs";

const today = new Date().toLocaleDateString("en-CA");
const app = useApp(async (store) => {
  const project = await store.createProject({ title: "Shared work", key: "SW" });
  await store.createTask(project.id, { title: "Cross-project card" });
  let { project: personal } = await store.personalSpace(process.env.LOCAL_USER_NAME);
  personal = await store.updateProject(personal.id, { revision: personal.revision, document_folders: [{ id: "folder-templates", title: "Templates", parent: null }] });
  await store.createDocument(personal.id, { title: "Daily", folder: "folder-templates", body: "# {{title}}\n\n```tasks\nnot done\ntitle includes Cross-project\n```\n\n{{cursor}}" });
  return { project, personal };
});

onDevices(["desktop", "phone"], () => test("Today opens the day's note in the personal space, which lists cards from other projects", async ({ page, device }) => {
  await page.goto(`${app.base}/#project/${app.project.id}/list`);
  if (device === "phone") await page.locator(".mobile-menu").click();
  const todayButton = page.locator(".sidebar").getByRole("button", { name: "Today", exact: true });
  // A double click still makes one note.
  if (device === "desktop") await todayButton.dblclick(); else await todayButton.click();
  await expect(page.locator(".topbar strong")).toHaveText(today);
  await expect(page.locator(".tabs [data-view]"), "the personal space shows Documents only").toHaveCount(1);
  const row = page.locator(".cm-content [data-document-task-query] .document-task-row");
  await expect(row).toHaveCount(1);
  const snapshot = await app.store.snapshot(app.personal.id);
  const daily = snapshot.project.document_folders.find((f) => f.title === "Daily");
  expect(snapshot.documents.filter((d) => d.title === today && d.folder === daily.id), "one note per day, in Daily").toHaveLength(1);
  expect(snapshot.documents.find((d) => d.title === today).body).toContain("```tasks");
  await row.getByRole("button", { name: /Cross-project card/ }).click();
  await expect(page.locator("#task-form [name=title]")).toHaveValue("Cross-project card");
}));

test("the personal space stays out of organisation project lists", async ({ page }) => {
  await page.goto(`${app.base}/#project/${app.project.id}/list`);
  await expect(page.locator(".project-links")).toContainText("Shared work");
  await expect(page.locator(".project-links")).not.toContainText("Personal");
  await page.locator(".sidebar").getByRole("button", { name: "Personal", exact: true }).click();
  await expect(page.locator(".topbar strong")).toHaveText("Personal");
  await expect(page.locator(".documents-workspace")).toBeVisible();
});

test("ticking a card from another project completes it in that project", async ({ page }) => {
  const task = await app.store.createTask(app.project.id, { title: "Tick me across" });
  await openNewDocument(page, app, app.personal.id, { body: "```tasks\nnot done\ntitle includes Tick me across\n```\n" });
  await page.getByRole("checkbox", { name: "Done: Tick me across" }).click();
  await expect.poll(async () => (await app.store.snapshot(app.project.id)).tasks.find((t) => t.id === task.id).status).toBe("done");
  await expect(page.getByText("No matching cards.")).toBeVisible();
});
