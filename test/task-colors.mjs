import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { chromium, webkit } from "playwright";
import { Store } from "../server/store.js";
import { createServer } from "../server/index.js";
const root = await fs.mkdtemp(path.join(os.tmpdir(), "pencils-task-colors-"));
const store = new Store(root);
await store.init();
const organisation = await store.createOrganisation({
  title: "Color studio",
  people: [
    { id: "george", name: "George" },
    { id: "alex", name: "Alex" },
  ],
  teams: [{ id: "team", name: "Team", members: ["george", "alex"] }],
});
const project = await store.createProject({
  title: "Task colors",
  organisation: organisation.id,
  teams: ["team"],
});
const today = new Date().toISOString().slice(0, 10);
const task = await store.createTask(project.id, {
  title: "Design release",
  assignee: "George",
  priority: "low",
  status: "in-progress",
  start: today,
  due: today,
});
await store.createTask(project.id, { title: "Unassigned task" });
const board = (await store.snapshot(project.id)).boards[0];
await store.updateBoard(project.id, board.id, {
  revision: board.revision,
  nodes: [
    {
      id: "task-card",
      type: "task",
      task: task.id,
      x: 100,
      y: 100,
      w: 360,
      h: 220,
    },
  ],
});
const server = createServer(store);
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await (
  process.env.BROWSER === "webkit" ? webkit : chromium
).launch();
const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } });
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
const color = (locator) =>
  locator.evaluate((el) =>
    getComputedStyle(el).getPropertyValue("--task-field-color").trim(),
  );
async function openView(view) {
  await page.goto(`${base}/#project/${project.id}/${view}`);
  await page.locator("#view-content").waitFor();
}
async function until(check) {
  for (let i = 0; i < 160; i++) {
    if (await check()) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw Error("Timed out");
}
const saved = async () =>
  (await store.snapshot(project.id)).tasks.find((t) => t.id === task.id);
async function assertContrast(locator) {
  const ratio = await locator.evaluate((el) => {
    const css = getComputedStyle(el),
      canvas = document.createElement("canvas"),
      ctx = canvas.getContext("2d");
    const luminance = (color) => {
      ctx.clearRect(0, 0, 1, 1);
      ctx.fillStyle = color;
      ctx.fillRect(0, 0, 1, 1);
      const rgb = [...ctx.getImageData(0, 0, 1, 1).data]
        .slice(0, 3)
        .map((x) => {
          x /= 255;
          return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
        });
      return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
    };
    const a = luminance(css.color),
      b = luminance(css.backgroundColor);
    return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
  });
  assert.ok(ratio >= 4.5, `Metadata text contrast is ${ratio}`);
}
try {
  await page.goto(base);
  await page.locator("#organisation-select").selectOption(organisation.id);
  await page.locator(`.project-link[data-id="${project.id}"]`).click();
  await page
    .locator(`[data-action=task-open][data-id="${task.id}"]`)
    .first()
    .click();
  const editor = page.locator("#task-form");
  const assignee = editor.locator('select[name="assignee"]'),
    status = editor.locator('select[name="status"]');
  const priority = editor.locator('[data-task-picker="priority"]');
  const initial = await Promise.all([
    color(assignee),
    color(status),
    color(priority),
  ]);
  assert.equal(new Set(initial).size, 3);
  await assignee.click();
  const choice = page
    .locator("#shared-select-menu")
    .getByRole("option", { name: "Alex", exact: true });
  const alexColor = await color(choice);
  assert.ok(await choice.locator(".task-color-dot").isVisible());
  await choice.click();
  assert.equal(await color(assignee), alexColor);
  assert.notEqual(alexColor, initial[0]);
  await priority.locator(".task-picker-trigger").click();
  assert.deepEqual(await priority.locator('[data-picker-value]').allTextContents(), ["Urgent", "High", "Medium", "Low", "Lowest"]);
  await priority.getByRole("option", { name: "Lowest", exact: true }).click();
  await until(async () => (await saved()).priority === "none");
  await priority.locator(".task-picker-trigger").click();
  const urgent = priority.getByRole("option", { name: "Urgent", exact: true });
  const urgentColor = await color(urgent);
  await urgent.click();
  assert.equal(await color(priority), urgentColor);
  await status.click();
  const review = page
    .locator("#shared-select-menu")
    .getByRole("option", { name: "In review", exact: true });
  const reviewColor = await color(review);
  await review.click();
  assert.equal(await color(status), reviewColor);
  await until(async () => {
    const t = await saved();
    return (
      t.assignee === "Alex" && t.priority === "urgent" && t.status === "review"
    );
  });
  for (const width of [1500, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    if (width <= 780)
      await page.waitForFunction(
        () =>
          document.querySelector(".sidebar").getBoundingClientRect().right <= 1,
      );
    await page.waitForFunction(
      () =>
        document.querySelector(".task-dialog").getBoundingClientRect().right <=
        innerWidth + 1,
    );
    for (const theme of ["light", "dark"]) {
      await page.evaluate(
        (value) => (document.documentElement.dataset.theme = value),
        theme,
      );
      await assertContrast(assignee);
      await assertContrast(status);
      await assertContrast(priority.locator(".task-picker-trigger"));
      assert.ok(
        await editor.evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
      );
      for (const control of [assignee, status])
        assert.equal(
          await control.evaluate((el) => getComputedStyle(el).appearance),
          "none",
        );
      await page.screenshot({
        path: `/tmp/pencils-task-colors-editor-${width}-${theme}.png`,
        animations: "disabled",
      });
    }
  }
  await page.locator("[data-action=dialog-close]").click();
  await page.setViewportSize({ width: 1500, height: 1000 });
  await page.evaluate(() => (document.documentElement.dataset.theme = "light"));
  for (const view of [
    "list",
    "tree",
    "table",
    "kanban",
    "board",
    "overview",
    "calendar",
    "timeline",
    "capacity",
  ]) {
    await openView(view);
    let root;
    if (["list", "tree"].includes(view)) {
      root = page.locator(`[data-task-order-row="${task.id}"]`);
      assert.equal(await color(root.locator(".task-assignee")), alexColor);
      assert.equal(await color(root.locator(".priority")), urgentColor);
    } else if (view === "table") {
      root = page.locator(`[data-table-task="${task.id}"]`);
      assert.equal(await root.locator('[data-task-field="priority"] option[value="none"]').textContent(), "Lowest");
      for (const [field, expected] of [
        ["assignee", alexColor],
        ["priority", urgentColor],
        ["status", reviewColor],
      ]) {
        const control = root.locator(`[data-task-field="${field}"]`);
        assert.equal(await color(control), expected);
        assert.notEqual(
          await control.evaluate((el) => getComputedStyle(el).backgroundColor),
          "rgba(0, 0, 0, 0)",
        );
      }
    } else if (view === "kanban") {
      root = page.locator(`[data-drag-task="${task.id}"]`);
      assert.equal(await color(root.locator(".task-assignee")), alexColor);
      assert.equal(await color(root.locator(".priority")), urgentColor);
      assert.equal(
        await color(page.locator('[data-drop-status="review"] .status-dot')),
        reviewColor,
      );
    } else if (view === "board") {
      root = page.locator('[data-node="task-card"]');
      assert.equal(await root.locator('[data-canvas-task-field="priority"] option[value="none"]').textContent(), "Lowest");
      for (const [selector, expected] of [
        [".canvas-task-assignee", alexColor],
        [".canvas-task-priority", urgentColor],
        [".canvas-task-status", reviewColor],
      ])
        assert.equal(await color(root.locator(selector)), expected);
      await root.locator(".canvas-task-status").click();
      assert.equal(
        await color(
          page
            .locator("#shared-select-menu")
            .getByRole("option", { name: "In review", exact: true }),
        ),
        reviewColor,
      );
      await page.keyboard.press("Escape");
    } else if (view === "overview") {
      assert.equal(
        await color(
          page
            .locator(".overview-status")
            .filter({ hasText: "In review" })
            .locator(".task-color-dot"),
        ),
        reviewColor,
      );
    } else if (view === "calendar") {
      assert.equal(
        await color(page.locator(`.calendar-task[data-id="${task.id}"]`)),
        reviewColor,
      );
    } else if (view === "timeline") {
      assert.equal(
        await color(page.locator(`[data-timeline-task="${task.id}"]`)),
        reviewColor,
      );
    } else if (view === "capacity") {
      assert.equal(
        await color(
          page
            .locator('.capacity-table th[scope="row"]')
            .filter({ hasText: "Alex" })
            .locator(".task-color-dot"),
        ),
        alexColor,
      );
    }
    await page.screenshot({ path: `/tmp/pencils-task-colors-${view}.png` });
  }
  // No changes are introduced by viewing colored fields in other views.
  const final = await saved();
  assert.equal(final.assignee, "Alex");
  assert.equal(final.priority, "urgent");
  assert.equal(final.status, "review");
  assert.deepEqual(errors, []);
  console.log(
    "PASS: colors update with field/menu selection and persist across all task views; desktop/mobile layouts and readable light/dark contrast; Board menus and autosave preserved.",
  );
} catch (error) {
  await page.screenshot({ path: "/tmp/pencils-task-colors-failure.png" });
  throw error;
} finally {
  await browser.close();
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
  await fs.rm(root, { recursive: true, force: true });
}
