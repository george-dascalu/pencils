// Owner request (T39, 31 October 2026): Settings → General chooses which views and components
// (Tasks, Planning, Boards, Documents) a project has; Overview always stays. Views that are off
// leave the tabs (the bottom bar on touch screens), the layout tray and the New menu, and a link
// to one opens Overview. Nothing in the project is deleted.
import { settingsSaved } from "../helpers/menu-controls.mjs";
import { test, expect, onDevices, useApp } from "../fixtures.mjs";

const app = useApp(async () => ({}));
let count = 0;
async function seed(views_off) {
  const project = await app.store.createProject({ title: `Views ${++count}`, key: `VW${count}` });
  if (views_off) {
    const { project: p } = await app.store.snapshot(project.id);
    await app.store.updateProject(project.id, { revision: p.revision, schema: { ...p.schema, views_off } });
  }
  return project;
}
const url = (p, view) => `${app.base}/#project/${p.id}/${view}`;
const tab = (page, view) => page.locator(`.tabs [data-view="${view}"]`);
async function newMenu(page) {
  await page.locator("[data-new-menu] > summary").filter({ visible: true }).click();
  return page.locator("[data-new-menu][open] .new-menu-panel");
}

test("Settings → General turns views and components off, and they leave the tabs, the tray and the New menu", async ({ page }) => {
  const project = await seed();
  await page.goto(url(project, "settings/general"));
  const views = page.getByRole("group", { name: "Views", exact: true });
  await views.getByRole("checkbox", { name: "Boards", exact: true }).uncheck();
  await views.getByRole("checkbox", { name: "Calendar", exact: true }).uncheck();
  // A component's checkbox turns all its views off at once.
  await views.getByRole("checkbox", { name: "Tasks", exact: true }).uncheck();
  for (const name of ["List", "Tree", "Table", "Kanban"]) await expect(views.getByRole("checkbox", { name, exact: true })).not.toBeChecked();
  await expect(views.getByRole("checkbox", { name: "Planning", exact: true }), "Planning keeps Timeline and Capacity").toBeChecked();
  await expect(page.locator('#project-form [name="default_view"]'), "the default view leaves List as it goes").toHaveValue("overview");
  await settingsSaved(page);
  const saved = (await app.store.snapshot(project.id)).project;
  expect(saved.schema.views_off).toEqual(["list", "tree", "table", "kanban", "calendar", "board"]);
  expect(saved.default_view).toBe("overview");

  await page.goto(url(project, "overview"));
  await expect(tab(page, "overview")).toHaveCount(1);
  await expect(tab(page, "documents")).toHaveCount(1);
  await expect(tab(page, "tasks"), "no Tasks tab").toHaveCount(0);
  await expect(tab(page, "board"), "no Boards tab").toHaveCount(0);
  await tab(page, "planning").click();
  await expect(page.locator(".view-layout-switcher [data-view]")).toHaveCount(2);
  await expect(page.locator('.view-layout-switcher [data-view="calendar"]')).toHaveCount(0);
  const menu = await newMenu(page);
  await expect(menu.locator('[data-action="board-new"]'), "no new board").toHaveCount(0);
  await expect(menu.locator('[data-action="task-new"]'), "Planning still shows cards").toHaveCount(1);

  // Turning a view back on brings it back.
  await page.goto(url(project, "settings/general"));
  await page.getByRole("group", { name: "Views", exact: true }).getByRole("checkbox", { name: "Boards", exact: true }).check();
  await settingsSaved(page);
  await page.goto(url(project, "overview"));
  await expect(tab(page, "board")).toHaveCount(1);
});

onDevices(["desktop", "phone"], () => test("a project without Tasks, Planning and Boards offers only Overview and Documents, and a link to a view that's off opens Overview", async ({ page }) => {
  const project = await seed(["list", "tree", "table", "kanban", "calendar", "timeline", "capacity", "board"]);
  await page.goto(url(project, "list"));
  await expect(tab(page, "overview")).toHaveAttribute("aria-current", "page");
  expect(await page.locator(".tabs [data-view]").evaluateAll((els) => els.map((el) => el.dataset.view))).toEqual(["overview", "documents"]);
  const menu = await newMenu(page);
  await expect(menu.locator('[data-action="task-new"]'), "no new card").toHaveCount(0);
  await expect(menu.locator('[data-action="board-new"]')).toHaveCount(0);
  await expect(menu.locator('[data-action="document-new"]')).toHaveCount(1);
  await page.keyboard.press("Escape");
  await page.goto(url(project, "board"));
  await expect(tab(page, "overview")).toHaveAttribute("aria-current", "page");
  await expect(page.getByText("This project's settings turn Boards off."), "says why").toBeVisible();
}));
