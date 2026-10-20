import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { chromium, firefox } from "playwright";
import { Store } from "../server/store.js";
import { createServer } from "../server/index.js";
import { selectProjectView } from "./menu-controls.mjs";

const root = await fs.mkdtemp(
  path.join(os.tmpdir(), "pencils-kanban-viewport-"),
);
const store = new Store(root);
await store.init();
const project = await store.createProject({ title: "Kanban viewport" });
const first = await store.createTask(project.id, {
  title: "First card",
  status: "todo",
});
await store.createTask(project.id, { title: "Second card", status: "backlog" });
const server = createServer(store);
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const browser = await (
  process.env.BROWSER === "firefox" ? firefox : chromium
).launch();
const page = await browser.newPage({
  viewport: { width: 1600, height: 1000 },
  hasTouch: true,
});
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const url = `http://127.0.0.1:${server.address().port}/#project/${project.id}/kanban`;
const board = page.locator("#view-content > .kanban");
const column = (status) =>
  page.locator(`.kanban-column[data-drop-status="${status}"]`);
async function saved(action, id) {
  const response = page.waitForResponse(
    (r) => r.request().method() === "PATCH" && r.url().endsWith(`/tasks/${id}`),
  );
  await action();
  assert.equal((await response).status(), 200);
}
async function fits() {
  const actual = await board.evaluate((el) => {
    const rect = el.getBoundingClientRect();
    const parent = el.parentElement.getBoundingClientRect();
    const style = getComputedStyle(el.parentElement);
    return {
      width: rect.width,
      availableWidth:
        parent.width -
        parseFloat(style.paddingLeft) -
        parseFloat(style.paddingRight),
      bottom: rect.bottom,
      parentBottom: parent.bottom,
      height: el.clientHeight,
      columns: [...el.children].map((c) => c.getBoundingClientRect().height),
      documentWidth: document.documentElement.scrollWidth,
      documentHeight: document.documentElement.scrollHeight,
      viewportWidth: innerWidth,
      viewportHeight: innerHeight,
    };
  });
  assert.ok(
    Math.abs(actual.width - actual.availableWidth) < 2,
    "Kanban fills component width",
  );
  assert.ok(
    Math.abs(actual.parentBottom - actual.viewportHeight) < 2,
    "Component fills remaining viewport",
  );
  assert.ok(
    actual.parentBottom - actual.bottom < 20,
    "Horizontal scrollbar sits at the component bottom",
  );
  assert.ok(
    actual.columns.every((h) => Math.abs(h - actual.height) < 2),
    "Every column fills the viewport, even empty columns",
  );
  assert.equal(await page.locator(".view-footnote").count(), 0);
  assert.ok(
    actual.documentWidth <= actual.viewportWidth,
    "No horizontal page overflow",
  );
  assert.ok(
    actual.documentHeight <= actual.viewportHeight + 1,
    "Cards scroll inside columns, not the page",
  );
}
try {
  await page.goto(url);
  await board.waitFor();
  for (const width of [1600, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const theme of ["light", "dark"]) {
      await page.evaluate((t) => {
        document.documentElement.dataset.theme = t;
      }, theme);
      await fits();
      await page.screenshot({
        path: `/tmp/pencils-kanban-viewport-${width}-${theme}.png`,
        animations: "disabled",
      });
    }
    await page.locator("#search").fill("No matching cards");
    await page.waitForFunction(() => !document.querySelector(".kanban-card"));
    await fits();
    await page.locator("#search").fill("");
    await page.locator(".kanban-card").first().waitFor();
  }
  // The final column and its add action remain reachable on a narrow screen.
  await column("done").locator(".column-header button").click();
  await page.locator("#task-form").waitFor();
  assert.equal(
    await page.locator("#task-form [name=status]").inputValue(),
    "done",
  );
  await page.locator('[data-action="dialog-close"]').click();
  await page.setViewportSize({ width: 1600, height: 1000 });
  await board.evaluate((el) => {
    el.scrollLeft = 0;
  });
  await page.locator(`[data-drag-task="${first.id}"] .card-top`).click();
  await page.locator("#task-form").waitFor();
  assert.equal(
    await page.locator("#task-form [name=title]").inputValue(),
    "First card",
  );
  await page.locator('[data-action="dialog-close"]').click();
  await page.locator(`[data-drag-task="${first.id}"] .card-bottom`).tap();
  await page.locator("#task-form").waitFor();
  assert.equal(
    await page.locator("#task-form [name=title]").inputValue(),
    "First card",
  );
  await page.locator('[data-action="dialog-close"]').click();
  await saved(
    () => page.locator(`[data-drag-task="${first.id}"]`).dragTo(column("done")),
    first.id,
  );
  await page.waitForFunction(
    (id) =>
      document.querySelector(
        `[data-drop-status="done"] [data-drag-task="${id}"]`,
      ),
    first.id,
  );
  assert.equal(
    (await store.snapshot(project.id)).tasks.find((t) => t.id === first.id)
      .status,
    "done",
  );

  for (let i = 0; i < 30; i++)
    await store.createTask(project.id, {
      title: `Overflow ${i}`,
      status: "todo",
    });
  await Promise.all([
    page.waitForEvent("domcontentloaded"),
    page.evaluate(() => location.reload()),
  ]);
  await page.waitForFunction(
    () => history.state?.kind === "pencils-navigation-v1",
  );
  await column("todo").locator(".kanban-card").nth(29).waitFor();
  await fits();
  const head = column("todo").locator(".column-header");
  const before = await head.boundingBox();
  await column("todo").evaluate((el) => {
    el.scrollTop = 600;
  });
  const after = await head.boundingBox();
  assert.ok(
    Math.abs(before.y - after.y) < 2,
    "Status header stays fixed while its column scrolls",
  );
  assert.equal(
    await column("done").evaluate((el) => el.scrollTop),
    0,
    "Other columns do not scroll",
  );
  await page.waitForFunction(
    () => history.state?.scroll?.kanbanColumns?.todo >= 600,
  );
  await selectProjectView(page, "overview");
  await page.goBack();
  await page.waitForFunction(
    () => document.querySelector('[data-drop-status="todo"]')?.scrollTop >= 600,
  );

  // Hold a real drag near the bottom of a long column and verify auto-scroll.
  await column("todo").evaluate((el) => {
    el.scrollTop = 0;
  });
  const card = await page
    .locator(`[data-drag-task="${first.id}"]`)
    .boundingBox();
  const target = await column("todo").boundingBox();
  await page.mouse.move(card.x + 30, card.y + 20);
  await page.mouse.down();
  await page.mouse.move(card.x + 40, card.y + 30, { steps: 4 });
  await page.mouse.move(
    target.x + target.width / 2,
    target.y + target.height - 15,
    { steps: 12 },
  );
  await page.waitForFunction(
    () => document.querySelector('[data-drop-status="todo"]').scrollTop > 400,
  );
  assert.equal(
    await page.evaluate(() => scrollY),
    0,
    "Drag scrolling leaves the page in place",
  );
  await saved(() => page.mouse.up(), first.id);
  await page.waitForFunction(
    (id) =>
      document.querySelector(
        `[data-drop-status="todo"] [data-drag-task="${id}"]`,
      ),
    first.id,
  );
  assert.equal(
    (await store.snapshot(project.id)).tasks.find((t) => t.id === first.id)
      .status,
    "todo",
  );
  await fits();
  await page.setViewportSize({ width: 390, height: 700 });
  await column("todo").locator(".add-row").scrollIntoViewIfNeeded();
  await fits();
  await page.screenshot({
    path: "/tmp/pencils-kanban-overflow-mobile.png",
    animations: "disabled",
  });
  assert.deepEqual(errors, []);
  console.log(
    "PASS: full-height Kanban, empty/sparse/overflowing columns, fixed headers, independent scrolling, Back restoration, card opening, drag/drop and edge auto-scroll, mobile and themes.",
  );
} finally {
  await browser.close();
  server.closeAllConnections();
  await new Promise((r) => server.close(r));
  await store.queue;
  await fs.rm(root, { recursive: true, force: true });
}
