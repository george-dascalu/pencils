// Owner request, 29 October 2026: personal, organisation and project settings share one
// full page, opened from a single Settings button in the top bar (and the phone drawer).
// Without an open project the page shows your own and the organisation's sections.
import { test, expect, onDevices, useApp } from "../fixtures.mjs";
import { openSettingsPage, openSidebar } from "../helpers/menu-controls.mjs";

const app = useApp(async (store) => ({
  project: await store.createProject({ title: "Settings lab", key: "SL" }),
  organisation: (await store.organisations?.())?.[0],
  other: await store.createOrganisation({ title: "Second org" }),
}));
const nav = (page) => page.locator(".settings-navigation nav");

onDevices(["desktop", "ipad"], () => test("one top bar button opens a full Settings page with You, Project and Organisation", async ({ page }) => {
  await page.goto(`${app.base}/#project/${app.project.id}/list`);
  await expect(page.locator(".sidebar [data-action=settings]")).toHaveCount(1);
  await expect(page.locator(".topbar .avatar, .topbar [data-personal=settings]")).toHaveCount(0);
  await openSettingsPage(page);
  await expect(page.locator(".settings-navigation h1")).toHaveText("Settings");
  await expect(page.locator("dialog[open]")).toHaveCount(0);
  for (const group of ["You", "Project", "Organisation"]) await expect(nav(page).locator(".settings-nav-group", { hasText: group })).toHaveCount(1);
  await nav(page).getByText("Appearance & workspace").click();
  await page.getByLabel("Dark").check();
  await expect.poll(() => page.evaluate(() => window.PencilsAppearance.read().theme)).toBe("dark");
  await page.getByLabel("Light").check();
}));

test("the organisation is edited on the Settings page", async ({ page }) => {
  await page.goto(`${app.base}/#project/${app.project.id}/settings/organisation`);
  const name = page.locator('#organisation-form [name="title"]');
  await expect(name).toBeVisible();
  await expect(page.locator("dialog[open]")).toHaveCount(0);
  const original = await name.inputValue();
  await name.fill("Renamed organisation");
  await page.locator("#organisation-form [type=submit]").click();
  await expect(page.locator("#toasts")).toContainText("Organisation saved.");
  await expect.poll(async () => (await (await fetch(`${app.base}/api/organisations`)).json()).organisations.map((o) => o.title)).toContain("Renamed organisation");
  await name.fill(original);
  await page.locator("#organisation-form [type=submit]").click();
});

test("without a project open, Settings shows You and Organisation", async ({ page }) => {
  await page.goto(`${app.base}/#home`);
  await openSettingsPage(page);
  await expect(page.locator(".settings-navigation h1")).toHaveText("Settings");
  await expect(nav(page).locator("a")).toHaveText(["Appearance & workspace", "Organisation"]);
  await page.locator("[data-action=settings-close]").click();
  await expect(page.locator(".settings-navigation")).toHaveCount(0);
});

test("without a project, unsaved organisation edits ask before leaving Settings", async ({ page }) => {
  await page.goto(`${app.base}/#home`);
  await openSettingsPage(page);
  await nav(page).locator("a", { hasText: "Organisation" }).click();
  await page.locator('#organisation-form [name="title"]').fill("Unsaved name");
  let asked = "";
  page.once("dialog", (dialog) => { asked = dialog.message(); dialog.dismiss(); });
  await page.locator("[data-action=settings-close]").click();
  await expect.poll(() => asked).toContain("Discard unsaved changes");
  await expect(page.locator('#organisation-form [name="title"]')).toHaveValue("Unsaved name");
});

test("switching organisation from Settings without a project opens that organisation", async ({ page }) => {
  await page.goto(`${app.base}/#home`);
  await openSettingsPage(page);
  await expect(page.locator(".settings-navigation h1")).toHaveText("Settings");
  await openSidebar(page);
  await page.locator("#organisation-select").selectOption(app.other.id);
  await expect(page.locator("#organisation-select")).toHaveValue(app.other.id);
  await expect(page.locator(".sidebar [data-action=settings]")).not.toHaveAttribute("aria-current", "page");
});

onDevices(["phone"], () => test("the phone drawer opens Settings from its settings row", async ({ page }) => {
  await page.goto(`${app.base}/#project/${app.project.id}/list`);
  await page.locator(".mobile-menu").click();
  const row = page.locator(".sidebar .phone-drawer-utilities");
  await expect(row.locator("button")).toHaveText(["Settings", "Roadmap", "Help"]);
  await row.getByRole("button", { name: "Settings" }).click();
  await expect(page.locator("#settings-page-title")).toBeVisible();
}));

// Saving the organisation's name kept wiping its people and teams (or failed when a project
// used a team): the details form now leaves them alone.
test("saving the organisation's details keeps its people and teams", async ({ page }) => {
  const organisation = await app.store.createOrganisation({ title: "Staffed", people: [{ id: "alice", name: "Alice", task_capacity: 0 }], teams: [{ id: "design", name: "Design", members: ["alice"] }] });
  const project = await app.store.createProject({ title: "Staffed project", organisation: organisation.id, teams: ["design"] });
  await page.goto(`${app.base}/#project/${project.id}/settings/organisation`);
  await page.locator('#organisation-form [name="body"]').fill("A team that makes things.");
  await page.locator("#organisation-form [type=submit]").click();
  await expect(page.locator("#toasts")).toContainText("Organisation saved.");
  const saved = (await (await fetch(`${app.base}/api/organisations`)).json()).organisations.find((o) => o.id === organisation.id);
  expect(saved.people.map((p) => p.name)).toEqual(["Alice"]);
  expect(saved.teams.map((t) => t.name)).toEqual(["Design"]);
});
