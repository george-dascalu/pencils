// Owner request (F0.22-75): Settings → Statuses & workflow chooses what the New card form shows. The
// title always shows; what's left out keeps its default and can be edited once the card exists.
import { test, expect, useApp } from "../fixtures.mjs";
import { settingsSaved } from "../helpers/menu-controls.mjs";
import { newCard } from "../helpers/new-card.mjs";
import { chooseCardSection } from "../helpers/card-panes.mjs";

const app = useApp(async (store) => ({ project: await store.createProject({ title: "Quick cards", key: "QC", schema: { off: ["tags"] } }) }));
const schema = async () => (await app.store.snapshot(app.project.id)).project.schema;
const url = (view) => `${app.base}/#project/${app.project.id}/${view}`;
// Each part of the card editor, by what shows it.
const parts = (form) => ({
  priority: form.locator('[data-task-picker="priority"]'),
  description: form.locator(".task-description .inline-rich"),
  attachments: form.locator(".task-attachments"),
  notes: form.locator(".task-notes"),
  relationships: form.locator(".task-relationships"),
  status: form.locator('select[name="status"]'),
});

test("the New card form shows only the parts the project chose, and the card editor shows them all", async ({ page }) => {
  await page.goto(url("settings/workflow"));
  const group = page.getByRole("group", { name: "New card form", exact: true });
  // A card field that's off (Tags) isn't offered.
  await expect(group.locator("label")).toHaveText(["Card type", "Assignee", "Status", "Priority", "Dates", "Description", "Attachments", "Notes", "Relationships", "Documents", "Boards"]);
  for (const name of ["Priority", "Description", "Notes", "Relationships"]) await group.getByRole("checkbox", { name, exact: true }).uncheck();
  await settingsSaved(page);
  await expect.poll(async () => (await schema()).create_off).toEqual(["priority", "description", "notes", "relationships"]);

  await page.goto(url("list"));
  await newCard(page);
  const form = page.locator("#task-form");
  await expect(form.locator('[name="title"]')).toBeVisible();
  const create = parts(form);
  for (const name of ["priority", "description", "notes", "relationships"]) await expect(create[name], name).toBeHidden();
  for (const name of ["attachments", "status"]) await expect(create[name], name).toBeVisible();
  await form.locator('[name="title"]').fill("Quick one");
  await form.getByRole("button", { name: "Create card", exact: true }).click();
  await expect(page.locator(".task-row", { hasText: "Quick one" })).toBeVisible();
  // What the form left out keeps its default.
  const card = (await app.store.snapshot(app.project.id)).tasks.find((t) => t.title === "Quick one");
  expect(card.priority).toBe("medium");

  // With every section left out, nothing is left under the fields: no empty section, no divider.
  await app.store.updateProject(app.project.id, { revision: (await app.store.snapshot(app.project.id)).project.revision, schema: { ...(await schema()), create_off: ["description", "attachments", "notes", "relationships", "documents", "boards"] } });
  await page.reload();
  await newCard(page);
  await expect(page.locator("#task-form .task-description")).toBeHidden();
  await expect(page.locator("#task-form .task-metadata")).toHaveCSS("border-bottom-width", "0px");
  await page.keyboard.press("Escape");
  await expect(page.locator("#task-form")).toHaveCount(0);
  // Once the card exists, its editor shows everything.
  await page.locator(".task-row", { hasText: "Quick one" }).locator(".task-id").click();
  const edit = parts(page.locator("#task-form"));
  for (const name of ["priority", "description", "status"]) await expect(edit[name], name).toBeVisible();
  // Its sections share a row of tabs on desktop (F0.23-10): every one of them is there.
  await expect(page.locator("#task-form").getByRole("tab")).toHaveText(["Attachments", "Notes", "Relationships", "Documents", "Boards"]);
  for (const name of ["Attachments", "Notes", "Relationships"]) await chooseCardSection(page, name);
});

test("left out of the form, the card's attachments take no dropped files and leave notes' own; nothing empty is left", async ({ page }) => {
  const project = await app.store.createProject({ title: "Slim cards", key: "SC", schema: { off: ["tags"], views_off: ["documents"], create_off: ["assignee", "status", "priority", "dates", "attachments"] } });
  await page.goto(`${app.base}/#project/${project.id}/settings/workflow`);
  // A part whose view is off (Documents) isn't offered either.
  await expect(page.getByRole("group", { name: "New card form", exact: true }).locator("label")).not.toContainText(["Documents"]);
  await page.goto(`${app.base}/#project/${project.id}/list`);
  await newCard(page);
  const form = page.locator("#task-form");
  await expect(form.locator('[name="title"]')).toBeVisible();
  // No fields left: no empty band where they were.
  await expect(form.locator(".task-metadata")).toBeHidden();
  await expect(form.locator(".task-description > .task-attachments")).toBeHidden();
  await expect(form.locator(".task-description .inline-rich")).toBeVisible();
  // A note keeps its own attachments (shown once it has a file): the form's rule leaves them alone.
  await form.getByRole("button", { name: "New note", exact: true }).click();
  const noteFiles = form.locator(".task-notes .task-attachments").first();
  await noteFiles.evaluate((el) => { el.hidden = false; });
  await expect(noteFiles).toBeVisible();
  // A file dropped on the form isn't taken.
  const transfer = await page.evaluateHandle(() => { const t = new DataTransfer(); t.items.add(new File(["hello"], "hello.txt", { type: "text/plain" })); return t; });
  await form.locator(".task-description .inline-rich").dispatchEvent("dragenter", { dataTransfer: transfer });
  await expect(page.locator(".task-dialog > .task-file-drop-overlay")).toBeHidden();
  await form.locator(".task-description .inline-rich").dispatchEvent("drop", { dataTransfer: transfer });
  // An upload would say so at once.
  await expect(form.locator(".task-description > .task-attachment-status")).not.toHaveText(/Attaching|attached/);
  await expect(form.locator(".task-description .task-attachment-list > li")).toHaveCount(0);
});
