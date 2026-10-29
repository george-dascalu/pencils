// Assignee, status and priority colours: choosing a value in the card editor (or its menu)
// colours the field straight away, the text stays readable (4.5:1) in light and dark themes
// on desktop and phone, and every project view shows the same colours. Viewing never edits.
import { test, expect, useApp } from "../fixtures.mjs";

const app = useApp(async (store) => {
  const organisation = await store.createOrganisation({
    title: "Color studio",
    people: [
      { id: "george", name: "George" },
      { id: "alex", name: "Alex" },
    ],
    teams: [{ id: "team", name: "Team", members: ["george", "alex"] }],
  });
  const project = await store.createProject({ title: "Task colors", organisation: organisation.id, teams: ["team"] });
  const today = new Date().toISOString().slice(0, 10);
  const task = await store.createTask(project.id, { title: "Design release", assignee: "George", priority: "low", status: "in-progress", start: today, due: today });
  await store.createTask(project.id, { title: "Unassigned task" });
  const board = (await store.snapshot(project.id)).boards[0];
  await store.updateBoard(project.id, board.id, { revision: board.revision, nodes: [{ id: "task-card", type: "task", task: task.id, x: 100, y: 100, w: 360, h: 220 }] });
  return { project, task };
});
// The editor picks the colours that the views then show.
test.describe.configure({ mode: "serial" });
const colors = {};

const color = (locator) => locator.evaluate((el) => getComputedStyle(el).getPropertyValue("--task-field-color").trim());
const saved = async () => (await app.store.snapshot(app.project.id)).tasks.find((t) => t.id === app.task.id);
const openEditor = async (page) => {
  await page.goto(`${app.base}/#project/${app.project.id}/list`);
  await page.locator(`[data-action=task-open][data-id="${app.task.id}"]`).first().click();
  const editor = page.locator("#task-form");
  await editor.waitFor();
  return { editor, assignee: editor.locator('select[name="assignee"]'), status: editor.locator('select[name="status"]'), priority: editor.locator('[data-task-picker="priority"]') };
};
async function contrast(locator) {
  const ratio = await locator.evaluate((el) => {
    const css = getComputedStyle(el);
    const ctx = document.createElement("canvas").getContext("2d");
    const luminance = (color) => {
      ctx.clearRect(0, 0, 1, 1);
      ctx.fillStyle = color;
      ctx.fillRect(0, 0, 1, 1);
      const rgb = [...ctx.getImageData(0, 0, 1, 1).data].slice(0, 3).map((x) => {
        x /= 255;
        return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
      });
      return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
    };
    const a = luminance(css.color);
    const b = luminance(css.backgroundColor);
    return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
  });
  expect(ratio, "Metadata text contrast").toBeGreaterThanOrEqual(4.5);
}

test("choosing an assignee, priority or status colours the editor field with the menu's colour", async ({ page }) => {
  const { assignee, status, priority } = await openEditor(page);
  const initial = await Promise.all([color(assignee), color(status), color(priority)]);
  expect(new Set(initial).size).toBe(3);
  await assignee.click();
  const choice = page.locator("#shared-select-menu").getByRole("option", { name: "Alex", exact: true });
  colors.alex = await color(choice);
  await expect(choice.locator(".task-color-dot")).toBeVisible();
  await choice.click();
  expect(await color(assignee)).toBe(colors.alex);
  expect(colors.alex).not.toBe(initial[0]);
  await priority.locator(".task-picker-trigger").click();
  await expect(priority.locator("[data-picker-value]")).toHaveText(["Urgent", "High", "Medium", "Low", "Lowest"]);
  await priority.getByRole("option", { name: "Lowest", exact: true }).click();
  await expect.poll(async () => (await saved()).priority).toBe("none");
  await priority.locator(".task-picker-trigger").click();
  const urgent = priority.getByRole("option", { name: "Urgent", exact: true });
  colors.urgent = await color(urgent);
  await urgent.click();
  expect(await color(priority)).toBe(colors.urgent);
  await status.click();
  const review = page.locator("#shared-select-menu").getByRole("option", { name: "In review", exact: true });
  colors.review = await color(review);
  await review.click();
  expect(await color(status)).toBe(colors.review);
  await expect.poll(async () => {
    const t = await saved();
    return [t.assignee, t.priority, t.status];
  }).toEqual(["Alex", "urgent", "review"]);
});

test("editor fields keep readable contrast and native-free styling on desktop and phone in both themes", async ({ page }) => {
  const { editor, assignee, status, priority } = await openEditor(page);
  // The open editor is resized from desktop to phone.
  for (const width of [1500, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    if (width <= 780) await page.waitForFunction(() => document.querySelector(".sidebar").getBoundingClientRect().right <= 1);
    await page.waitForFunction(() => document.querySelector(".task-dialog").getBoundingClientRect().right <= innerWidth + 1);
    for (const theme of ["light", "dark"]) {
      await page.evaluate((value) => (document.documentElement.dataset.theme = value), theme);
      await contrast(assignee);
      await contrast(status);
      await contrast(priority.locator(".task-picker-trigger"));
      expect(await editor.evaluate((el) => el.scrollWidth <= el.clientWidth + 1), `${width}px ${theme}: no overflow`).toBe(true);
      for (const control of [assignee, status]) await expect(control).toHaveCSS("appearance", "none");
    }
  }
});

const views = {
  async list(page) {
    const root = page.locator(`[data-task-order-row="${app.task.id}"]`);
    expect(await color(root.locator(".row-assignee .task-assignee"))).toBe(colors.alex);
    expect(await color(root.locator(".priority"))).toBe(colors.urgent);
  },
  async tree(page) {
    await views.list(page);
  },
  async table(page) {
    const root = page.locator(`[data-table-task="${app.task.id}"]`);
    await expect(root.locator('[data-task-field="priority"] option[value="none"]')).toHaveText("Lowest");
    for (const [field, expected] of [
      ["assignee", colors.alex],
      ["priority", colors.urgent],
      ["status", colors.review],
    ]) {
      const control = root.locator(`[data-task-field="${field}"]`);
      expect(await color(control), field).toBe(expected);
      await expect(control).not.toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
    }
  },
  async kanban(page) {
    const root = page.locator(`[data-drag-task="${app.task.id}"]`);
    expect(await color(root.locator(".task-assignee"))).toBe(colors.alex);
    expect(await color(root.locator(".priority"))).toBe(colors.urgent);
    expect(await color(page.locator('[data-drop-status="review"] .status-dot'))).toBe(colors.review);
  },
  async board(page) {
    const root = page.locator('[data-node="task-card"]');
    await expect(root.locator('[data-canvas-task-field="priority"] option[value="none"]')).toHaveText("Lowest");
    for (const [selector, expected] of [
      [".canvas-task-assignee .task-assignee", colors.alex],
      [".canvas-task-priority", colors.urgent],
      [".canvas-task-status", colors.review],
    ])
      expect(await color(root.locator(selector)), selector).toBe(expected);
    await root.locator(".canvas-task-status").click();
    expect(await color(page.locator("#shared-select-menu").getByRole("option", { name: "In review", exact: true }))).toBe(colors.review);
    await page.keyboard.press("Escape");
  },
  async overview(page) {
    expect(await color(page.locator(".overview-status").filter({ hasText: "In review" }).locator(".task-color-dot"))).toBe(colors.review);
  },
  async calendar(page) {
    expect(await color(page.locator(`.calendar-task[data-id="${app.task.id}"]`))).toBe(colors.review);
  },
  async timeline(page) {
    expect(await color(page.locator(`[data-timeline-task="${app.task.id}"]`))).toBe(colors.review);
  },
  async capacity(page) {
    expect(await color(page.locator('.capacity-table th[scope="row"]').filter({ hasText: "Alex" }).locator(".task-color-dot"))).toBe(colors.alex);
  },
};
for (const [view, check] of Object.entries(views))
  test(`${view[0].toUpperCase()}${view.slice(1)} shows the chosen colours`, async ({ page }) => {
    await page.goto(`${app.base}/#project/${app.project.id}/${view}`);
    await page.locator("#view-content").waitFor();
    await check(page);
  });

test("viewing coloured fields in other views changes nothing", async () => {
  expect(await saved()).toMatchObject({ assignee: "Alex", priority: "urgent", status: "review" });
});
