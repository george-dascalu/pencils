// Regression checks for the errors the sweep of every screen and button found (owner request T40,
// 1 November 2026; fixed as T54–T63). Each failed before its fix.
import { test, expect, onDevices, useApp } from "../fixtures.mjs";
import { documentTool, openNewDocument } from "../helpers/documents.mjs";
import { clickControl, openSettingsPage, openSidebar, showSettingsSection } from "../helpers/menu-controls.mjs";

const app = useApp(async (store) => {
  // Sorts before "Our organisation" and holds no projects.
  await store.createOrganisation({ title: "Aardvark" });
  const project = await store.createProject({ title: "Sweep", key: "SW" });
  const dated = await store.createTask(project.id, { title: "Dated", start: "2026-10-29", due: "2026-11-05", status: "todo" });
  const board = (await store.snapshot(project.id)).boards[0];
  return { project, dated, board };
});
const url = (view) => `${app.base}/#project/${app.project.id}/${view}`;
const focused = (page) => page.evaluate(() => (document.activeElement === document.body ? "body" : document.activeElement.outerHTML.slice(0, 100)));
// The text field holding focus, which on a touch screen means the keyboard is up.
const typing = (page) => page.evaluate(() => (document.activeElement?.matches("textarea, [contenteditable=true], input:not([type=checkbox], [type=radio], [type=button])") ? document.activeElement.outerHTML.slice(0, 100) : null));

test("the Table refuses a due date before the start date, says why and puts the date back", async ({ page }) => {
  await page.goto(url("table"));
  const cell = (field) => page.locator(`.spreadsheet input[data-task-field="${field}"][data-id="${app.dated.id}"]`);
  // The calendar offers only the dates the other one allows.
  await expect(cell("due")).toHaveAttribute("min", "2026-10-29");
  await expect(cell("start")).toHaveAttribute("max", "2026-11-05");
  // A typed date can't turn the range around either.
  await cell("due").fill("2026-10-27");
  await expect(page.locator(".toast.error .toast-text")).toHaveText("Start must be on or before the due date.");
  await expect(cell("due")).toHaveValue("2026-11-05");
  expect((await app.store.snapshot(app.project.id)).tasks.find((t) => t.id === app.dated.id).due).toBe("2026-11-05");
});

test("Home opens in the organisation in use, with direct project links and bookmarked views named", async ({ page }) => {
  await page.goto(url("list"));
  await page.locator(".task-row").first().waitFor();
  await page.evaluate((project) => fetch("/api/bookmarks", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ kind: "view", project, id: "kanban" }) }), app.project.id);
  // Cross-project reference data may arrive after Home has drawn its project links.
  const held = [];
  let answered = 0;
  await page.route("**/api/overview", (route) => held.push(route));
  page.on("requestfinished", (request) => { if (new URL(request.url()).pathname === "/api/overview") answered++; });
  await page.goto("about:blank");
  await page.goto(`${app.base}/#home`);
  const projects = page.locator('.home-panel[data-type="projects"]');
  await expect(projects.locator(`.project-card[data-id="${app.project.id}"]`), "the organisation in use, not the first").toBeVisible();
  await expect.poll(() => held.length).toBeGreaterThanOrEqual(2);
  await Promise.all(held.map((route) => route.continue()));
  await page.unroute("**/api/overview");
  await expect.poll(() => answered).toBe(held.length);
  await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => setTimeout(done))));
  // Late answers must not put the old full dashboard back inside the Projects panel.
  for (const part of [".dashboard-metrics", ".dashboard-deadlines", ".project-health"])
    expect(await projects.locator(part).count(), part).toBe(0);
  await expect(projects.locator(".project-card")).toHaveCount(1);
  await expect(page.locator('.home-panel[data-type="bookmarks"] .home-item')).toHaveText(["Kanban · Sweep"]);
});

test("Capacity's Choose project teams opens the project's teams settings", async ({ page }) => {
  await page.goto(url("capacity"));
  await page.getByRole("button", { name: "Choose project teams", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`#project/${app.project.id}/settings/teams$`));
});

test("a document's Add property opens and closes its panel without an error", async ({ page }) => {
  await openNewDocument(page, app, app.project.id, { title: "Props", body: "Text" });
  await documentTool(page, "Add property");
  const panel = page.getByRole("dialog", { name: "Add property", exact: true }), add = page.locator(".document-properties [data-property-add]");
  await expect(panel).toBeVisible();
  await add.click();
  await expect(panel).toBeHidden();
  await add.click();
  await expect(panel).toBeVisible();
});

test("Escape closes the row date editor, the timeline range, the Text style menu and the Frames panel", async ({ page }) => {
  await page.goto(url("list"));
  await page.locator(`[data-row-dates="${app.dated.id}"]`).first().click();
  const dates = page.locator("#task-dates-popover");
  await expect(dates.locator('input[name="start"]'), "the editor takes focus").toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dates).toHaveCount(0);

  await page.goto(url("timeline"));
  await page.locator("[data-timeline-range]").first().click();
  const range = page.getByRole("dialog", { name: "Timeline range", exact: true });
  await expect(range.locator('input[name="start"]')).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(range).toBeHidden();

  await openNewDocument(page, app, app.project.id, { title: "Styles", body: "Text" });
  const style = page.locator(".document-formatting .rich-format-menu");
  await style.locator(":scope > summary").click();
  await expect(style).toHaveAttribute("open", "");
  await page.keyboard.press("Escape");
  await expect(style).not.toHaveAttribute("open", "");
  await expect(style.locator(":scope > summary")).toBeFocused();

  await page.goto(url("board"));
  const frames = page.locator('.board-tools [data-pro="outline"]');
  await frames.click();
  await expect(page.locator("#canvas-outline")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator("#canvas-outline")).toBeHidden();
  await expect(frames).toBeFocused();
});

test("focus stays on a control after Hide weekends, closing New project and Restrict status changes", async ({ page }) => {
  await page.goto(url("calendar"));
  await clickControl(page.locator("[data-weekends-toggle]").first());
  await expect.poll(() => focused(page), "after the calendar redraws").not.toBe("body");

  await page.goto(url("list"));
  await page.locator(".task-row").first().waitFor();
  await openSidebar(page);
  await page.locator('.sidebar [data-action="project-new"]').first().click();
  await page.locator("dialog[open]").waitFor();
  await page.keyboard.press("Escape");
  await expect(page.locator("dialog[open]")).toHaveCount(0);
  await expect.poll(() => focused(page), "back where it came from").not.toBe("body");

  await openSidebar(page);
  await page.locator('.sidebar [data-action="project-new"]').first().click();
  const restrict = page.locator("dialog[open] [data-workflow-rules]");
  await page.locator('#project-form [name="title"]').fill("Workflow focus");
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await restrict.check();
  await expect(restrict).toBeChecked();
  await expect(restrict).toBeFocused();

});

onDevices(["phone"], () => {
  test("on touch, Add person and Add team leave the keyboard down", async ({ page }) => {
    await page.goto(url("list"));
    await openSettingsPage(page, "organisation");
    for (const name of ["Add person", "Add team"]) {
      await page.getByRole("button", { name, exact: true }).tap();
      await expect(page.getByRole("button", { name, exact: true }), "focus stays on the button").toBeFocused();
      expect(await typing(page)).toBe(null);
    }
  });

  test("on touch, Add type and Add field leave the keyboard down", async ({ page }) => {
    await page.goto(url("list"));
    await openSettingsPage(page, "hierarchy");
    await page.getByRole("button", { name: "Add type", exact: true }).tap();
    await expect(page.getByRole("button", { name: "Add type", exact: true })).toBeFocused();
    expect(await typing(page)).toBe(null);
    await showSettingsSection(page, "fields");
    await page.getByRole("button", { name: "Add field", exact: true }).tap();
    await expect(page.getByRole("button", { name: "Add field", exact: true })).toBeFocused();
    expect(await typing(page)).toBe(null);
  });

  test("on touch, a description's Link and Clear dates leave the keyboard down", async ({ page }) => {
    await page.goto(url("list"));
    await page.locator(`[data-action=task-open][data-id="${app.dated.id}"]:visible`).first().tap();
    await page.locator("#task-form [data-rich-link]").first().tap();
    await expect(page.locator("#task-form [data-rich-link]").first()).toBeFocused();
    expect(await typing(page)).toBe(null);
    await page.keyboard.press("Escape");
    await page.goto(url("list"));
    await page.locator(`[data-row-dates="${app.dated.id}"]:visible`).first().tap();
    await page.getByRole("button", { name: "Clear dates", exact: true }).tap();
    await expect(page.getByRole("button", { name: "Clear dates", exact: true })).toBeFocused();
    expect(await typing(page)).toBe(null);
  });
});

test("Copy board link offers the link to copy by hand when the browser refuses the clipboard", async ({ page }) => {
  await page.goto(url("board"));
  await page.locator("#canvas").waitFor();
  await page.evaluate(() => { navigator.clipboard.writeText = () => Promise.reject(new DOMException("Write permission denied.", "NotAllowedError")); });
  await page.locator("[data-board-menu=tools] > summary").click();
  await page.getByRole("button", { name: "Copy board link", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Board link", exact: true })).toHaveValue(`${app.base}/#project/${app.project.id}/board/${app.board.id}`);
});

test("Make a capture token is off at the ten-token limit", async ({ page }) => {
  await page.goto(url("list"));
  await page.evaluate(async (project) => {
    for (let i = 0; i < 10; i++) await fetch("/api/capture-tokens", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ project }) });
  }, app.project.id);
  await openSettingsPage(page, "personal");
  const box = page.getByRole("group", { name: "Capture from your phone" });
  await expect(box.locator("[data-capture-tokens] li")).toHaveCount(10);
  await expect(box.getByRole("button", { name: "Make a capture token", exact: true })).toBeDisabled();
});
