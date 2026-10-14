import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { chromium, firefox } from "playwright";
import { Store } from "../server/store.js";
import { createServer } from "../server/index.js";
import { clickControl } from "./menu-controls.mjs";
const root = await fs.mkdtemp(path.join(os.tmpdir(), "pencils-pen-")),
  store = new Store(root);
await store.init();
const project = await store.createProject({ title: "Pen lab" }),
  initial = (await store.snapshot(project.id)).boards[0];
const card = {
  id: "card",
  type: "sticky",
  x: 300,
  y: 250,
  w: 300,
  h: 200,
  text: "Draw over this note",
};
await store.updateBoard(project.id, initial.id, {
  revision: initial.revision,
  nodes: [card],
  edges: [],
  settings: { snap: false },
});
const server = createServer(store);
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const browser = await (
    process.env.BROWSER === "firefox" ? firefox : chromium
  ).launch({ headless: true }),
  page = await browser.newPage({ viewport: { width: 1600, height: 1100 } });
page.setDefaultTimeout(10000);
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
await page.addInitScript(
  (id) =>
    localStorage.setItem(
      `pencils:camera:${id}`,
      JSON.stringify({ x: 30, y: 20, z: 1 }),
    ),
  initial.id,
);
const current = async () => (await store.snapshot(project.id)).boards[0];
const strokes = async () =>
  (await current()).nodes.filter((n) => n.type === "draw");
async function until(fn) {
  for (let i = 0; i < 120; i++) {
    if (await fn()) return;
    await page.waitForTimeout(60);
  }
  throw Error("Save did not settle");
}
async function world(x, y) {
  return page.locator("#canvas").evaluate(
    (el, { x, y }) => {
      const r = el.getBoundingClientRect(),
        m = new DOMMatrix(
          document.querySelector("#canvas-world").style.transform,
        );
      return { x: r.x + m.e + x * m.a, y: r.y + m.f + y * m.a };
    },
    { x, y },
  );
}
async function draw(points, { shift = false, cancel = false } = {}) {
  const pts = await Promise.all(points.map(([x, y]) => world(x, y)));
  if (shift) await page.keyboard.down("Shift");
  await page.mouse.move(pts[0].x, pts[0].y);
  await page.mouse.down();
  for (const p of pts.slice(1)) await page.mouse.move(p.x, p.y, { steps: 8 });
  if (cancel) await page.keyboard.press("Escape");
  await page.mouse.up();
  if (shift) await page.keyboard.up("Shift");
}
try {
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  await page.locator(".project-link").click();
  await page.locator("[data-view=board]").click();
  await page.locator('.board-tools [aria-label="Pen"]').click();
  assert.ok(await page.locator("#pen-tools").isVisible());
  await page.locator("[data-pen-width]").selectOption("8");
  await page.locator('#pen-tools summary[aria-label="Pen colour"]').click();
  await page.locator('[data-color-choice="#f1a9a0"]').click();
  await draw([
    [320, 300],
    [360, 330],
    [430, 290],
    [540, 360],
  ]);
  await until(async () => (await strokes()).length === 1);
  let ink = (await strokes())[0];
  assert.equal(ink.strokeWidth, 8);
  assert.equal(ink.color, "#f1a9a0");
  assert.ok(ink.points.length > 3);
  assert.deepEqual(
    (await current()).nodes.find((n) => n.id === "card"),
    card,
  );
  assert.match(await page.locator(".board-node.draw svg").innerHTML(), / Q/);
  assert.equal(
    await page
      .locator(".board-node.draw")
      .evaluate((el) => getComputedStyle(el).backgroundColor),
    "rgba(0, 0, 0, 0)",
  );
  assert.equal(
    await page.locator(".board-node.draw .object-caption").count(),
    0,
  );
  await draw([[650, 300]]);
  await until(async () => (await strokes()).length === 2);
  assert.equal((await strokes())[1].points.length, 1);
  await page.locator('[data-pen-mode="highlighter"]').click();
  await page.locator("[data-pen-width]").selectOption("18");
  await draw(
    [
      [320, 400],
      [420, 400],
      [540, 400],
    ],
    { shift: true },
  );
  await until(async () => (await strokes()).length === 3);
  const highlight = (await strokes())[2];
  assert.equal(highlight.opacity, 0.32);
  assert.equal(highlight.points.length, 2);
  await draw(
    [
      [700, 450],
      [750, 470],
    ],
    { cancel: true },
  );
  assert.equal((await strokes()).length, 3);
  assert.equal(await page.locator(".drawing-preview").count(), 0);
  await page.keyboard.press("e");
  assert.ok(
    (await page
      .locator('[data-pen-mode="erase"]')
      .getAttribute("aria-pressed")) === "true",
  );
  await draw(
    [
      [400, 250],
      [400, 450],
    ],
    { cancel: true },
  );
  assert.equal((await strokes()).length, 3);
  await draw([
    [400, 250],
    [400, 450],
  ]);
  await until(async () => (await strokes()).length === 1);
  assert.ok((await current()).nodes.some((n) => n.id === "card"));
  await page.keyboard.press("Control+z");
  await until(async () => (await strokes()).length === 3);
  await page.keyboard.press("v");
  assert.equal(await page.locator("#pen-tools").count(), 0);
  await page.locator(`[data-node="${ink.id}"]`).click();
  await page.locator("[data-stroke-width]").selectOption("12");
  await until(
    async () =>
      (await strokes()).find((n) => n.id === ink.id).strokeWidth === 12,
  );
  await page.reload();
  await page.locator(".board-node.draw").first().waitFor();
  await page.keyboard.press("p");
  assert.equal(await page.locator("[data-pen-width]").inputValue(), "18");
  assert.equal(
    await page
      .locator('[data-pen-mode="highlighter"]')
      .getAttribute("aria-pressed"),
    "true",
  );
  await page.locator('[data-pen-preset="1"]').click();
  assert.equal(await page.locator("[data-pen-width]").inputValue(), "5");
  await page.locator('[data-pen-preset="0"]').click();
  assert.equal(await page.locator("[data-pen-width]").inputValue(), "18");
  // Active stylus pressure is saved and an in-progress touch stroke is cancelled by a pinch.
  if (process.env.BROWSER !== "firefox") {
    await page.locator('[data-pen-mode="pen"]').click();
    await page.keyboard.press("v");
    const cdp = await page.context().newCDPSession(page),
      pt = await world(800, 500),
      before = (await strokes()).length;
    await cdp.send("Input.dispatchMouseEvent", {
      type: "mousePressed",
      x: pt.x,
      y: pt.y,
      button: "left",
      buttons: 1,
      pointerType: "pen",
      force: 0.1,
    });
    for (let i = 1; i <= 8; i++)
      await cdp.send("Input.dispatchMouseEvent", {
        type: "mouseMoved",
        x: pt.x + i * 8,
        y: pt.y + i * 4,
        button: "left",
        buttons: 1,
        pointerType: "pen",
        force: 0.1 + i * 0.1,
      });
    await cdp.send("Input.dispatchMouseEvent", {
      type: "mouseReleased",
      x: pt.x + 64,
      y: pt.y + 32,
      button: "left",
      buttons: 0,
      pointerType: "pen",
    });
    await until(async () => (await strokes()).length === before + 1);
    const pressure = (await strokes()).find(
      (n) => n.pressure && new Set(n.pressures).size > 1,
    );
    assert.ok(pressure);
    const touch = await world(700, 600),
      count = (await strokes()).length;
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ x: touch.x, y: touch.y, id: 1 }],
    });
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ x: touch.x + 20, y: touch.y, id: 1 }],
    });
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [
        { x: touch.x + 20, y: touch.y, id: 1 },
        { x: touch.x + 80, y: touch.y, id: 2 },
      ],
    });
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [
        { x: touch.x, y: touch.y, id: 1 },
        { x: touch.x + 110, y: touch.y, id: 2 },
      ],
    });
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
    assert.equal((await strokes()).length, count);
    assert.equal(await page.locator(".drawing-preview").count(), 0);
  }
  await page.keyboard.press("v");
  await page.locator(`[data-node="${ink.id}"]`).click();
  await page.locator('[data-feature="lock"]').click();
  await until(
    async () => (await strokes()).find((n) => n.id === ink.id).locked,
  );
  await page.keyboard.press("e");
  await draw([
    [400, 250],
    [400, 370],
  ]);
  assert.ok((await strokes()).some((n) => n.id === ink.id));
  await page.keyboard.press("v");
  const download = page.waitForEvent("download");
  await clickControl(page.locator('[data-feature="canvas-svg"]'));
  const exported = await fs.readFile(await (await download).path(), "utf8");
  assert.match(exported, /opacity="0.32"/);
  assert.match(exported, /stroke-linecap="round"/);
  await page.keyboard.press("p");
  await page.screenshot({ path: "/tmp/pencils-pen-desktop.png" });
  await page.locator('[data-personal="sidebar"]').click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => (document.documentElement.dataset.theme = "dark"));
  const bar = await page.locator("#pen-tools").boundingBox();
  assert.ok(bar.x >= 0 && bar.x + bar.width <= 390);
  await page.screenshot({ path: "/tmp/pencils-pen-mobile.png" });
  assert.deepEqual(errors, []);
  console.log(
    "PASS: pen placement, smooth ink over cards, colours/width, dots, straight highlighter, eraser/cancel/undo, stroke editing, presets/reload, mobile/dark.",
  );
} catch (e) {
  console.error("Browser errors:", errors);
  console.error(
    "Saved strokes:",
    (await strokes()).map((n) => ({
      id: n.id,
      points: n.points.length,
      width: n.strokeWidth,
      brush: n.brush,
    })),
  );
  await page.screenshot({ path: "/tmp/pencils-pen-failure.png" });
  throw e;
} finally {
  await browser.close();
  server.closeAllConnections();
  await new Promise((r) => server.close(r));
  await fs.rm(root, { recursive: true, force: true });
}
