import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { chromium } from "playwright";
import { Store } from "../server/store.js";
import { createServer } from "../server/index.js";
const root = await fs.mkdtemp(path.join(os.tmpdir(), "pencils-board-scale-")),
  store = new Store(root);
await store.init();
const project = await store.createProject({ title: "5,000 object board" }),
  tasks = [];
for (let i = 0; i < 30; i++)
  tasks.push(
    await store.createTask(project.id, {
      title: `Planning task ${i}`,
      assignee: i % 2 ? "Alice" : "Bob",
      body: "## Notes\nA live Markdown task card.\n\n- [ ] Review the plan\n",
    }),
  );
let board = (await store.snapshot(project.id)).boards[0];
const nodes = [];
for (let i = 0; i < 5000; i++)
  nodes.push({
    id: `node-${i}`,
    type: i < 30 ? "task" : i >= 30 && i < 40 ? "draw" : "sticky",
    ...(i < 30
      ? { task: tasks[i].id }
      : i < 40
        ? {
            points: Array.from({ length: 30 }, (_, j) => [
              j * 5,
              50 + Math.sin(j) * 30,
            ]),
            pressures: Array.from({ length: 30 }, (_, j) => 0.2 + (j % 8) / 10),
          }
        : { text: `Planning idea ${i}\nKeep the next step visible.` }),
    x: (i % 100) * 320,
    y: Math.floor(i / 100) * 280,
    w: 250,
    h: 200,
    color: "#d6e4d3",
  });
const edges = Array.from({ length: 2000 }, (_, i) => ({
  id: `edge-${i}`,
  from: `node-${i}`,
  to: `node-${i + 1}`,
  routing: i % 2 ? "curve" : "elbow",
}));
board = await store.updateBoard(project.id, board.id, {
  revision: board.revision,
  nodes,
  edges,
});
const server = createServer(store);
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${server.address().port}`,
  browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] }),
  page = await browser.newPage({
    viewport: { width: 1440, height: 1050 },
    hasTouch: true,
  }),
  errors = [];
page.on("pageerror", (e) => errors.push(e.message));
try {
  const start = performance.now();
  await page.goto(base);
  await page.locator(".project-link").click();
  await page.locator("[data-view=board]").click();
  await page.locator("#canvas-performance").waitFor();
  await page.waitForFunction(() =>
    document
      .querySelector("#canvas-performance")
      ?.textContent.includes("5,000"),
  );
  const load = performance.now() - start,
    count = await page.locator(".board-node").count();
  assert.ok(count < 700, `Expected culling, got ${count} DOM cards`);
  assert.ok(load < 6000, `Initial load ${load} ms exceeds 6 seconds`);
  const timings = await page.evaluate(async () => {
    const canvas = document.querySelector("#canvas");
    canvas.scrollIntoView({ block: "center" });
    const values = [];
    for (let i = 0; i < 40; i++) {
      const start = performance.now();
      canvas.dispatchEvent(
        new WheelEvent("wheel", {
          bubbles: true,
          cancelable: true,
          deltaX: 80,
          deltaY: 25,
          shiftKey: true,
        }),
      );
      await new Promise((r) =>
        requestAnimationFrame(() => requestAnimationFrame(r)),
      );
      values.push(performance.now() - start);
    }
    return values.sort((a, b) => a - b);
  });
  const p95 = timings[Math.floor(timings.length * 0.95)];
  assert.ok(p95 < 150, `Pan p95 ${p95} ms exceeds 150ms regression budget`);
  console.log(
    JSON.stringify({
      objects: 5000,
      connectors: 2000,
      initialLoadMs: Math.round(load),
      detailedDOM: count,
      panMedianMs: Math.round(timings[20]),
      panP95Ms: Math.round(p95),
    }),
  );
  await page.locator("[data-action=board-fit]").click();
  await page.waitForTimeout(150);
  assert.ok((await page.locator(".board-node").count()) < 700);
  console.log(
    "PASS: overview renders all objects as a bitmap with bounded detailed DOM",
  );
  // Real multi-touch input (not untrusted DOM events) exercises pointer capture and pinch.
  await page.evaluate(() =>
    document.querySelector("#canvas").scrollIntoView({ block: "center" }),
  );
  const box = await page.locator("#canvas").boundingBox(),
    session = await page.context().newCDPSession(page),
    x = box.x + box.width * 0.55,
    y = Math.max(100, box.y) + 180;
  const before = await page.locator("#zoom-label").textContent();
  await session.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [
      { x: x - 40, y, id: 1 },
      { x: x + 40, y, id: 2 },
    ],
  });
  await session.send("Input.dispatchTouchEvent", {
    type: "touchMove",
    touchPoints: [
      { x: x - 120, y: y + 20, id: 1 },
      { x: x + 120, y: y + 20, id: 2 },
    ],
  });
  await session.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  await page.waitForTimeout(100);
  assert.notEqual(await page.locator("#zoom-label").textContent(), before);
  console.log("PASS: two-finger pan and pinch zoom");
  // Move to blank board space and draw using actual pen pointer events with pressure.
  await page.locator("#canvas-find").fill("Planning idea 4999");
  await page.locator("[data-pro=find-result][data-id=node-4999]").click();
  await page.evaluate(() =>
    document.querySelector("#canvas").scrollIntoView({ block: "center" }),
  );
  const region = await page.locator("#canvas").boundingBox(),
    px = region.x + region.width * 0.8,
    py = Math.max(100, region.y) + 300;
  await session.send("Input.dispatchMouseEvent", {
    type: "mousePressed",
    x: px,
    y: py,
    button: "left",
    buttons: 1,
    pointerType: "pen",
    force: 0.2,
  });
  for (let i = 1; i < 8; i++)
    await session.send("Input.dispatchMouseEvent", {
      type: "mouseMoved",
      x: px + i * 7,
      y: py + i * 4,
      button: "left",
      buttons: 1,
      pointerType: "pen",
      force: 0.2 + i * 0.08,
    });
  await session.send("Input.dispatchMouseEvent", {
    type: "mouseReleased",
    x: px + 49,
    y: py + 28,
    button: "left",
    buttons: 0,
    pointerType: "pen",
  });
  for (let i = 0; i < 100; i++) {
    if ((await store.snapshot(project.id)).boards[0].nodes.length > 5000) break;
    await page.waitForTimeout(100);
  }
  const drawing = (await store.snapshot(project.id)).boards[0].nodes.find(
    (n) => n.id.startsWith("n-") && n.type === "draw",
  );
  assert.ok(drawing, "Pen stroke should create a drawing");
  assert.ok(
    new Set(drawing.pressures).size > 1,
    "Pressure samples should be preserved",
  );
  assert.deepEqual(errors, []);
  console.log("PASS: pressure-sensitive pen drawing with no browser errors");
  await page.screenshot({
    path: "/tmp/pencils-canvas-scale.png",
    fullPage: true,
  });
} finally {
  await browser.close();
  server.closeAllConnections();
  await new Promise((r) => server.close(r));
  await fs.rm(root, { recursive: true, force: true });
}
