import {chooseCardPane} from '../helpers/card-panes.mjs';
// Board: cards are created and edited in a compact, non-modal panel beside the board
// (AGENTS.md "Dialogs and contextual panels"). The board stays usable, drafts are recovered,
// the fields keep the shared order (assignee, status, priority, then dates; 0.19.9) on desktop
// and phone in both themes, linked cards show their fields with neutral fills and coloured
// borders (0.19.12), and History opens beside the panel and restores a version. How the panel fits
// phones and themes is in board-task-panel-fit.spec.mjs (split by tier, F0.22-21).
import { test, expect, useApp } from "../fixtures.mjs";
import { legacySubtasks } from "../helpers/task-editor-helpers.mjs";
import { selectProjectView, acceptConfirm, clickControl } from "../helpers/menu-controls.mjs";
import { newCard } from "../helpers/new-card.mjs";

const app = useApp();

// A fresh project per test, so task counts belong to the test.
const newProject = () => app.store.createProject({ title: "Panel lab" });
const snapshot = (project) => app.store.snapshot(project.id);
const savedTask = async (project, id) => (await snapshot(project)).tasks.find((t) => t.id === id);
// A linked card on the board, with a subtask and an earlier version for History to restore.
async function seedCard() {
  const project = await newProject();
  const created = await app.store.createTask(project.id, { title: "Compact task", type: "story", priority: "high", body: "Rich description" });
  await app.store.createTask(project.id, { title: "Child from panel", type: "task", parent: created.id });
  const task = await app.store.updateTask(project.id, created.id, { revision: created.revision, status: "review" });
  const board = (await snapshot(project)).boards[0];
  await app.store.updateBoard(project.id, board.id, { revision: board.revision, nodes: [{ id: "card", type: "task", task: task.id, x: 20, y: 40, w: 320, h: 240 }] });
  return { project, task, board };
}
async function openBoard(page, project) {
  await page.goto(`${app.base}/#project/${project.id}/board`);
  await page.locator("#canvas").waitFor();
}
async function openNewCardPanel(page) {
  // Phones keep the board tools in the dock's Add row.
  await clickControl(page.locator("[data-action=board-task]"));
  await page.locator("[data-action=board-create-task]").click();
  await page.locator(".board-task-editor").waitFor();
}
const editor = (page) => page.locator(".board-task-editor");
const title = (page) => page.locator("#task-form [name=title]");
const typeTrigger = (page) => page.locator("[data-task-picker=type] .task-picker-trigger");
const card = (page) => page.locator('[data-node="card"]');

async function checkMetadataLayout(page) {
  const fields = await page.locator(".task-fields [name], .task-date-range [name]").evaluateAll((fields) => fields.map((el) => ({ name: el.name, x: el.closest(".field").getBoundingClientRect().x, y: el.closest(".field").getBoundingClientRect().y })));
  // Field order is assignee, status, priority (0.19.9); each time follows its date in the date range (F0.23-11).
  expect(fields.map((f) => f.name)).toEqual(["assignee", "status", "priority", "start", "start_time", "due", "due_time"]);
  expect(fields[0].x < fields[1].x && fields[1].x < fields[2].x, "assignee, status and priority left to right").toBe(true);
  expect(Math.abs(fields[0].y - fields[2].y), "assignee and priority share a row").toBeLessThan(2);
  expect(Math.abs(fields[3].y - fields[5].y), "start and due share a row").toBeLessThan(2);
}

test("a new card opens as a compact panel, the board stays usable, and the recovered draft saves with all its fields", async ({ page }) => {
  const project = await newProject();
  await openBoard(page, project);
  await openNewCardPanel(page);
  await expect(page.locator("dialog:modal"), "the panel is not modal").toHaveCount(0);
  await expect(page.locator("#board-task-panel")).toHaveCount(0);
  expect((await editor(page).boundingBox()).width).toBeLessThanOrEqual(681);
  await title(page).fill("Compact task");
  await page.locator('[aria-label="Card description"]').fill("Rich description");
  await legacySubtasks(page.locator("#task-form"), [{ title: "Child from panel", type: "task" }]);
  // The board remains interactive; zooming it keeps the form data.
  const c = await page.locator("#canvas").boundingBox();
  const zoom = await page.locator("#zoom-label").innerText();
  await page.mouse.move(c.x + c.width * 0.8, c.y + c.height * 0.55);
  await page.mouse.wheel(0, 200);
  await expect(page.locator("#zoom-label")).not.toHaveText(zoom);
  await expect(title(page)).toHaveValue("Compact task");
  await typeTrigger(page).click();
  await page.locator("[data-task-picker=type] [data-picker-value=story]").click();
  await page.locator("[data-task-picker=priority] .task-picker-trigger").click();
  await page.locator("[data-task-picker=priority] [data-picker-value=high]").click();
  await page.locator("[data-date-range] [data-date-picker]:visible").click();
  await page.locator("[data-date-phase=due]").click();
  await page.locator("[data-date-clear]").click();
  await page.getByRole("button", { name: "Close new card", exact: true }).click();
  await expect(editor(page)).toHaveCount(0);
  // Reopening offers the closed draft back.
  await page.locator("[data-action=board-task]").click();
  await page.locator("[data-action=board-create-task]").click();
  await page.locator("[data-feature=form-restore]").click();
  await expect(title(page)).toHaveValue("Compact task");
  await expect(page.locator("[name=pendingSubtasks]")).toHaveValue(/Child from panel/);
  // Ctrl+Enter saves the card and its subtask and returns to Project tasks.
  await title(page).focus();
  await page.keyboard.press("Control+Enter");
  await expect.poll(async () => (await snapshot(project)).tasks.length).toBe(2);
  await expect(editor(page)).toHaveCount(0);
  await expect(page.locator("#board-task-panel")).toBeVisible();
  const saved = await snapshot(project);
  const task = saved.tasks.find((t) => t.title === "Compact task");
  expect(task.type).toBe("story");
  expect(task.priority).toBe("high");
  expect(task.body).toMatch(/Rich description/);
  expect(saved.tasks.find((t) => t.title === "Child from panel").parent).toBe(task.id);
  expect(saved.boards[0].nodes.filter((n) => n.task === task.id), "the card is placed on the board").toHaveLength(1);
});

test("linked card fields follow the shared order in one box coloured by priority, and status colours its text", async ({ page }) => {
  const { project, task } = await seedCard();
  await openBoard(page, project);
  await expect(card(page).locator(".live-card-heading")).toContainText("Compact task");
  expect(await card(page).locator(".live-card-state").evaluate((el) => [...el.querySelectorAll(":scope > *, :scope > .field-box > *")].map((x) => x.className))).toEqual([
    "field-box",
    "canvas-task-assignee",
    "canvas-task-status",
    "canvas-task-priority priority high",
    "canvas-task-dates",
  ]);
  // Status values differ by text colour; the shared box takes the priority's colour (29 Oct, item 15).
  const status = card(page).locator(".canvas-task-status"), box = card(page).locator(".live-card-state > .field-box");
  const ink = await status.evaluate((el) => getComputedStyle(el).color), border = await box.evaluate((el) => getComputedStyle(el).borderTopColor);
  await card(page).locator("[data-canvas-status]").selectOption("done");
  await expect.poll(async () => (await savedTask(project, task.id)).status).toBe("done");
  await expect(status).not.toHaveCSS("color", ink);
  await card(page).locator("[data-canvas-task-field=priority]").selectOption("urgent");
  await expect.poll(async () => (await savedTask(project, task.id)).priority).toBe("urgent");
  await expect(box).not.toHaveCSS("border-top-color", border);
});

test("Details opens the card in the side panel without moving the board, and History restores a version beside it", async ({ page }) => {
  const { project, task } = await seedCard();
  await openBoard(page, project);
  const camera = await page.locator("#canvas-world").getAttribute("style");
  await card(page).locator("[data-pro=task-details]").click();
  await editor(page).waitFor();
  await expect(page.locator("dialog:modal")).toHaveCount(0);
  await expect(page.locator("#task-form")).toHaveAttribute("data-id", task.id);
  await expect(editor(page).locator(".board-task-editor-heading .task-key")).toHaveText(task.key);
  await expect(page.locator("#canvas-world"), "opening the card does not move the board").toHaveAttribute("style", camera);
  // Delete, Duplicate, Archive, Version history, Comments and Card board (F0.21-76).
  await expect(editor(page).locator(".task-editor-actions button")).toHaveCount(6);
  await expect(editor(page).locator(".task-subtasks")).toHaveCount(0);
  await checkMetadataLayout(page);
  await chooseCardPane(page, 'history');
  await editor(page).locator(".task-history-panel .recovery-item").first().waitFor();
  const history = await editor(page).locator(".task-history-panel").boundingBox();
  const panel = await editor(page).boundingBox();
  expect(history.x, "History opens inside the left side of the panel").toBeGreaterThanOrEqual(panel.x);
  expect(history.x + history.width).toBeLessThanOrEqual((await editor(page).locator(".task-editor-content > .dialog-body").boundingBox()).x);
  expect(history.x + history.width).toBeLessThanOrEqual(page.viewportSize().width);
  await editor(page).locator(".task-history-panel .recovery-item:has([data-task-modal=history-restore]) summary").first().click();
  await editor(page).locator("[data-task-modal=history-restore]").first().click();
  await acceptConfirm(page);
  await expect(page.locator("[data-feature=task-history]")).toHaveAttribute("aria-expanded", "true");
  await expect(page.locator(".board-task-editor-heading")).toHaveCount(1);
  await expect(page.locator("dialog:modal")).toHaveCount(0);
});

test("edits in the side panel save automatically and keep one card on the board", async ({ page }) => {
  const { project, task } = await seedCard();
  await openBoard(page, project);
  await card(page).locator("[data-pro=task-details]").click();
  await title(page).fill("Updated from board panel");
  await page.locator('[aria-label="Card description"]').fill("Updated rich description");
  await title(page).press("Control+Enter");
  await expect(page.locator("[data-autosave-status]")).toHaveText("");
  await page.locator("[data-action=dialog-close]").click();
  await expect(editor(page)).toHaveCount(0);
  await expect.poll(async () => (await savedTask(project, task.id)).title).toBe("Updated from board panel");
  const updated = await snapshot(project);
  expect(updated.tasks).toHaveLength(2);
  expect(updated.tasks.find((t) => t.id === task.id).body).toMatch(/Updated rich description/);
  expect(updated.boards[0].nodes.filter((n) => n.task === task.id)).toHaveLength(1);
  await expect(page.locator("#board-task-panel")).toHaveCount(0);
});

test("New card from the header replaces the open card, shows no key until saved, and closes on navigation", async ({ page }) => {
  const { project } = await seedCard();
  await openBoard(page, project);
  await card(page).locator("[data-pro=task-details]").click();
  await editor(page).waitFor();
  await newCard(page);
  await expect(page.locator("#task-form")).toHaveAttribute("data-id", "");
  await expect(editor(page).locator(".board-task-editor-heading .task-key"), "a new card shows no key until it is saved").toHaveCount(0);
  await page.locator("dialog [data-action=dialog-close]").click();
  await newCard(page);
  await title(page).fill("Preserve on navigation");
  await selectProjectView(page, "list");
  await expect(editor(page)).toHaveCount(0);
});
