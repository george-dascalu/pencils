// Large mixed paste on a 3,456-object board (1500×1000 at 3% zoom): copying all 5,040 selected
// items (frames, task cards, notes, grids and connectors with bends) pastes and saves them without
// moving the camera, remaps frames, connectors and bends, and leaves the originals untouched; the
// overview stays bounded with thousands of objects selected; the pasted group drags as one with
// undo and redo; after reload, zooming through the detail boundary mounts only the group's shared
// outline and handles; and the selection toolbar fits a phone width.
// PRODUCTION_ASSETS=1 serves the built assets.
// The steps share the pasted board, so the file runs in order.
import { test, expect } from "../fixtures.mjs";
import { useCustomApp } from "../helpers/custom-server.mjs";
import { newGrid } from "../../public/grid-model.js";

const app = useCustomApp({
  seed: async (store) => {
    const project = await store.createProject({ title: "Large mixed paste" });
    const task = await store.createTask(project.id, {
      title: "Rich task card",
      body: "# Plan\n\n**Bold** and *italic*.\n\n| Stage | State |\n| --- | --- |\n| Design | Ready |\n\n- [ ] Follow up",
    });
    const nodes = [], edges = [];
    for (let i = 0; i < 144; i++) {
      const x = (i % 12) * 6200, y = Math.floor(i / 12) * 2500;
      for (let f = 0; f < 2; f++) nodes.push({ id: `frame-${i}-${f}`, type: "frame", text: `Frame ${i}-${f}`, x: x + f * 2400, y, w: 2000, h: 1800 });
      for (let j = 0; j < 20; j++)
        nodes.push({
          id: `task-${i}-${j}`,
          type: "task",
          task: task.id,
          taskCollapsed: false,
          frame: `frame-${i}-${Math.floor(j / 10)}`,
          x: x + Math.floor(j / 10) * 2400 + 80 + (j % 2) * 800,
          y: y + 100 + Math.floor((j % 10) / 2) * 300,
          w: 600,
          h: 200,
        });
      nodes.push({ id: `note-${i}`, type: "sticky", text: "A note", x: x + 4500, y: y + 1600, w: 400, h: 200 });
      nodes.push({ id: `grid-${i}`, type: "grid", grid: newGrid(), x: x + 4500, y: y + 100, w: 1200, h: 1000 });
      for (let j = 0; j < 11; j++)
        edges.push({
          id: `edge-${i}-${j}`,
          from: `task-${i}-${j}`,
          to: `task-${i}-${j + 1}`,
          routing: j % 2 ? "curve" : "elbow",
          label: "Related",
          ...(j === 10 ? { bends: [{ x: x + 2200, y: y + 1900 }] } : {}),
        });
    }
    let board = (await store.snapshot(project.id)).boards[0];
    board = await store.updateBoard(project.id, board.id, { revision: board.revision, nodes, edges, settings: { snap: false, alignObjects: false } });
    return { project, board };
  },
  server: () => ({ productionAssets: process.env.PRODUCTION_ASSETS === "1" }),
});

test.describe.configure({ mode: "serial" });
test.use({ viewportSize: { width: 1500, height: 1000 } });

const current = async () => (await app.store.snapshot(app.project.id)).boards[0];

// Opens the board at 3% zoom and waits for its objects. Pasting lands at the canvas centre; the
// camera keeps that point in empty space now that the sidebar no longer narrows the canvas, so the
// pasted notes don't drop into an original grid. Presence heartbeats run one at a time, so
// after the second one the first heartbeat's snapshot refresh has finished and the board will not
// be rebuilt under the selection.
async function open(page, count) {
  await page.addInitScript((id) => localStorage.setItem(`pencils:camera:${id}`, JSON.stringify({ x: 278, y: 100, z: 0.03 })), app.board.id);
  let beats = 0;
  page.on("response", (r) => {
    if (r.url().endsWith("/presence") && r.request().method() === "POST") beats++;
  });
  await page.goto(`${app.base}/#project/${app.project.id}/board/${app.board.id}`);
  await page.waitForFunction((count) => document.querySelector("#canvas")?.dataset.objectCount === String(count), count, { timeout: 60000 });
  await expect.poll(() => beats, { timeout: 15000 }).toBeGreaterThanOrEqual(2);
}
async function savedCount(page, count) {
  await expect
    .poll(async () => (await current()).nodes.length === count && (await page.locator("#board-save").textContent()) === "Saved automatically", {
      message: `Expected ${count} saved objects`,
      timeout: 60000,
    })
    .toBe(true);
  return current();
}
async function overviewOnly(page) {
  await expect(page.locator(".board-node"), "Bulk selection must not promote arbitrary cards/grids at 3% zoom").toHaveCount(0);
  await expect(page.locator("path.canvas-edge"), "Selected connectors must not bypass the detail budget").toHaveCount(0);
  expect(await page.locator("#canvas *").count(), "DOM stays bounded with thousands of selected objects").toBeLessThan(500);
}
async function selectAll(page) {
  await page.locator("#canvas").focus();
  await page.keyboard.press("Control+a");
}

test("5,040 copied objects paste in place with frames, connectors and bends remapped, and the pasted group drags, undoes and redoes as one", { tag: "@heavy" }, async ({ page }) => {
  test.setTimeout(240000);
  const board = app.board;
  await open(page, 3456);
  const camera = await page.locator("#canvas-world").getAttribute("style");
  await selectAll(page);
  await page.keyboard.press("Control+c");
  await expect(page.locator(".selection-filter-total")).toHaveText("5040");
  const start = performance.now();
  await page.keyboard.press("Control+v");
  let pasted = await savedCount(page, 6912);
  console.log(`Pasted and saved 5,040 mixed objects in ${Math.round(performance.now() - start)} ms`);
  expect(pasted.edges.length).toBe(3168);
  expect(new Set(pasted.nodes.map((n) => n.id)).size).toBe(6912);
  expect(new Set(pasted.edges.map((e) => e.id)).size).toBe(3168);
  await expect(page.locator(".selection-filter-total")).toHaveText("5040");
  expect(await page.locator("#canvas-world").getAttribute("style"), "the camera stays put").toBe(camera);
  await overviewOnly(page);
  // Preserve the original layout and remap all copied containers/connectors.
  const original = new Map(board.nodes.map((n) => [n.id, n]));
  const copied = pasted.nodes.filter((n) => !original.has(n.id));
  const remapped = new Map(board.nodes.map((n, i) => [n.id, copied[i].id]));
  const dx = copied[0].x - board.nodes[0].x, dy = copied[0].y - board.nodes[0].y;
  for (let i = 0; i < board.nodes.length; i++) {
    const before = board.nodes[i], copy = copied[i], source = pasted.nodes.find((n) => n.id === before.id);
    expect(source, "Pasting must not alter originals").toEqual(before);
    expect([copy.x, copy.y, copy.w, copy.h]).toEqual([before.x + dx, before.y + dy, before.w, before.h]);
    if (before.frame) expect(copy.frame).toBe(remapped.get(before.frame));
  }
  const originalEdges = new Set(board.edges.map((e) => e.id));
  const newEdges = pasted.edges.filter((e) => !originalEdges.has(e.id));
  for (let i = 0; i < board.edges.length; i++) {
    const before = board.edges[i], copy = newEdges[i];
    expect(copy.from).toBe(remapped.get(before.from));
    expect(copy.to).toBe(remapped.get(before.to));
    if (before.bends)
      for (let j = 0; j < before.bends.length; j++) {
        // Node positions are rounded on save; connector bends retain subpixels.
        expect(Math.abs(copy.bends[j].x - before.bends[j].x - dx)).toBeLessThan(1);
        expect(Math.abs(copy.bends[j].y - before.bends[j].y - dy)).toBeLessThan(1);
      }
  }
  // Drag a selected bitmap, including every frame and connector in its group.
  const hit = copied.find((n) => n.type === "task");
  const point = await page.locator("#canvas").evaluate((el, n) => {
    const r = el.getBoundingClientRect(), m = new DOMMatrix(document.querySelector("#canvas-world").style.transform);
    return { x: r.x + m.e + (n.x + n.w / 2) * m.a, y: r.y + m.f + (n.y + n.h / 2) * m.a };
  }, hit);
  await page.mouse.move(point.x, point.y);
  await page.mouse.down();
  await page.mouse.move(point.x + 30, point.y + 18, { steps: 5 });
  await page.mouse.up();
  const hitX = async () => (await current()).nodes.find((n) => n.id === hit.id).x;
  await expect.poll(async () => Math.abs((await hitX()) - hit.x - 1000) < 0.1, { timeout: 30000 }).toBe(true);
  pasted = await current();
  const byId = new Map(pasted.nodes.map((n) => [n.id, n]));
  for (const n of copied) {
    expect(Math.abs(byId.get(n.id).x - n.x - 1000)).toBeLessThan(0.1);
    expect(Math.abs(byId.get(n.id).y - n.y - 600)).toBeLessThan(0.1);
  }
  await overviewOnly(page);
  await page.keyboard.press("Control+z");
  await expect.poll(async () => Math.abs((await hitX()) - hit.x) < 0.1, { message: "Undo group movement", timeout: 30000 }).toBe(true);
  await page.waitForFunction(() => !document.querySelector('[data-action="board-undo"]')?.disabled);
  await page.keyboard.press("Control+z");
  await savedCount(page, 3456);
  await page.waitForFunction(() => !document.querySelector('[data-action="board-redo"]')?.disabled);
  await page.keyboard.press("Control+Shift+z");
  await savedCount(page, 6912);
});

test("after reload, zooming a selected group through the detail boundary mounts one shared outline and handles", { tag: "@heavy" }, async ({ page }) => {
  test.setTimeout(180000);
  await open(page, 6912);
  await overviewOnly(page);
  await selectAll(page);
  // Moving through the detail boundary must not create handles for each
  // selected card or separate overlays for hundreds of selected connectors.
  const overlayCounts = await page.evaluate(async () => {
    const canvas = document.querySelector("#canvas"), world = document.querySelector("#canvas-world");
    const outline = world.querySelector(".multi-resize-box"), box = canvas.getBoundingClientRect();
    const peak = { ports: 0, handles: 0, halos: 0, detailed: 0 };
    const sample = () => {
      for (const [key, selector] of Object.entries({ ports: ".connection-port", handles: ".resize-handle", halos: ".connector-selection", detailed: ".board-node" }))
        peak[key] = Math.max(peak[key], world.querySelectorAll(selector).length);
    };
    const observer = new MutationObserver(sample);
    observer.observe(world, { childList: true, subtree: true });
    // Wait until the zoom has ended and the board has stopped changing for half a second
    // (detail loads in after the camera settles), up to 10 seconds.
    const settle = async () => {
      let last = performance.now();
      const watch = new MutationObserver(() => (last = performance.now()));
      watch.observe(world, { childList: true, subtree: true, attributes: true });
      const start = performance.now();
      while (performance.now() - start < 10000 && (canvas.classList.contains("zooming") || performance.now() - last < 500))
        await new Promise((resolve) => requestAnimationFrame(resolve));
      watch.disconnect();
    };
    for (const target of [0.24, 0.1, 0.24, 0.03]) {
      const zoom = new DOMMatrix(world.style.transform).a;
      const delta = -Math.log(target / zoom) / 0.002, steps = Math.ceil(Math.abs(delta) / 250);
      for (let i = 0; i < steps; i++) {
        canvas.dispatchEvent(new WheelEvent("wheel", { bubbles: true, cancelable: true, deltaY: delta / steps, clientX: box.x + 180, clientY: box.y + 120 }));
        // A wheel stream, one notch every 70 ms as from a mouse wheel: the input's own pace.
        await new Promise((resolve) => setTimeout(resolve, 70));
      }
      await settle();
      sample();
    }
    observer.disconnect();
    return { ...peak, sameOutline: outline === world.querySelector(".multi-resize-box") };
  });
  console.log("Selected-group overlay counts:", JSON.stringify(overlayCounts));
  expect(overlayCounts.detailed, "Exercise selected cards in detailed mode").toBeGreaterThan(0);
  expect(overlayCounts.ports, "Group selections do not get individual connection handles").toBe(0);
  expect(overlayCounts.handles, "Only the group resize handles are mounted").toBe(4);
  expect(overlayCounts.halos, "Selected detailed connectors share one highlight").toBe(1);
  expect(overlayCounts.sameOutline, "Keep the shared outline mounted through zoom").toBe(true);
  await overviewOnly(page);
});

test("with thousands of objects selected, the selection toolbar fits a phone width", { tag: "@heavy" }, async ({ page }) => {
  test.setTimeout(120000);
  await open(page, 6912);
  await selectAll(page);
  await expect(page.locator(".selection-filter-total")).toHaveText("10080");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForFunction(() => document.querySelector(".sidebar").getBoundingClientRect().right <= 1);
  const toolbar = await page.locator("#selection-tools").boundingBox();
  expect(toolbar.x).toBeGreaterThanOrEqual(0);
  expect(toolbar.x + toolbar.width).toBeLessThanOrEqual(391);
});
