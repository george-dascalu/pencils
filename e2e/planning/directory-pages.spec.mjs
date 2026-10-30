// Teams and People directory pages: the sidebar opens them as pages (not dialogs) that create,
// edit and save the organisation's directory, keep their place across reloads and organisation
// switches, keep a recoverable draft when you leave without saving, never let an older draft
// overwrite changes saved elsewhere, fit desktop and phone widths in both themes, and work from
// the phone drawer. Choosing a project leaves the directory.
import { test, expect, useApp } from "../fixtures.mjs";
import { clickControl, openSidebar } from "../helpers/menu-controls.mjs";

const people = (name) => [{ id: "george", name, task_capacity: 7 }];
const team = (name) => [{ id: "product", name, members: ["george"] }];
async function directory(store, title, { person = "George", teamName = "Product" } = {}) {
  const organisation = await store.createOrganisation({ title, people: people(person), teams: team(teamName) });
  const project = await store.createProject({ title: `${title} project`, organisation: organisation.id });
  return { organisation, project };
}
const app = useApp(async (store) => ({
  project: await store.createProject({ title: "Directory project" }),
  other: await store.createOrganisation({ title: "Other organisation" }),
  scoped: await directory(store, "Scoped directory"),
  drafts: await directory(store, "Draft directory"),
  conflict: await directory(store, "Conflicting directory", { person: "George draft" }),
  layout: await directory(store, "Directory layout"),
}));

test.use({ viewportSize: { width: 1440, height: 1000 } });

const navigate = (page, kind) => clickControl(page.locator(`.directory-link[data-page="${kind}"]`));
const save = (page, kind) =>
  Promise.all([
    page.waitForResponse((r) => r.request().method() === "PATCH" && r.url().includes("/organisations/")),
    page.getByRole("button", { name: `Save ${kind}`, exact: true }).click(),
  ]);
const heading = (page, name) => page.getByRole("heading", { name, exact: true, level: 1 });
const openDirectory = async (page, { organisation }, kind) => {
  await page.goto(`${app.base}/#organisation/${organisation.id}/${kind}`);
  await heading(page, kind === "people" ? "People" : "Teams").waitFor();
};

test("the sidebar opens Teams and People as pages that create and save the directory, and survive a reload", async ({ page }) => {
  const { project } = app;
  await page.goto(app.base);
  await openSidebar(page);
  await page.locator("#organisation-select").selectOption(project.organisation);
  await clickControl(page.locator(`.project-link[data-id="${project.id}"]`));
  await openSidebar(page);
  expect(await page.getByRole("navigation", { name: "Teams and people" }).locator("button").evaluateAll((els) => els.map((el) => el.dataset.page))).toEqual(["teams", "people"]);
  await navigate(page, "people");
  await expect(heading(page, "People")).toBeVisible();
  await expect(page.locator("dialog")).toHaveCount(0);
  await expect(page.locator("[data-directory-section=teams]")).toBeHidden();
  await page.locator("[data-add-person]").click();
  await page.getByLabel("Person name", { exact: true }).fill("George");
  await page.locator("[data-person-field=task_capacity]").fill("7");
  const [saved] = await save(page, "people");
  expect(saved.status()).toBe(200);
  await page.getByText("People saved.", { exact: true }).waitFor();
  let org = await app.store.getOrganisation(project.organisation);
  expect(org.people[0].name).toBe("George");
  expect(org.people[0].task_capacity).toBe(7);
  await navigate(page, "teams");
  await expect(page.locator("[data-directory-section=people]")).toBeHidden();
  await page.locator("[data-add-team]").click();
  await page.getByLabel("Team name", { exact: true }).fill("Product");
  await page.locator("[data-member]").check();
  await save(page, "teams");
  await page.getByText("Teams saved.", { exact: true }).waitFor();
  org = await app.store.getOrganisation(project.organisation);
  expect(org.teams[0].members).toEqual([org.people[0].id]);
  await page.reload();
  await heading(page, "Teams").waitFor();
  await expect(page.getByLabel("Team name", { exact: true })).toHaveValue("Product");
  await expect(page.locator(".directory-link[aria-current=page]")).toHaveAttribute("data-page", "teams");
});

test("switching organisations keeps the directory page but changes its scope", async ({ page }) => {
  const { organisation } = app.scoped;
  await openDirectory(page, app.scoped, "teams");
  await expect(page.getByLabel("Team name", { exact: true })).toHaveValue("Product");
  await openSidebar(page);
  await page.locator("#organisation-select").selectOption(app.other.id);
  await page.getByText("No teams yet.", { exact: false }).waitFor();
  expect(page.url()).toContain(app.other.id);
  await navigate(page, "people");
  await heading(page, "People").waitFor();
  await expect(page.locator(".person-row")).toHaveCount(0);
  await openSidebar(page);
  await page.locator("#organisation-select").selectOption(organisation.id);
  await expect(page.getByLabel("Person name", { exact: true })).toHaveValue("George");
});

test("switching pages keeps a recoverable draft without writing it", async ({ page }) => {
  const { organisation } = app.drafts;
  await openDirectory(page, app.drafts, "people");
  await page.getByLabel("Person name", { exact: true }).fill("George draft");
  await navigate(page, "teams");
  await navigate(page, "people");
  await page.locator("[data-feature=form-restore]").click();
  await expect(page.getByLabel("Person name", { exact: true })).toHaveValue("George draft");
  expect((await app.store.getOrganisation(organisation.id)).people[0].name).toBe("George");
  await save(page, "people");
  await page.getByText("People saved.", { exact: true }).waitFor();
  expect((await app.store.getOrganisation(organisation.id)).people[0].name).toBe("George draft");
});

test("restoring an older draft never overwrites changes saved elsewhere", async ({ page }) => {
  const { organisation } = app.conflict;
  await openDirectory(page, app.conflict, "people");
  await page.getByLabel("Person name", { exact: true }).fill("Old draft");
  await navigate(page, "teams");
  await heading(page, "Teams").waitFor();
  const org = await app.store.getOrganisation(organisation.id);
  await app.store.updateOrganisation(org.id, { revision: org.revision, teams: [{ ...org.teams[0], name: "Product updated elsewhere" }] });
  await page.reload();
  await heading(page, "Teams").waitFor();
  await navigate(page, "people");
  await page.locator("[data-feature=form-restore]").click();
  const [conflict] = await save(page, "people");
  expect(conflict.status()).toBe(409);
  await page.locator(".form-error:not(.hidden)").waitFor();
  const after = await app.store.getOrganisation(organisation.id);
  expect(after.people[0].name).toBe("George draft");
  expect(after.teams[0].name).toBe("Product updated elsewhere");
  await navigate(page, "teams");
  await navigate(page, "people");
  await page.locator("[data-feature=form-discard]").click();
  await expect(page.locator("[data-feature=form-discard]")).toHaveCount(0);
});

for (const width of [1440, 390]) {
  test.describe(`${width}px`, () => {
    test.use({ viewportSize: { width, height: 1000 } });
    test("Teams and People fit the window in both themes", async ({ page }) => {
      for (const kind of ["people", "teams"]) {
        await openDirectory(page, app.layout, kind);
        for (const theme of ["light", "dark"]) {
          await page.evaluate((t) => (document.documentElement.dataset.theme = t), theme);
          expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), `${kind}, ${theme}: no horizontal overflow`).toBe(false);
        }
      }
    });
  });
}

test.describe("phone drawer", () => {
  test.use({ viewportSize: { width: 390, height: 900 } });
  test("directory links close the drawer and open the chosen page", async ({ page }) => {
    await openDirectory(page, app.layout, "teams");
    await page.getByRole("button", { name: "Toggle sidebar", exact: true }).click();
    await expect(page.locator(".sidebar")).toHaveClass(/\bopen\b/);
    await navigate(page, "people");
    await expect(heading(page, "People")).toBeVisible();
    await expect(page.locator(".sidebar")).not.toHaveClass(/\bopen\b/);
  });
});

test("choosing a project leaves the directory, also after a reload", async ({ page }) => {
  const { project } = app.layout;
  await openDirectory(page, app.layout, "people");
  await clickControl(page.locator(`.project-link[data-id="${project.id}"]`));
  await page.waitForURL((url) => !url.hash.startsWith("#organisation/"));
  await page.reload();
  await page.locator(".tabs [data-view=tasks]").waitFor();
  await expect(page.locator(".directory-page")).toHaveCount(0);
});
