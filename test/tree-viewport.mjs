import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { chromium, firefox } from "playwright";
import { Store } from "../server/store.js";
import { createServer } from "../server/index.js";
import { selectProjectView } from "./menu-controls.mjs";

const root = await fs.mkdtemp(path.join(os.tmpdir(), "pencils-tree-viewport-"));
const store = new Store(root);
await store.init();
const project = await store.createProject({ title: "Tree viewport" });
const emptyProject = await store.createProject({ title: "Empty tree" });
const parent = await store.createTask(project.id, { title: "Parent task" });
const child = await store.createTask(project.id, {
  title: "Child task", parent: parent.id,
});
const server = createServer(store);
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const browser = await (process.env.BROWSER === "firefox" ? firefox : chromium)
  .launch({ ignoreDefaultArgs: ["--hide-scrollbars"] });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const base = `http://127.0.0.1:${server.address().port}`;
const area = page.locator("#view-content > .tree-wrapper");
const toggle = (id) => page.locator(`.tree-toggle[data-id="${id}"]`);
async function fits() {
  const actual = await area.evaluate((el) => {
    const r = el.getBoundingClientRect();
    const parent = el.parentElement.getBoundingClientRect();
    const ps = getComputedStyle(el.parentElement);
    const style = getComputedStyle(el);
    return {
      width: r.width,
      availableWidth: parent.width - parseFloat(ps.paddingLeft) - parseFloat(ps.paddingRight),
      nextTop: el.nextElementSibling?.getBoundingClientRect().top ?? parent.bottom - parseFloat(ps.paddingBottom),
      bottom: r.bottom,
      parentBottom: parent.bottom,
      lastBottom: el.parentElement.lastElementChild.getBoundingClientRect().bottom,
      height: innerHeight, widthLimit: innerWidth,
      documentHeight: document.documentElement.scrollHeight,
      documentWidth: document.documentElement.scrollWidth,
      overflowX: style.overflowX, overflowY: style.overflowY,
    };
  });
  assert.ok(Math.abs(actual.width - actual.availableWidth) < 2, "Tree fills component width");
  assert.ok(Math.abs(actual.parentBottom - actual.height) < 2, "Tree component fills the page");
  assert.ok(actual.nextTop - actual.bottom >= -1 && actual.nextTop - actual.bottom < 30, "Scroll track stays at the bottom or above pagination");
  assert.ok(actual.lastBottom <= actual.height + 1, "Bottom controls remain visible");
  assert.equal(await page.locator(".view-footnote").count(), 0);
  assert.equal(await page.locator('#view-content [data-action="task-new"]').count(), 0, "Task creation uses the shared header");
  assert.equal(await area.evaluate(el => getComputedStyle(el).backgroundColor), "rgba(0, 0, 0, 0)", "Tree's empty space shares the page background");
  assert.ok(actual.documentWidth <= actual.widthLimit, "No horizontal page overflow");
  assert.ok(actual.documentHeight <= actual.height + 1, "Rows scroll inside the tree");
  assert.equal(actual.overflowX, "auto");
  assert.equal(actual.overflowY, "auto");
}
async function reload() {
  await Promise.all([
    page.waitForEvent("domcontentloaded"),
    page.evaluate(() => location.reload()),
  ]);
  await page.waitForFunction(() => history.state?.kind === "pencils-navigation-v1");
  await area.waitFor();
}
try {
  await page.goto(`${base}/#project/${project.id}/tree`);
  await area.waitFor();
  for (const width of [1600, 390]) {
    await page.setViewportSize({ width, height: 844 });
    for (const theme of ["light", "dark"]) {
      await page.evaluate((t) => document.documentElement.dataset.theme = t, theme);
      await fits();
      const height = await area.evaluate((el) => el.clientHeight);
      const rowHeight = await area.locator(".tree-row").evaluateAll((rows) => rows.reduce((h, row) => h + row.offsetHeight, 0));
      assert.ok(height > rowHeight + 100, "Sparse rows leave space inside the tree");
      await page.screenshot({ path: `/tmp/pencils-tree-${process.env.BROWSER || "chromium"}-${width}-${theme}.png`, animations: "disabled" });
    }
    await toggle(parent.id).click();
    assert.equal(await area.locator(".tree-row").count(), 1);
    await fits();
    await page.locator('[data-action="expand-all"]').click();
    assert.equal(await area.locator(".tree-row").count(), 2);
    await page.locator("#search").fill("Nothing matches");
    await area.locator(".empty").waitFor();
    await fits();
    await area.getByRole("button", { name: "Clear filters", exact: true }).click();
    await area.locator(".tree-row").first().waitFor();
  }
  await area.locator(`.row-open[data-id="${child.id}"]`).click();
  await page.locator("#task-form").waitFor();
  assert.equal(await page.locator('#task-form [name="title"]').inputValue(), "Child task");
  await page.locator('[data-action="dialog-close"]').click();
  await page.getByRole("button", { name: "New task", exact: true }).click();
  await page.locator("#task-form").waitFor();
  assert.equal(await page.locator('#task-form [name="parent"]').inputValue(), "");
  await page.locator('[data-action="dialog-close"]').click();

  let branch, deepest;
  for (let i = 0; i < 35; i++) {
    const task = await store.createTask(project.id, { title: `Root ${String(i).padStart(2, "0")}` });
    if (i === 12) branch = task;
  }
  deepest = branch;
  for (let i = 0; i < 12; i++) deepest = await store.createTask(project.id, {
    title: `Nested task ${i}`, parent: deepest.id,
    tags: ["Planning"], assignee: "Alex", due: "2026-11-01",
  });
  await reload();
  await page.setViewportSize({ width: 1600, height: 1000 });
  await area.focus();
  await page.keyboard.press("PageDown");
  await page.waitForFunction(() => document.querySelector(".tree-wrapper").scrollTop > 100);
  await fits();
  await toggle(branch.id).scrollIntoViewIfNeeded();
  const previousTop = await area.evaluate((el) => el.scrollTop);
  await toggle(branch.id).click();
  assert.ok(Math.abs(await area.evaluate((el) => el.scrollTop) - previousTop) < 2, "Collapse preserves position");
  assert.equal(await toggle(branch.id).evaluate((el) => el === document.activeElement), true, "Collapse keeps keyboard focus");
  await page.keyboard.press("Enter");
  assert.ok(Math.abs(await area.evaluate((el) => el.scrollTop) - previousTop) < 2, "Expansion preserves position");
  assert.equal(await toggle(branch.id).getAttribute("aria-label"), "Collapse subtasks");

  await page.setViewportSize({ width: 390, height: 700 });
  await area.locator(`.task-title[data-id="${deepest.id}"]`).scrollIntoViewIfNeeded();
  assert.ok(await area.evaluate((el) => el.scrollWidth <= el.clientWidth + 1), "Deep hierarchy reflows within the mobile viewport");
  const titleBounds = await area.locator(`.task-title[data-id="${deepest.id}"]`).boundingBox();
  assert.ok(titleBounds.x >= 0 && titleBounds.x + titleBounds.width <= 391, "The deepest task title remains visible");
  await fits();
  const position = await area.evaluate((el) => ({ x: el.scrollLeft, y: el.scrollTop }));
  await page.waitForFunction(({ x, y }) => history.state?.scroll?.treeX === x && history.state?.scroll?.treeY === y, position);
  await page.screenshot({ path: `/tmp/pencils-tree-${process.env.BROWSER || "chromium"}-overflow-mobile.png`, animations: "disabled" });
  await selectProjectView(page, "overview");
  await page.goBack();
  await page.waitForFunction(({ x, y }) => {
    const tree = document.querySelector(".tree-wrapper");
    return tree && Math.abs(tree.scrollLeft - x) < 2 && Math.abs(tree.scrollTop - y) < 2;
  }, position);
  await fits();

  // Root-group pagination and its controls stay outside the scrolling rows.
  for (let i = 35; i < 101; i++) await store.createTask(project.id, { title: `Root ${i}` });
  await reload();
  await fits();
  const pagination = page.locator("#pagination");
  await pagination.waitFor();
  const p = await pagination.boundingBox();
  assert.ok(p.y + p.height < 700, "Pagination remains visible with overflowing rows");

  await page.goto(`${base}/#project/${emptyProject.id}/tree`);
  await area.getByRole("heading", { name: "Create your first task" }).waitFor();
  await fits();
  await page.getByRole("button", { name: "New task", exact: true }).click();
  await page.locator("#task-form").waitFor();
  assert.deepEqual(errors, []);
  console.log("PASS: full-height Tree, sparse/empty/filtered/nested/overflowing tasks, branch focus and position, keyboard scrolling, root creation, pagination, Back restoration, mobile and themes.");
} finally {
  await browser.close();
  server.closeAllConnections();
  await new Promise((r) => server.close(r));
  await store.queue;
  await fs.rm(root, { recursive: true, force: true });
}
