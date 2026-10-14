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
        .then((t) => /All (canvas )?changes saved/.test(t)),
    "save",
  );
}
async function find(id, text) {
  await page.locator("#canvas-find").fill(text);
  await page.locator(`[data-pro=find-result][data-id="${id}"]`).click();
  await page.waitForTimeout(100);
}
try {
  await enter();
  await page.setViewportSize({ width: 2065, height: 936 });
  await page
    .getByRole("button", { name: "Collapse sidebar", exact: true })
    .click();
  const canvas = page.locator("#canvas");
  let rect = await canvas.boundingBox();
  assert.ok(rect.y < 160, `Compact header: ${rect.y}px`);
  assert.ok(rect.height > 750, `Canvas height: ${rect.height}px`);
  assert.ok(await page.locator(".hero").isHidden());
  const summary = (key) => page.locator(`[data-board-menu=${key}] > summary`);
  await summary("project").focus();
  await summary("project").press("Space");
  assert.match(
    await page.locator(".compact-project-info").textContent(),
    /Board lab/,
  );
  assert.ok(await page.locator("#saved-view").isVisible());
  await page.keyboard.press("Escape");
  assert.ok(
    await summary("project").evaluate((el) => el === document.activeElement),
  );
  await summary("more").click();
  assert.ok(await page.locator("[data-feature=canvas-json]").isVisible());
  await summary("add").click();
  assert.ok(await page.locator("[data-feature=canvas-json]").isHidden());
  await summary("navigate").click();
  await page.locator(".breadcrumb strong").click();
  assert.equal(await page.locator(".board-menu[open]").count(), 0);
  await page
    .getByRole("button", { name: "Project settings", exact: true })
    .click();
  await page.locator("dialog").waitFor();
  await page.locator("[data-action=dialog-close]").first().click();
  // Trigger a complete content redraw; every menu must keep exactly one action.
  await clickControl(page.locator(".board-menu [data-pro=outline]"));
  await page.locator("[data-view=list]").click();
  assert.ok(await page.locator(".hero").isHidden());
  assert.equal(await page.locator("#board-project-tools").count(), 1);
  await page.locator("[data-view=board]").click();
  for (const sel of [
    "#saved-view",
    "#canvas-snap",
    "[data-action=board-new]",
    ".board-menu [data-pro=outline]",
  ])
    assert.equal(await page.locator(sel).count(), 1, sel);
  await page.screenshot({
    path: "/tmp/pencils-compact-board.png",
    fullPage: true,
  });
  console.log(
    `PASS: desktop canvas starts at ${rect.y}px and uses ${Math.round((rect.height / 936) * 100)}% of viewport`,
  );
  for (const viewport of [
    { width: 1024, height: 768 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport);
    rect = await canvas.boundingBox();
    assert.ok(rect.height > viewport.height * 0.65);
    const overflow = await page.evaluate(() => ({
      x: document.documentElement.scrollWidth - innerWidth,
      y: document.documentElement.scrollHeight - innerHeight,
    }));
    assert.ok(overflow.x <= 1 && overflow.y <= 1, JSON.stringify(overflow));
    await page
      .getByRole("button", { name: "Project settings", exact: true })
      .click();
    await page.locator("[data-action=dialog-close]").first().click();
    await page.getByRole("button", { name: "New task", exact: true }).click();
    await page.locator("[data-action=dialog-close]").first().click();
    for (const key of ["project", "board", "add", "navigate", "more"]) {
      await summary(key).click();
      const box = await page
        .locator(`[data-board-menu=${key}] .board-menu-panel`)
        .boundingBox();
      assert.ok(box.x >= 0 && box.x + box.width <= viewport.width, key);
      assert.ok(box.y + box.height <= viewport.height, key);
      await page.keyboard.press("Escape");
    }
  }
  await page.screenshot({
    path: "/tmp/pencils-compact-mobile.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page
    .getByRole("button", { name: "Personal settings", exact: true })
    .click();
  await page.locator("[name=personal-theme][value=dark]").check();
  await page.locator("[data-action=dialog-close]").first().click();
  await summary("more").click();
  const bg = await page
    .locator("[data-board-menu=more] .board-menu-panel")
    .evaluate((el) => getComputedStyle(el).backgroundColor);
  assert.notEqual(bg, "rgb(255, 255, 255)");
  await page.screenshot({
    path: "/tmp/pencils-compact-dark.png",
    fullPage: true,
  });
  await page.keyboard.press("Escape");
  // Warnings remain visible even when the canvas normally fills the viewport.
  await page
    .locator(".topbar")
    .evaluate((el) =>
      el.insertAdjacentHTML(
        "afterend",
        '<div class="connection-banner">Local server unavailable.</div>',
      ),
    );
  const warning = await page.locator(".connection-banner").boundingBox();
  assert.ok(warning.height > 0 && warning.y < (await canvas.boundingBox()).y);
  assert.deepEqual(errors, []);
  assert.deepEqual(external, []);
  console.log(
    "PASS: menus, settings, view switching, mobile, dark mode, warnings and offline assets",
  );
} catch (e) {
  await page.screenshot({
    path: "/tmp/pencils-layout-failure.png",
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
