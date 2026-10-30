// Repeatable board capacity assessment (production assets, 1440×1050): boards from 650 rich task
// cards up to 100,000 objects with 200,000 connectors load, pan, fit and save a small move as a
// guarded delta. Each case reports its measurements (load, pan, fit, save, DOM, heap, long tasks)
// to artifacts/board-capacity-100k.json (or CAPACITY_OUTPUT); CAPACITY_CASES=name,name picks
// cases. Synthetic boards in a temporary vault, never the user's.
// The cases measure rather than assert time budgets: each must load, pan, fit and save without a
// page error.
import fs from "node:fs/promises";
import os from "node:os";
import { test, expect } from "../fixtures.mjs";
import { useCustomApp } from "../helpers/custom-server.mjs";
import { boardDifference } from "../../public/board-delta.js";

const app = useCustomApp({
  seed: async (store) => {
    const project = await store.createProject({ title: "Board capacity assessment" });
    const tasks = [];
    for (let i = 0; i < 30; i++)
      tasks.push(
        await store.createTask(project.id, {
          title: `Task ${i}`,
          body: "## Project notes\nA task with **formatted** content.\n\n- [ ] Review\n- [x] Prepare\n\n> A quotation\n",
        }),
      );
    return { project, tasks };
  },
  server: () => ({ productionAssets: true }),
});

const cases = [
  { name: "sparse-100000", count: 100000, edges: 40000, columns: 400, gap: 320 },
  { name: "maximum-100000", count: 100000, edges: 200000, columns: 400, gap: 320 },
  { name: "dense-100000", count: 100000, edges: 200000, columns: 400, gap: 30 },
  { name: "sparse-1000", count: 1000, edges: 400, columns: 50, gap: 320 },
  { name: "sparse-5000", count: 5000, edges: 2000, columns: 100, gap: 320 },
  { name: "maximum-10000", count: 10000, edges: 20000, columns: 100, gap: 320 },
  { name: "dense-2500", count: 2500, edges: 5000, columns: 50, gap: 30 },
  { name: "task-cards-650", count: 650, edges: 200, columns: 26, gap: 320, rich: true },
];
const selectedCases = process.env.CAPACITY_CASES?.split(",");

test.use({ viewportSize: { width: 1440, height: 1050 } });

const results = [];
let browserVersion;
test.afterAll(async () => {
  if (!results.length) return;
  await fs.mkdir("artifacts", { recursive: true });
  await fs.writeFile(
    process.env.CAPACITY_OUTPUT || "artifacts/board-capacity-100k.json",
    JSON.stringify({ date: "2026-10-21", cpu: os.cpus()[0].model, cores: os.cpus().length, browser: browserVersion, viewport: "1440x1050", production: true, results }, null, 2),
  );
});

for (const scenario of cases.filter((s) => !selectedCases || selectedCases.includes(s.name))) {
  test(`${scenario.name}: ${scenario.count} objects with ${scenario.edges} connectors load, pan, fit and save a move as a delta`, { tag: scenario.count >= 100000 ? "@heavy" : [] }, async ({ page, browser }, testInfo) => {
    test.setTimeout(scenario.count >= 100000 ? 300000 : 120000);
    browserVersion = browser.version();
    const { store, project, tasks } = app;
    let board = (await store.snapshot(project.id)).boards[0];
    const nodes = Array.from({ length: scenario.count }, (_, i) => ({
      id: `node-${i}`,
      type: scenario.rich ? "task" : "sticky",
      ...(scenario.rich ? { task: tasks[i % tasks.length].id } : { text: `Idea ${i}\nNext step` }),
      x: (i % scenario.columns) * scenario.gap,
      y: Math.floor(i / scenario.columns) * scenario.gap,
      w: 250,
      h: 200,
      color: "#d6e4d3",
    }));
    const edges = Array.from({ length: scenario.edges }, (_, i) => ({
      id: `edge-${i}`,
      from: `node-${i % nodes.length}`,
      to: `node-${(i + 1 + Math.floor(i / nodes.length)) % nodes.length}`,
      routing: i % 2 ? "elbow" : "curve",
    }));
    // Seed fixtures without carrying a previous 100k-object operation into the next case.
    const file = store.file(project.id, "boards", board.id);
    board = await store.write(file, { ...board, nodes, edges, operations: [] }, "", await store.read(file));
    await page.addInitScript(() => {
      window.longTasks = [];
      new PerformanceObserver((list) => window.longTasks.push(...list.getEntries().map((e) => e.duration))).observe({ type: "longtask", buffered: true });
    });
    const start = performance.now();
    await page.goto(`${app.base}/#project/${project.id}/board/${board.id}`);
    await page.waitForFunction((count) => document.querySelector("#canvas")?.dataset.objectCount === String(count), scenario.count, { timeout: 120000 });
    const loadMs = performance.now() - start;
    const dom = await page.locator(".board-node").count();
    const initialLongTasks = await page.evaluate(() => {
      const tasks = window.longTasks;
      window.longTasks = [];
      return tasks;
    });
    const pan = await page.evaluate(async () => {
      const canvas = document.querySelector("#canvas"), samples = [];
      for (let i = 0; i < 30; i++) {
        const start = performance.now();
        canvas.dispatchEvent(new WheelEvent("wheel", { bubbles: true, cancelable: true, deltaX: 80, deltaY: 25, shiftKey: true }));
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        samples.push(performance.now() - start);
      }
      return samples.sort((a, b) => a - b);
    });
    const zoom = await page.locator("#zoom-label").textContent();
    const fit = performance.now();
    await page.locator("#zoom-label").dblclick();
    // The overview is in place once the zoom changes and two frames have painted.
    await expect(page.locator("#zoom-label")).not.toHaveText(zoom, { timeout: 30000 });
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const overview = await page.evaluate(() => ({
      detailed: document.querySelectorAll(".board-node").length,
      elements: document.querySelectorAll("*").length,
      connectors: document.querySelector("#canvas-lines")?.childElementCount,
      heapMiB: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null,
      longTasks: window.longTasks,
    }));
    const fitMs = Math.round(performance.now() - fit);
    // A small move uses the same guarded delta contract as SaveQueue.
    const baseRecord = { ...board };
    delete baseRecord.native;
    delete baseRecord.operations;
    const moved = { ...baseRecord, nodes: baseRecord.nodes.map((n, i) => (i === 0 ? { ...n, x: n.x + 10 } : n)) };
    const body = JSON.stringify({ changes: boardDifference(baseRecord, moved), revision: board.revision, client: "capacity", operationId: `op-${scenario.name}` });
    const saveStart = performance.now();
    const response = await fetch(`${app.base}/api/projects/${project.id}/boards/${board.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body });
    const saved = await response.json();
    expect(response.ok, JSON.stringify(saved).slice(0, 300)).toBe(true);
    const result = {
      ...scenario,
      loadMs: Math.round(loadMs),
      detailedDOM: dom,
      panMedianMs: Math.round(pan[15]),
      panP95Ms: Math.round(pan[28]),
      fitMs,
      saveMs: Math.round(performance.now() - saveStart),
      savePayloadBytes: Buffer.byteLength(body),
      savePayloadKiB: +(Buffer.byteLength(body) / 1024).toFixed(2),
      snapshotKiB: Math.round(Buffer.byteLength(JSON.stringify(saved)) / 1024),
      initialLongestTaskMs: Math.round(Math.max(0, ...initialLongTasks)),
      ...overview,
    };
    results.push(result);
    console.log(JSON.stringify(result));
    await testInfo.attach(`${scenario.name}.json`, { body: JSON.stringify(result, null, 2), contentType: "application/json" });
  });
}
