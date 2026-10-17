import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { chromium, firefox } from "playwright";
import { Store } from "../server/store.js";
import { createServer } from "../server/index.js";
const root = await fs.mkdtemp(path.join(os.tmpdir(), "pencils-dependencies-"));
const store = new Store(root);
await store.init();
const project = await store.createProject({ title: "Dependency lab" });
const first = await store.createTask(project.id, { title: "Design" });
const second = await store.createTask(project.id, { title: "Build" });
const third = await store.createTask(project.id, {
  title: "Ship",
  dependencies: [second.id],
});
const board = (await store.snapshot(project.id)).boards[0];
await store.updateBoard(project.id, board.id, {
  revision: board.revision,
  nodes: [first, second].map((task, i) => ({
    id: `n${i}`,
    type: "task",
    task: task.id,
    x: 80 + i * 420,
    y: 200,
    w: 280,
    h: 220,
  })),
  edges: [
    { id: "arrow", from: "n0", to: "n1", fromSide: "right", toSide: "left" },
  ],
});
const server = createServer(store);
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const browser = await (
  process.env.BROWSER === "firefox" ? firefox : chromium
).launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
const snap = () => store.snapshot(project.id);
const saved = async (id) => (await snap()).tasks.find((task) => task.id === id);
async function until(fn) {
  for (let i = 0; i < 180; i++) {
    if (await fn()) return;
    await new Promise((r) => setTimeout(r, 50));
  }
  throw Error("Timed out");
}
async function dependencyMenu() {
  await page
    .locator('g[data-edge="arrow"] .connector-hit')
    .click({ force: true });
  await page.locator('[data-selection-menu="dependency"] summary').click();
}
try {
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  await page.locator(`.project-link[data-id="${project.id}"]`).click();
  await page
    .locator(`[data-action=task-open][data-id="${second.id}"]`)
    .first()
    .click();
  await page.getByLabel("Start date", { exact: true }).fill("2026-10-16");
  await page.getByLabel("Due date", { exact: true }).fill("2026-10-20");
  await until(
    async () =>
      (await saved(second.id)).start === "2026-10-16" &&
      (await saved(second.id)).due === "2026-10-20",
  );
  for (const width of [1400, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    const start = await page
      .getByLabel("Start date", { exact: true })
      .boundingBox();
    const due = await page
      .getByLabel("Due date", { exact: true })
      .boundingBox();
    assert.ok(
      start.x < due.x && Math.abs(start.y - due.y) < 1,
      "Dates stay beside each other",
    );
  }
  await page.setViewportSize({ width: 1400, height: 1000 });
  assert.match(await page.locator("[data-dependants]").innerText(), /Ship/);
  await page.locator(".dependency-picker summary").click();
  assert.ok(
    await page.locator(`[data-dependency-add="${third.id}"]`).isDisabled(),
  );
  await page.getByLabel("Search prerequisites").fill(first.key);
  await page.locator(`[data-dependency-add="${first.id}"]`).click();
  await until(async () =>
    (await saved(second.id)).dependencies?.includes(first.id),
  );
  await page.screenshot({ path: "/tmp/pencils-task-dependencies.png" });
  await page.locator("[data-action=dialog-close]").click();
  await page.locator("[data-view=board]").click();
  await page.locator("g[data-task-dependency=true]").waitFor();
  const arrow = page.locator('g[data-edge="arrow"] .canvas-edge');
  assert.equal(await arrow.getAttribute("stroke"), "#8863b2");
  assert.match(
    await arrow.getAttribute("style"),
    /stroke-width:3;stroke-dasharray:8 5/,
  );
  await page
    .locator('g[data-edge="arrow"] .connector-hit')
    .click({ force: true });
  await page
    .getByRole("button", {
      name: "Dependency arrow style in Board settings",
      exact: true,
    })
    .click();
  const settings = page.locator(".dependency-style-settings");
  await settings.locator('[name="dependency-width"]').click();
  await page
    .locator("#shared-select-menu")
    .getByRole("option", { name: "5 px", exact: true })
    .click();
  await settings
    .locator('[name="dependency-lineStyle"]')
    .selectOption("dotted");
  await settings.locator('[name="dependency-toEnd"]').selectOption("arrow");
  await settings.locator(".color-picker summary").click();
  await settings.getByRole("button", { name: "Rose", exact: true }).click();
  assert.equal(
    await settings
      .locator(".dependency-style-preview path")
      .last()
      .getAttribute("stroke"),
    "#f1a9a0",
  );
  assert.match(
    await settings
      .locator(".dependency-style-preview path")
      .last()
      .getAttribute("style"),
    /stroke-width:5;stroke-dasharray:1 5/,
  );
  for (const width of [1400, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.evaluate(() => {
      document.querySelector(".sidebar")?.classList.remove("open");
      document.querySelector(".sidebar-overlay")?.classList.remove("visible");
    });
    if (width < 780) {
      await page.waitForFunction(
        () =>
          document.querySelector(".sidebar").getBoundingClientRect().right <= 1,
      );
      await page.evaluate(() =>
        window.PencilsAppearance.write({ theme: "dark" }),
      );
    }
    await settings.scrollIntoViewIfNeeded();
    assert.ok(
      await settings.evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
    );
    await page.screenshot({
      path: `/tmp/pencils-dependency-style-${width}.png`,
    });
  }
  await page.setViewportSize({ width: 1400, height: 1000 });
  await until(
    async () =>
      (await snap()).boards[0].settings?.dependency_style?.color === "#f1a9a0",
  );
  assert.deepEqual((await snap()).boards[0].settings.dependency_style, {
    color: "#f1a9a0",
    width: 5,
    lineStyle: "dotted",
    toEnd: "arrow",
  });
  await page.locator("[data-board-settings-reset]").click();
  await until(
    async () =>
      (await snap()).boards[0].settings.dependency_style.color === "#8863b2",
  );
  await page.locator("#board-settings-form").press("Control+z");
  await until(
    async () =>
      (await snap()).boards[0].settings.dependency_style.color === "#f1a9a0",
  );
  assert.equal(
    await settings.locator('[name="dependency-width"]').inputValue(),
    "5",
  );
  assert.equal(
    await settings.locator('[name="dependency-color"]').inputValue(),
    "#f1a9a0",
  );
  await page
    .getByRole("button", { name: "Close board settings", exact: true })
    .click();
  await page.reload();
  assert.equal(await arrow.getAttribute("stroke"), "#f1a9a0");
  assert.match(
    await arrow.getAttribute("style"),
    /stroke-width:5;stroke-dasharray:1 5/,
  );
  const more = page
    .locator(".board-toolbar details")
    .filter({ has: page.locator('[data-feature="canvas-svg"]') });
  await more.locator("summary").click();
  const downloadPromise = page.waitForEvent("download");
  await page.locator('[data-feature="canvas-svg"]').click();
  const downloaded = await downloadPromise;
  const svg = await fs.readFile(await downloaded.path(), "utf8");
  assert.match(svg, /stroke="#f1a9a0"/);
  assert.match(svg, /stroke-width:5;stroke-dasharray:1 5/);

  assert.equal(
    await page.locator('g[data-edge="arrow"] .edge-label').textContent(),
    "blocks",
  );
  await dependencyMenu();
  await page
    .getByRole("button", { name: "Remove dependency", exact: true })
    .click();
  await until(
    async () => !(await saved(second.id)).dependencies?.includes(first.id),
  );
  await until(
    async () =>
      (await page.locator("g[data-task-dependency=true]").count()) === 0,
  );
  assert.equal(
    await arrow.getAttribute("stroke"),
    "#78906f",
    "Ordinary connectors recover their own style",
  );

  await dependencyMenu();
  await page
    .getByRole("button", { name: "Make dependency", exact: true })
    .click();
  await until(async () =>
    (await saved(second.id)).dependencies?.includes(first.id),
  );
  await page.locator("[data-node=n1] [data-pro=task-details]").click();
  assert.match(
    await page.locator("[data-prerequisites]").innerText(),
    /Design/,
  );
  for (const width of [1400, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.evaluate(() => {
      window.PencilsAppearance.write({ theme: "dark" });
      document.querySelector(".sidebar")?.classList.remove("open");
      document.querySelector(".sidebar-overlay")?.classList.remove("visible");
    });
    if (width < 780)
      await page.waitForFunction(
        () =>
          document.querySelector(".sidebar").getBoundingClientRect().right <= 1,
      );
    await page.screenshot({
      path: `/tmp/pencils-dependency-panel-${width}.png`,
    });
    assert.ok(
      await page
        .locator(".task-dependencies")
        .evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
    );
  }
  await page.locator(`[data-dependency-remove="${first.id}"]`).click();
  await until(
    async () => !(await saved(second.id)).dependencies?.includes(first.id),
  );
  await until(
    async () =>
      (await page.locator("g[data-task-dependency=true]").count()) === 0,
  );
  await page.locator("[data-action=dialog-close]").click();
  await until(
    async () =>
      (await page.locator("g[data-task-dependency=true]").count()) === 0,
  );
  await page.setViewportSize({ width: 1400, height: 1000 });
  await dependencyMenu();
  await page
    .getByRole("button", { name: "Make dependency", exact: true })
    .click();
  await until(async () =>
    (await saved(second.id)).dependencies?.includes(first.id),
  );
  await page
    .locator('g[data-edge="arrow"] .connector-hit')
    .click({ force: true });
  await page
    .getByRole("button", { name: "Delete connector", exact: true })
    .click();
  await until(async () => !(await snap()).boards[0].edges.length);
  assert.deepEqual((await saved(second.id)).dependencies, [first.id]);
  assert.deepEqual(errors, []);
  console.log(
    "PASS: adjacent dates, searchable prerequisites, cycle prevention, downstream tasks, arrow dependency add/remove, task editor sync, mobile/dark layouts and line deletion semantics",
  );
} catch (error) {
  await page.screenshot({ path: "/tmp/pencils-dependencies-failure.png" });
  throw error;
} finally {
  await browser.close();
  server.closeAllConnections();
  await new Promise((r) => server.close(r));
  await fs.rm(root, { recursive: true, force: true });
}
