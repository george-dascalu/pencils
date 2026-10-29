// iPad board pinch-zoom: a pinch over a large board coalesces touch updates into animation
// frames and saves the camera once, at the end, rather than on every move. Card controls keep
// the shared compact board height (--board-control-height in controls.css) while the touch
// tools and field menus keep 44px targets. Below 8% zoom the overview bitmap follows the
// fingers, aligned with the board, without repainting each frame, and a cancelled or
// interrupted gesture clears navigation. Pinching never changes board content.
import { test, expect, onDevices, useApp } from "../fixtures.mjs";
import { presetCamera } from "../helpers/board-canvas.mjs";

const app = useApp(async (store) => {
  const project = await store.createProject({ title: "Tablet canvas" });
  const task = await store.createTask(project.id, { title: "Keep the big picture close", body: "# Project notes\n\n**Bold**, *italic* and formatted content.", due: "2026-10-28" });
  const initial = (await store.snapshot(project.id)).boards[0];
  const nodes = Array.from({ length: 96 }, (_, i) => ({ id: `card-${i}`, type: "task", task: task.id, x: (i % 12) * 380, y: Math.floor(i / 12) * 230, w: 320, h: 180, taskCollapsed: true, ...(i === 0 ? { color: "#db4437" } : {}) }));
  const edges = Array.from({ length: 95 }, (_, i) => ({ id: `edge-${i}`, from: `card-${i}`, to: `card-${i + 1}`, routing: "elbow" }));
  const board = await store.updateBoard(project.id, initial.id, { revision: initial.revision, nodes, edges });
  return { project, board };
});

const savedBoard = async () => (await app.store.snapshot(app.project.id)).boards.find((b) => b.id === app.board.id);
async function openBoard(page, camera) {
  await presetCamera(page, app.board.id, camera);
  await page.addInitScript(() => localStorage.setItem("pencils:sidebar", "collapsed"));
  await page.goto(`${app.base}/#project/${app.project.id}/board/${app.board.id}`);
  await page.waitForFunction(() => document.querySelector("#canvas")?.dataset.objectCount === "96");
  // Cards and connectors are built over several frames; wait until four frames change nothing.
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          new Promise((resolve) => {
            const read = () => [document.querySelectorAll(".board-node").length, document.querySelectorAll("#canvas-lines [data-edge]").length, document.querySelector("#canvas-world").style.transform].join("|");
            const before = read();
            let frames = 0;
            const tick = () => (++frames < 4 ? requestAnimationFrame(tick) : resolve(read() === before));
            requestAnimationFrame(tick);
          }),
      ),
    )
    .toBe(true);
}
const boardControlHeight = (page) => page.evaluate(() => parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--board-control-height")));

// A two-finger pinch dispatched as pointer events, four moves per frame, with the app's camera
// storage writes, transform changes and canvas rect reads counted while it runs.
function pinch(boardId) {
  return new Promise(async (resolve) => {
    const canvas = document.querySelector("#canvas"),
      world = document.querySelector("#canvas-world"),
      r = canvas.getBoundingClientRect();
    const key = `pencils:camera:${boardId}`;
    let writes = 0, transformChanges = 0, moves = 0, rectReads = 0;
    const set = Storage.prototype.setItem;
    Storage.prototype.setItem = function (k, v) {
      if (k === key) writes++;
      return set.call(this, k, v);
    };
    const rect = canvas.getBoundingClientRect;
    canvas.getBoundingClientRect = function () {
      rectReads++;
      return rect.call(this);
    };
    const observer = new MutationObserver((records) => (transformChanges += records.length));
    observer.observe(world, { attributes: true, attributeFilter: ["style"] });
    const send = (type, id, x, y) => canvas.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: id, pointerType: "touch", isPrimary: id === 41, clientX: r.left + x, clientY: r.top + y, button: 0, buttons: type === "pointerup" ? 0 : 1 }));
    const x = 580, y = 16;
    send("pointerdown", 41, x - 130, y);
    send("pointerdown", 42, x + 130, y);
    const frames = [];
    let last = performance.now();
    for (let i = 0; i < 72; i++) {
      await new Promise(requestAnimationFrame);
      const now = performance.now();
      frames.push(now - last);
      last = now;
      for (let j = 0; j < 4; j++) {
        const d = 130 * (0.8 + 0.2 * Math.cos(((i + j / 4) / 72) * Math.PI * 4));
        send("pointermove", 41, x - d, y);
        send("pointermove", 42, x + d, y);
        moves += 2;
      }
    }
    const writesDuring = writes;
    send("pointerup", 41, x - 130, y);
    send("pointerup", 42, x + 130, y);
    await new Promise(requestAnimationFrame);
    await new Promise(requestAnimationFrame);
    observer.disconnect();
    Storage.prototype.setItem = set;
    canvas.getBoundingClientRect = rect;
    const card = document.querySelector('[data-node="card-0"]');
    resolve({
      moves, writesDuring, writes, rectReads, transformChanges, frames,
      zoom: new DOMMatrix(world.style.transform).a,
      stored: JSON.parse(localStorage.getItem(key)),
      title: card?.querySelector(".task-title").getBoundingClientRect().width,
      control: card?.querySelector(".live-card-actions button").offsetHeight,
    });
  });
}

async function fieldMenusKeepTouchTargets(page) {
  await openBoard(page, { x: 60, y: 40, z: 0.5 });
  await page.locator('[data-node="card-0"] .canvas-task-status').click();
  const options = page.locator('#shared-select-menu [role="option"]');
  await options.first().waitFor();
  const heights = await options.evaluateAll((els) => els.map((el) => el.getBoundingClientRect().height));
  expect(heights.every((h) => h >= 44), `field menus preserve full touch targets ${heights}`).toBe(true);
  await page.keyboard.press("Escape");
}

onDevices(["ipad"], () => {
  test.use({ viewportSize: { width: 1180, height: 820 }, deviceScaleFactor: 2 });

  test("a pinch coalesces updates into frames, saves the camera once at the end, and keeps card controls compact", async ({ page }, testInfo) => {
    await openBoard(page, { x: 60, y: 40, z: 0.5 });
    const before = await page.locator('[data-node="card-0"]').evaluate((el) => ({ title: el.querySelector(".task-title").getBoundingClientRect().width, control: el.querySelector(".live-card-actions button").offsetHeight }));
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Performance.enable");
    const metrics = async () => Object.fromEntries((await cdp.send("Performance.getMetrics")).metrics.map((m) => [m.name, m.value]));
    const start = await metrics();
    const result = await page.evaluate(pinch, app.board.id);
    const end = await metrics();
    const frames = result.frames.sort((a, b) => a - b);
    delete result.frames;
    // The measurements, for comparing runs (the old suite wrote them to /tmp).
    await testInfo.attach("pinch-metrics.json", {
      contentType: "application/json",
      body: JSON.stringify({ before, ...result, p95: frames[Math.floor(frames.length * 0.95)], max: Math.max(...frames), layouts: end.LayoutCount - start.LayoutCount, styles: end.RecalcStyleCount - start.RecalcStyleCount, layoutMs: (end.LayoutDuration - start.LayoutDuration) * 1000, styleMs: (end.RecalcStyleDuration - start.RecalcStyleDuration) * 1000 }, null, 2),
    });
    // Touch card controls use the shared board token in controls.css (--board-control-height:
    // 28px, 24px in Compact) since 0.18.35 made shared controls 32px; read it rather than
    // hard-coding a size.
    const boardControl = await boardControlHeight(page);
    expect(boardControl > 0 && boardControl < 44, `board control token ${boardControl}`).toBe(true);
    expect(before.control, "card content uses compact board controls at half zoom").toBe(boardControl);
    expect(result.control, "pinch keeps control geometry stable").toBe(boardControl);
    expect(result.title, "the task title keeps its space").toBeGreaterThan(40);
    expect(result.writesDuring, "no synchronous camera storage writes while pinching").toBe(0);
    expect(result.writes, "persist at gesture completion").toBeLessThanOrEqual(2);
    expect(result.transformChanges, "coalesce touch updates into frames").toBeLessThan(result.moves / 2);
    expect(Math.abs(result.stored.z - result.zoom), "final camera saved").toBeLessThan(0.00001);
    const fields = await page.locator('[data-node="card-0"]').evaluate((el) => [".canvas-task-assignee", ".canvas-task-priority", ".canvas-task-status", ".canvas-task-due"].map((s) => el.querySelector(s).offsetHeight));
    expect(fields, "all card fields align at compact height").toEqual(Array(4).fill(boardControl));
    expect(await page.locator(".board-tools button").first().evaluate((el) => el.offsetHeight), "unscaled touch tools retain full targets").toBe(44);
    expect((await savedBoard()).revision, "pinch changes no board content").toBe(app.board.revision);
  });

  test("card field menus keep full touch targets in landscape", async ({ page }) => fieldMenusKeepTouchTargets(page));

  test("below 8% the overview bitmap follows a pinch without repainting, and cancellation clears navigation", async ({ page }) => {
    await openBoard(page, { x: 100, y: 100, z: 0.05 });
    // Check an actual preview pixel at its world position through both pan and pinch.
    const overview = await page.evaluate(async () => {
      const canvas = document.querySelector("#canvas"), world = document.querySelector("#canvas-world"), bitmap = document.querySelector("#canvas-overview");
      const r = canvas.getBoundingClientRect(), samples = [];
      let paints = 0;
      const clear = CanvasRenderingContext2D.prototype.clearRect;
      CanvasRenderingContext2D.prototype.clearRect = function (...args) {
        if (this.canvas === bitmap) paints++;
        return clear.apply(this, args);
      };
      const send = (type, id, x) => canvas.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: id, pointerType: "touch", isPrimary: id === 51, clientX: r.left + x, clientY: r.top + 16, button: 0, buttons: type === "pointerup" ? 0 : 1 }));
      send("pointerdown", 51, 460);
      send("pointerdown", 52, 720);
      for (let i = 1; i <= 20; i++) {
        send("pointermove", 51, 460 + i * 3);
        send("pointermove", 52, 720 + i * 5);
        await new Promise(requestAnimationFrame);
        const m = new DOMMatrix(world.style.transform), b = new DOMMatrix(bitmap.style.transform);
        const pixel = new DOMPoint(160 * m.a + m.e, 90 * m.a + m.f).matrixTransform(b.inverse());
        samples.push({ z: m.a, rgba: [...bitmap.getContext("2d").getImageData(Math.round(pixel.x), Math.round(pixel.y), 1, 1).data] });
      }
      send("pointerup", 51, 520);
      send("pointercancel", 52, 820);
      await new Promise(requestAnimationFrame);
      await new Promise(requestAnimationFrame);
      // A second pinch interrupted by a lost window.
      send("pointerdown", 51, 460);
      send("pointerdown", 52, 720);
      send("pointermove", 51, 470);
      send("pointermove", 52, 750);
      await new Promise(requestAnimationFrame);
      send("pointerup", 51, 470);
      window.dispatchEvent(new Event("blur"));
      await new Promise(requestAnimationFrame);
      await new Promise(requestAnimationFrame);
      CanvasRenderingContext2D.prototype.clearRect = clear;
      return { samples, paints, gestureActive: canvas.classList.contains("touch-navigating"), settled: new DOMMatrix(bitmap.style.transform).isIdentity };
    });
    expect(overview.samples.every((s) => s.z < 0.08), "pinch preserves overview zoom instead of jumping to 8%").toBe(true);
    expect(overview.samples.every((s) => s.rgba[0] === 219 && s.rgba[1] === 68 && s.rgba[2] === 55 && s.rgba[3] === 255), `the bitmap stays aligned with world coordinates throughout the gesture ${JSON.stringify(overview.samples.map((s) => s.rgba))}`).toBe(true);
    expect(overview.paints, "reuse the bitmap instead of repainting every touch frame").toBeLessThan(10);
    expect(overview.gestureActive, "cancellation and an interrupted second finger clear navigation state").toBe(false);
    expect(overview.settled, "finishing returns the bitmap to the settled viewport").toBe(true);
    expect((await savedBoard()).revision, "pinch changes no board content").toBe(app.board.revision);
  });
});

onDevices(["ipad-portrait"], () => test("card field menus keep full touch targets in portrait", async ({ page }) => fieldMenusKeepTouchTargets(page)));
