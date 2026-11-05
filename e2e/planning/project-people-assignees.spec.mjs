// Owner request F0.21-72 (people and teams are created in the organisation editor; projects choose their
// people and only a project's people can be assigned), split by tier (F0.22-21) from teams-capacity.spec.mjs.
// Part of the cross-browser release gate.
import { test, expect, useApp } from "../fixtures.mjs";
import { selectSettingsPage, openSettingsPage, settingsSaved } from "../helpers/menu-controls.mjs";
import { newCard } from "../helpers/new-card.mjs";

const today = new Date().toLocaleDateString("en-CA");
const app = useApp(async (store) => {
  const empty = await store.createOrganisation({ title: "New directory" });
  const fresh = await store.createProject({ title: "Team planning", organisation: empty.id });
  const unstaffed = await store.createOrganisation({ title: "Unstaffed", people: [{ id: "alice", name: "Alice", task_capacity: 0 }], teams: [{ id: "design", name: "Design", members: [] }, { id: "crew", name: "Crew", members: ["alice"] }] });
  const membership = await store.createProject({ title: "Membership project", organisation: unstaffed.id, teams: ["design"] });
  return { fresh, membership };
});

test.use({ viewportSize: { width: 1440, height: 1000 } });

test("people and teams are created in the organisation editor, and a project without people offers no assignees", { tag: "@gate" }, async ({ page }) => {
  const project = app.fresh;
  await page.goto(`${app.base}/#project/${project.id}/list`);
  // Settings → Organisation also edits people and teams.
  await openSettingsPage(page, "organisation");
  await page.getByRole("button", { name: "Add person", exact: true }).click();
  await page.getByLabel("Person name", { exact: true }).fill("Alice");
  await page.locator("[data-person-field=task_capacity]").fill("0");
  await page.getByRole("button", { name: "Add team", exact: true }).click();
  await page.getByLabel("Team name", { exact: true }).fill("Design");
  await settingsSaved(page);
  const org = await app.store.getOrganisation(project.organisation);
  expect(org.people[0].task_capacity).toBe(0);
  expect(org.teams[0].members).toEqual([]);
  // A team without members offers nothing to add; the person is there to add on their own.
  await openSettingsPage(page);
  await selectSettingsPage(page, "teams");
  await expect(page.locator("[data-project-person]")).toHaveCount(1);
  await expect(page.locator("[data-project-team-add]")).toHaveCount(0);
  await page.getByRole("button", { name: "Back to project", exact: true }).click();
  await newCard(page);
  await expect(page.locator("#task-form [name=assignee] option")).toHaveText(["Unassigned"]);
  await expect(page.locator("#task-assignee-help")).toHaveText(/No people in this project yet/);
  await page.locator('[data-action="dialog-close"]').click();
});

test("adding a person to the project, with no team, makes them assignable on a new card", { tag: "@gate" }, async ({ page }) => {
  const project = app.membership;
  await page.goto(`${app.base}/#project/${project.id}/list`);
  await openSettingsPage(page);
  await selectSettingsPage(page, "teams");
  const alice = page.getByRole("checkbox", { name: "Alice", exact: true }), people = async () => (await app.store.snapshot(project.id)).project.people;
  await alice.check();
  await settingsSaved(page);
  const org = await app.store.getOrganisation(project.organisation);
  expect(org.teams[0].members, "the team is left as it was").toEqual([]);
  expect(await people()).toEqual([org.people[0].id]);
  await alice.uncheck();
  await expect.poll(people).toEqual([]);
  // A team only ticks its members; the menu is ready for another.
  await page.locator("[data-project-team-add]").selectOption("crew");
  await expect(alice).toBeChecked();
  await expect(page.locator("[data-project-team-add]")).toHaveValue("");
  await expect.poll(people).toEqual([org.people[0].id]);
  await page.getByRole("button", { name: "Back to project", exact: true }).click();
  await newCard(page);
  await expect(page.locator("#task-assignee-help")).toHaveCount(0);
  await page.locator("#task-form [name=title]").fill("Planned work");
  await expect(page.locator("#task-form [name=assignee] option")).toHaveText(["Unassigned", "Alice"]);
  await page.locator("#task-form").getByLabel("Assignee", { exact: true }).selectOption("Alice");
  await page.getByLabel("Due date", { exact: true }).fill(today);
  await page.getByRole("button", { name: "Create card", exact: true }).click();
  await page.locator("dialog").waitFor({ state: "detached" });
  await expect.poll(async () => (await app.store.snapshot(project.id)).tasks[0]?.assignee_id).toBe(org.people[0].id);
});
