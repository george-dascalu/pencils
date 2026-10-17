import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { chromium, firefox } from "playwright";
import { Store } from "../server/store.js";
import { createServer } from "../server/index.js";
const root = await fs.mkdtemp(
  path.join(os.tmpdir(), "pencils-creation-tools-"),
);
const store = new Store(root);
await store.init();
const project = await store.createProject({
  title: "Creation tools",
  key: "TOOLS",
});
const a = await store.createTask(project.id, {
  title: "Find this bug",
  type: "bug",
  status: "review",
});
await store.createTask(project.id, {
  title: "Other task",
  type: "task",
  status: "todo",
});
const server = createServer(store);
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const browser = await (
  process.env.BROWSER === "firefox" ? firefox : chromium
).launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const until = async (fn) => {
  for (let i = 0; i < 100; i++) {
    if (await fn()) return;
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error("Timed out");
};
try {
  await page.goto(
    `http://127.0.0.1:${server.address().port}/#project/${project.id}`,
  );
  await page.locator(`.project-link[data-id="${project.id}"]`).click();
  await page.locator("[data-action=task-new]").first().click();
  await page.locator("#task-form [name=title]").fill("Parent with drafts");
  await page.locator("[name=subtaskTitle]").fill("First draft");
  await page.locator("[name=subtaskTitle]").press("Enter");
  await page.locator("[name=subtaskType]").selectOption("bug");
  await page.locator("[name=subtaskTitle]").fill("Second draft");
  await page.locator("[data-task-modal=subtask-add]").click();
  assert.match(
    await page.locator("[data-subtask-list]").innerText(),
    /First draft/,
  );
  assert.equal((await store.snapshot(project.id)).tasks.length, 2);
  // Closing and restoring a browser draft retains the child drafts and retry token.
  const request = await page.locator("[name=creation_request]").inputValue();
  await page.mouse.click(5, 5);
  await page.locator("[data-action=task-new]").first().click();
  await page.locator("[data-feature=form-restore]").click();
  assert.equal(
    await page.locator("[name=creation_request]").inputValue(),
    request,
  );
  assert.match(
    await page.locator("[data-subtask-list]").innerText(),
    /Second draft/,
  );

  // Custom date picker is Monday-first, weekends visually distinct, and stays inside modal.
  await page.locator("#task-form [name=due]").fill("2026-10-16");
  await page.locator(".date-field:has([name=due]) [data-date-picker]").click();
  assert.equal(
    await page.locator(".date-picker-popover thead th").first().innerText(),
    "Mon",
  );
  assert.equal(
    await page.locator(".date-picker-popover th.weekend").count(),
    2,
  );
  assert.equal(
    await page.locator(".date-picker-popover td.weekend").count(),
    12,
  );
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.waitForFunction(() => {
      const r = document
        .querySelector(".date-picker-popover")
        .getBoundingClientRect();
      return r.left >= 0 && r.right <= innerWidth + 1;
    });
    const box = await page.locator(".date-picker-popover").boundingBox();
    assert.ok(box.x >= 0 && box.x + box.width <= width + 1);
    await page.screenshot({ path: `/tmp/pencils-date-picker-${width}.png` });
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.locator('[data-date-value="2026-10-19"]').click();
  assert.equal(await page.locator("[name=due]").inputValue(), "2026-10-19");
  await page.locator(".date-field:has([name=due]) [data-date-picker]").click();
  await page.keyboard.press("Escape");
  assert.equal(await page.locator(".date-picker-popover").count(), 0);
  assert.equal(await page.locator("#task-form").count(), 1);
  await page.locator("#task-form [type=submit]").click();
  await until(
    async () => (await store.snapshot(project.id)).tasks.length === 5,
  );
  const tasks = (await store.snapshot(project.id)).tasks,
    parent = tasks.find((t) => t.title === "Parent with drafts");
  assert.equal(tasks.filter((t) => t.parent === parent.id).length, 2);
  assert.equal(tasks.find((t) => t.title === "Second draft").type, "bug");
  // Hierarchy editor persists and keeps invalid relationships from being saved.
  await page.locator("[data-action=project-edit]").click();
  await page.locator("[data-hierarchy-mode]").selectOption("enforced");
  await page.locator(".hierarchy-matrix > summary").click();
  await page
    .locator('[data-hierarchy-parent="task"][data-hierarchy-child="bug"]')
    .uncheck();
  await page.locator("#project-form [type=submit]").click();
  await page.getByText(/Move existing tasks before enforcing/).waitFor();
  await page
    .locator('[data-hierarchy-parent="task"][data-hierarchy-child="bug"]')
    .check();
  await page
    .locator('[data-hierarchy-parent="bug"][data-hierarchy-child="task"]')
    .uncheck();
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    );
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.locator("#project-form [type=submit]").click();
  await until(
    async () =>
      (await store.snapshot(project.id)).project.schema.hierarchy?.mode ===
      "enforced",
  );
  await page.locator("[data-view=board]").click();
  assert.equal(await page.locator("[data-board-menu=add]").count(), 0);
  await page.locator(".board-tools [data-action=board-task]").click();
  await page.locator("#board-task-search").fill(a.key);
  assert.equal(
    await page.locator("#board-task-panel [data-action=board-pick]").count(),
    1,
  );
  await page.locator("[data-board-task-filter=type]").selectOption("task");
  assert.equal(
    await page.locator("#board-task-panel [data-action=board-pick]").count(),
    0,
  );
  await page.locator("[data-board-task-filter=type]").selectOption("bug");
  await page.locator("[data-board-task-filter=status]").selectOption("review");
  assert.equal(
    await page.locator("#board-task-panel [data-action=board-pick]").count(),
    1,
  );
  const camera = await page.locator("#canvas-world").getAttribute("style");
  await page.locator("#board-task-panel [data-action=board-pick]").click();
  await until(async () =>
    (await store.snapshot(project.id)).boards[0].nodes.some(
      (n) => n.task === a.id,
    ),
  );
  assert.equal(
    await page.locator("#canvas-world").getAttribute("style"),
    camera,
  );
  assert.match(
    await page.locator(".board-task-results").innerText(),
    /On board/,
  );
  await page.locator("[data-board-task-filter=placement]").selectOption("off");
  assert.equal(
    await page.locator("#board-task-panel [data-action=board-pick]").count(),
    0,
  );
  await page.locator("[data-board-task-filter=placement]").selectOption("on");
  for (const width of [1440, 390])
    for (const theme of ["light", "dark"]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.evaluate(
        (t) => window.PencilsAppearance.write({ theme: t }),
        theme,
      );
      if (width === 390 && (await page.locator(".sidebar.open").count()))
        await page
          .locator(".sidebar-overlay")
          .click({ position: { x: 380, y: 200 } });
      if (width === 390)
        await page.waitForFunction(
          () =>
            document.querySelector(".sidebar").getBoundingClientRect().right <=
            1,
        );
      const box = await page.locator("#board-task-panel").boundingBox();
      assert.ok(box.x >= 0 && box.x + box.width <= width + 1);
      await page.screenshot({
        path: `/tmp/pencils-task-browser-${width}-${theme}.png`,
      });
    }
  await page.locator("#board-task-search").focus();
  await page.keyboard.press("Escape");
  assert.equal(await page.locator("#board-task-panel").count(), 0);
  await page.locator(".board-tools [data-action=board-task]").click();
  await page.locator("[data-action=board-task-close]").focus();
  await page.keyboard.press("Space");
  assert.equal(await page.locator("#board-task-panel").count(), 0);
  assert.deepEqual(errors, []);
  console.log(
    "PASS: draft subtasks, hierarchy settings and validation, Monday-first date picker, board task search/filter/place, desktop/mobile and light/dark.",
  );
} catch (error) {
  await page.screenshot({ path: "/tmp/pencils-creation-error.png" });
  throw error;
} finally {
  await browser.close();
  await new Promise((r) => server.close(r));
  await fs.rm(root, { recursive: true, force: true });
}
