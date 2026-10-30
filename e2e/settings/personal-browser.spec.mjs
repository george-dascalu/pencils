// Personal preferences and per-project workflows: the sidebar collapses (and is hidden from
// assistive technology) and stays collapsed after a reload; eight fonts load from the local
// server; light, dark and System themes apply, persist and reach other open tabs. Each project
// keeps its own statuses, a status in use cannot be removed, and a new project can start with
// its own workflow. On phones the drawer opens and closes and the Settings page fits the screen.
// Nothing is requested from outside the local server.
import { test, expect, onDevices, useApp } from "../fixtures.mjs";
import { openSettingsPage, selectProjectView, clickControl, openSidebar } from "../helpers/menu-controls.mjs";
import { newCard } from "../helpers/new-card.mjs";

const app = useApp(async (store) => ({
  project: await store.createProject({ title: "Design studio" }),
  other: await store.createProject({ title: "Other project" }),
}));

let external;
test.beforeEach(async ({ context }) => {
  external = [];
  context.on("request", (r) => {
    if (!r.url().startsWith(app.base) && !r.url().startsWith("data:")) external.push(r.url());
  });
});
test.afterEach(() => expect(external, "no external requests").toEqual([]));

const html = (page) => page.locator("html");
// Since 0.19.31 one Settings button (top bar, or the phone drawer's settings row) opens the
// Settings page; the former Personal settings dialog is its "You" section, which applies
// changes immediately and has no Close button, so leaving goes back to the project.
const openSettings = openSettingsPage;
const openPersonal = (page) => openSettings(page, "personal");
const closePersonal = (page) => page.locator("[data-action=settings-close]").click();
async function openProject(page, project = app.project) {
  await page.goto(`${app.base}/#project/${project.id}/list`);
  await page.locator(".topbar").waitFor();
}
async function setStatuses(page, names, done) {
  if (!(await page.locator("[data-status-details]").evaluate((el) => el.open))) await page.locator("[data-status-details] > summary").click();
  const existing = await page.locator("[data-workflow-status]").evaluateAll((els) => els.map((el) => el.dataset.workflowStatus));
  for (const name of names) {
    await page.getByLabel("New status name", { exact: true }).fill(name);
    await page.locator("[data-status-add]").click();
  }
  for (const id of existing) await page.locator(`[data-workflow-status="${id}"] [data-status-remove]`).click();
  await page.locator(`[data-workflow-status="${done}"] [data-status-completed]`).check();
  await page.locator(`[data-workflow-status="${names[0]}"] [data-status-initial]`).check();
}
const statusOptions = (page) => page.locator("#task-form [name=status] option").evaluateAll((els) => els.map((el) => el.value));

// Since 0.20.24 the sidebar opens over the page on every device and starts closed.
test("the closed sidebar is hidden from assistive technology, and opening it leaves the page in place", async ({ page }) => {
  await page.goto(app.base);
  await clickControl(page.locator(`[data-action=project-open][data-id="${app.project.id}"]`));
  await expect(page.locator(".sidebar")).toBeHidden();
  expect(await page.locator(".sidebar").evaluate((el) => el.inert)).toBe(true);
  await expect(page.locator(".main")).toBeVisible();
  expect((await page.locator(".main").boundingBox()).x).toBe(0);
  await openSidebar(page);
  expect(await page.locator(".sidebar").evaluate((el) => el.inert)).toBe(false);
  expect(await page.locator(".main").evaluate((el) => el.inert), "the page behind waits").toBe(true);
  expect((await page.locator(".main").boundingBox()).x, "the page doesn't move").toBe(0);
  await page.reload();
  await expect(page.locator(".sidebar"), "it starts closed after a reload").toBeHidden();
});

test("all eight fonts load from the local server and apply to the page", async ({ page }) => {
  await openProject(page);
  await openPersonal(page);
  await expect(page.locator('[name="personal-font"]')).toHaveCount(8);
  for (const [value, name] of await page.evaluate(() => window.PencilsAppearance.fonts)) {
    await page.locator(`[name=personal-font][value=${value}]`).check();
    const loaded = await page.evaluate(async (name) => {
      const fonts = await document.fonts.load(`16px "${name}"`);
      return fonts.length > 0 && fonts.every((f) => f.status === "loaded");
    }, name);
    expect(loaded, `${name} must load from the local server`).toBe(true);
    await expect.poll(() => page.locator("body").evaluate((el) => getComputedStyle(el).fontFamily)).toContain(name);
  }
});

test("the chosen font and dark theme survive a reload", async ({ page }) => {
  await openProject(page);
  await openPersonal(page);
  await page.locator("[name=personal-font][value=spacegrotesk]").check();
  await page.locator("[name=personal-theme][value=dark]").check();
  await expect(html(page)).toHaveAttribute("data-theme", "dark");
  await closePersonal(page);
  await page.reload();
  await expect(html(page)).toHaveAttribute("data-theme", "dark");
  await expect(html(page)).toHaveAttribute("data-font", "spacegrotesk");
});

test("the System theme follows the operating system's colour scheme", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light" });
  await openProject(page);
  await openPersonal(page);
  await page.locator("[name=personal-theme][value=system]").check();
  await expect(html(page)).toHaveAttribute("data-theme", "light");
  await page.emulateMedia({ colorScheme: "dark" });
  await expect(html(page)).toHaveAttribute("data-theme", "dark");
  await page.locator("[name=personal-theme][value=light]").check();
  await expect(html(page)).toHaveAttribute("data-theme", "light");
  await closePersonal(page);
});

test("a theme chosen in one tab reaches the other open tabs", async ({ page, context }) => {
  await openProject(page);
  await expect(html(page)).not.toHaveAttribute("data-theme", "dark");
  const second = await context.newPage();
  await second.goto(app.base);
  await openPersonal(second);
  await second.locator("[name=personal-theme][value=dark]").check();
  await expect(html(page)).toHaveAttribute("data-theme", "dark");
  await second.close();
});

test("a project's workflow is its own: new cards and Kanban use it, and a status in use cannot be removed", async ({ page }) => {
  await openProject(page);
  await openSettings(page, "workflow");
  await setStatuses(page, ["ideas", "active", "shipped"], "shipped");
  await page.locator("#workflow-form [type=submit]").click();
  await expect.poll(async () => (await app.store.snapshot(app.project.id)).project.schema.statuses[0]).toBe("ideas");
  expect((await app.store.snapshot(app.other.id)).project.schema.statuses).toEqual(["backlog", "todo", "in-progress", "review", "done"]);
  if (await page.locator("[data-action=settings-close]").count()) await page.locator("[data-action=settings-close]").click();
  await newCard(page);
  await expect(page.locator("#task-form [name=status]")).toHaveValue("ideas");
  expect(await statusOptions(page)).toEqual(["ideas", "active", "shipped"]);
  await page.locator("#task-form [name=title]").fill("Explore the next idea");
  await page.locator("#task-form [type=submit]").click();
  await expect.poll(async () => (await app.store.snapshot(app.project.id)).tasks.length).toBe(1);
  await selectProjectView(page, "kanban");
  await expect.poll(() => page.locator(".kanban-column").evaluateAll((els) => els.map((el) => el.dataset.dropStatus))).toEqual(["ideas", "active", "shipped"]);
  await openSettings(page, "workflow");
  await expect(page.locator("[data-workflow-status=ideas] [data-status-remove]")).toBeDisabled();
  expect((await app.store.snapshot(app.project.id)).project.schema.statuses).toEqual(["ideas", "active", "shipped"]);
  await page.locator("[data-action=settings-close]").click();
});

test("a new project can start with its own workflow", async ({ page }) => {
  await openProject(page);
  await clickControl(page.locator('.side-new[data-action="project-new"]'));
  await page.locator("#project-form [name=title]").fill("Independent workflow");
  await setStatuses(page, ["queued", "complete"], "complete");
  await page.locator("#project-form [type=submit]").click();
  await page.locator(".breadcrumb strong").filter({ hasText: "Independent workflow" }).waitFor();
  if (await page.locator("[data-action=settings-close]").count()) await page.locator("[data-action=settings-close]").click();
  await newCard(page);
  await expect.poll(() => statusOptions(page)).toEqual(["queued", "complete"]);
  await page.locator("#task-form [data-action=dialog-close]").click();
});

onDevices(["phone"], () => {
  test("the drawer opens and closes, and Settings from its settings row fits the screen", async ({ page }) => {
    await openProject(page);
    await page.getByRole("button", { name: "Toggle sidebar", exact: true }).click();
    await expect(page.locator(".sidebar")).toBeVisible();
    expect(await page.locator(".sidebar").evaluate((el) => el.inert)).toBe(false);
    await page.getByRole("button", { name: "Close sidebar", exact: true }).click({ position: { x: 350, y: 400 } });
    await page.waitForFunction(() => !document.querySelector(".sidebar.open"));
    // Since 0.19.26 phones reach settings from the drawer's settings row; since 0.19.31 its
    // Settings button opens the Settings page, whose "You" section was Personal settings.
    await openSettings(page, "personal");
    await expect(page.locator("[name=personal-theme]").first()).toBeVisible();
    for (const part of ["#settings-section-select", "#settings-panel"]) {
      const box = await page.locator(part).boundingBox();
      expect(box.x, part).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width, part).toBeLessThanOrEqual(390);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth), "no sideways scrolling").toBeLessThanOrEqual(390);
  });
});
