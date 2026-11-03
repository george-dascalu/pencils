// Owner request, 30 October 2026: an assignee shows the first three letters of their name, such as
// Geo for George, instead of initials, and they fit their box, even wide letters in Compact
// density; the full name stays in the tooltip. Owner request, 31 October 2026: a person's own short
// name, set in Settings → Organisation, replaces the three letters.
import { settingsSaved } from "../helpers/menu-controls.mjs";
import { test, expect, onDevices, useApp } from "../fixtures.mjs";

const app = useApp(async (store) => {
  const project = await store.createProject({ title: "Assignee labels", key: "AL" });
  await store.createTask(project.id, { title: "Lower case", assignee: "george" });
  await store.createTask(project.id, { title: "Full name", assignee: "Wilhelmina Moss" });
  await store.createTask(project.id, { title: "Wide letters", assignee: "Mmmwide" });
  const organisation = await store.createOrganisation({ title: "Short names", people: [{ id: "george", name: "George" }, { id: "wilma", name: "Wilma" }], teams: [] });
  const named = await store.createProject({ title: "Short name project", organisation: organisation.id, people: ["george", "wilma"] });
  await store.createTask(named.id, { title: "Named", assignee: "George" });
  await store.createTask(named.id, { title: "Default", assignee: "Wilma" });
  return { project, organisation, named };
});

onDevices(["desktop", "phone"], () => test("assignee names adapt to their box", async ({ page, device }) => {
  const densities = device === "desktop" ? ["comfortable", "compact"] : ["comfortable"];
  for (const density of densities) for (const view of ["list", "kanban", "table"]) {
    await page.goto(`${app.base}/#project/${app.project.id}/${view}`);
    await page.evaluate((density) => window.PencilsAppearance.write({ density }), density);
    const avatars = page.locator("#view-content .task-assignee:visible");
    await expect(avatars.first()).toBeVisible();
    await expect.poll(() => avatars.evaluateAll(els => els.every(el => el.scrollWidth <= el.clientWidth + 1)), {message:`${device} ${density} ${view}: names fit`}).toBe(true);
    const labels = await avatars.evaluateAll(els => els.map(el => [el.title, el.textContent]));
    for (const [full, text] of labels) expect([full, full[0].toUpperCase()+full.slice(1,3), full[0]], 'full name or a readable fallback').toContain(text);
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
  await settingsSaved(page);
  expect((await app.store.getOrganisation(app.organisation.id)).people.map((p) => p.short_name)).toEqual(["MWa", undefined]);
  await page.goto(`${app.base}/#project/${app.named.id}/list`);
  await page.evaluate(() => window.PencilsAppearance.write({ density: "compact" }));
  const avatars = page.locator("#view-content .task-assignee:visible");
  await expect(avatars).toHaveCount(2);
  await avatars.evaluateAll(els => els.forEach(el => {el.style.setProperty('width','36px','important');el.style.setProperty('min-width','0','important');}));
  await expect(avatars.filter({hasText:'MWa'})).toHaveCount(1);
  await expect(avatars.filter({hasText:'Wil'})).toHaveCount(1);
  const labels = await avatars.evaluateAll((els) => els.map((el) => [el.title, el.textContent, el.scrollWidth <= el.clientWidth]));
  expect(labels.sort(), "George's short name; Wilma's default letters; both fit").toEqual([["George", "MWa", true], ["Wilma", "Wil", true]]);
});
