import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { chromium } from "playwright";
import { Store } from "../server/store.js";
import { createServer } from "../server/index.js";

const root = await fs.mkdtemp(path.join(os.tmpdir(), "pencils-gestures-"));
const store = new Store(root);
await store.init();
const project = await store.createProject({ title: "Board gestures" });
const initial = (await store.snapshot(project.id)).boards[0];
const card = {
  id: "note",
  type: "sticky",
  x: 220,
  y: 160,
  w: 250,
  h: 180,
  text: "Move with fingers",
};
await store.updateBoard(project.id, initial.id, {
  revision: initial.revision,
  nodes: [card],
  edges: [],
  settings: { snap: false, alignObjects: false },
});
const server = createServer(store);
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 1180, height: 1000 },
  hasTouch: true,
});
page.setDefaultTimeout(8000);
const session = await page.context().newCDPSession(page),
  errors = [];
page.on("pageerror", (error) => errors.push(error.message));
const current = async () =>
  (await store.snapshot(project.id)).boards.find((b) => b.id === initial.id);
const strokes = async () =>
  (await current()).nodes.filter((n) => n.type === "draw");
async function until(fn, message) {
  for (let i = 0; i < 100; i++) {
    if (await fn()) return;
    await page.waitForTimeout(60);
  }
  throw Error(message || "Save did not settle");
}
const camera = () =>
  page.locator("#canvas-world").evaluate((el) => {
    const m = new DOMMatrix(el.style.transform);
    return { x: m.e, y: m.f, z: m.a };
  });
const world = (x, y) =>
  page.locator("#canvas").evaluate(
    (el, { x, y }) => {
      const r = el.getBoundingClientRect(),
        m = new DOMMatrix(
          document.querySelector("#canvas-world").style.transform,
        );
      return { x: r.x + m.e + x * m.a, y: r.y + m.f + y * m.a };
    },
    { x, y },
  );
async function touch(type, points) {
  await session.send("Input.dispatchTouchEvent", {
    type,
    touchPoints: points.map((p, i) => ({
      id: p.id ?? i + 1,
      radiusX: 2,
      radiusY: 2,
      force: 1,
      ...p,
    })),
  });
  await page.waitForTimeout(25);
}
async function tap(p) {
  await touch("touchStart", [p]);
  await touch("touchEnd", []);
}
async function doubleTap(p) {
  await page.waitForTimeout(400);
  await tap(p);
  await tap(p);
}
async function twoTap(p) {
  await page.waitForTimeout(400);
  await touch("touchStart", [p, { x: p.x + 70, y: p.y }]);
  await touch("touchEnd", []);
}
async function drag(from, to) {
  await touch("touchStart", [from]);
  await touch("touchMove", [to]);
  await touch("touchEnd", []);
}
const pen = (type, p, force = 0.5) =>
  session.send("Input.dispatchMouseEvent", {
    type,
    ...p,
    button: "left",
    buttons: type === "mouseReleased" ? 0 : 1,
    pointerType: "pen",
    force,
  });
async function stroke(x, y, palm = false) {
  const from = await world(x, y),
    to = await world(x + 80, y + 40);
  const before = await camera();
  await pen("mousePressed", from, 0.2);
  if (palm) {
    const hand = await world(700, 390);
    await touch("touchStart", [hand]);
    await touch("touchMove", [{ x: hand.x - 60, y: hand.y - 30 }]);
  }
  for (let i = 1; i <= 6; i++)
    await pen(
      "mouseMoved",
      {
        x: from.x + ((to.x - from.x) * i) / 6,
        y: from.y + ((to.y - from.y) * i) / 6,
      },
      0.2 + i * 0.1,
    );
  await pen("mouseReleased", to, 0);
  if (palm) {
    await touch("touchEnd", []);
    assert.deepEqual(
      await camera(),
      before,
      "Palm must not pan while the pen draws",
    );
  }
}
try {
  await page.addInitScript(
    (id) =>
      localStorage.setItem(
        `pencils:camera:${id}`,
        JSON.stringify({ x: 80, y: 80, z: 1 }),
      ),
    initial.id,
  );
  await page.goto(
    `http://127.0.0.1:${server.address().port}/#project/${project.id}/board/${initial.id}`,
  );
  await page.locator("#canvas.drawing-canvas").waitFor();
  // Touch still places non-ink objects when their tool is explicitly selected.
  await page.locator('.board-tools [data-tool="sticky"]').click();
  await tap(await world(500, 450));
  await until(
    async () =>
      (await current()).nodes.filter((n) => n.type === "sticky").length === 2,
    "Finger should place a note with the note tool",
  );
  await page.keyboard.press("Escape");
  await page.keyboard.press("Delete");
  await until(async () => (await current()).nodes.filter((n) => n.type === "sticky").length === 1);
  await page.locator('.board-tools [data-feature="draw-tool"]').click();
  await page.locator("#pen-tools").waitFor();
  assert.ok(
    await page.locator('.board-tools [data-action="board-task"]').isVisible(),
  );
  assert.ok(
    await page
      .locator('.board-tools [data-feature="project-frame-add"]')
      .isVisible(),
  );
  let p = await world(730, 350),
    before = await camera();
  await drag(p, { x: p.x - 50, y: p.y + 30 });
  assert.equal(
    (await strokes()).length,
    0,
    "Finger on empty space must not draw",
  );
  assert.equal((await camera()).x, before.x - 50);
  assert.equal((await camera()).y, before.y + 30);

  await stroke(530, 180);
  await until(
    async () => (await strokes()).length === 1,
    "Pencil stroke should save",
  );
  assert.ok(new Set((await strokes())[0].pressures).size > 1);
  const node = page.locator('[data-node="note"]');
  await tap(await world(300, 240));
  assert.match(await node.getAttribute("class"), /selected/);
  assert.ok(
    await node.locator('.resize-handle[data-resize-corner="se"]').isVisible(),
  );
  p = await world(300, 240);
  await drag(p, { x: p.x + 45, y: p.y + 30 });
  await until(
    async () =>
      (await current()).nodes.find((n) => n.id === "note").x === card.x + 45,
    "Finger should move selected note in pen mode",
  );
  const handle = await node
    .locator('.resize-handle[data-resize-corner="se"]')
    .boundingBox();
  p = { x: handle.x + handle.width / 2, y: handle.y + handle.height / 2 };
  await drag(p, { x: p.x + 30, y: p.y + 20 });
  await until(
    async () =>
      (await current()).nodes.find((n) => n.id === "note").w === card.w + 30,
    "Finger should resize note in pen mode",
  );
  assert.equal((await strokes()).length, 1);

  // A second finger cancels the object edit before navigation takes over.
  const saved = (await current()).nodes.find((n) => n.id === "note");
  p = await world(saved.x + 90, saved.y + 90);
  const moved = { x: p.x + 60, y: p.y + 25 },
    second = { x: p.x + 140, y: p.y + 80 };
  await touch("touchStart", [p]);
  await touch("touchMove", [moved]);
  await touch("touchStart", [moved, second]);
  before = await camera();
  await touch("touchMove", [
    { x: moved.x - 20, y: moved.y },
    { x: second.x + 30, y: second.y },
  ]);
  await until(async () => (await camera()).z > before.z, "Pinch must zoom");
  // Keep contact through a presence refresh; it must not replace this canvas.
  await page.waitForTimeout(1000);
  await touch("touchEnd", [{ id: 1, x: moved.x - 20, y: moved.y }]);
  before = await camera();
  await touch("touchMove", [{ id: 2, x: second.x + 60, y: second.y + 20 }]);
  await until(
    async () => Math.abs((await camera()).x - before.x - 30) < 0.1,
    "Remaining finger should continue panning",
  );
  await touch("touchEnd", []);
  await page.waitForTimeout(500);
  assert.deepEqual(
    (await current()).nodes.find((n) => n.id === "note"),
    saved,
    "Pinch must cancel the partial object move",
  );
  assert.equal((await strokes()).length, 1, "Pinch must not trigger undo");

  // Fit keeps subsequent test coordinates on screen after navigation.
  await page.locator('[data-action="board-fit"]').click();
  p = await world(650, 350);
  await doubleTap(p);
  await page.waitForFunction(
    () =>
      document
        .querySelector('[data-pen-mode="erase"]')
        ?.getAttribute("aria-pressed") === "true",
  );
  p = await world(saved.x + 100, saved.y + 80);
  await drag(p, { x: p.x + 20, y: p.y });
  await until(
    async () =>
      (await current()).nodes.find((n) => n.id === "note").x > saved.x,
  );
  assert.equal(
    (await strokes()).length,
    1,
    "Finger with eraser active must select/move, not erase",
  );
  await doubleTap(await world(650, 350));
  await page.waitForFunction(
    () =>
      document
        .querySelector('[data-pen-mode="pen"]')
        ?.getAttribute("aria-pressed") === "true",
  );
  await stroke(540, 260, true);
  await until(
    async () => (await strokes()).length === 2,
    "Pen and palm together should produce one stroke",
  );
  await twoTap(await world(650, 350));
  await until(
    async () => (await strokes()).length === 1,
    "Two-finger tap should undo",
  );

  await page.locator(".pen-preferences summary").click();
  await page
    .locator('[data-drawing-gesture="twoFingerTap"]')
    .selectOption("redo");
  await page.locator('[data-drawing-gesture="doubleTap"]').selectOption("none");
  await page.waitForTimeout(100);
  await page.screenshot({ path: "/tmp/pencils-drawing-gestures-ipad.png" });
  const popover = await page
    .locator(".pen-preferences .selection-popover")
    .boundingBox();
  assert.ok(
    popover.x >= 0 && popover.x + popover.width <= 1181,
    "Preferences should fit iPad width",
  );
  assert.ok(
    popover.y >= 0 && popover.y + popover.height <= 1001,
    "Preferences should fit iPad height",
  );
  assert.ok(
    await page.locator(".pen-preferences .selection-popover").evaluate((el) => {
      const r = el.getBoundingClientRect();
      return el.contains(
        document.elementFromPoint(r.x + r.width / 2, r.y + 20),
      );
    }),
    `Preferences must be visible and interactive: ${JSON.stringify(popover)}`,
  );
  await page.locator(".pen-preferences summary").click();
  await twoTap(await world(650, 350));
  await until(
    async () => (await strokes()).length === 2,
    "Configured two-finger gesture should redo",
  );
  await doubleTap(await world(650, 350));
  assert.equal(
    await page.locator('[data-pen-mode="pen"]').getAttribute("aria-pressed"),
    "true",
    "Disabled double tap must not toggle tools",
  );
  await page.reload();
  await page.locator("#canvas").waitFor();
  await page.locator('.board-tools [data-feature="draw-tool"]').click();
  await page.locator(".pen-preferences summary").click();
  assert.equal(
    await page.locator('[data-drawing-gesture="twoFingerTap"]').inputValue(),
    "redo",
  );
  assert.equal(
    await page.locator('[data-drawing-gesture="doubleTap"]').inputValue(),
    "none",
  );
  await page.locator(".pen-preferences summary").click();

  // Cancellation cannot commit ink or a gesture, and must not leave touch blocked.
  p = await world(650, 350);
  before = await camera();
  await touch("touchStart", [p]);
  await touch("touchCancel", []);
  await drag(p, { x: p.x + 25, y: p.y + 15 });
  assert.equal((await camera()).x, before.x + 25);
  assert.equal((await strokes()).length, 2);

  // A reported pen side button toggles once per press, including hover moves.
  p = await world(650, 350);
  await session.send("Input.dispatchMouseEvent", {
    type: "mousePressed",
    ...p,
    pointerType: "pen",
    button: "right",
    buttons: 2,
  });
  await session.send("Input.dispatchMouseEvent", {
    type: "mouseMoved",
    x: p.x + 2,
    y: p.y,
    pointerType: "pen",
    button: "right",
    buttons: 2,
  });
  await session.send("Input.dispatchMouseEvent", {
    type: "mouseReleased",
    ...p,
    pointerType: "pen",
    button: "right",
    buttons: 0,
  });
  assert.equal(
    await page.locator('[data-pen-mode="erase"]').getAttribute("aria-pressed"),
    "true",
  );
  assert.equal(
    (await strokes()).length,
    2,
    "Pen side button must not create ink",
  );
  await page.locator('[data-pen-mode="pen"]').click();

  // Preferences use the same values in both entry points, including dark/mobile UI.
  await page
    .getByRole("button", { name: "Personal settings", exact: true })
    .click();
  assert.equal(
    await page
      .locator('.personal-dialog [data-drawing-gesture="twoFingerTap"]')
      .inputValue(),
    "redo",
  );
  await page
    .locator('.personal-dialog [data-drawing-gesture="twoFingerTap"]')
    .selectOption("none");
  await page.locator('[name="personal-theme"][value="dark"]').check();
  await page.getByRole("button", { name: "Done", exact: true }).click();
  for (const [width, height] of [
    [834, 1194],
    [390, 844],
  ]) {
    await page.setViewportSize({ width, height });
    await page.waitForTimeout(250);
    await page.locator(".pen-preferences summary").click();
    await page.locator(".pen-preferences[open] .selection-popover").waitFor();
    await page.waitForTimeout(100);
    assert.equal(
      await page.locator('[data-drawing-gesture="twoFingerTap"]').inputValue(),
      "none",
    );
    const box = await page
      .locator(".pen-preferences .selection-popover")
      .boundingBox();
    assert.ok(
      box.x >= 0 &&
        box.y >= 0 &&
        box.x + box.width <= width + 1 &&
        box.y + box.height <= height + 1,
      `Preferences fit ${width}px viewport`,
    );
    await page.screenshot({
      path: `/tmp/pencils-drawing-gestures-dark-${width}.png`,
    });
    // The scrollable preferences remain finger-scrollable inside the canvas.
    const start = { x: box.x + box.width - 15, y: box.y + box.height - 30 };
    await drag(start, { x: start.x, y: box.y + 30 });
    assert.ok(
      await page
        .locator(".pen-preferences .selection-popover")
        .evaluate(
          (el) => el.scrollHeight <= el.clientHeight || el.scrollTop > 0,
        ),
      "Finger can scroll gesture preferences",
    );
    await page.keyboard.press("Escape");
    assert.equal(
      await page.locator(".pen-preferences").getAttribute("open"),
      null,
    );
    assert.equal(
      await page.locator('[data-pen-mode="pen"]').getAttribute("aria-pressed"),
      "true",
      "Closing preferences must keep the pen active",
    );
  }
  assert.deepEqual(errors, []);
  console.log(
    "PASS: pen/touch events, finger pan/select/move/resize, pinch cancellation, palm rejection, gesture undo/redo, pen side button, shared settings, iPad/mobile bounds and dark theme.",
  );
} finally {
  await browser.close();
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
  await fs.rm(root, { recursive: true, force: true });
}
