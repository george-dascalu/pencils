// Board: cards are created and edited in a compact, non-modal panel beside the board
// (AGENTS.md "Dialogs and contextual panels"). The board stays usable, drafts are recovered,
// the fields keep the shared order (assignee, status, priority, then dates; 0.19.9) on desktop
// and phone in both themes, linked cards show their fields with neutral fills and coloured
// borders (0.19.12), and History opens beside the panel and restores a version.
import { test, expect, onDevices, useApp } from "../fixtures.mjs";
import { legacySubtasks } from "../helpers/task-editor-helpers.mjs";
import { selectProjectView, acceptConfirm, clickControl } from "../helpers/menu-controls.mjs";
import { newCard } from "../helpers/new-card.mjs";
import { presetCamera } from "../helpers/board-canvas.mjs";

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
  const fields = await page.locator(".task-metadata [name]").evaluateAll((fields) => fields.map((el) => ({ name: el.name, x: el.closest(".field").getBoundingClientRect().x, y: el.closest(".field").getBoundingClientRect().y })));
  // Field order is assignee, status, priority (0.19.9).
  expect(fields.map((f) => f.name)).toEqual(["assignee", "status", "priority", "start", "due"]);
  expect(fields[0].x < fields[1].x && fields[1].x < fields[2].x, "assignee, status and priority left to right").toBe(true);
  expect(Math.abs(fields[0].y - fields[2].y), "assignee and priority share a row").toBeLessThan(2);
  expect(Math.abs(fields[3].y - fields[4].y), "start and due share a row").toBeLessThan(2);
}
const noHorizontalOverflow = (locator) => expect.poll(() => locator.evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
// The focus ring: 1px inset outline in the shared green, no shadow.
function focusStyle(el) {
  const style = getComputedStyle(el);
  const probe = document.createElement("span");
  probe.style.color = "var(--green)";
  el.parentElement.append(probe);
  const expected = getComputedStyle(probe).color;
  probe.remove();
  return { color: style.outlineColor, width: style.outlineWidth, offset: style.outlineOffset, shadow: style.boxShadow, expected };
}

test("a new card opens as a compact panel, the board stays usable, and the recovered draft saves with all its fields", async ({ page }) => {
  const project = await newProject();
  await openBoard(page, project);
  await openNewCardPanel(page);
  await expect(page.locator("dialog:modal"), "the panel is not modal").toHaveCount(0);
  await expect(page.locator("#board-task-panel")).toHaveCount(0);
  expect((await editor(page).boundingBox()).width).toBeLessThanOrEqual(681);
  await title(page).fill("Compact task");
  await page.locator('[aria-label="Task description"]').fill("Rich description");
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
  await page.locator(".date-field:has([name=due]) [data-date-picker]").click();
  await page.locator("[data-date-clear]").click();
  await page.getByRole("button", { name: "Close new task", exact: true }).click();
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

onDevices(["desktop", "phone"], () => test("the new card panel fits the screen with the shared field order and focus ring in both themes", async ({ page, device }) => {
  await openBoard(page, await newProject());
  await openNewCardPanel(page);
  await title(page).fill("Compact task");
  for (const theme of ["light", "dark"]) {
    await page.evaluate((t) => window.PencilsAppearance.write({ theme: t }), theme);
    await page.waitForFunction(() => {
      const r = document.querySelector(".board-task-editor").getBoundingClientRect();
      return r.left >= 0 && r.right <= innerWidth && r.bottom <= innerHeight;
    });
    await noHorizontalOverflow(editor(page));
    await checkMetadataLayout(page);
    const titleBox = await title(page).boundingBox();
    const typeBox = await typeTrigger(page).boundingBox();
    if (device === "phone") expect(titleBox.x, "phone title follows the type selector").toBeGreaterThanOrEqual(typeBox.x + typeBox.width);
    else expect(titleBox.y, "desktop title has its own row below the type selector").toBeGreaterThanOrEqual(typeBox.y + typeBox.height);
    expect(titleBox.width, "the title spans the panel width").toBeGreaterThan(typeBox.width * 3);
    await title(page).evaluate((el) => el.focus({ focusVisible: true }));
    const focused = await title(page).evaluate(focusStyle);
    expect(focused.width).toBe("1px");
    expect(focused.offset).toBe("-1px");
    expect(focused.color).toBe(focused.expected);
    expect(focused.shadow).toBe("none");
    // Keyboard order follows the visible title layout.
    await page.keyboard.press("Shift+Tab");
    await expect(device === "phone" ? typeTrigger(page) : page.locator('#task-form [data-action="dialog-close"]')).toBeFocused();
    await typeTrigger(page).evaluate((el) => el.focus({ focusVisible: true }));
    const keyboardFocus = await typeTrigger(page).evaluate(focusStyle);
    expect(keyboardFocus.color).toBe(keyboardFocus.expected);
    expect(keyboardFocus.width).toBe("1px");
  }
}));

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
  await expect(editor(page).locator(".task-editor-actions button")).toHaveCount(6);
  await expect(editor(page).locator(".task-subtasks")).toHaveCount(0);
  await checkMetadataLayout(page);
  await editor(page).locator("[data-feature=task-history]").click();
  await editor(page).locator(".task-history-panel .recovery-item").first().waitFor();
  const history = await editor(page).locator(".task-history-panel").boundingBox();
  const panel = await editor(page).boundingBox();
  expect(history.x, "History opens beside the panel").toBeGreaterThanOrEqual(panel.x + panel.width);
  expect(history.x + history.width).toBeLessThanOrEqual(page.viewportSize().width);
  await editor(page).locator(".task-history-panel .recovery-item:has([data-task-modal=history-restore]) summary").first().click();
  await editor(page).locator("[data-task-modal=history-restore]").first().click();
  await acceptConfirm(page);
  await expect(page.locator("[data-feature=task-history]")).toHaveAttribute("aria-expanded", "true");
  await expect(page.locator(".board-task-editor-heading")).toHaveCount(1);
  await expect(page.locator("dialog:modal")).toHaveCount(0);
});

onDevices(["phone"], () => test("History and Details fit a phone screen in both themes", async ({ page }) => {
  const { project, board } = await seedCard();
  // Keep the whole card on the narrow screen.
  await presetCamera(page, board.id, { x: 10, y: 10, z: 1 });
  await openBoard(page, project);
  await card(page).locator("[data-pro=task-details]").click();
  await editor(page).locator("[data-feature=task-history]").click();
  const history = editor(page).locator(".task-history-panel");
  await history.locator(".recovery-item").first().waitFor();
  const width = page.viewportSize().width;
  for (const theme of ["light", "dark"]) {
    await page.evaluate((t) => window.PencilsAppearance.write({ theme: t }), theme);
    await expect.poll(async () => {
      const box = await history.boundingBox();
      return box.x >= 0 && box.x + box.width <= width;
    }, `${theme}: History stays on screen`).toBe(true);
  }
  await editor(page).locator('[data-feature="task-details"]').click();
  await checkMetadataLayout(page);
  await noHorizontalOverflow(editor(page));
}));

test("edits in the side panel save automatically and keep one card on the board", async ({ page }) => {
  const { project, task } = await seedCard();
  await openBoard(page, project);
  await card(page).locator("[data-pro=task-details]").click();
  await title(page).fill("Updated from board panel");
  await page.locator('[aria-label="Task description"]').fill("Updated rich description");
  await title(page).press("Control+Enter");
  await page.locator("[data-autosave-status]").filter({ hasText: /^Saved automatically$/ }).waitFor();
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
