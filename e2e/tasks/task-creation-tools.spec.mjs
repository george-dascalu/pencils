// Creation tools: a new card's child drafts and retry token survive closing and restoring
// the browser draft and create their subtasks once; the date picker is Monday-first with
// distinct weekends and stays on screen; the hierarchy editor refuses rules existing cards
// break; the board's task browser searches, filters and places cards without moving the
// camera, on desktop and phone in both themes.
import { test, expect, useApp } from "../fixtures.mjs";
import { newCard } from "../helpers/new-card.mjs";
import { legacySubtasks } from "../helpers/task-editor-helpers.mjs";
import { openSettingsPage } from "../helpers/menu-controls.mjs";

const app = useApp(async (store) => {
  const project = await store.createProject({ title: "Creation tools", key: "TOOLS" });
  const bug = await store.createTask(project.id, { title: "Find this bug", type: "bug", status: "review" });
  await store.createTask(project.id, { title: "Other task", type: "task", status: "todo" });
  return { project, bug };
});
const snap = () => app.store.snapshot(app.project.id);
const openList = async (page) => {
  await page.goto(`${app.base}/#project/${app.project.id}/list`);
  await page.locator(".topbar").waitFor();
};

test("a new card's child drafts and retry token survive closing and restoring, and create their subtasks once", async ({ page }) => {
  await openList(page);
  const before = (await snap()).tasks.length;
  await newCard(page);
  await page.locator("#task-form [name=title]").fill("Parent with drafts");
  await legacySubtasks(page.locator("#task-form"), [
    { title: "First draft", type: "task" },
    { title: "Second draft", type: "bug" },
  ]);
  await expect(page.locator("[name=pendingSubtasks]")).toHaveValue(/First draft/);
  expect((await snap()).tasks).toHaveLength(before);
  const request = await page.locator("[name=creation_request]").inputValue();
  // Click away, then start another card: the unsent card is offered back as a browser draft.
  await page.mouse.click(5, 5);
  await newCard(page);
  await page.locator("[data-feature=form-restore]").click();
  await expect(page.locator("[name=creation_request]")).toHaveValue(request);
  await expect(page.locator("[name=pendingSubtasks]")).toHaveValue(/Second draft/);
  await page.locator("#task-form [type=submit]").click();
  await expect.poll(async () => (await snap()).tasks.length).toBe(before + 3);
  const tasks = (await snap()).tasks;
  const parent = tasks.find((t) => t.title === "Parent with drafts");
  expect(tasks.filter((t) => t.parent === parent.id)).toHaveLength(2);
  expect(tasks.find((t) => t.title === "Second draft").type).toBe("bug");
});

test("the date picker is Monday-first with distinct weekends, stays on screen and closes with Escape", async ({ page }) => {
  await openList(page);
  await newCard(page);
  await page.locator("#task-form [name=due]").fill("2026-10-16");
  await page.locator(".date-field:has([name=due]) [data-date-picker]").click();
  await expect(page.locator(".date-picker-popover thead th").first()).toHaveText("Mon");
  await expect(page.locator(".date-picker-popover th.weekend")).toHaveCount(2);
  await expect(page.locator(".date-picker-popover td.weekend")).toHaveCount(12);
  // The open picker is resized from desktop to phone.
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.waitForFunction(() => {
      const r = document.querySelector(".date-picker-popover").getBoundingClientRect();
      return r.left >= 0 && r.right <= innerWidth + 1;
    });
    const box = await page.locator(".date-picker-popover").boundingBox();
    expect(box.x >= 0 && box.x + box.width <= width + 1, `${width}px`).toBe(true);
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.locator('td [data-date-value="2026-10-19"]').click();
  await expect(page.locator("[name=due]")).toHaveValue("2026-10-19");
  await page.locator(".date-field:has([name=due]) [data-date-picker]").click();
  await page.locator(".date-picker-popover").waitFor();
  await page.keyboard.press("Escape");
  await expect(page.locator(".date-picker-popover")).toHaveCount(0);
  await expect(page.locator("#task-form")).toHaveCount(1);
});

test("the hierarchy editor refuses rules that existing cards break, fits a phone, and saves enforcement", async ({ page }) => {
  // A task with a bug child, so "task → bug" cannot be removed while enforcing.
  const parent = await app.store.createTask(app.project.id, { title: "Hierarchy parent", type: "task" });
  await app.store.createTask(app.project.id, { title: "Hierarchy bug", type: "bug", parent: parent.id });
  await openList(page);
  // Since 0.19.31 the top bar's one Settings button opens the Settings page (was the project gear).
  await openSettingsPage(page, "hierarchy");
  await page.locator("[data-hierarchy-mode]").selectOption("enforced");
  await page.locator(".hierarchy-matrix > summary").click();
  await page.locator('[data-hierarchy-parent="task"][data-hierarchy-child="bug"]').uncheck();
  await page.locator("#settings-panel [type=submit]").click();
  await expect(page.getByText(/Move existing tasks before enforcing/)).toBeVisible();
  await page.locator('[data-hierarchy-parent="task"][data-hierarchy-child="bug"]').check();
  await page.locator('[data-hierarchy-parent="bug"][data-hierarchy-child="task"]').uncheck();
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${width}px: no horizontal scroll`).toBe(true);
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.locator("#settings-panel [type=submit]").click();
  await expect.poll(async () => (await snap()).project.schema.hierarchy?.mode).toBe("enforced");
});

test("the board's task browser searches, filters and places cards without moving the camera, on desktop and phone", async ({ page }) => {
  await page.goto(`${app.base}/#project/${app.project.id}/board`);
  const pick = page.locator("#board-task-panel [data-action=board-pick]");
  await page.locator(".board-tools [data-action=board-task]").click();
  await expect(page.locator("[data-board-menu=add]")).toHaveCount(0);
  await page.locator("#board-task-search").fill(app.bug.key);
  await expect(pick).toHaveCount(1);
  await page.locator("[data-board-task-filter=type]").selectOption("task");
  await expect(pick).toHaveCount(0);
  await page.locator("[data-board-task-filter=type]").selectOption("bug");
  await page.locator("[data-board-task-filter=status]").selectOption("review");
  await expect(pick).toHaveCount(1);
  const camera = await page.locator("#canvas-world").getAttribute("style");
  await pick.click();
  await expect.poll(async () => (await snap()).boards[0].nodes.some((n) => n.task === app.bug.id)).toBe(true);
  expect(await page.locator("#canvas-world").getAttribute("style")).toBe(camera);
  await expect(page.locator(".board-task-results")).toContainText("On board");
  await page.locator("[data-board-task-filter=placement]").selectOption("off");
  await expect(pick).toHaveCount(0);
  await page.locator("[data-board-task-filter=placement]").selectOption("on");
  for (const width of [1440, 390])
    for (const theme of ["light", "dark"]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.evaluate((t) => window.PencilsAppearance.write({ theme: t }), theme);
      if (width === 390 && (await page.locator(".sidebar.open").count())) await page.locator(".sidebar-overlay").click({ position: { x: 380, y: 200 } });
      if (width === 390) await page.waitForFunction(() => document.querySelector(".sidebar").getBoundingClientRect().right <= 1);
      const box = await page.locator("#board-task-panel").boundingBox();
      expect(box.x >= 0 && box.x + box.width <= width + 1, `${width}px ${theme}`).toBe(true);
    }
  await page.locator("#board-task-search").focus();
  await page.keyboard.press("Escape");
  await expect(page.locator("#board-task-panel")).toHaveCount(0);
  // Still at phone width: since 0.18.26 Project tasks sits in the Canvas tools palette.
  await page.locator(".phone-board-more").click();
  await page.locator(".board-tools [data-action=board-task]").click();
  await page.locator("[data-action=board-task-close]").focus();
  await page.keyboard.press("Space");
  await expect(page.locator("#board-task-panel")).toHaveCount(0);
});
