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
const camera = () =>
  page.locator("#canvas-world").evaluate((el) => {
    const m = new DOMMatrix(getComputedStyle(el).transform);
    return { x: m.e, y: m.f, z: m.a };
  });
const near = (a, b) => assert.ok(Math.abs(a - b) < 1, `${a} ≈ ${b}`);
async function wheel(dx, dy, extra = {}) {
  await page.locator("#canvas").evaluate(
    (el, { dx, dy, extra }) => {
      const r = el.getBoundingClientRect();
      el.dispatchEvent(
        new WheelEvent("wheel", {
          bubbles: true,
          cancelable: true,
          clientX: r.left + 480,
          clientY: r.top + 280,
          deltaX: dx,
          deltaY: dy,
          ...extra,
        }),
      );
    },
    { dx, dy, extra },
  );
}
async function dragFrom(locator, button, modifier) {
  const r = await locator.boundingBox();
  if (modifier) await page.keyboard.down(modifier);
  await page.mouse.move(r.x + 70, r.y + 70);
  await page.mouse.down({ button });
  await page.mouse.move(r.x + 130, r.y + 110, { steps: 8 });
  await page.mouse.up({ button });
  if (modifier) await page.keyboard.up(modifier);
}
try {
  await enter();
  let before = await camera();
  await wheel(0, -50);
  let after = await camera();
  assert.ok(after.z > before.z);
  near((480 - before.x) / before.z, (480 - after.x) / after.z);
  near((280 - before.y) / before.z, (280 - after.y) / after.z);
  before = await camera();
  await wheel(0, 31, { shiftKey: true });
  after = await camera();
  near(after.z, before.z);
  near(after.x, before.x);
  near(after.y, before.y - 31);
  before = after;
  await wheel(22, 0, { shiftKey: true });
  after = await camera();
  near(after.z, before.z);
  near(after.y, before.y - 22);
  await wheel(0, -20, { ctrlKey: true });
  assert.ok((await camera()).z > after.z);
  before = await camera();
  await wheel(0, 2.5);
  assert.ok((await camera()).z < before.z);
  console.log(
    "PASS: pointer-anchored scroll zoom, Shift-scroll vertical pan and pinch zoom",
  );

  await find("note", "First idea");
  await page.locator("[data-node=note]").click();
  const original = structuredClone((await current()).nodes);
  for (const [button, modifier] of [
    ["right", null],
    ["middle", null],
    ["left", "Space"],
  ]) {
    before = await camera();
    await dragFrom(page.locator("[data-node=note]"), button, modifier);
    after = await camera();
    near(after.x, before.x + 60);
    near(after.y, before.y + 40);
    assert.ok(
      await page
        .locator("[data-node=note]")
        .evaluate((el) => el.classList.contains("selected")),
    );
  }
  await page.keyboard.press("h");
  before = await camera();
  await dragFrom(page.locator("[data-node=note]"), "left");
  after = await camera();
  near(after.x, before.x + 60);
  await page.keyboard.press("v");
  assert.deepEqual((await current()).nodes, original);
  console.log(
    "PASS: right/middle/Space/hand panning preserves objects and selection",
  );

  await page.keyboard.press("Escape");
  await page.keyboard.press("Control+0");
  near((await camera()).z, 1);
  await find("note", "First idea");
  await page.locator("[data-node=note]").click();
  await page.keyboard.press("Alt+2");
  await page.keyboard.press("Control+g");
  await saved();
  assert.ok((await current()).nodes.find((n) => n.id === "note").group);
  await page.keyboard.press("Control+Shift+g");
  await saved();
  assert.ok(!(await current()).nodes.find((n) => n.id === "note").group);
  await page.keyboard.press("Control+Shift+l");
  await saved();
  assert.ok((await current()).nodes.find((n) => n.id === "note").locked);
  await page.keyboard.press("Control+Shift+l");
  await saved();
  await page.keyboard.press("m");
  assert.ok(await page.locator("#canvas-minimap").isHidden());
  await page.keyboard.press("m");
  assert.ok(await page.locator("#canvas-minimap").isVisible());
  await page.keyboard.press("g");
  assert.ok(
    await page
      .locator("#canvas")
      .evaluate((el) => el.classList.contains("grid-hidden")),
  );
  await page.keyboard.press("g");
  await page.keyboard.press("Control+f");
  assert.equal(
    await page.evaluate(() => document.activeElement.id),
    "canvas-find",
  );
  await page.keyboard.type("nht");
  assert.equal(await page.locator("#canvas-find").inputValue(), "nht");
  await page.locator("#canvas-find").fill("");
  await page.locator("#canvas").focus();
  await page.keyboard.press("F1");
  assert.equal(
    await page.locator("dialog h2").textContent(),
    "Board shortcuts",
  );
  await page.locator('dialog [data-action="dialog-close"]').click();
  console.log(
    "PASS: group/lock, zoom, find, minimap/grid and shortcut help with typing guards",
  );

  await find("note", "First idea");
  await page.locator("[data-node=note]").click();
  await page.keyboard.press("Control+0");
  // Move the camera so both neighboring cards are visible.
  await page.keyboard.press("Escape");
  await page.keyboard.press("Alt+1");
  await page.locator("[data-node=note]").click();
  await page.locator("[data-node=task-a]").click({ modifiers: ["Control"] });
  assert.equal(await page.locator(".board-node.selected").count(), 2);
  await page.locator("[data-node=task-a]").click({ modifiers: ["Control"] });
  assert.equal(await page.locator(".board-node.selected").count(), 1);
  await page.keyboard.press("Alt+2");
  const beforeDuplicate = await current();
  const count = beforeDuplicate.nodes.length;
  await dragFrom(page.locator("[data-node=note]"), "left", "Alt");
  await saved();
  await until(
    async () => (await current()).nodes.length === count + 1,
    "Alt-drag clone",
  );
  const duplicated = (await current()).nodes.filter(
    (n) => n.text === "First idea",
  );
  assert.equal(duplicated.length, 2);
  assert.deepEqual(
    duplicated.find((n) => n.id === "note"),
    beforeDuplicate.nodes.find((n) => n.id === "note"),
  );
  assert.notEqual(duplicated[0].x, duplicated[1].x);
  await page.keyboard.press("Control+z");
  await until(
    async () => (await current()).nodes.length === count,
    "undo duplicate",
  );
  console.log(
    "PASS: Ctrl-click multi-selection and Alt-drag duplication with undo",
  );

  await page.keyboard.press("Escape");
  await page.keyboard.press("n");
  assert.equal(
    await page.locator("dialog").count(),
    0,
    "N must not open a task dialog on the board",
  );
  await page.locator("#canvas").click({ position: { x: 480, y: 300 } });
  await page.locator('#canvas-inline-form [name="text"]').fill("Placed with N");
  // Wheel scrolling in an editor must not pan or zoom the board.
  before = await camera();
  await page
    .locator("#canvas-inline-form textarea")
    .dispatchEvent("wheel", { deltaY: 80, bubbles: true });
  assert.deepEqual(await camera(), before);
  await page.keyboard.press("Control+Enter");
  await saved();
  await until(
    async () => (await current()).nodes.some((n) => n.text === "Placed with N"),
    "placed note saved",
  );
  await page.keyboard.press("t");
  await page.keyboard.press("Escape");
  assert.equal(
    await page
      .locator("#canvas")
      .evaluate((el) => el.classList.contains("placing")),
    false,
  );
  await page.keyboard.press("l");
  assert.equal(
    await page.locator('[data-tool="connect"]').getAttribute("class"),
    "active",
  );
  await page.keyboard.press("p");
  assert.ok(
    await page
      .locator('[data-feature="draw-tool"]')
      .evaluate((el) => el.classList.contains("primary")),
  );
  await page.keyboard.press("v");
  if (process.env.BROWSER !== "firefox") {
    const cdp = await context.newCDPSession(page);
    await page.locator('[data-action="board-add"][data-tool="text"]').click();
    const r = await page.locator("#canvas").boundingBox();
    const x = r.x + 420,
      y = r.y + 220;
    const count = (await current()).nodes.length;
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ x, y, id: 1 }],
    });
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ x: x + 60, y: y + 40, id: 1 }],
    });
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
    assert.equal(
      await page.locator("#canvas-inline-form").count(),
      0,
      "Dragging with a touch must not place a card",
    );
    assert.equal((await current()).nodes.length, count);
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ x, y, id: 2 }],
    });
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
    await page.locator("#canvas-inline-form textarea").fill("Placed by touch");
    await page.locator('#canvas-inline-form [type="submit"]').click();
    await until(
      async () =>
        (await current()).nodes.some((n) => n.text === "Placed by touch"),
      "touch placement",
    );
    console.log("PASS: touch tap places a card; touch drag only pans");
  }
  assert.deepEqual(errors, []);
  assert.deepEqual(external, []);
  console.log(
    "PASS: sticky click-to-place and inline save, editor scrolling, tool shortcuts, no internet requests",
  );
} catch (e) {
  await page.screenshot({
    path: "/tmp/pencils-controls-failure.png",
    fullPage: true,
  });
  console.error("Browser errors:", errors);
  throw e;
} finally {
  await browser.close();
  server.closeAllConnections();
  await new Promise((r) => server.close(r));
  await fs.rm(root, { recursive: true, force: true });
}
