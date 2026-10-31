// Workspace journey (the original end-to-end browser check, test/browser.mjs): from an empty
// workspace through the optional sample project, a new card with hierarchy and safe Markdown,
// Table, Kanban and Tree edits, canvas notes, connectors, undo/redo and several canvases, live
// Obsidian edits with conflict protection, organisations with scoped and moved projects, and the
// phone layout. Every step saves to the vault, and nothing is requested from outside the server.
import fs from "node:fs/promises";
import path from "node:path";
import { test, expect, onDevices, useApp } from "../fixtures.mjs";
import { clickControl, selectProjectView, selectSettingsPage, openSettingsPage, openSidebar } from "../helpers/menu-controls.mjs";
import { newCard } from "../helpers/new-card.mjs";

const app = useApp();
// One journey: each step works on the sample project, card, canvases and organisations the
// earlier steps created.
test.describe.configure({ mode: "serial" });

let external;
test.beforeEach(async ({ page }) => {
  external = [];
  await page.route("**/*", (route) => {
    if (new URL(route.request().url()).origin !== app.base) {
      external.push(route.request().url());
      return route.abort();
    }
    return route.continue();
  });
});
test.afterEach(() => expect(external, "no external requests").toEqual([]));

let demo, epic, created, studio;
const snapshot = () => app.store.snapshot(demo.id);
const click = (page, action) => clickControl(page.locator(`[data-action="${action}"]`).first());
// Waits for the save (a PATCH, or an undo/redo) that `fn` starts, and checks it succeeded.
async function saved(page, fn, entityId) {
  const response = page.waitForResponse((r) => (r.request().method() === "PATCH" || r.url().endsWith("/undo")) && r.url().includes("/api/") && (!entityId || r.url().includes(entityId)));
  await fn();
  expect((await response).status()).toBe(200);
}
async function openDemo(page, view = "list") {
  await page.goto(`${app.base}/#project/${demo.id}/list`);
  await expect(page.getByRole("heading", { name: demo.title, exact: true })).toBeVisible();
  if (view !== "list") await selectProjectView(page, view);
}

test("an empty workspace offers the optional sample project", async ({ page }) => {
  await page.goto(app.base);
  await expect(page.getByRole("heading", { name: /A little space for your/ })).toBeVisible();
  await click(page, "demo");
  await expect(page.getByRole("heading", { name: "A little more possibility", exact: true })).toBeVisible();
  demo = (await app.store.list()).projects[0];
  expect((await snapshot()).tasks).toHaveLength(8);
});

test("a new card saves its type, priority and parent, and its Markdown preview drops unsafe HTML", async ({ page }) => {
  await openDemo(page);
  await newCard(page);
  await page.locator('#task-form [name="title"]').fill("Browser-tested task");
  await page.locator("[data-task-picker=type] .task-picker-trigger").click();
  await page.locator("[data-task-picker=type] [data-picker-value=bug]").click();
  await page.locator("[data-task-picker=priority] .task-picker-trigger").click();
  await page.locator("[data-task-picker=priority] [data-picker-value=urgent]").click();
  epic = (await snapshot()).tasks.find((t) => t.type === "epic");
  // Since 0.15.36 the editor has no Parent picker; since 0.19.2 a new card takes its parent
  // from the Relationships section before it is saved.
  const relationships = page.getByRole("region", { name: "Relationships", exact: true });
  await relationships.locator("[data-relationship-toggle]").click();
  await relationships.getByLabel("Relationship type", { exact: true }).click();
  await page.locator("#shared-select-menu").getByRole("option", { name: "Parent", exact: true }).click();
  await relationships.getByLabel("Find a task to link", { exact: true }).fill(epic.key);
  await relationships.locator(`[data-relationship-add="${epic.id}"]`).click();
  await relationships.locator(`[data-relationship-remove="${epic.id}"][data-relationship-kind="parent"]`).waitFor();

  await page.locator('#task-form [data-rich-mode="source"]').click();
  await page.locator('#task-form [name="body"]').fill("# Browser notes\n\n- [ ] Persist this task\n\n<script>window.__pwned=true</script>");
  await page.locator("#task-form [data-rich-preview]").click();
  await expect(page.locator("#markdown-preview h1")).toHaveText("Browser notes");
  expect(await page.evaluate(() => window.__pwned)).toBeUndefined();
  await page.locator('#task-form [type="submit"]').click();
  await page.locator("dialog").waitFor({ state: "detached" });
  created = (await snapshot()).tasks.find((t) => t.title === "Browser-tested task");
  expect(created.type).toBe("bug");
  expect(created.priority).toBe("urgent");
  expect(created.parent).toBe(epic.id);
  expect(created.tags).toEqual([]);
});

test("Table edits to a title and a status persist", async ({ page }) => {
  await openDemo(page, "table");
  const cell = page.locator(`[data-task-field="title"][data-id="${created.id}"]`);
  await cell.waitFor();
  await saved(page, async () => {
    await cell.fill("Edited in the grid");
    await cell.press("Tab");
  });
  await saved(page, () => page.locator(`[data-task-field="status"][data-id="${created.id}"]`).selectOption("review"));
  const task = (await snapshot()).tasks.find((t) => t.id === created.id);
  expect(task.title).toBe("Edited in the grid");
  await expect.poll(async () => (await snapshot()).tasks.find((t) => t.id === created.id).status).toBe("review");
});

test("dragging a Kanban card to Done saves its status", async ({ page }) => {
  await openDemo(page, "kanban");
  // Kanban fits a whole number of columns and snaps its horizontal scroll, so at this width
  // Done starts off-screen: bring it into view before dragging.
  await page.locator('[data-drop-status="done"]').scrollIntoViewIfNeeded();
  await saved(page, () => page.locator(`[data-drag-task="${created.id}"]`).dragTo(page.locator('[data-drop-status="done"]')), created.id);
  expect((await snapshot()).tasks.find((t) => t.id === created.id).status).toBe("done");
});

test("the Tree collapses a parent, expands everything again, and search narrows the rows", async ({ page }) => {
  await openDemo(page, "tree");
  const row = page.locator(`[data-action="task-open"][data-id="${created.id}"]`);
  await page.locator(`[data-action="collapse"][data-id="${epic.id}"]`).click();
  await expect(row).toHaveCount(0);
  await click(page, "tree-cycle");
  await expect(row).not.toHaveCount(0);
  await page.locator("#search").fill("Edited in the grid");
  await expect(page.locator(".task-row:not(.tree-context)")).toHaveCount(1);
  await page.locator("#search").fill("");
});

test("a canvas note edits on double-click, and dragging it saves its new position", async ({ page }) => {
  await openDemo(page, "board");
  await page.locator("#zoom-label").dblclick();
  const sticky = page.locator('[data-node="n-note"]');
  await sticky.dblclick();
  await page.locator("#canvas-inline-form").waitFor();
  await page.locator("#canvas-inline-form .inline-rich").fill("Edited on the canvas");
  await saved(page, () => page.locator('[data-pro="search-toggle"]').click());
  expect((await snapshot()).boards[0].nodes.find((n) => n.id === "n-note").text).toBe("Edited on the canvas");
  const before = (await snapshot()).boards[0].nodes.find((n) => n.id === "n-note");
  const box = await sticky.boundingBox();
  await saved(page, async () => {
    await page.mouse.move(box.x + 50, box.y + 50);
    await page.mouse.down();
    await page.mouse.move(box.x + 110, box.y + 90, { steps: 8 });
    await page.mouse.up();
  });
  expect((await snapshot()).boards[0].nodes.find((n) => n.id === "n-note").x).not.toBe(before.x);
});

test("a new sticky note and connector persist, with undo and redo, across a reload", async ({ page }) => {
  await openDemo(page, "board");
  await page.locator('[data-action="board-add"][data-tool="sticky"]').click();
  await page.locator("#canvas").click({ position: { x: 450, y: 350 } });
  await page.locator("#canvas-inline-form .inline-rich").fill("New persistent sticky");
  await page.locator('[data-pro="search-toggle"]').click();
  // The board save label reads "Saved automatically" (public/save-state.js).
  await expect(page.locator("#board-save")).toHaveText("Saved automatically");
  const added = (await snapshot()).boards[0].nodes.find((n) => n.text === "New persistent sticky");
  expect(added).toBeTruthy();
  await page.locator("#zoom-label").dblclick();
  await page.locator('[data-action="board-tool"][data-tool="connect"]').click();
  await page.locator('[data-node="n-note2"]').click();
  await saved(page, () => page.locator(`[data-node="${added.id}"]`).click());
  expect((await snapshot()).boards[0].edges).toHaveLength(3);
  await saved(page, () => click(page, "board-undo"));
  expect((await snapshot()).boards[0].edges).toHaveLength(2);
  await saved(page, () => click(page, "board-redo"));
  expect((await snapshot()).boards[0].edges).toHaveLength(3);
  await page.reload();
  await page.locator(`[data-node="${added.id}"]`).waitFor();
});

test("a project keeps several named canvases", async ({ page }) => {
  await openDemo(page, "board");
  await click(page, "board-new");
  await page.locator('#board-form [name="title"]').fill("Another canvas");
  await page.locator('#board-form [type="submit"]').click();
  await page.locator("dialog").waitFor({ state: "detached" });
  expect((await snapshot()).boards).toHaveLength(2);
  await page.getByRole("button", { name: "Board settings", exact: true }).click();
  // Board settings is an anchored popover that applies changes as you edit; Apply was
  // removed, and closing it flushes the pending rename.
  await saved(page, async () => {
    await page.locator('#board-settings-form [name="title"]').fill("Planning canvas");
    await page.getByRole("button", { name: "Close board settings", exact: true }).click();
  });
  await page.locator("#board-settings-form").waitFor({ state: "detached" });
  expect((await snapshot()).boards.map((b) => b.title)).toContain("Planning canvas");
});

test("Markdown edited outside the app shows live, and a conflicting edit keeps the browser draft in Recovery", async ({ page }) => {
  await openDemo(page);
  const file = path.join(app.root, created.file);
  await fs.writeFile(file, (await fs.readFile(file, "utf8")).replace("Edited in the grid", "Changed in Obsidian"));
  // List rows edit titles in place; the row's ID button opens the editor and names the task
  // (see the List and Tree row changes in CHANGELOG.md).
  const openChanged = page.getByRole("button", { name: `Open ${created.key || created.id}: Changed in Obsidian`, exact: true }).first();
  await openChanged.click();
  await page.locator('#task-form [name="title"]').fill("Unsaved browser edit");
  await fs.writeFile(file, (await fs.readFile(file, "utf8")).replace("Changed in Obsidian", "Newer Obsidian edit"));
  // Existing cards save automatically (no Save button). The conflicting save keeps the
  // browser draft and says so in the autosave status.
  await expect(page.locator("#task-form [data-autosave-status]")).toHaveText(/^Conflict — changes kept in Recovery$/);
  await expect(page.locator('#task-form [name="title"]')).toHaveValue("Unsaved browser edit");
  page.once("dialog", (dialog) => dialog.accept());
  await click(page, "dialog-close");
  // Since 0.19.31 Personal settings is the "You" section of the Settings page, opened from
  // the top bar's single Settings button.
  await openSettingsPage(page);
  await selectSettingsPage(page, "personal");
  // The header save warning also links to Recovery; use the Settings page's one.
  await page.locator('.personal-workspace-actions [data-feature="recovery"]').click();
  await page.locator('[data-feature="resolve-remote"]').click();
  await page.locator('[data-action="dialog-close"]').first().click();
});

test("organisations are created and renamed, scope their projects, and are remembered", async ({ page }) => {
  await openDemo(page);
  const original = (await snapshot()).project;
  await click(page, "organisation-new");
  await page.locator('#organisation-form [name="title"]').fill("Acme Studio");
  await page.locator('#organisation-form [name="body"]').fill("Projects for our studio.");
  await page.locator('#organisation-form [type="submit"]').click();
  await page.locator("dialog").waitFor({ state: "detached" });
  const selected = page.locator("#organisation-select option:checked");
  await expect(selected).toHaveText("Acme Studio");
  studio = (await app.store.listOrganisations()).organisations.find((o) => o.title === "Acme Studio");
  expect(studio).toBeTruthy();
  await expect(page.locator(".project-link")).toHaveCount(0);
  await expect(page.locator(".task-row")).toHaveCount(0);
  for (const title of ["Website refresh", "Marketing launch"]) {
    await click(page, "project-new");
    await expect(page.locator('#project-form [name="organisation"]')).toHaveValue(studio.id);
    await page.locator('#project-form [name="title"]').fill(title);
    await page.locator('#project-form [type="submit"]').click();
    await expect(page.getByRole("heading", { name: title, exact: true })).toBeVisible();
  }
  await expect(page.locator(".project-link")).toHaveCount(2);
  expect((await app.store.list(studio.id)).projects).toHaveLength(2);
  await openSettingsPage(page, "organisation");
  await page.locator('#organisation-form [name="title"]').fill("Acme Collective");
  await page.locator('#organisation-form [type="submit"]').click();
  await expect(selected).toHaveText("Acme Collective");
  expect((await app.store.getOrganisation(studio.id)).title).toBe("Acme Collective");
  // Each organisation remembers its last project, also after a reload.
  await openSidebar(page);
  await page.locator("#organisation-select").selectOption("o-default");
  await expect(page.getByRole("heading", { name: original.title, exact: true })).toBeVisible();
  await expect(page.locator(".project-link")).toHaveCount(1);
  await openSidebar(page);
  await page.locator("#organisation-select").selectOption(studio.id);
  await expect(page.getByRole("heading", { name: "Marketing launch", exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: "Marketing launch", exact: true })).toBeVisible();
  await expect(page.locator("#organisation-select")).toHaveValue(studio.id);
});

test("moving a project to another organisation keeps its tasks and canvases, and the organisation overview lists it", async ({ page }) => {
  await openDemo(page);
  await expect(page.locator("#organisation-select")).toHaveValue("o-default");
  const beforeMove = await snapshot();
  // One Settings button, at the bottom of the sidebar (0.20.24; the top bar's before).
  await openSettingsPage(page);
  await selectSettingsPage(page, "teams");
  await page.locator('#project-form [name="organisation"]').selectOption(studio.id);
  await page.locator('#project-form [type="submit"]').click();
  await expect(page.locator("#organisation-select")).toHaveValue(studio.id);
  await expect(page.locator(".project-link")).toHaveCount(3);
  // The project settings page refreshes the workspace before navigation settles.
  await expect(page.locator("#toasts").getByText("Organisation & teams saved.", { exact: true })).toBeVisible();
  const afterMove = await snapshot();
  expect(afterMove.project.organisation).toBe(studio.id);
  expect(afterMove.tasks).toEqual(beforeMove.tasks);
  expect(afterMove.boards).toEqual(beforeMove.boards);
  // The default organisation is now empty, also after a reload.
  await openSidebar(page);
  await page.locator("#organisation-select").selectOption("o-default");
  await expect(page.getByRole("heading", { name: /A little space for your/ })).toBeVisible();
  await expect(page.locator(".project-link")).toHaveCount(0);
  await expect(page.locator('[data-action="task-open"]')).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole("heading", { name: /A little space for your/ })).toBeVisible();
  await expect(page.locator("#organisation-select")).toHaveValue("o-default");
  await openSidebar(page);
  await page.locator("#organisation-select").selectOption(studio.id);
  await expect(page.getByRole("heading", { name: demo.title, exact: true })).toBeVisible();
  await click(page, "home");
  await expect(page.getByRole("heading", { name: "Acme Collective", exact: true })).toBeVisible();
  await expect(page.locator(".project-card")).toHaveCount(3);
  await page.locator(`.project-card[data-id="${demo.id}"]`).click();
  await expect(page.getByRole("heading", { name: demo.title, exact: true })).toBeVisible();
});

onDevices(["phone"], () => {
  test("the phone layout fits without horizontal scrolling, and the drawer closes from its overlay", async ({ page }) => {
    await page.goto(`${app.base}/#project/${demo.id}/list`);
    await page.locator(".breadcrumb strong").waitFor();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.locator(".mobile-menu").click();
    await page.locator(".sidebar.open").waitFor();
    await page.locator(".sidebar-overlay").click({ position: { x: 350, y: 100 } });
    await page.waitForFunction(() => !document.querySelector(".sidebar.open"));
  });
});
