import { selectProjectView } from "./menu-controls.mjs";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { chromium, firefox } from "playwright";
import { Store } from "../server/store.js";
import { createServer } from "../server/index.js";
const root = await fs.mkdtemp(path.join(os.tmpdir(), "pencils-task-panel-"));
const store = new Store(root);
await store.init();
const project = await store.createProject({ title: "Panel lab" });
const server = createServer(store);
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const browser = await (
  process.env.BROWSER === "firefox" ? firefox : chromium
).launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const snapshot = () => store.snapshot(project.id);
const checkMetadataLayout = async () => {
  const rows = await page.locator(".task-metadata > div").evaluateAll((rows) =>
    rows.map((row) =>
      [...row.querySelectorAll(".field")].map((field) => ({
        name: field.querySelector("[name]").name,
        x: field.getBoundingClientRect().x,
        y: field.getBoundingClientRect().y,
      })),
    ),
  );
  assert.deepEqual(
    rows.map((row) => row.map((field) => field.name)),
    [
      ["priority", "status", "assignee"],
      ["parent", "due"],
    ],
  );
  for (const row of rows) {
    assert.ok(
      Math.max(...row.map((field) => field.y)) -
        Math.min(...row.map((field) => field.y)) <
        2,
    );
    assert.ok(
      row.every((field, index) => index === 0 || field.x > row[index - 1].x),
    );
  }
  assert.ok(rows[1][0].y > rows[0][0].y);
};

const until = async (fn) => {
  for (let i = 0; i < 120; i++) {
    if (await fn()) return;
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error("Timed out");
};
try {
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  await page.locator(`.project-link[data-id="${project.id}"]`).click();
  await page.locator("[data-view=board]").click();
  await page.locator("[data-action=board-task]").click();
  await page.locator("[data-action=board-create-task]").click();
  await page.locator(".board-task-editor").waitFor();
  assert.equal(await page.locator("dialog:modal").count(), 0);
  assert.equal(await page.locator("#board-task-panel").count(), 0);
  assert.ok(
    (await page.locator(".board-task-editor").boundingBox()).width <= 401,
  );
  await page.locator("#task-form [name=title]").fill("Compact task");
  await page
    .locator('[aria-label="Task description"]')
    .fill("Rich description");
  await page.locator("[name=subtaskTitle]").fill("Child from panel");
  await page.locator("[data-task-modal=subtask-add]").click();
  // Board remains interactive; resizing/rerendering retains form data and focus behavior.
  const c = await page.locator("#canvas").boundingBox();
  const before = await page.locator("#zoom-label").innerText();
  await page.mouse.move(c.x + c.width * 0.8, c.y + c.height * 0.55);
  await page.mouse.wheel(0, 200);
  await until(
    async () => (await page.locator("#zoom-label").innerText()) !== before,
  );
  assert.equal(
    await page.locator("#task-form [name=title]").inputValue(),
    "Compact task",
  );
  await page.locator("[data-task-picker=type] .task-picker-trigger").click();
  await page
    .locator("[data-task-picker=type] [data-picker-value=story]")
    .click();
  await page
    .locator("[data-task-picker=priority] .task-picker-trigger")
    .click();
  await page
    .locator("[data-task-picker=priority] [data-picker-value=high]")
    .click();
  await page.locator(".date-field:has([name=due]) [data-date-picker]").click();
  await page.locator("[data-date-clear]").click();
  await page.locator("[data-task-list-back]").click();
  assert.equal(await page.locator(".board-task-editor").count(), 0);
  await page.locator("[data-action=board-create-task]").click();
  await page.locator("[data-feature=form-restore]").click();
  assert.equal(
    await page.locator("#task-form [name=title]").inputValue(),
    "Compact task",
  );
  assert.match(
    await page.locator("[data-subtask-list]").innerText(),
    /Child from panel/,
  );
  for (const width of [1500, 390])
    for (const theme of ["light", "dark"]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.evaluate(
        (t) => window.PencilsAppearance.write({ theme: t }),
        theme,
      );
      await page.waitForFunction(() => {
        const r = document
          .querySelector(".board-task-editor")
          .getBoundingClientRect();
        return r.left >= 0 && r.right <= innerWidth && r.bottom <= innerHeight;
      });
      assert.ok(
        await page
          .locator(".board-task-editor")
          .evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
      );
      await checkMetadataLayout();
      const title = page.locator("#task-form [name=title]");
      const type = page.locator("[data-task-picker=type] .task-picker-trigger");
      const titleBox = await title.boundingBox();
      const typeBox = await type.boundingBox();
      assert.ok(
        titleBox.x >= typeBox.x + typeBox.width + 7,
        "Type selector and title must have a visible gap",
      );
      assert.ok(
        Math.abs(titleBox.y - typeBox.y) < 10,
        "Type selector and title stay on the same row",
      );
      await title.focus();
      const focusStyle = (el) => {
        const style = getComputedStyle(el);
        const probe = document.createElement("span");
        probe.style.color = "var(--green)";
        el.parentElement.append(probe);
        const expected = getComputedStyle(probe).color;
        probe.remove();
        return {
          color: style.outlineColor,
          width: style.outlineWidth,
          offset: style.outlineOffset,
          shadow: style.boxShadow,
          expected,
        };
      };
      const focused = await title.evaluate(focusStyle);
      assert.equal(focused.width, "1px");
      assert.equal(focused.offset, "-1px");
      assert.equal(focused.color, focused.expected);
      assert.equal(focused.shadow, "none");
      await page.keyboard.press("Shift+Tab");
      assert.ok(await type.evaluate((el) => el === document.activeElement));
      const keyboardFocus = await type.evaluate(focusStyle);
      assert.equal(keyboardFocus.color, keyboardFocus.expected);
      assert.equal(keyboardFocus.width, "1px");
      await title.focus();
      await page.screenshot({
        path: `/tmp/pencils-new-task-panel-${width}-${theme}.png`,
        animations: "disabled",
      });
    }
  await page.setViewportSize({ width: 1500, height: 1000 });
  await page.locator("#task-form [name=title]").focus();
  await page.keyboard.press("Control+Enter");
  await until(async () => (await snapshot()).tasks.length === 2);
  await page.locator(".board-task-editor").waitFor({ state: "detached" });
  await page.locator("#board-task-panel").waitFor();
  const s = await snapshot(),
    task = s.tasks.find((t) => t.title === "Compact task"),
    node = s.boards[0].nodes.find((n) => n.task === task.id);
  assert.equal(task.type, "story");
  assert.equal(task.priority, "high");
  assert.match(task.body, /Rich description/);
  await page.locator("[data-action=board-task-close]").click();
  const card = page.locator(`[data-node="${node.id}"]`);
  assert.match(
    await card.locator(".live-card-heading").innerText(),
    /Compact task/,
  );
  assert.deepEqual(
    await card
      .locator(".live-card-state")
      .evaluate((el) => [...el.children].map((x) => x.className)),
    [
      "canvas-task-key",
      "canvas-task-priority priority high",
      "canvas-task-status",
      "canvas-task-assignee",
    ],
  );
  const color = await card
    .locator(".canvas-task-status")
    .evaluate((el) => getComputedStyle(el).backgroundColor);
  await card.locator("[data-canvas-status]").selectOption("done");
  await until(
    async () =>
      (await snapshot()).tasks.find((t) => t.id === task.id).status === "done",
  );
  assert.notEqual(
    await card
      .locator(".canvas-task-status")
      .evaluate((el) => getComputedStyle(el).backgroundColor),
    color,
  );
  await card
    .locator("[data-canvas-task-field=priority]")
    .selectOption("urgent");
  await until(
    async () =>
      (await snapshot()).tasks.find((t) => t.id === task.id).priority ===
      "urgent",
  );
  await page.screenshot({ path: "/tmp/pencils-task-card-layout.png" });
  const editCamera = await page.locator("#canvas-world").getAttribute("style");
  await card.locator("[data-pro=task-details]").click();
  const editPanel = page.locator(".board-task-editor");
  assert.equal(await page.locator("dialog:modal").count(), 0);
  assert.equal(
    await page.locator("#task-form").getAttribute("data-id"),
    task.id,
  );
  assert.equal(
    await editPanel.locator(".board-task-editor-heading strong").textContent(),
    task.key,
  );
  assert.equal(
    await page.locator("#canvas-world").getAttribute("style"),
    editCamera,
  );
  assert.equal(
    await editPanel.locator(".task-editor-actions button").count(),
    5,
  );
  assert.match(
    await editPanel.locator("[data-subtask-list]").textContent(),
    /Child from panel/,
  );
  await checkMetadataLayout();
  await editPanel.locator("[data-feature=task-history]").click();
  await editPanel
    .locator(".task-history-panel .recovery-item")
    .first()
    .waitFor();
  const historyBox = await editPanel
    .locator(".task-history-panel")
    .boundingBox();
  const editorBox = await editPanel.boundingBox();
  assert.ok(historyBox.x >= editorBox.x + editorBox.width);
  assert.ok(historyBox.x + historyBox.width <= 1500);
  await page.screenshot({ path: "/tmp/pencils-edit-task-panel-history.png" });
  await editPanel
    .locator(".task-history-panel .recovery-item summary")
    .first()
    .click();
  page.once("dialog", (d) => d.accept());
  await editPanel.locator("[data-task-modal=history-restore]").first().click();
  await page.waitForFunction(
    () =>
      document
        .querySelector("[data-feature=task-history]")
        ?.getAttribute("aria-expanded") === "true",
  );
  assert.equal(await page.locator(".board-task-editor-heading").count(), 1);
  assert.equal(await page.locator("dialog:modal").count(), 0);
  await page.setViewportSize({ width: 390, height: 1000 });
  for (const theme of ["light", "dark"]) {
    await page.evaluate(
      (t) => window.PencilsAppearance.write({ theme: t }),
      theme,
    );
    await page.waitForTimeout(250);
    const smallHistory = await editPanel
      .locator(".task-history-panel")
      .boundingBox();
    assert.ok(
      smallHistory.x >= 0 && smallHistory.x + smallHistory.width <= 390,
    );
    await page.screenshot({
      path: `/tmp/pencils-edit-task-panel-history-mobile-${theme}.png`,
      animations: "disabled",
    });
  }
  await editPanel.locator("[data-task-modal=history-close]").click();
  await checkMetadataLayout();
  assert.ok(
    await editPanel.evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
  );
  await page.screenshot({
    path: "/tmp/pencils-edit-task-panel-mobile.png",
    animations: "disabled",
  });
  await page.setViewportSize({ width: 1500, height: 1000 });
  await page.evaluate(() => window.PencilsAppearance.write({ theme: "light" }));
  await page
    .locator("#task-form [name=title]")
    .fill("Updated from board panel");
  await page
    .locator('[aria-label="Task description"]')
    .fill("Updated rich description");
  await page.screenshot({ path: "/tmp/pencils-edit-task-panel.png" });
  await page.locator("#task-form [name=title]").press("Control+Enter");
  await page
    .locator("[data-autosave-status]")
    .filter({ hasText: /^Saved automatically$/ })
    .waitFor();
  await page.locator("[data-action=dialog-close]").click();
  await editPanel.waitFor({ state: "detached" });
  await until(
    async () =>
      (await snapshot()).tasks.find((t) => t.id === task.id).title ===
      "Updated from board panel",
  );
  const updated = await snapshot();
  assert.equal(updated.tasks.length, 2);
  assert.match(
    updated.tasks.find((t) => t.id === task.id).body,
    /Updated rich description/,
  );
  assert.equal(
    updated.boards[0].nodes.filter((n) => n.task === task.id).length,
    1,
  );
  assert.equal(await page.locator("#board-task-panel").count(), 0);
  await card.locator("[data-pro=task-details]").click();
  await page.locator("[data-action=task-new]").first().click();
  assert.equal(await page.locator("#task-form").getAttribute("data-id"), "");
  assert.equal(
    await editPanel.locator(".board-task-editor-heading strong").textContent(),
    "New task",
  );
  await page.locator("dialog [data-action=dialog-close]").click();
  await page.locator("[data-action=task-new]").first().click();
  await page.locator("#task-form [name=title]").fill("Preserve on navigation");
  await selectProjectView(page, "list");
  assert.equal(await page.locator(".board-task-editor").count(), 0);
  assert.deepEqual(errors, []);
  console.log(
    "PASS: nonmodal compact task creation, interactive board, metadata/rich text/subtasks, draft recovery, navigation, responsive themes, linked card layout/colors and expand.",
  );
} catch (e) {
  await page.screenshot({ path: "/tmp/pencils-task-panel-error.png" });
  throw e;
} finally {
  await browser.close();
  await new Promise((r) => server.close(r));
  await fs.rm(root, { recursive: true, force: true });
}
