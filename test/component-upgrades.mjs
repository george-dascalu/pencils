import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { chromium, firefox } from "playwright";
import { Store } from "../server/store.js";
import { createServer } from "../server/index.js";
import { newGrid } from "../public/grid-model.js";
const root = await fs.mkdtemp(path.join(os.tmpdir(), "pencils-components-")),
  store = new Store(root);
await store.init();
const project = await store.createProject({ title: "Components", key: "COMP" }),
  task = await store.createTask(project.id, {
    title: "Scheduled task",
    start: "2026-10-14",
    due: "2026-10-18",
  });
await store.createTask(project.id, { title: "Unscheduled task" });
let board = (await store.snapshot(project.id)).boards[0];
const grid = newGrid();
grid.cells[0][0].text = "Alpha";
grid.cells[0][1].text = "Beta";
board = await store.updateBoard(project.id, board.id, {
  revision: board.revision,
  nodes: [
    {
      id: "note",
      type: "sticky",
      text: "Typography note",
      x: 150,
      y: 240,
      w: 240,
      h: 180,
    },
    {
      id: "note2",
      type: "sticky",
      text: "Second note",
      x: 500,
      y: 240,
      w: 180,
      h: 120,
    },
    {
      id: "shape",
      type: "shape",
      text: "Decision",
      x: 850,
      y: 240,
      w: 240,
      h: 180,
    },
    {
      id: "grid",
      type: "grid",
      text: "",
      x: 150,
      y: 550,
      w: 540,
      h: 312,
      grid,
    },
    {
      id: "frame",
      type: "frame",
      text: "Frame one",
      x: 1100,
      y: 600,
      w: 640,
      h: 400,
    },
    {
      id: "query",
      type: "query",
      text: "Live work",
      x: 850,
      y: 1100,
      w: 800,
      h: 500,
      query: {},
      viewType: "table",
    },
  ],
  edges: [{ id: "edge", from: "note", to: "note2", label: "Connection" }],
});
const server = createServer(store);
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${server.address().port}`,
  browser = await (
    process.env.BROWSER === "firefox" ? firefox : chromium
  ).launch({ headless: true }),
  page = await browser.newPage({ viewport: { width: 1600, height: 1100 } }),
  errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.setDefaultTimeout(10000);
const current = async () => (await store.snapshot(project.id)).boards[0];
async function until(fn) {
  for (let i = 0; i < 120; i++) {
    if (await fn()) return;
    await page.waitForTimeout(80);
  }
  throw Error("Save timed out");
}
async function menu(key) {
  const m = page.locator(`[data-selection-menu="${key}"]`);
  if ((await m.getAttribute("open")) === null)
    await m.locator(":scope > summary").click();
  return m;
}
async function find(id, text) {
  const search = page.locator("#canvas-find");
  if (!(await search.isVisible()))
    await page.locator('[data-pro="search-toggle"]').click();
  await search.fill(text);
  await page.locator(`[data-pro="find-result"][data-id="${id}"]`).click();
  await page.waitForTimeout(100);
}
async function more() {
  const m = page.locator("[data-board-menu=more]");
  if ((await m.getAttribute("open")) === null)
    await m.locator(":scope > summary").click();
}
try {
  await page.goto(base);
  await page.locator(".project-link").click();
  await page.locator("[data-view=board]").click();
  await find("note", "Typography");
  await menu("text-align");
  await page
    .locator("#selection-tools [data-text-style=fontSize]")
    .selectOption("24");
  await until(
    async () =>
      (await current()).nodes.find((n) => n.id === "note").fontSize === 24,
  );
  await menu("text-align");
  await page
    .locator("#selection-tools [data-text-style=verticalAlign]")
    .selectOption("bottom");
  await until(
    async () =>
      (await current()).nodes.find((n) => n.id === "note").verticalAlign ===
      "bottom",
  );
  assert.equal(
    await page
      .locator("[data-node=note] .board-node-content")
      .evaluate((e) => getComputedStyle(e).justifyContent),
    "flex-end",
  );
  console.log("Typography saved and painted");
  await find("shape", "Decision");
  await menu("geometry");
  await page.locator("[data-object-geometry=shape]").selectOption("diamond");
  await until(
    async () =>
      (await current()).nodes.find((n) => n.id === "shape").shape === "diamond",
  );
  assert.equal(
    await page.locator("[data-node=shape] .shape-art polygon").count(),
    1,
  );
  await menu("geometry");
  await page.locator("[data-object-geometry=rotation]").fill("30");
  await page.locator("[data-object-geometry=rotation]").press("Tab");
  await until(
    async () =>
      (await current()).nodes.find((n) => n.id === "shape").rotation === 30,
  );
  console.log("Shape and rotation saved");
  await find("grid", "Alpha");
  const cells = page.locator("[data-node=grid] .grid-cell");
  await cells.nth(0).click();
  await cells.nth(1).click({ modifiers: ["Shift"] });
  const merge = page.locator("[data-grid-action=merge]");
  await merge.evaluate((e) => (e.closest("details").open = true));
  await merge.click();
  await until(
    async () =>
      (await current()).nodes.find((n) => n.id === "grid").grid.merges
        ?.length === 1,
  );
  assert.match(await cells.nth(0).innerText(), /Alpha[\s\S]*Beta/);
  await page.reload();
  await find("grid", "Alpha");
  assert.match(
    await page.locator("[data-node=grid] .grid-cell").first().innerText(),
    /Beta/,
  );
  console.log("Grid merge persisted");
  await find("note", "Typography");
  await more();
  await page.locator("[data-layout-tool=layers]").click();
  await page.locator("#board-layers-form [name=name]").fill("Ideas");
  await page.locator("#board-layers-form [type=submit]").click();
  await until(async () => (await current()).layers?.length === 1);
  await page
    .locator('[data-layer-action=assign][data-layer]:not([data-layer=""])')
    .click();
  await until(
    async () => (await current()).nodes.find((n) => n.id === "note").layer,
  );
  await page.locator("[data-layer-action=hide]").click();
  await until(
    async () =>
      (await current()).nodes.find((n) => n.id === "note").layerHidden,
  );
  await page.locator("[data-action=dialog-close]").click();
  assert.equal(await page.locator(".board-node[data-node=note]").count(), 0);
  await more();
  await page.locator("[data-layout-tool=layers]").click();
  await page.locator("[data-layer-action=hide]").click();
  await page.locator("[data-action=dialog-close]").click();
  await until(
    async () =>
      (await page.locator(".board-node[data-node=note]").count()) === 1,
  );
  console.log("Named layers persisted, hide/show works");
  await find("note", "Typography");
  await page.keyboard.down("Control");
  await page.locator("[data-node=note2]").click();
  await page.keyboard.up("Control");
  assert.equal(await page.locator(".multi-resize-box").count(), 1);
  const handle = await page.locator("[data-group-resize=se]").boundingBox();
  const before = await current();
  if (process.env.DEBUG_DRAG) {
    console.log(
      "HANDLE",
      handle,
      await page.evaluate(
        ({ x, y }) => document.elementFromPoint(x, y)?.outerHTML,
        { x: handle.x + handle.width / 2, y: handle.y + handle.height / 2 },
      ),
    );
    await page.evaluate(() => {
      window.dragEvents = [];
      for (const type of [
        "pointerdown",
        "pointermove",
        "pointerup",
        "pointercancel",
        "lostpointercapture",
      ])
        window.addEventListener(
          type,
          (e) =>
            window.dragEvents.push([
              type,
              e.clientX,
              e.clientY,
              e.target.outerHTML?.slice(0, 80),
            ]),
          true,
        );
    });
  }
  await page.mouse.move(
    handle.x + handle.width / 2,
    handle.y + handle.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(Math.min(1580, handle.x + 50), handle.y + 70, {
    steps: 10,
  });
  await page.mouse.up();
  if (process.env.DEBUG_DRAG)
    console.log(await page.evaluate(() => window.dragEvents));
  await until(
    async () =>
      (await current()).nodes.find((n) => n.id === "note").w >
      before.nodes.find((n) => n.id === "note").w,
  );
  console.log("Multiple object resize saved");
  await find("query", "Live work");
  assert.match(
    await page.locator("[data-node=query] .embedded-table").innerText(),
    /COMP-1/,
  );
  await page.locator("[data-selection-menu=more] > summary").click();
  await page.locator("[data-pro=query-edit]").click();
  await page
    .locator("#canvas-query-form [name=viewType]")
    .selectOption("kanban");
  await page.locator("#canvas-query-form [type=submit]").click();
  await until(
    async () =>
      (await current()).nodes.find((n) => n.id === "query").viewType ===
      "kanban",
  );
  const first = page.locator(`[data-live-task="${task.id}"]`),
    target = page.locator('[data-live-status="in-progress"]');
  await first.dragTo(target);
  await until(
    async () =>
      (await store.snapshot(project.id)).tasks.find((t) => t.id === task.id)
        .status === "in-progress",
  );
  console.log("Embedded Kanban updates project task");
  await page.locator("[data-view=timeline]").click();
  const bar = page.locator(`[data-timeline-task="${task.id}"]`),
    b = await bar.boundingBox();
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width / 2 + 32, b.y + b.height / 2, {
    steps: 5,
  });
  await page.mouse.up();
  await until(
    async () =>
      (await store.snapshot(project.id)).tasks.find((t) => t.id === task.id)
        .start === "2026-10-16",
  );
  await page.locator(`[data-milestone="${task.id}"]`).click();
  await until(
    async () =>
      (await store.snapshot(project.id)).tasks.find((t) => t.id === task.id)
        .milestone === true,
  );
  console.log("Timeline drag and milestones saved");
  await page.locator("[data-view=board]").click();
  await find("frame", "Frame one");
  await menu("arrange");
  const download = page.waitForEvent("download");
  await page.locator("[data-feature=frames-pdf]").click();
  const file = await download;
  const bytes = await fs.readFile(await file.path());
  assert.equal(bytes.subarray(0, 4).toString(), "%PDF");
  assert.ok(bytes.length > 1000);
  console.log("Local frame PDF exported");
  await find("note", "Typography");
  await more();
  await page.locator("[data-session=open]").first().click();
  await page.locator("[data-session=timer]").click();
  await until(
    async () => (await current()).settings?.session?.timerEnd > Date.now(),
  );
  await page.locator("[data-session=vote-start]").click();
  await until(async () => (await current()).settings?.session?.voting);
  await page.locator("[data-session=vote-cast]").click();
  await until(async () =>
    (await current()).settings?.session?.votes?.[0]?.nodes.includes("note"),
  );
  await page.locator("[data-action=dialog-close]").click();
  console.log("Timer and votes persisted");

  // Direct frame URLs work on a separate device; follow is explicitly opt-in.
  const other = await browser.newPage({
    viewport: { width: 1600, height: 1100 },
  });
  other.on("pageerror", (e) => errors.push(e.message));
  await other.goto(
    `${base}/#project/${project.id}/board/${board.id}/frame/frame`,
  );
  await other.locator("#canvas").waitFor();
  await more();
  await page.locator("[data-session=open]").first().click();
  await page.locator("[data-session=invite]").click();
  await page.locator("[data-action=dialog-close]").click();
  if (process.env.DEBUG_SESSION) {
    await page.waitForTimeout(2000);
    console.log(
      "MEMBERS",
      await (
        await fetch(
          `${base}/api/projects/${project.id}/boards/${board.id}/presence`,
        )
      ).json(),
    );
    console.log(
      "OTHER",
      await other.locator("#canvas-presence").innerText(),
      await other.locator("#session-invitation").count(),
    );
  }
  await other.locator("#session-invitation [data-follow]").click();
  await other.locator("#session-status [data-session=unfollow]").waitFor();
  await until(
    async () =>
      (await page
        .locator("#canvas-world")
        .evaluate((e) => e.style.transform)) ===
      (await other.locator("#canvas-world").evaluate((e) => e.style.transform)),
  );
  const c = await page.locator("#canvas").boundingBox();
  await page.mouse.move(c.x + 400, c.y + 200);
  await page.mouse.down({ button: "middle" });
  await page.mouse.move(c.x + 460, c.y + 240);
  await page.mouse.up({ button: "middle" });
  await until(
    async () =>
      (await page
        .locator("#canvas-world")
        .evaluate((e) => e.style.transform)) ===
      (await other.locator("#canvas-world").evaluate((e) => e.style.transform)),
  );
  await other.locator("[data-session=unfollow]").click();
  await other.close();
  console.log(
    "Frame deep link and opt-in presenter follow work across devices",
  );
  // Mouse/trackpad preferences and keyboard object resizing.
  await page.evaluate(() =>
    window.PencilsAppearance.write({
      navigation: "trackpad",
      singleKeys: false,
    }),
  );
  await find("note", "Typography");
  await page.locator("[data-node=note]").focus();
  const oldSize = (await current()).nodes.find((n) => n.id === "note").w;
  await page.keyboard.press("Alt+Shift+ArrowRight");
  await until(
    async () =>
      (await current()).nodes.find((n) => n.id === "note").w === oldSize + 10,
  );
  await page.keyboard.press("n");
  assert.equal(
    await page
      .locator("#canvas")
      .evaluate((e) => e.classList.contains("placing")),
    false,
  );
  const oldTransform = await page
    .locator("#canvas-world")
    .evaluate((e) => e.style.transform);
  await page.mouse.move(c.x + 400, c.y + 200);
  await page.mouse.wheel(0, 100);
  await page.waitForTimeout(100);
  assert.notEqual(
    await page.locator("#canvas-world").evaluate((e) => e.style.transform),
    oldTransform,
  );
  await page.evaluate(() =>
    window.PencilsAppearance.write({ navigation: "mouse", singleKeys: true }),
  );
  console.log("Keyboard resize and personal navigation preferences work");
  await page.screenshot({ path: "/tmp/pencils-component-upgrades.png" });
  assert.deepEqual(errors, []);
  console.log("PASS: component upgrade integration");
} catch (e) {
  await page.screenshot({
    path: "/tmp/pencils-component-upgrades-failure.png",
  });
  console.error(errors);
  throw e;
} finally {
  await browser.close();
  await new Promise((r) => server.close(r));
  store.close?.();
  await fs.rm(root, { recursive: true, force: true });
}
