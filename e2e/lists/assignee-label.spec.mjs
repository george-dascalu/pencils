// Owner request, 30 October 2026: an assignee shows the first three letters of their name, such as
// Geo for George, instead of initials, and they fit their box, even wide letters in Compact
// density; the full name stays in the tooltip. Owner request, 31 October 2026: a person's own short
// name, set in Settings → Organisation, replaces the three letters.
import { test, expect, onDevices, useApp } from "../fixtures.mjs";

const app = useApp(async (store) => {
  const project = await store.createProject({ title: "Assignee labels", key: "AL" });
  await store.createTask(project.id, { title: "Lower case", assignee: "george" });
  await store.createTask(project.id, { title: "Full name", assignee: "Wilhelmina Moss" });
  await store.createTask(project.id, { title: "Wide letters", assignee: "Mmmwide" });
  const organisation = await store.createOrganisation({ title: "Short names", people: [{ id: "george", name: "George" }, { id: "wilma", name: "Wilma" }], teams: [] });
  const named = await store.createProject({ title: "Short name project", organisation: organisation.id });
  await store.createTask(named.id, { title: "Named", assignee: "George" });
  await store.createTask(named.id, { title: "Default", assignee: "Wilma" });
  return { project, organisation, named };
});

onDevices(["desktop", "phone"], () => test("assignees show three letters that fit their box", async ({ page, device }) => {
  const densities = device === "desktop" ? ["comfortable", "compact"] : ["comfortable"];
  for (const density of densities) for (const view of ["list", "kanban", "table"]) {
    await page.goto(`${app.base}/#project/${app.project.id}/${view}`);
    await page.evaluate((density) => window.PencilsAppearance.write({ density }), density);
    const avatars = page.locator("#view-content .task-assignee:visible");
    await expect(avatars.first()).toBeVisible();
    const labels = await avatars.evaluateAll((els) => els.map((el) => ({ text: el.textContent, title: el.title, fits: el.scrollWidth <= el.clientWidth })));
    expect(labels.map((l) => [l.title, l.text]).sort(), `${device} ${view}`).toEqual([["Mmmwide", "Mmm"], ["Wilhelmina Moss", "Wil"], ["george", "Geo"]]);
    for (const l of labels) expect(l.fits, `${device} ${density} ${view}: ${l.text} fits`).toBe(true);
  }
}));

test("a short name set in Settings → Organisation replaces the three letters and fits its box", async ({ page }) => {
  await page.goto(`${app.base}/#organisation/${app.organisation.id}/settings/organisation`);
  const row = page.locator('[data-person="george"]'), field = page.getByLabel("Short name for George", { exact: true });
  await expect(field, "the placeholder shows the default").toHaveAttribute("placeholder", "Geo");
  await row.locator("[data-person-field=name]").fill("Alex");
  await expect(field, "the placeholder follows the name").toHaveAttribute("placeholder", "Ale");
  await row.locator("[data-person-field=name]").fill("George");
  await field.fill("MWa");
  const [saved] = await Promise.all([
    page.waitForResponse((r) => r.request().method() === "PATCH" && r.url().includes("/organisations/")),
    page.getByRole("button", { name: "Save organisation", exact: true }).click(),
  ]);
  expect(saved.status()).toBe(200);
  expect((await app.store.getOrganisation(app.organisation.id)).people.map((p) => p.short_name)).toEqual(["MWa", undefined]);
  await page.goto(`${app.base}/#project/${app.named.id}/list`);
  await page.evaluate(() => window.PencilsAppearance.write({ density: "compact" }));
  const avatars = page.locator("#view-content .task-assignee:visible");
  await expect(avatars).toHaveCount(2);
  const labels = await avatars.evaluateAll((els) => els.map((el) => [el.title, el.textContent, el.scrollWidth <= el.clientWidth]));
  expect(labels.sort(), "George's short name; Wilma's default letters; both fit").toEqual([["George", "MWa", true], ["Wilma", "Wil", true]]);
});
