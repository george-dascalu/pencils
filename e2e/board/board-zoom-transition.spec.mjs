// Board zoom transitions on a large board (160 cards, 100 connectors, a grid): zooming in builds
// card and connector detail progressively over frames in stacking order, detail crossfades in
// and out (without animation under reduced motion), zooming back reuses cards already built,
// small reversals around the 12% threshold do not tear cards down, a remote task edit made while
// zoomed out reaches the cards when they return, grid sizing stays on the grid, and objects
// remain selectable from the bitmap.
import { test, expect, useApp } from "../fixtures.mjs";
import { newGrid } from "../../public/grid-model.js";

const body = "# Heading\n\n**Bold** and *italic* notes.\n\n- [ ] Follow up\n\n| A | B |\n| --- | --- |\n| One | Two |";
const nodes = (task) => [
  ...Array.from({ length: 160 }, (_, i) => ({ id: `card-${i}`, type: "task", task, taskCollapsed: false, x: (i % 16) * 380, y: Math.floor(i / 16) * 300, w: 320, h: 260 })),
  { id: "grid", type: "grid", x: 2700, y: 1400, w: 540, h: 312, grid: newGrid() },
];

const app = useApp(async (store) => {
  const project = await store.createProject({ title: "Zoom transitions" });
  const task = await store.createTask(project.id, { title: "Original task", body });
  let board = (await store.snapshot(project.id)).boards[0];
  board = await store.updateBoard(project.id, board.id, {
    revision: board.revision,
    nodes: nodes(task.id),
    edges: Array.from({ length: 100 }, (_, i) => ({ id: `edge-${i}`, from: `card-${i}`, to: `card-${i + 1}`, routing: "elbow" })),
  });
  return { project, task, board };
});

test.use({ viewportSize: { width: 1500, height: 1000 } });

test.beforeEach(async ({ page }) => {
  // The crossfade checks need motion; the reduced-motion test turns it back off.
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.addInitScript((id) => localStorage.setItem(`pencils:camera:${id}`, JSON.stringify({ x: 310, y: 291, z: 0.1 })), app.board.id);
});

const count = (page, n) => page.waitForFunction((n) => document.querySelectorAll(".board-node").length === n, n);
async function openBoard(page) {
  await page.goto(`${app.base}/#project/${app.project.id}/board/${app.board.id}`);
  await page.waitForFunction(() => document.querySelector("#canvas")?.dataset.objectCount === "161");
  await count(page, 0);
}
async function zoomTo(page, target) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const current = await page.locator("#canvas-world").evaluate((el) => new DOMMatrix(el.style.transform).a);
    if (Math.abs(current - target) < 0.0001) return;
    await page.locator("#canvas").evaluate((canvas, delta) => {
      const b = canvas.getBoundingClientRect();
      canvas.dispatchEvent(new WheelEvent("wheel", { bubbles: true, cancelable: true, deltaY: delta, clientX: b.x + b.width / 2, clientY: b.y + b.height / 2 }));
    }, -Math.log(target / current) / 0.002);
    await page.waitForFunction(() => !document.querySelector("#canvas").classList.contains("zooming"));
  }
  throw new Error(`Zoom did not reach ${target}`);
}
// Records which detail transitions (in/out) cards go through.
const recordMotion = (page) => page.evaluate(() => {
  window.motionStates = new Set();
  new MutationObserver((records) => {
    for (const r of records) if (r.target.dataset?.detailTransition) window.motionStates.add(r.target.dataset.detailTransition);
  }).observe(document.querySelector("#canvas-world"), { subtree: true, attributes: true, attributeFilter: ["data-detail-transition"] });
});
const motionStates = (page) => page.evaluate(() => [...window.motionStates].sort());

test("zooming in builds card and connector detail over successive frames, in stacking order", async ({ page }) => {
  await openBoard(page);
  await page.evaluate(() => {
    window.detailFrames = []; window.edgeFrames = []; window.detailRecording = true;
    let changed = new Set(), changedEdges = new Set();
    window.detailObserver = new MutationObserver((records) => {
      for (const r of records) for (const el of r.addedNodes) {
        if (el.classList?.contains("board-node")) changed.add(el.dataset.node);
        if (r.target.id === "canvas-lines" && el.dataset?.edge) changedEdges.add(el.dataset.edge);
      }
    });
    window.detailObserver.observe(document.querySelector("#canvas-world"), { childList: true, subtree: true });
    function frame() {
      window.detailFrames.push(changed.size); window.edgeFrames.push(changedEdges.size);
      changed = new Set(); changedEdges = new Set();
      if (window.detailRecording) requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  });
  await zoomTo(page, 0.24);
  await count(page, 80);
  const frames = await page.evaluate(() => { window.detailRecording = false; window.detailObserver.disconnect(); return window.detailFrames; });
  expect(Math.max(...frames), "no full-board hydration burst: new cards in one frame").toBeLessThanOrEqual(4);
  expect(frames.filter((n) => n > 0).length, "cards are built over successive frames").toBeGreaterThanOrEqual(20);
  expect(await page.evaluate(() => Math.max(...window.edgeFrames)), "connector detail is also built over successive frames").toBeLessThanOrEqual(8);
  const order = await page.locator(".board-node").evaluateAll((els) => els.map((el) => el.dataset.node));
  expect(order, "incremental rendering preserves stacking order").toEqual(nodes(app.task.id).filter((n) => order.includes(n.id)).map((n) => n.id));
});

test("detail crossfades in and out, and zooming back in reuses the cards already built", async ({ page }) => {
  await openBoard(page);
  await recordMotion(page);
  await zoomTo(page, 0.24);
  await count(page, 80);
  await page.evaluate(() => { window.retainedCard = document.querySelector(".board-node.task"); window.retainedBody = window.retainedCard.querySelector(".board-node-content"); });
  await zoomTo(page, 0.1);
  await count(page, 0);
  expect(await motionStates(page), "detail crossfades in both directions").toEqual(["in", "out"]);
  expect(await page.evaluate(() => window.retainedCard.isConnected)).toBe(false);
  await zoomTo(page, 0.24);
  await count(page, 80);
  expect(await page.evaluate(() => window.retainedCard.isConnected && window.retainedBody === window.retainedCard.querySelector(".board-node-content")), "zoom reversal reuses rendered cards").toBe(true);
});

test("small zoom reversals around 12% do not tear down cards", async ({ page }) => {
  await openBoard(page);
  await zoomTo(page, 0.24);
  await count(page, 80);
  await page.evaluate(() => (window.retainedCard = document.querySelector(".board-node.task")));
  for (const z of [0.125, 0.115, 0.13]) {
    await zoomTo(page, z);
    await count(page, 80);
  }
  expect(await page.evaluate(() => window.retainedCard.isConnected)).toBe(true);
});

test("a remote edit made while zoomed out reaches the cards when they return, and bitmap objects stay selectable", async ({ page }) => {
  // Start from the original task, whatever an earlier run left.
  let task = (await app.store.snapshot(app.project.id)).tasks.find((t) => t.id === app.task.id);
  task = await app.store.updateTask(app.project.id, task.id, { revision: task.revision, title: "Original task", body });
  await openBoard(page);
  await zoomTo(page, 0.24);
  await count(page, 80);
  await zoomTo(page, 0.1);
  await count(page, 0);
  // A remote task edit must invalidate detached cards before they return.
  const projectUrl = `${app.base}/api/projects/${app.project.id}`;
  // The page refreshes with a delta of changed records, or the whole project when a delta is unavailable.
  const refreshed = page.waitForResponse(async (response) => {
    const { pathname } = new URL(response.url());
    if (response.status() !== 200 || ![new URL(projectUrl).pathname, `${new URL(projectUrl).pathname}/delta`].includes(pathname)) return false;
    const json = await response.json();
    const tasks = json.tasks || (json.records || []).filter((r) => r.kind === "tasks").map((r) => r.value);
    return tasks.some((t) => t.title === "Updated while zoomed out");
  });
  const response = await page.request.patch(`${projectUrl}/tasks/${task.id}`, { data: { revision: task.revision, title: "Updated while zoomed out", body: "## Fresh description" } });
  expect(response.ok()).toBe(true);
  await refreshed;
  // While zoomed out the cards are detached and the bitmap shows no text, so nothing on the
  // page shows when the refresh has been applied; give it a moment.
  await page.waitForTimeout(100);
  await zoomTo(page, 0.24);
  await count(page, 80);
  expect(await page.locator(".board-node.task .task-title").first().textContent()).toBe("Updated while zoomed out");
  expect(await page.locator(".board-node.task .task-card-description h2").first().textContent()).toBe("Fresh description");
  await zoomTo(page, 0.06);
  await count(page, 0);
  const point = await page.locator("#canvas").evaluate((canvas) => {
    const b = canvas.getBoundingClientRect(), m = new DOMMatrix(document.querySelector("#canvas-world").style.transform);
    return { x: b.x + m.e + 160 * m.a, y: b.y + m.f + 130 * m.a };
  });
  await page.mouse.click(point.x, point.y);
  await page.locator('[data-node="card-0"].selected').waitFor();
  expect(await page.locator('[data-node="card-0"] .task-title').textContent()).toBe("Updated while zoomed out");
});

test("grid sizing stays on the grid and its title stays screen-sized", async ({ page }) => {
  await openBoard(page);
  await zoomTo(page, 0.24);
  await count(page, 80);
  // The sizing variable belongs only to grids, not the whole board.
  expect(await page.locator("#canvas").evaluate((el) => el.style.getPropertyValue("--grid-hit-size"))).toBe("");
  expect(await page.locator("#canvas-world").evaluate((el) => el.style.getPropertyValue("--canvas-touch-target"))).toBe("");
  const font = await page.locator(".grid-title").evaluate((el) => parseFloat(getComputedStyle(el).fontSize) * new DOMMatrix(document.querySelector("#canvas-world").style.transform).a);
  expect(Math.abs(font - 14), `grid title stays screen-sized (${font}px)`).toBeLessThan(0.1);
});

test("under reduced motion detail changes without animation", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await openBoard(page);
  await recordMotion(page);
  await zoomTo(page, 0.24);
  await count(page, 80);
  await zoomTo(page, 0.1);
  await count(page, 0);
  expect(await motionStates(page), "reduced motion changes detail without animation").toEqual([]);
});
