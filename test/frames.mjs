import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { chromium, firefox } from "playwright";
import { Store } from "../server/store.js";
import { createServer } from "../server/index.js";
import { openBoardSearch, clickControl } from "./menu-controls.mjs";
const root = await fs.mkdtemp(path.join(os.tmpdir(), "pencils-frames-")),
  store = new Store(root);
await store.init();
const project = await store.createProject({ title: "Frame lab" });
const initial = (await store.snapshot(project.id)).boards[0];
const note = {
  id: "note",
  type: "sticky",
  text: "Contained idea",
  x: 210,
  y: 390,
  w: 180,
  h: 100,
  frame: "inner",
};
const fixtures = [
  {
    id: "outer",
    type: "frame",
    text: "Workshop",
    x: 100,
    y: 200,
    w: 700,
    h: 500,
  },
  {
    id: "inner",
    type: "frame",
    text: "Discussion",
    x: 180,
    y: 340,
    w: 300,
    h: 220,
    frame: "outer",
  },
  note,
  {
    id: "second",
    type: "frame",
    text: "Next steps",
    x: 900,
    y: 200,
    w: 400,
    h: 500,
  },
];
const server = createServer(store);
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const browser = await (
  process.env.BROWSER === "firefox" ? firefox : chromium
).launch({ headless: true });
const page = await browser.newPage({
  viewport: { width: 1600, height: 1100 },
  hasTouch: true,
});
page.setDefaultTimeout(12000);
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
await page.addInitScript(
  (id) =>
    localStorage.setItem(
      `pencils:camera:${id}`,
      JSON.stringify({ x: 40, y: 20, z: 0.8 }),
    ),
  initial.id,
);
const current = async () => (await store.snapshot(project.id)).boards[0];
const node = (id) => page.locator(`[data-node="${id}"]`);
async function until(fn) {
  for (let i = 0; i < 120; i++) {
    if (await fn()) return;
    await page.waitForTimeout(60);
  }
  throw Error("Save did not settle");
}
async function fixture(nodes = fixtures) {
  const b = await current();
  await store.updateBoard(project.id, b.id, {
    revision: b.revision,
    nodes,
    edges: nodes.some((n) => n.id === "inner")
      ? [
          { id: "internal", from: "inner", to: "note" },
          { id: "external", from: "note", to: "second" },
        ]
      : [],
    settings: { snap: false, alignObjects: false },
    presentation: [],
  });
  await page.reload();
  await node(nodes[0].id).waitFor();
}
async function find(id, text) {
  await openBoardSearch(page);
  await page.locator("#canvas-find").fill(text);
  await page.locator(`#canvas-find-results [data-id="${id}"]`).click();
  await page.waitForTimeout(250);
}
const camera = () =>
  page
    .locator("#canvas-world")
    .evaluate((el) => getComputedStyle(el).transform);
async function world(x, y) {
  return page.evaluate(
    ({ x, y }) => {
      const r = document.querySelector("#canvas").getBoundingClientRect(),
        m = new DOMMatrix(
          getComputedStyle(document.querySelector("#canvas-world")).transform,
        );
      return { x: r.x + m.e + x * m.a, y: r.y + m.f + y * m.a };
    },
    { x, y },
  );
}
async function move(id, dx, dy, title = false) {
  const el = title ? node(id).locator(".frame-title") : node(id);
  const r = await el.boundingBox(),
    z = await page
      .locator("#canvas-world")
      .evaluate((el) => new DOMMatrix(getComputedStyle(el).transform).a);
  await page.mouse.move(r.x + r.width / 2, r.y + r.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    r.x + r.width / 2 + dx * z,
    r.y + r.height / 2 + dy * z,
    { steps: 8 },
  );
  await page.mouse.up();
}
async function moveSurface(x, y, dx, dy, cancel = false) {
  const start = await world(x, y),
    end = await world(x + dx, y + dy);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(end.x, end.y, { steps: 8 });
  assert.equal(
    await page.locator(".marquee").count(),
    0,
    "Dragging a selected frame does not start a selection box",
  );
  if (cancel) await page.keyboard.press("Escape");
  await page.mouse.up();
}
try {
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  await page.locator(".project-link").click();
  await page.locator("[data-view=board]").click();
  await fixture([{ ...note, frame: undefined, x: 250, y: 300 }]);
  await page.locator('[aria-label="Draw frame"]').click();
  const start = await world(200, 250),
    end = await world(550, 500);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(end.x, end.y, { steps: 8 });
  assert.ok(await page.locator(".frame-preview").isVisible());
  await page.mouse.up();
  await until(async () => (await current()).nodes.length === 2);
  let frame = (await current()).nodes.find((n) => n.type === "frame");
  assert.deepEqual([frame.x, frame.y, frame.w, frame.h], [200, 250, 350, 250]);
  assert.equal(
    (await current()).nodes.find((n) => n.id === "note").frame,
    frame.id,
  );
  assert.equal(await node(frame.id).locator(".frame-title").textContent(), "");
  assert.equal(
    await page.evaluate(() => document.activeElement.dataset.node),
    frame.id,
  );
  await page.keyboard.press("f");
  const cancel = await world(650, 550);
  await page.mouse.move(cancel.x, cancel.y);
  await page.mouse.down();
  await page.mouse.move(cancel.x + 100, cancel.y + 70);
  await page.keyboard.press("Escape");
  await page.mouse.up();
  assert.equal((await current()).nodes.length, 2);
  await fixture();
  await find("outer", "Workshop");
  // Stay below the nested frame toolbar when adding its parent to selection.
  const emptyInside = await world(600, 650);
  await page.mouse.click(emptyInside.x, emptyInside.y);
  const selectedIds = () =>
    page
      .locator(".board-node.selected")
      .evaluateAll((els) => els.map((el) => el.dataset.node).sort());
  assert.deepEqual(
    await selectedIds(),
    ["outer"],
    "Empty frame space selects its frame",
  );
  const selectionCamera = await camera(),
    selectionBoard = await current();
  const innerInside = await world(440, 520);
  await page.mouse.click(innerInside.x, innerInside.y);
  assert.deepEqual(
    await selectedIds(),
    ["inner"],
    "Nested frames take precedence",
  );
  await page.keyboard.down("Shift");
  await page.mouse.click(emptyInside.x, emptyInside.y);
  await page.keyboard.up("Shift");
  assert.deepEqual(await selectedIds(), ["inner", "outer"]);
  await page.keyboard.down("Control");
  await page.mouse.click(emptyInside.x, emptyInside.y);
  await page.keyboard.up("Control");
  assert.deepEqual(
    await selectedIds(),
    ["inner"],
    "Modifier clicks toggle frame selection",
  );
  const noteInside = await world(300, 440);
  await page.mouse.click(noteInside.x, noteInside.y);
  assert.deepEqual(
    await selectedIds(),
    ["note"],
    "Children remain directly selectable",
  );
  await page.mouse.move(emptyInside.x, emptyInside.y);
  await page.mouse.down();
  await page.mouse.move(emptyInside.x + 2, emptyInside.y + 1);
  await page.mouse.up();
  assert.deepEqual(
    await selectedIds(),
    ["outer"],
    "Small pointer jitter remains a click",
  );
  await page.mouse.move(innerInside.x, innerInside.y);
  await page.mouse.down();
  const marqueeEnd = await world(200, 380);
  await page.mouse.move(marqueeEnd.x, marqueeEnd.y, { steps: 8 });
  await page.mouse.up();
  assert.deepEqual(
    await selectedIds(),
    ["note"],
    "Dragging frame space still selects contained objects",
  );
  await page.mouse.move(emptyInside.x, emptyInside.y);
  await page.mouse.down();
  await page.keyboard.press("Escape");
  await page.mouse.up();
  assert.deepEqual(
    await selectedIds(),
    ["note"],
    "Cancelling a pending frame click preserves selection",
  );
  const outside = await world(850, 300);
  await page.mouse.click(outside.x, outside.y);
  await page.waitForFunction(
    () => !document.querySelector(".board-node.selected"),
  );
  assert.deepEqual(
    await selectedIds(),
    [],
    "The board background still deselects everything",
  );
  assert.deepEqual(
    await current(),
    selectionBoard,
    "Selection never mutates or saves frame contents",
  );
  assert.equal(
    await camera(),
    selectionCamera,
    "Selection does not move the camera",
  );
  await page.mouse.click(emptyInside.x, emptyInside.y);
  await page.waitForFunction(() =>
    document.querySelector('[data-node="outer"].selected'),
  );
  const surfaceBefore = await current();
  await moveSurface(600, 300, 35, 25);
  await until(
    async () =>
      Math.abs((await current()).nodes.find((n) => n.id === "outer").x - 135) <=
      1,
  );
  const surfaceMoved = (await current()).nodes.find((n) => n.id === "outer"),
    surfaceDx = surfaceMoved.x - 100,
    surfaceDy = surfaceMoved.y - 200;
  assert.ok(Math.abs(surfaceDy - 25) <= 1);
  for (const id of ["outer", "inner", "note"]) {
    const old = surfaceBefore.nodes.find((n) => n.id === id),
      moved = (await current()).nodes.find((n) => n.id === id);
    assert.equal(
      moved.x,
      old.x + surfaceDx,
      "Frame surface drag carries descendants",
    );
    assert.equal(moved.y, old.y + surfaceDy);
  }
  assert.deepEqual(
    (await current()).nodes.find((n) => n.id === "second"),
    surfaceBefore.nodes.find((n) => n.id === "second"),
  );
  assert.equal(
    await camera(),
    selectionCamera,
    "Moving a frame leaves the camera unchanged",
  );
  await page.keyboard.press("Control+z");
  await until(
    async () => (await current()).nodes.find((n) => n.id === "outer").x === 100,
  );
  assert.deepEqual(
    (await current()).nodes,
    surfaceBefore.nodes,
    "One undo restores the frame and its contents",
  );
  await moveSurface(600, 300, 40, 30, true);
  assert.deepEqual(
    (await current()).nodes,
    surfaceBefore.nodes,
    "Escape cancels a frame surface drag",
  );
  assert.equal(
    Math.round(await node("outer").evaluate((el) => parseFloat(el.style.left))),
    100,
  );
  await find("outer", "Workshop");
  const before = await current();
  await move("outer", 30, 40, true);
  await until(
    async () => (await current()).nodes.find((n) => n.id === "outer").x === 130,
  );
  for (const id of ["inner", "note"]) {
    const old = before.nodes.find((n) => n.id === id),
      fresh = (await current()).nodes.find((n) => n.id === id);
    assert.equal(fresh.x, old.x + 30);
    assert.equal(fresh.y, old.y + 40);
  }
  await page.locator("#canvas").focus();
  await page.keyboard.press("ArrowRight");
  await until(
    async () => (await current()).nodes.find((n) => n.id === "outer").x === 135,
  );
  assert.equal(
    (await current()).nodes.find((n) => n.id === "note").x,
    note.x + 35,
    "Keyboard nudging carries descendants",
  );
  await fixture();
  await page.locator('[data-action="board-fit"]').click();
  await page.waitForTimeout(250);
  await node("note").click();
  await move("note", 600, 210);
  await until(
    async () =>
      Math.abs((await current()).nodes.find((n) => n.id === "note").x - 810) <=
      2,
  );
  assert.equal(
    (await current()).nodes.find((n) => n.id === "note").frame,
    undefined,
  );
  await find("note", "Contained idea");
  await move("note", 140, -180);
  await until(
    async () =>
      (await current()).nodes.find((n) => n.id === "note").frame === "second",
  );
  await fixture();
  await find("outer", "Workshop");
  const cam = await camera();
  await page.keyboard.press("Control+d");
  await until(async () => (await current()).nodes.length === 7);
  const copies = (await current()).nodes.filter(
    (n) => !fixtures.some((f) => f.id === n.id),
  );
  assert.equal(copies.length, 3);
  const outerCopy = copies.find((n) => n.text === "Workshop"),
    innerCopy = copies.find((n) => n.text === "Discussion"),
    noteCopy = copies.find((n) => n.type === "sticky");
  assert.equal(innerCopy.frame, outerCopy.id);
  assert.equal(noteCopy.frame, innerCopy.id);
  assert.ok(
    (await current()).edges.some(
      (e) => e.from === innerCopy.id && e.to === noteCopy.id,
    ),
  );
  assert.equal(
    (await current()).edges.length,
    3,
    "Only internal connectors are copied",
  );
  assert.equal(await camera(), cam);
  await page.keyboard.press("Control+z");
  await until(async () => (await current()).nodes.length === 4);
  await find("outer", "Workshop");
  const pasteCamera = await camera();
  await page.keyboard.press("Control+c");
  await page.keyboard.press("Control+v");
  await until(async () => (await current()).nodes.length === 7);
  assert.equal(await camera(), pasteCamera);
  await fixture();
  await find("outer", "Workshop");
  await page
    .locator('#selection-tools [data-selection-menu="frame-size"] > summary')
    .click();
  await page.locator('[data-preset="square"]').click();
  await until(
    async () => (await current()).nodes.find((n) => n.id === "outer").w === 600,
  );
  assert.deepEqual(
    (await current()).nodes.find((n) => n.id === "note"),
    note,
  );
  await page.locator('[data-feature="frame-fit"]').click();
  await until(
    async () => (await current()).nodes.find((n) => n.id === "outer").w === 380,
  );
  assert.deepEqual(
    (await current()).nodes.find((n) => n.id === "note"),
    note,
  );
  await page.locator('[data-feature="frame-contents"]').click();
  assert.equal(await page.locator(".board-node.selected").count(), 2);
  await find("outer", "Workshop");
  await page.locator('[data-feature="selection-delete"]').click();
  await until(async () => (await current()).nodes.length === 3);
  assert.ok((await current()).nodes.some((n) => n.id === "note"));
  assert.equal(
    (await current()).nodes.find((n) => n.id === "inner").frame,
    undefined,
  );
  await page.keyboard.press("Control+z");
  await until(async () => (await current()).nodes.length === 4);
  await fixture();
  await find("outer", "Workshop");
  await page.locator('#selection-tools [data-pro="collapse"]').click();
  await until(
    async () =>
      (await current()).nodes.find((n) => n.id === "outer").collapsed === true,
  );
  assert.equal(await node("note").count(), 0);
  await page.locator('#selection-tools [data-pro="frame-present"]').click();
  await page.locator("#presentation-controls").waitFor();
  assert.match(
    await page.locator("#presentation-controls").innerText(),
    /1 \/ 2/,
  );
  assert.ok(await node("note").isVisible());
  assert.equal(
    (await current()).nodes.find((n) => n.id === "outer").collapsed,
    true,
  );
  await page.keyboard.press("Escape");
  assert.equal(await node("note").count(), 0);
  await find("outer", "Workshop");
  await page.locator('#selection-tools [data-pro="collapse"]').click();
  await until(
    async () =>
      !(await current()).nodes.find((n) => n.id === "outer").collapsed,
  );
  await clickControl(page.locator('[data-pro="outline"]').first());
  const row = (id) => page.locator(`#canvas-outline [data-frame-row="${id}"]`);
  await row("second").dragTo(row("outer"));
  await until(async () => (await current()).presentation[0] === "second");
  assert.equal(await row("inner").getAttribute("draggable"), "false");
  await page.locator('#canvas-outline [data-pro="frames-organize"]').click();
  await until(async () => (await current()).presentation[0] === "outer");
  await page.locator('#canvas-outline [data-pro="outline"]').click();
  await find("outer", "Workshop");
  await page
    .locator('#selection-tools [data-selection-menu="color"] > summary')
    .click();
  await page.getByRole("button", { name: "Rose", exact: true }).click();
  await until(
    async () =>
      (await current()).nodes.find((n) => n.id === "outer").color === "#f1a9a0",
  );
  assert.equal(
    await node("outer").evaluate((el) => getComputedStyle(el).backgroundColor),
    "rgb(241, 169, 160)",
  );
  await page.screenshot({ path: "/tmp/pencils-frames-desktop.png" });
  for (const width of [1600, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.evaluate(
      () => (document.documentElement.dataset.theme = "dark"),
    );
    await find("outer", "Workshop");
    const r = await page.locator("#selection-tools").boundingBox();
    assert.ok(r.x >= 0 && r.x + r.width <= width);
    await page.screenshot({ path: `/tmp/pencils-frames-${width}-dark.png` });
  }
  await page.reload();
  await find("outer", "Workshop");
  assert.equal((await current()).presentation[0], "outer");
  // Untitled and locked frames remain selectable by touch on a narrow viewport.
  await fixture([
    { ...fixtures[0], text: "", locked: true, x: 100, y: 100, w: 300, h: 300 },
  ]);
  await page.locator('[data-action="board-fit"]').click();
  await page.waitForTimeout(250);
  const touchPoint = await world(250, 250),
    touchBoard = await current();
  await page.touchscreen.tap(touchPoint.x, touchPoint.y);
  assert.deepEqual(await selectedIds(), ["outer"]);
  assert.equal(await node("outer").locator(".frame-title").textContent(), "");
  assert.deepEqual(await current(), touchBoard);
  await moveSurface(250, 250, 20, 15);
  assert.deepEqual(
    await current(),
    touchBoard,
    "Locked frames cannot move from their interior",
  );
  await fixture([{ ...fixtures[0], text: "", x: 100, y: 100, w: 300, h: 300 }]);
  await page.locator('[data-action="board-fit"]').click();
  await page.waitForTimeout(250);
  const unlockedTouch = await world(250, 250);
  await page.touchscreen.tap(unlockedTouch.x, unlockedTouch.y);
  await moveSurface(250, 250, 20, 15);
  await until(
    async () =>
      Math.abs((await current()).nodes.find((n) => n.id === "outer").x - 120) <=
      1,
  );
  assert.ok(
    Math.abs((await current()).nodes[0].y - 115) <= 1,
    "Untitled frames move on a narrow viewport",
  );
  const mobileMoved = (await current()).nodes;
  await page.reload();
  await node("outer").waitFor();
  assert.deepEqual(
    (await current()).nodes,
    mobileMoved,
    "Frame surface movement persists",
  );
  assert.deepEqual(errors, []);
  console.log(
    "PASS: frame surface clicks/taps, nested selection, modifier toggles, marquee, cancellation, untitled/locked frames, draw/cancel frames, selected-surface dragging, nested movement, attach/detach, full-content duplicate/paste, fixed-camera focus, presets/fit/select, safe deletion/undo, collapsed presentation, slide reorder, colours, persistence and mobile/dark layout.",
  );
} catch (error) {
  console.error(
    "Frame positions:",
    (await current()).nodes.map(({ id, x, y }) => ({ id, x, y })),
  );
  await page.screenshot({ path: "/tmp/pencils-frames-failure.png" });
  throw error;
} finally {
  await browser.close();
  server.closeAllConnections();
  await new Promise((r) => server.close(r));
  await fs.rm(root, { recursive: true, force: true });
}
