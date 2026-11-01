// Readability items from the UI review (owner request T40, 1 November 2026; T64, T66, T69, T75, T79):
// one task title size, faint icons for empty fields and the assignee's full name in the card editor,
// body-size menus on touch screens, headings on the type scale, and one font size in phones' View
// options. (T65: rows and cards already open from their whole area, kanban-viewport and
// kanban-swimlanes.)
import { test, expect, onDevices, useApp } from "../fixtures.mjs";
import { clickControl, openSettingsPage, openSidebar } from "../helpers/menu-controls.mjs";

const app = useApp(async (store) => {
  const organisation = await store.createOrganisation({ title: "Type studio", people: [{ id: "george", name: "George" }], teams: [{ id: "team", name: "Team", members: ["george"] }] });
  const project = await store.createProject({ title: "Type scale", organisation: organisation.id, teams: ["team"] });
  const today = new Date().toISOString().slice(0, 10);
  const dated = await store.createTask(project.id, { title: "Dated work", assignee: "George", status: "todo", priority: "medium", start: today, due: today, estimate: 2 });
  const bare = await store.createTask(project.id, { title: "Bare work", status: "todo" });
  const teamless = await store.createProject({ title: "No teams yet", organisation: organisation.id });
  return { project, dated, bare, teamless };
});
const url = (view, project = app.project) => `${app.base}/#project/${project.id}/${view}`;
const size = (locator) => locator.evaluate((el) => getComputedStyle(el).fontSize);
const token = (page, name) => page.evaluate((name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim(), name);

onDevices(["desktop", "phone"], () => test("task titles use the body size in every view", async ({ page, device }) => {
  const phone = device === "phone";
  const titles = {
    list: phone ? ".phone-task-title" : ".task-row .task-title",
    tree: phone ? ".phone-task-title" : ".task-row .task-title",
    kanban: ".kanban-card .task-title",
    table: '.spreadsheet input[data-task-field="title"]',
    timeline: ".timeline-task-label",
    calendar: phone ? ".agenda-task" : ".calendar-card-title",
    capacity: ".capacity-task",
  };
  for (const [view, selector] of Object.entries(titles)) {
    await page.goto(url(view));
    const title = page.locator(`${selector}:visible`).first();
    await expect(title, view).toBeVisible();
    expect(await size(title), view).toBe(phone ? "16px" : "13px");
  }
}));

test("empty fields show a faint icon, and the card editor names the assignee in full", async ({ page }) => {
  await page.goto(url("list"));
  const row = page.locator(`[data-task-order-row="${app.bare.id}"]`);
  await expect(row.locator(".row-assignee .task-assignee.unassigned .icon")).toHaveCount(1);
  await expect(row.locator(".row-assignee .task-assignee")).toHaveText("");
  await expect(row.locator(".row-due .due .icon")).toHaveCount(1);
  await expect(row.locator(".row-due .due")).toHaveText("");
  await page.locator(`[data-action=task-open][data-id="${app.dated.id}"]:visible`).first().click();
  const avatar = page.locator("#task-form [data-assignee-avatar] .task-assignee");
  await expect(avatar).toHaveText("George");
  // The name has room: it ends before the status starts.
  const [name, status] = await Promise.all([avatar.boundingBox(), page.locator('#task-form .task-fields select[name="status"]').boundingBox()]);
  expect(name.x + name.width, "the name ends before the status").toBeLessThanOrEqual(status.x);
});

onDevices(["phone"], () => test("menus on touch screens use the body size", async ({ page }) => {
  await page.goto(url("list"));
  await page.locator('[data-board-menu="new-icon"] > summary').click();
  const row = page.locator('[data-board-menu="new-icon"] .board-menu-panel > button').first();
  await expect(row).toBeVisible();
  expect(await size(row)).toBe("16px");
  await page.keyboard.press("Escape");
  await clickControl(page.locator("#filter-status"));
  const option = page.locator("#shared-select-menu [role=option]").first();
  await expect(option).toBeVisible();
  expect(await size(option)).toBe("16px");
}));

test("headings use the type scale", async ({ page }) => {
  await page.goto(url("list"));
  const title = await token(page, "--type-title"), section = await token(page, "--type-section");
  await openSettingsPage(page, "general");
  expect(await size(page.locator(".settings-navigation h1")), "Settings").toBe(title);
  expect(await size(page.locator(".settings-section-heading h2:visible").first()), "a settings section").toBe(section);
  await page.goto(url("capacity", app.teamless));
  expect(await size(page.locator(".empty h2:visible").first()), "an empty view").toBe(title);
  await page.goto(`${app.base}/#help/start`);
  expect(await size(page.locator(".help-article h1")), "Help").toBe(title);
  expect(await size(page.locator(".help-section h2").first()), "a help section").toBe(section);
  await page.goto(url("list"));
  await openSidebar(page);
  await page.locator(".sidebar [data-action=project-new]").first().click();
  expect(await size(page.locator("dialog[open] .dialog-head h2")), "a dialog").toBe(title);
});

onDevices(["phone"], () => test("phones' View options uses one font size, one row per option", async ({ page }) => {
  for (const view of ["list", "kanban", "table", "calendar", "timeline"]) {
    await page.goto(url(view));
    const options = page.locator(".mobile-view-options");
    if (!(await options.evaluate((el) => el.open))) await options.locator(":scope > summary").click();
    const panel = options.locator(".mobile-view-options-panel");
    await expect(panel).toBeVisible();
    const sizes = await panel.evaluate((root) => [...new Set([...root.querySelectorAll("label, select, summary, button, .control-label")]
      .filter((el) => el.getClientRects().length && el.textContent.trim())
      .map((el) => `${getComputedStyle(el).fontSize} ${el.tagName.toLowerCase()} ${el.textContent.trim().slice(0, 20)}`))]);
    expect(sizes.filter((entry) => !entry.startsWith("16px ")), view).toEqual([]);
    if (view === "list") {
      const [blocked, archived] = await Promise.all(["Blocked", "Include archived"].map((name) => panel.getByText(name, { exact: true }).boundingBox()));
      expect(archived.y, "Include archived has its own row").toBeGreaterThanOrEqual(blocked.y + blocked.height - 1);
    }
  }
}));
