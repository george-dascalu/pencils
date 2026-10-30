// Board performance budgets on a 5,000-object board with 2,000 connectors (1440×1050, touch
// enabled with a fine pointer): the board loads in under 6 seconds with culled DOM (under 700
// cards) and panning keeps a p95 frame under 150 ms. Cards preload during a held pan and during an
// animated zoom without rebuilding existing cards, the fit overview stays bounded, two fingers
// pinch-zoom, and a pen stroke keeps its pressure samples.
import { test, expect, useApp } from "../fixtures.mjs";
import { openBoardSearch, clickControl } from "../helpers/menu-controls.mjs";

const app = useApp(async (store) => {
  const project = await store.createProject({ title: "5,000 object board" });
  const tasks = [];
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
      type: i < 30 ? "task" : i < 40 ? "draw" : "sticky",
      ...(i < 30
        ? { task: tasks[i].id }
        : i < 40
          ? { points: Array.from({ length: 30 }, (_, j) => [j * 5, 50 + Math.sin(j) * 30]), pressures: Array.from({ length: 30 }, (_, j) => 0.2 + (j % 8) / 10) }
          : { text: `Planning idea ${i}\nKeep the next step visible.` }),
      x: (i % 100) * 320,
      y: Math.floor(i / 100) * 280,
      w: 250,
      h: 200,
      color: "#d6e4d3",
    });
  const edges = Array.from({ length: 2000 }, (_, i) => ({ id: `edge-${i}`, from: `node-${i}`, to: `node-${i + 1}`, routing: i % 2 ? "curve" : "elbow" }));
  board = await store.updateBoard(project.id, board.id, { revision: board.revision, nodes, edges });
  return { project };
});

test.use({ viewportSize: { width: 1440, height: 1050 } });

const objects = async () => (await app.store.snapshot(app.project.id)).boards[0].nodes.length;

// Opens the board as a user would, from the start page, with touch input enabled as on a
// touchscreen laptop (fine pointer) and motion allowed, so zooms animate. Returns the load time,
// the page's CDP session and a count of presence heartbeats.
async function open(page) {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
  const beats = { count: 0 };
  page.on("response", (r) => {
    if (r.url().endsWith("/presence") && r.request().method() === "POST") beats.count++;
  });
  const count = await objects();
  const start = performance.now();
  await page.goto(app.base);
  await clickControl(page.locator(".project-link"));
  await page.locator(".tabs [data-view=board]").click();
  await page.waitForFunction((count) => document.querySelector("#canvas")?.dataset.objectCount === String(count), count);
  return { load: performance.now() - start, cdp, beats };
}
// Presence heartbeats run one at a time, so after the second one the first heartbeat's snapshot
// refresh has finished and the board will not be rebuilt under the measurement.
const settled = (beats) => expect.poll(() => beats.count, { timeout: 15000 }).toBeGreaterThanOrEqual(2);

test("5,000 objects load within 6 seconds with culled DOM, and cards preload during a held pan", async ({ page }) => {
  test.setTimeout(90000);
  const { load } = await open(page);
  const count = await page.locator(".board-node").count();
  expect(count, `Expected culling, got ${count} DOM cards`).toBeLessThan(700);
  expect(load, `Initial load ${Math.round(load)} ms exceeds 6 seconds`).toBeLessThan(6000);
  // Keep the pointer held down: preloading must not wait until a pan ends.
  const startingIds = await page.locator(".board-node").evaluateAll((els) => els.map((el) => el.dataset.node));
  await page.keyboard.press("h");
  const panBox = await page.locator("#canvas").boundingBox();
  await page.mouse.move(panBox.x + panBox.width - 80, panBox.y + 300);
  await page.mouse.down();
  await page.mouse.move(panBox.x + 80, panBox.y + 300, { steps: 12 });
  await page.waitForFunction((ids) => [...document.querySelectorAll(".board-node")].some((el) => !ids.includes(el.dataset.node)), startingIds);
  await page.mouse.up();
  await page.keyboard.press("v");
  console.log(JSON.stringify({ objects: 5000, connectors: 2000, initialLoadMs: Math.round(load), detailedDOM: count }));
});

test("panning keeps a p95 frame under 150 ms and leaves the zoom and participant controls in place", async ({ page }) => {
  test.setTimeout(90000);
  const { beats } = await open(page);
  await settled(beats);
  await page.waitForFunction(() => document.querySelector("#canvas-presence button"));
  const timings = await page.evaluate(async () => {
    const canvas = document.querySelector("#canvas");
    const zoomText = document.querySelector("#zoom-label").firstChild;
    const participant = document.querySelector("#canvas-presence button");
    canvas.scrollIntoView({ block: "center" });
    const values = [];
    for (let i = 0; i < 40; i++) {
      const start = performance.now();
      canvas.dispatchEvent(new WheelEvent("wheel", { bubbles: true, cancelable: true, deltaX: 80, deltaY: 25, shiftKey: true }));
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      values.push(performance.now() - start);
    }
    if (!zoomText.isConnected || !participant.isConnected) throw new Error("Panning must preserve unchanged zoom and participant controls");
    return values.sort((a, b) => a - b);
  });
  const p95 = timings[Math.floor(timings.length * 0.95)];
  console.log(JSON.stringify({ panMedianMs: Math.round(timings[20]), panP95Ms: Math.round(p95) }));
  expect(p95, `Pan p95 ${Math.round(p95)} ms exceeds 150ms regression budget`).toBeLessThan(150);
});

test("cards preload during an animated zoom without rebuilding the cards already shown", async ({ page }) => {
  await open(page);
  const duringZoom = await page.evaluate(async () => {
    const canvas = document.querySelector("#canvas"), world = document.querySelector("#canvas-world");
    const ids = new Set([...world.querySelectorAll(".board-node")].map((el) => el.dataset.node));
    const retained = world.querySelector(".board-node.sticky .board-node-content");
    let added = false;
    const observer = new MutationObserver((records) => {
      if (canvas.classList.contains("zooming"))
        added ||= records.some((record) => [...record.addedNodes].some((el) => el.classList?.contains("board-node") && !ids.has(el.dataset.node)));
    });
    observer.observe(world, { childList: true });
    const rect = canvas.getBoundingClientRect();
    canvas.dispatchEvent(new WheelEvent("wheel", { bubbles: true, cancelable: true, deltaY: 350, clientX: rect.x + rect.width / 2, clientY: rect.y + rect.height / 2 }));
    const start = performance.now();
    while (canvas.classList.contains("zooming") && performance.now() - start < 1500) await new Promise(requestAnimationFrame);
    observer.disconnect();
    return { added, retained: !retained || retained.isConnected };
  });
  expect(duringZoom.added, "Cards preload before animated zoom finishes").toBe(true);
  expect(duringZoom.retained, "Existing card content is not rebuilt when neighbours load").toBe(true);
});

test("fit shows every object in a lightweight overview with bounded editable detail", async ({ page }) => {
  await open(page);
  await page.locator("#zoom-label").dblclick();
  // The overview swaps detailed cards for a bitmap over a few frames.
  await expect.poll(() => page.locator(".board-node").count(), { message: "Fit uses lightweight overview with bounded editable detail" }).toBeLessThanOrEqual(80);
});

test("two fingers pinch-zoom the board with real touch input", async ({ page }) => {
  const { cdp } = await open(page);
  // Real multi-touch input (not untrusted DOM events) exercises pointer capture and pinch.
  await page.evaluate(() => document.querySelector("#canvas").scrollIntoView({ block: "center" }));
  const box = await page.locator("#canvas").boundingBox();
  const x = box.x + box.width * 0.55, y = Math.max(100, box.y) + 180;
  const before = await page.locator("#zoom-label").textContent();
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: x - 40, y, id: 1 }, { x: x + 40, y, id: 2 }] });
  await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: x - 120, y: y + 20, id: 1 }, { x: x + 120, y: y + 20, id: 2 }] });
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await expect(page.locator("#zoom-label")).not.toHaveText(before);
});

test("a pen stroke on blank board space creates a drawing that keeps its pressure samples", async ({ page }) => {
  const { cdp } = await open(page);
  const count = await objects();
  // Move to blank board space and draw using actual pen pointer events with pressure.
  await openBoardSearch(page);
  await page.locator("#canvas-find").fill("Planning idea 4999");
  await page.locator("[data-pro=find-result][data-id=node-4999]").click();
  await expect(page.locator('[data-node="node-4999"]')).toBeVisible();
  await page.evaluate(() => document.querySelector("#canvas").scrollIntoView({ block: "center" }));
  const region = await page.locator("#canvas").boundingBox();
  const px = region.x + region.width * 0.8, py = Math.max(100, region.y) + 300;
  await cdp.send("Input.dispatchMouseEvent", { type: "mousePressed", x: px, y: py, button: "left", buttons: 1, pointerType: "pen", force: 0.2 });
  for (let i = 1; i < 8; i++)
    await cdp.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: px + i * 7, y: py + i * 4, button: "left", buttons: 1, pointerType: "pen", force: 0.2 + i * 0.08 });
  await cdp.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: px + 49, y: py + 28, button: "left", buttons: 0, pointerType: "pen" });
  await expect.poll(objects, { timeout: 10000 }).toBeGreaterThan(count);
  const drawing = (await app.store.snapshot(app.project.id)).boards[0].nodes.find((n) => n.id.startsWith("n-") && n.type === "draw");
  expect(drawing, "Pen stroke should create a drawing").toBeTruthy();
  expect(new Set(drawing.pressures).size, "Pressure samples should be preserved").toBeGreaterThan(1);
});
