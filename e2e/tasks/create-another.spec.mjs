// Create another: a failed create keeps the new card; creating with "Create another" keeps
// type, priority, status, assignee, parent and dates for the next card while clearing the
// title, description and subtasks, without moving the board camera; subtasks are created
// once. Every creation entry point shares the board's compact, non-blocking panel, on
// desktop and phone in both themes, and returns focus to New when closed.
import { test, expect, useApp } from "../fixtures.mjs";
import { newCard } from "../helpers/new-card.mjs";
import { selectProjectView } from "../helpers/menu-controls.mjs";
import { legacySubtasks } from "../helpers/task-editor-helpers.mjs";

const app = useApp(async (store) => {
  const org = await store.createOrganisation({ title: "Batch studio", people: [{ id: "alice", name: "Alice" }], teams: [{ id: "design", name: "Design", members: ["alice"] }] });
  const project = await store.createProject({ title: "Panel lab", organisation: org.id, teams: ["design"] });
  const parent = await store.createTask(project.id, { title: "Parent epic", type: "epic" });
  return { project, parent };
});
const snapshot = () => app.store.snapshot(app.project.id);
const taskCount = async () => (await snapshot()).tasks.length;
const boardTaskCount = async () => (await snapshot()).boards[0].nodes.filter((n) => n.type === "task").length;
test.use({ viewportSize: { width: 1500, height: 1000 } });

async function newBoardCard(page) {
  await page.locator("[data-action=board-task]").click();
  await page.locator("[data-action=board-create-task]").click();
  const form = page.locator("#task-form");
  await form.waitFor();
  return form;
}
const pick = async (form, name, value) => {
  await form.locator(`[data-task-picker="${name}"] .task-picker-trigger`).click();
  await form.locator(`[data-task-picker="${name}"] [data-picker-value="${value}"]`).click();
};
const createAnother = (form) => form.getByRole("checkbox", { name: "Create another" });
const createCard = (form) => form.getByRole("button", { name: "Create card", exact: true });

test("on the board, create another keeps the shared fields and clears the rest, after a failed create keeps the card", async ({ page }) => {
  const { parent } = app;
  await page.goto(`${app.base}/#project/${app.project.id}/board`);
  const before = await taskCount();
  const boardBefore = await boardTaskCount();
  let form = await newBoardCard(page);
  await expect(form.locator("[name=priority]")).toHaveValue("medium");
  await expect(form.getByText("Planning & relationships", { exact: true })).toHaveCount(0);
  await pick(form, "type", "story");
  await pick(form, "priority", "high");
  await form.locator("[name=dependencies]").evaluate((select, id) => {
    select.value = id;
    select.dispatchEvent(new Event("change", { bubbles: true }));
  }, parent.id);
  // A parent inherited from task creation or a restored browser draft stays intact.
  await form.locator("[name=parent]").evaluate((input, id) => {
    input.value = id;
    input.dispatchEvent(new Event("input", { bubbles: true }));
  }, parent.id);
  await form.locator("[name=status]").selectOption("review");
  await form.locator("[name=assignee]").selectOption("Alice");
  await form.locator("[name=due]").fill("2026-10-30");
  await form.locator("[name=title]").fill("Repeat one");
  await form.locator('[aria-label="Task description"]').fill("Only the first description");
  await legacySubtasks(form, [
    { title: "Queued child", type: "task" },
    { title: "Typed child", type: "task" },
  ]);
  await createAnother(form).check();
  await page.getByRole("button", { name: "Close new task", exact: true }).click();
  form = await newBoardCard(page);
  await form.locator("[data-feature=form-restore]").click();
  await expect(createAnother(form)).toBeChecked();
  const camera = await page.locator("#canvas-world").getAttribute("style");
  const requestId = await form.locator("[name=creation_request]").inputValue();
  const url = `**/api/projects/${app.project.id}/tasks`;
  await page.route(url, (route) => route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: "Temporary create failure" }) }));
  await createCard(form).click();
  await form.locator(".form-error:not(.hidden):not([hidden])").first().waitFor();
  await expect(form.locator("[name=title]")).toHaveValue("Repeat one");
  await expect(form.locator('[aria-label="Task description"]')).toContainText(/first description/);
  expect(await taskCount()).toBe(before);
  await page.unroute(url);
  await createCard(form).click();
  await expect.poll(taskCount).toBe(before + 3);
  await expect(form.locator("[name=creation_request]")).not.toHaveValue(requestId);
  await expect(page.locator("#board-task-panel")).toHaveCount(0);
  await expect(page.locator("dialog:modal")).toHaveCount(0);
  expect(await page.locator("#canvas-world").getAttribute("style")).toBe(camera);
  for (const [name, value] of Object.entries({ type: "story", priority: "high", status: "review", assignee: "Alice", parent: parent.id, due: "2026-10-30", title: "", pendingSubtasks: "[]" }))
    await expect(form.locator(`[name="${name}"]`), name).toHaveValue(value);
  await expect(form.locator('[aria-label="Task description"]')).toHaveText(/^\s*$/);
  await expect(createAnother(form)).toBeChecked();
  await expect(form.locator("[name=title]")).toBeFocused();
  await form.locator("[name=title]").fill("Repeat two");
  await createAnother(form).uncheck();
  await createCard(form).click();
  await expect(form).toHaveCount(0);
  await expect.poll(taskCount).toBe(before + 4);
  const final = await snapshot();
  const first = final.tasks.find((t) => t.title === "Repeat one");
  const second = final.tasks.find((t) => t.title === "Repeat two");
  for (const task of [first, second]) expect(task, task.title).toMatchObject({ parent: parent.id, priority: "high", status: "review", assignee: "Alice", due: "2026-10-30", estimate: null });
  expect(second.body.trim()).toBe("");
  expect(first.dependencies).toEqual([parent.id]);
  expect(second.dependencies).toEqual([]);
  expect(final.tasks.filter((t) => t.parent === first.id)).toHaveLength(2);
  expect(final.tasks.filter((t) => t.parent === second.id)).toHaveLength(0);
  expect(await boardTaskCount()).toBe(boardBefore + 2);
});

test("the board's new card keeps assignee, status and priority in one row with the dates after them, on desktop and phone", async ({ page }) => {
  await page.goto(`${app.base}/#project/${app.project.id}/board`);
  const form = await newBoardCard(page);
  // The open panel is resized from desktop to phone.
  for (const width of [1500, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.waitForFunction(() => document.querySelector(".board-task-editor").getBoundingClientRect().right <= innerWidth);
    const { priority, status, assignee, start, due } = await form.evaluate((form) => {
      const rect = (selector) => form.querySelector(selector).getBoundingClientRect().toJSON();
      return { priority: rect("[data-task-picker=priority]"), status: rect("[name=status]"), assignee: rect("[name=assignee]"), start: rect(".date-field:has([name=start])"), due: rect(".date-field:has([name=due])") };
    });
    // Field order is assignee, status, priority (0.19.9).
    expect(assignee.x < status.x && status.x < priority.x, `${width}px: order`).toBe(true);
    expect(Math.abs(priority.y - status.y) < 2 && Math.abs(status.y - assignee.y) < 2, JSON.stringify({ width, priority, status, assignee })).toBe(true);
    // Wide panels put the dates beside the fields, narrow ones below them (this used to pass on a sub-pixel).
    const after = width > 600 ? start.x > priority.x + priority.width - 1 : start.y > status.y + status.height - 1;
    expect(after && Math.abs(start.y - due.y) < 2 && start.x < due.x, `${width}px: dates ${width > 600 ? "beside" : "below"}, side by side`).toBe(true);
    expect(await form.evaluate((el) => el.scrollWidth <= el.clientWidth + 1), `${width}px: no overflow`).toBe(true);
  }
});

test("from the List, create another clears the title, keeps the panel open and places nothing on the board", async ({ page }) => {
  await page.goto(`${app.base}/#project/${app.project.id}/list`);
  const before = await taskCount();
  const boardBefore = await boardTaskCount();
  await newCard(page);
  const form = page.locator("#task-form");
  await expect(form.getByText("Planning & relationships", { exact: true })).toHaveCount(0);
  await form.locator("[name=title]").fill("List repeated task");
  await createAnother(form).check();
  await createCard(form).click();
  await expect(form.locator("[name=title]")).toHaveValue("");
  await expect(page.locator("dialog:modal")).toHaveCount(0);
  await form.locator("[name=title]").press("Escape");
  await expect.poll(taskCount).toBe(before + 1);
  expect(await boardTaskCount()).toBe(boardBefore);
});

const views = ["board", "overview", "list", "tree", "table", "kanban", "calendar", "timeline", "capacity"];
for (const width of [1500, 390])
  for (const theme of ["light", "dark"])
    test.describe(`${width}px ${theme}`, () => {
      test.use({ viewportSize: { width, height: 1000 } });
      test("every creation entry point opens the same compact, non-blocking new card and returns focus to New", async ({ page }) => {
        await page.goto(`${app.base}/#project/${app.project.id}/list`);
        await page.locator(".topbar").waitFor();
        await page.evaluate((value) => (document.documentElement.dataset.theme = value), theme);
        const before = await taskCount();
        const form = page.locator("#task-form");
        for (const view of views) {
          await selectProjectView(page, view);
          await newCard(page);
          await form.waitFor();
          await expect(form.locator("[name=priority]")).toHaveValue("medium");
          // Let the panel settle into its final position (two frames).
          await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
          const dialog = page.locator(".task-dialog");
          const box = await dialog.boundingBox();
          const toolbar = await page.locator("#view-toolbar").boundingBox();
          const context = `${view}, ${width}px, ${theme}`;
          if (width <= 600) expect(box, `Phone card page: ${context}`).toEqual({ x: 0, y: 0, width, height: 1000 });
          else {
            expect(box.width <= 680 && box.height <= 760, `Compact panel: ${context}`).toBe(true);
            expect(box.x >= 12 && box.x + box.width <= width - 12, `Fits width: ${context}`).toBe(true);
            expect(box.y >= toolbar.y + toolbar.height && box.y + box.height <= 984, `Below toolbar, within viewport: ${context}`).toBe(true);
          }
          if (width <= 600) await form.locator(".task-editor-foot").scrollIntoViewIfNeeded();
          const footer = await form.locator(".task-editor-foot").boundingBox();
          expect(footer.y >= box.y && footer.y + footer.height <= box.y + box.height, `Footer stays inside: ${context}`).toBe(true);
          await expect(page.locator("dialog:modal")).toHaveCount(0);
          await expect(dialog.locator(".task-panel-resizer")).toHaveCount(0);
          await expect(form.locator("[name=title]"), context).toBeFocused();
          expect(await form.evaluate((el) => el.scrollWidth <= el.clientWidth + 1), `No overflow: ${context}`).toBe(true);
          await expect(createAnother(form)).toBeVisible();
          await expect(createCard(form)).toBeVisible();
          await form.locator(".task-description").scrollIntoViewIfNeeded();
          await expect(form.locator(".task-description"), `Lower fields reachable: ${context}`).toBeVisible();
          await form.locator("[name=title]").focus();
          await form.locator(".task-editor-content > .dialog-body").evaluate((el) => (el.scrollTop = 0));
          await form.locator("[name=title]").press("Escape");
          await expect(form).toHaveCount(0);
          if (view !== "board") await expect(page.locator(".topbar .new-menu > summary:visible"), `Focus returns: ${context}`).toBeFocused();
        }
        expect(await taskCount(), "Opening and closing creates no tasks").toBe(before);
      });
    });
