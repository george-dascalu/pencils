import { openBoardSearch } from "./menu-controls.mjs";
import { clickControl } from "./menu-controls.mjs";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { chromium, firefox } from "playwright";
import { Store } from "../server/store.js";
import { createServer } from "../server/index.js";
const root = await fs.mkdtemp(path.join(os.tmpdir(), "pencils-canvas-ui-")),
  store = new Store(root);
await store.init();
const project = await store.createProject({ title: "Board lab" }),
  a = await store.createTask(project.id, {
    title: "Write specification",
    assignee: "Alice",
    due: "2020-01-01",
    body: "## Scope\nOriginal scope.\n\n## Other\nKeep this.\n",
  }),
  b = await store.createTask(project.id, {
    title: "Build prototype",
    assignee: "Bob",
  });
let board = (await store.snapshot(project.id)).boards[0];
board = await store.updateBoard(project.id, board.id, {
  revision: board.revision,
  nodes: [
    {
      id: "note",
      type: "sticky",
      text: "First idea",
      x: 80,
      y: 150,
      w: 240,
      h: 200,
      color: "#f5e7a2",
    },
    { id: "task-a", type: "task", task: a.id, x: 420, y: 150, w: 310, h: 300 },
    { id: "task-b", type: "task", task: b.id, x: 830, y: 150, w: 300, h: 240 },
    {
      id: "far",
      type: "text",
      text: "A distant idea",
      x: 6000,
      y: 3000,
      w: 300,
      h: 150,
    },
  ],
  edges: [],
});
const server = createServer(store);
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await (
  process.env.BROWSER === "firefox" ? firefox : chromium
).launch({
  headless: true,
  args: process.env.BROWSER === "firefox" ? [] : ["--no-sandbox"],
});
const context = await browser.newContext({
    viewport: { width: 1600, height: 1100 },
  }),
  page = await context.newPage(),
  errors = [],
  external = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("request", (r) => {
  if (!r.url().startsWith(base) && !r.url().startsWith("data:"))
    external.push(r.url());
});
page.setDefaultTimeout(12000);
const pro = (name, p = page) => p.locator(`[data-pro="${name}"]`).first();
const snap = () => store.snapshot(project.id);
const current = async () =>
  (await snap()).boards.find((x) => x.id === board.id);
async function until(fn, label = "condition") {
  for (let i = 0; i < 120; i++) {
    if (await fn()) return;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error("Timed out: " + label);
}
async function enter(p = page) {
  await p.goto(base);
  await p.locator(".project-link").click();
  await p.locator("[data-view=board]").click();
  await p.locator("#canvas").waitFor();
}
async function saved() {
  await until(
    () =>
      page
        .locator("#board-save")
        .textContent()
        .then((t) => t === "Saved automatically"),
    "save",
  );
}
async function find(id, text) {
  await openBoardSearch(page);
  await page.locator("#canvas-find").fill(text);
  await page.locator(`[data-pro=find-result][data-id="${id}"]`).click();
  await page.waitForTimeout(100);
}
try {
  await enter();
  await find("note", "First idea");
  const toolbar = page.locator("#selection-tools");
  let box = await toolbar.boundingBox();
  assert.ok(box.width < 720 && box.height < 55, JSON.stringify(box));
  assert.equal(await toolbar.getAttribute("role"), "toolbar");
  assert.equal(
    await toolbar.locator('[data-selection-menu="more"]').count(),
    0,
  );
  for (const action of ["bring-front", "send-back", "selection-delete"]) {
    const button = toolbar.locator(`[data-feature="${action}"]`);
    assert.ok(await button.isVisible());
    assert.equal(await button.evaluate((el) => !!el.closest("details")), false);
  }
  const menu = (key) =>
    toolbar.locator(`[data-selection-menu=${key}] > summary`);
  await menu("arrange").focus();
  await menu("arrange").press("Space");
  assert.ok(await toolbar.locator("[data-feature=align-left]").isDisabled());
  await page.keyboard.press("Escape");
  assert.ok(
    await menu("arrange").evaluate((el) => el === document.activeElement),
  );
  await menu("color").click();
  await page.getByRole("button", { name: "Rose", exact: true }).click();
  await until(
    async () =>
      (await current()).nodes.find((n) => n.id === "note").color === "#f1a9a0",
  );
  await saved();
  await page.keyboard.press("Control+z");
  await until(
    async () =>
      (await current()).nodes.find((n) => n.id === "note").color === "#f5e7a2",
  );
  await toolbar.locator("[data-feature=lock]").click();
  await saved();
  assert.equal(
    await toolbar.locator("[data-feature=lock]").getAttribute("aria-label"),
    "Unlock selection",
  );
  assert.ok(await toolbar.locator("[data-pro=inline]").isDisabled());
  await menu("color").click();
  assert.equal(await toolbar.locator("details[open]").count(), 0);
  await toolbar.locator("[data-feature=lock]").click();
  await saved();
  // Bulk selection adapts the toolbar; actions must apply to all selected objects.
  await page.keyboard.press("Control+a");
  assert.equal(
    await toolbar.locator(".selection-filter-total").textContent(),
    "4",
  );
  assert.equal(await toolbar.locator("[data-pro=inline]").count(), 0);
  await menu("color").click();
  await page.getByRole("button", { name: "Sky", exact: true }).click();
  await page.waitForTimeout(100);
  await until(async () =>
    (await current()).nodes.every((n) => n.color === "#aed7dc"),
  );
  await clickControl(toolbar.locator("[data-feature=align-center]"));
  await until(
    async () =>
      new Set((await current()).nodes.map((n) => n.x + n.w / 2)).size === 1,
  );
  await clickControl(toolbar.locator("[data-feature=group]"));
  await until(async () => (await current()).nodes.every((n) => n.group));
  await clickControl(toolbar.locator("[data-feature=ungroup]"));
  await until(async () => (await current()).nodes.every((n) => !n.group));
  await find("note", "First idea");
  await clickControl(toolbar.locator("[data-feature=bring-front]"));
  await until(async () => (await current()).nodes.at(-1).id === "note");
  await saved();
  await toolbar.locator('[data-feature="send-back"]').click();
  await until(async () => (await current()).nodes[0].id === "note");
  await toolbar.locator('[data-feature="selection-delete"]').click();
  await until(
    async () => !(await current()).nodes.some((n) => n.id === "note"),
  );
  await page.keyboard.press("Control+z");
  await until(async () => (await current()).nodes.some((n) => n.id === "note"));
  await saved();
  await page.reload();
  await page.locator("#canvas").waitFor();
  await find("note", "First idea");
  assert.equal(
    (await current()).nodes.find((n) => n.id === "note").color,
    "#aed7dc",
  );
  await page.screenshot({
    path: "/tmp/pencils-selection-toolbar.png",
    fullPage: true,
  });
  for (const size of [
    { width: 1600, height: 1100 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(size);
    await find("note", "First idea");
    await page.locator("[data-node=note]").click();
    box = await toolbar.boundingBox();
    assert.ok(box.x >= 0 && box.x + box.width <= size.width);
    assert.ok(box.height < 140, JSON.stringify(box));
    for (const action of ["bring-front", "send-back", "selection-delete"]) {
      const button = await toolbar
        .locator(`[data-feature="${action}"]`)
        .boundingBox();
      assert.ok(
        button && button.x >= 0 && button.x + button.width <= size.width,
      );
    }
    for (const key of ["color", "arrange", "text-align"]) {
      await menu(key).click();
      await page.waitForTimeout(50);
      const panel = await toolbar
        .locator("details[open] .selection-popover")
        .boundingBox();
      const canvas = await page.locator("#canvas").boundingBox();
      assert.ok(
        panel.x >= canvas.x && panel.x + panel.width <= canvas.x + canvas.width,
        key,
      );
      assert.ok(
        panel.y >= canvas.y &&
          panel.y + panel.height <= canvas.y + canvas.height,
        key,
      );
      await page.keyboard.press("Escape");
    }
    await page.screenshot({
      path: `/tmp/pencils-selection-${size.width}.png`,
      fullPage: true,
    });
  }
  await page.setViewportSize({ width: 1600, height: 1100 });
  await page
    .getByRole("button", { name: "Personal settings", exact: true })
    .click();
  await page.locator("[name=personal-theme][value=dark]").check();
  await page.locator("[data-action=dialog-close]").first().click();
  await find("note", "First idea");
  await menu("arrange").click();
  await page.screenshot({
    path: "/tmp/pencils-selection-dark.png",
    fullPage: true,
  });
  assert.notEqual(
    await toolbar.evaluate((el) => getComputedStyle(el).backgroundColor),
    "rgb(255, 255, 255)",
  );
  assert.deepEqual(errors, []);
  assert.deepEqual(external, []);
  console.log(
    "PASS: compact groups, keyboard menus, colour/undo, locks, bulk alignment/grouping, layers, persistence, mobile bounds and dark mode",
  );
} catch (e) {
  await page.screenshot({
    path: "/tmp/pencils-selection-failure.png",
    fullPage: true,
  });
  console.error(errors);
  throw e;
} finally {
  await browser.close();
  server.closeAllConnections();
  await new Promise((r) => server.close(r));
  await fs.rm(root, { recursive: true, force: true });
}
