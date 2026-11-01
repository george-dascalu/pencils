// Owner request, 31 October 2026: people and teams have one home, Settings → Organisation. The
// sidebar has no Teams section, the old Teams and People links open that section, and Capacity's
// empty state goes there.
import { test, expect, onDevices, useApp } from "../fixtures.mjs";
import { openSidebar, settingsSaved } from "../helpers/menu-controls.mjs";

const app = useApp(async (store) => {
  const project = await store.createProject({ title: "People home" });
  const organisation = await store.createOrganisation({ title: "Draft organisation", people: [{ id: "george", name: "George" }], teams: [] });
  const first = await store.createProject({ title: "First", organisation: organisation.id });
  const second = await store.createProject({ title: "Second", organisation: organisation.id });
  return { project, organisation, first, second };
});

onDevices(["desktop", "phone"], () => test("the sidebar has no Teams section", async ({ page, device }) => {
  await page.goto(`${app.base}/#project/${app.project.id}/list`);
  await openSidebar(page);
  await expect(page.locator(".sidebar .project-switch")).toBeVisible();
  await expect(page.locator(".sidebar :is(.sidebar-directory, [data-page=teams], [data-page=people])"), device).toHaveCount(0);
}));

for (const kind of ["teams", "people"])
  test(`an old ${kind} link opens Settings → Organisation`, async ({ page }) => {
    await page.goto(`${app.base}/#organisation/${app.project.organisation}/${kind}`);
    await expect(page.locator("#settings-page-title")).toHaveText("Organisation");
    await expect(page.getByRole("button", { name: "Add person", exact: true })).toBeVisible();
    await expect(page).toHaveURL(/#organisation\/[^/]+\/settings\/organisation$/);
  });

test("Capacity without teams sends you to Settings → Organisation", async ({ page }) => {
  await page.goto(`${app.base}/#project/${app.project.id}/capacity`);
  await page.getByRole("button", { name: "People and teams", exact: true }).click();
  await expect(page.locator("#settings-page-title")).toHaveText("Organisation");
});

// The draft belongs to the organisation, so its other projects offer it too; Settings save as they
// change, so restoring it saves it.
test("an unsaved People edit is offered in the organisation's other projects and saved once restored", async ({ page }) => {
  const name = page.locator('[data-person="george"] [data-person-field=name]');
  const stored = async () => (await app.store.getOrganisation(app.organisation.id)).people[0].name;
  await page.goto(`${app.base}/#project/${app.first.id}/settings/organisation`);
  await name.fill("George draft");
  await expect.poll(() => page.evaluate(() => Object.keys(localStorage).some((key) => key.includes(":organisation-form:"))), "the draft is kept").toBe(true);
  await page.reload();
  await page.goto(`${app.base}/#project/${app.second.id}/settings/organisation`);
  await page.locator("[data-feature=form-restore]").click();
  await expect(name).toHaveValue("George draft");
  await expect.poll(stored, "restoring saves the draft").toBe("George draft");
});

for (const width of [1440, 390])
  test(`Settings → Organisation fits ${width}px in both themes`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto(`${app.base}/#organisation/${app.organisation.id}/settings/organisation`);
    await page.getByRole("button", { name: "Add person", exact: true }).waitFor();
    for (const theme of ["light", "dark"]) {
      await page.evaluate((theme) => window.PencilsAppearance.write({ theme }), theme);
      expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), `${width}px ${theme}: no horizontal overflow`).toBe(false);
    }
  });
