// Auto-assign (F0.22-25): Settings → Project → People chooses a person the project's new cards
// start assigned to. The new card form shows them and can still be changed; a card made without
// the form, such as a quick child or quick capture, is assigned too; Nobody, or taking the person
// out of the project, turns it off.
import { test, expect, useApp } from "../fixtures.mjs";
import { selectSettingsPage, openSettingsPage, settingsSaved } from "../helpers/menu-controls.mjs";
import { newCard } from "../helpers/new-card.mjs";

const app = useApp(async (store) => {
  const org = await store.createOrganisation({ title: "Studio", people: [{ id: "alice", name: "Alice" }, { id: "bob", name: "Bob" }] });
  const project = await store.createProject({ title: "Auto", organisation: org.id, people: ["alice", "bob"] });
  return { project };
});

const schema = async () => (await app.store.snapshot(app.project.id)).project.schema;
const quickCard = async (page, title) =>
  (await (await page.request.post(`${app.base}/api/projects/${app.project.id}/tasks`, { data: { title } })).json()).assignee;

test("new cards start with the project's auto-assignee until it is set to Nobody", async ({ page }) => {
  await page.goto(`${app.base}/#project/${app.project.id}/list`);
  await openSettingsPage(page);
  await selectSettingsPage(page, "teams");
  const setting = page.getByRole("combobox", { name: "Auto-assign new cards", exact: true });
  await expect(setting).toHaveValue("");
  await setting.selectOption({ label: "Bob" });
  await settingsSaved(page);
  expect((await schema()).default_assignee).toBe("bob");
  expect(await quickCard(page, "Quick")).toBe("Bob");
  await page.getByRole("button", { name: "Back to project", exact: true }).click();
  await newCard(page);
  await expect(page.locator("#task-form [name=assignee]")).toHaveValue("Bob");
  await page.locator("[data-action=dialog-close]").first().click();
  await openSettingsPage(page);
  await selectSettingsPage(page, "teams");
  await setting.selectOption({ label: "Nobody" });
  await settingsSaved(page);
  expect((await schema()).default_assignee).toBeUndefined();
  expect(await quickCard(page, "Later")).toBe("");
  // Taking the person out of the project clears the setting too.
  await setting.selectOption({ label: "Alice" });
  await settingsSaved(page);
  expect((await schema()).default_assignee).toBe("alice");
  await page.locator('[data-project-person="alice"]').uncheck();
  await settingsSaved(page);
  await expect.poll(async () => (await schema()).default_assignee).toBeUndefined();
});
