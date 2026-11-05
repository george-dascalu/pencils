// Board card panel, split by tier (F0.22-21) from board-task-panel.spec.mjs: the new card panel fits
// the screen with the shared field order (assignee, status, priority, then dates; 0.19.9) and focus
// ring, and History and Details fit a phone, in both themes.
import {chooseCardPane} from '../helpers/card-panes.mjs';
import { test, expect, onDevices, useApp } from "../fixtures.mjs";
import { clickControl } from "../helpers/menu-controls.mjs";
import { presetCamera } from "../helpers/board-canvas.mjs";

const app = useApp();

// A fresh project per test, so task counts belong to the test.
const newProject = () => app.store.createProject({ title: "Panel lab" });
const snapshot = (project) => app.store.snapshot(project.id);
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
    expect(titleBox.x, "title follows the type, ID and bookmark").toBeGreaterThanOrEqual(typeBox.x + typeBox.width);
    expect(titleBox.y + titleBox.height/2).toBeCloseTo(typeBox.y + typeBox.height/2, 0);
    expect(titleBox.width, "the title spans the panel width").toBeGreaterThan(typeBox.width * 3);
    await title(page).evaluate((el) => el.focus({ focusVisible: true }));
    const focused = await title(page).evaluate(focusStyle);
    expect(focused.width).toBe("1px");
    expect(focused.offset).toBe("-1px");
    expect(focused.color).toBe(focused.expected);
    expect(focused.shadow).toBe("none");
    // Keyboard order follows the visible title layout.
    await page.keyboard.press("Shift+Tab");
    await expect(typeTrigger(page)).toBeFocused();
    await typeTrigger(page).evaluate((el) => el.focus({ focusVisible: true }));
    const keyboardFocus = await typeTrigger(page).evaluate(focusStyle);
    expect(keyboardFocus.color).toBe(keyboardFocus.expected);
    expect(keyboardFocus.width).toBe("1px");
  }
}));

onDevices(["phone"], () => test("History and Details fit a phone screen in both themes", async ({ page }) => {
  const { project, board } = await seedCard();
  // Keep the whole card on the narrow screen.
  await presetCamera(page, board.id, { x: 10, y: 10, z: 1 });
  await openBoard(page, project);
  await card(page).locator("[data-pro=task-details]").click();
  await chooseCardPane(page, 'history');
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
  await chooseCardPane(page, 'details');
  await checkMetadataLayout(page);
  await noHorizontalOverflow(editor(page));
}));
