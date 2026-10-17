import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { chromium, firefox } from "playwright";
import { Store } from "../server/store.js";
import { createServer } from "../server/index.js";
const root = await fs.mkdtemp(path.join(os.tmpdir(), "pencils-autosave-"));
const store = new Store(root);
await store.init();
const project = await store.createProject({
  title: "Autosave lab",
  schema: {
    statuses: ["todo", "review", "done"],
    done: ["done"],
    initial_status: "todo",
    transitions: { todo: ["review"], review: ["done"], done: ["review"] },
  },
});
const original = await store.createTask(project.id, {
  title: "Original title",
  body: "Original description",
  estimate: 3,
});
const server = createServer(store);
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const browser = await (
  process.env.BROWSER === "firefox" ? firefox : chromium
).launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const task = async () =>
  (await store.snapshot(project.id)).tasks.find((t) => t.id === original.id);
const until = async (fn) => {
  for (let i = 0; i < 180; i++) {
    if (await fn()) return;
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error("Timed out");
};
const open = () =>
  page
    .locator(`[data-action=task-open][data-id="${original.id}"]`)
    .first()
    .click();
const title = () => page.locator("#task-form [name=title]");
try {
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  await page.locator(`.project-link[data-id="${project.id}"]`).click();
  await open();
  assert.equal(
    await page
      .getByRole("button", { name: "Save changes", exact: true })
      .count(),
    0,
  );
  await title().fill("Saved while focused");
  await until(async () => (await task()).title === "Saved while focused");
  assert.ok(await title().evaluate((el) => el === document.activeElement));
  await page
    .locator('[aria-label="Task description"]')
    .fill("**New description**");
  await until(async () => (await task()).body.includes("New description"));
  await page.locator("#task-form [name=status]").selectOption("review");
  await until(async () => (await task()).status === "review");
  await until(async () =>
    (
      await page
        .locator("#task-form [name=status] option")
        .evaluateAll((els) => els.map((el) => el.value))
    ).includes("done"),
  );
  await page.locator("#task-form [name=status]").selectOption("done");
  await until(async () => (await task()).status === "done");
  assert.equal(
    (await task()).estimate,
    3,
    "Unedited planning values survive autosave",
  );
  // A pending valid save must not discard a later invalid browser draft.
  await title().fill("Before blank");
  await page.waitForTimeout(480);
  await title().fill("");
  await page.waitForTimeout(600);
  assert.notEqual((await task()).title, "");
  assert.match(
    await page.locator("[data-autosave-status]").innerText(),
    /required fields/,
  );
  await title().fill("Recovered title");
  await until(async () => (await task()).title === "Recovered title");
  // Offline/failed requests stay queued and automatically retry without another edit.
  await page.route("**/api/projects/*/tasks/*", (route) =>
    route.request().method() === "PATCH"
      ? route.fulfill({ status: 500, json: { error: "Test offline" } })
      : route.continue(),
  );
  await title().fill("Queued edit");
  await page
    .locator("[data-autosave-status]")
    .filter({ hasText: "Pending — changes kept in this browser" })
    .waitFor();
  assert.notEqual((await task()).title, "Queued edit");
  await page.unroute("**/api/projects/*/tasks/*");
  await until(async () => (await task()).title === "Queued edit");
  await page
    .locator("[data-autosave-status]")
    .filter({ hasText: /^Saved automatically$/ })
    .waitFor();
  await page.locator("[data-feature=task-comments]").click();
  const comments = page.locator(".board-comments");
  await comments.waitFor();
  assert.equal(await comments.getAttribute("popover"), null);
  const commentsBox = await comments.boundingBox();
  const dialogBox = await page.locator(".task-dialog").boundingBox();
  assert.ok(commentsBox.x >= dialogBox.x + dialogBox.width - 1, "Comments dock beside the shared task panel");
  assert.ok(commentsBox.x + commentsBox.width <= 1400);
  assert.equal(
    await comments.locator("textarea").evaluate((el) => el.form),
    null,
  );

  await comments.locator("textarea").fill("A task comment");
  await comments
    .getByRole("button", { name: "Add comment", exact: true })
    .click();
  await until(async () => (await task()).comments?.length === 1);
  await comments.getByRole("button", { name: "Reply", exact: true }).click();
  await comments.locator("textarea").fill("A reply");
  await comments.locator("[data-comment-submit]").click();
  await until(async () => (await task()).comments?.length === 2);
  await comments.locator("[data-comment-react]").first().click();
  await until(async () => (await task()).comments?.[0].reactions?.length === 1);
  await page.locator("[data-feature=task-history]").click();
  assert.equal(await comments.count(), 0);
  await page.locator(".task-history-panel .recovery-item").first().waitFor();
  const historyBox = await page.locator(".task-history-panel").boundingBox();
  for (const key of ["x", "y", "width", "height"])
    assert.ok(
      Math.abs(historyBox[key] - commentsBox[key]) < 2,
      `${key}: comments match history`,
    );

  for (const width of [1400, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.locator("[data-feature=task-comments]").click();
    const box = await comments.boundingBox();
    assert.ok(box.x >= 0 && box.x + box.width <= width);
    await page.screenshot({
      path: `/tmp/pencils-task-comments-modal-${width}.png`,
    });
    await page.locator("[data-feature=task-history]").click();
    const history = await page.locator(".task-history-panel").boundingBox();
    for (const key of ["x", "y", "width", "height"])
      assert.ok(
        Math.abs(history[key] - box[key]) < 2,
        `Modal ${width}: matching ${key}`,
      );
  }
  await page.setViewportSize({ width: 1400, height: 1000 });
  assert.equal(await page.locator("#task-form").count(), 1);
  await page.locator("[data-task-modal=history-close]").click();
  await title().fill("Close before debounce");
  await page.locator("[data-action=dialog-close]").click();
  await until(async () => (await task()).title === "Close before debounce");
  await page.reload();
  await open();
  assert.equal(await title().inputValue(), "Close before debounce");
  await page.locator("[data-action=dialog-close]").click();
  await page.locator("[data-view=board]").click();
  await page.locator("[data-action=board-task]").click();
  await page
    .locator(`[data-action=board-pick][data-id="${original.id}"]`)
    .click();
  await page.locator(".board-node.task [data-pro=task-details]").click();
  const panel = page.locator(".board-task-editor");
  await title().fill("Live on the board");
  await until(
    async () =>
      (await page.locator(".board-node.task .task-title").innerText()) ===
      "Live on the board",
  );
  assert.equal(await title().inputValue(), "Live on the board");
  const actions = await panel
    .locator(".board-task-editor-heading button")
    .evaluateAll((els) => els.map((el) => el.getAttribute("aria-label")));
  assert.deepEqual(actions, [
    "Back to project tasks",
    "Delete task",
    "Duplicate task",
    "Archive task",
    "Version history",
    "Task comments",
    "Close task",
  ]);
  for (const width of [1400, 390])
    for (const theme of ["light", "dark"]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.evaluate((theme) => {
        window.PencilsAppearance.write({ theme });
        document.querySelector(".sidebar")?.classList.remove("open");
        document.querySelector(".sidebar-overlay")?.classList.remove("visible");
      }, theme);
      if (width < 780)
        await page.waitForFunction(
          () =>
            document.querySelector(".sidebar").getBoundingClientRect().right <=
            1,
        );
      await page.screenshot({
        path: `/tmp/pencils-task-editor-${width}-${theme}.png`,
      });
      await page.locator("[data-feature=task-comments]").click();
      const box = await comments.boundingBox();
      assert.ok(box.x >= 0 && box.x + box.width <= width);
      if (width === 1400) {
        const p = await panel.boundingBox();
        assert.ok(box.x >= p.x + p.width);
      }
      assert.ok(
        await comments.evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
      );
      await page.screenshot({
        path: `/tmp/pencils-task-autosave-${width}-${theme}.png`,
      });
      await comments.locator("[data-comments-close]").click();
    }
  await page.setViewportSize({ width: 1400, height: 1000 });
  await title().fill("Latest before duplicate");
  await page.locator("[data-feature=task-duplicate]").click();
  await until(async () =>
    (await store.snapshot(project.id)).tasks.some(
      (t) => t.title === "Latest before duplicate (copy)",
    ),
  );
  assert.equal((await task()).title, "Latest before duplicate");
  assert.deepEqual(errors, []);
  console.log(
    "PASS: automatic task edits, focus, invalid drafts, queued failure recovery, close flush, header actions, shared comments/replies/reactions, history and mobile themes.",
  );
} finally {
  await browser.close();
  await new Promise((r) => server.close(r));
  await fs.rm(root, { recursive: true, force: true });
}
