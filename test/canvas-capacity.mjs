// Repeatable capacity assessment; isolated synthetic boards, never the user's vault.
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { chromium } from "playwright";
import { boardDifference } from "../public/board-delta.js";
import { Store } from "../server/store.js";
import { createServer } from "../server/index.js";

const root = await fs.mkdtemp(path.join(os.tmpdir(), "pencils-capacity-"));
const store = new Store(root);
await store.init();
const project = await store.createProject({ title: "Board capacity assessment" });
const tasks = [];
for (let i = 0; i < 30; i++) tasks.push(await store.createTask(project.id, {
  title: `Task ${i}`, body: "## Project notes\nA task with **formatted** content.\n\n- [ ] Review\n- [x] Prepare\n\n> A quotation\n",
}));
let board = (await store.snapshot(project.id)).boards[0];
const server = createServer(store, { productionAssets: true });
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
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
const results = [];
const selectedCases = process.env.CAPACITY_CASES?.split(",");
try {
  for (const scenario of cases.filter(s => !selectedCases || selectedCases.includes(s.name))) {
    const nodes = Array.from({ length: scenario.count }, (_, i) => ({
      id: `node-${i}`, type: scenario.rich ? "task" : "sticky",
      ...(scenario.rich ? { task: tasks[i % tasks.length].id } : { text: `Idea ${i}\nNext step` }),
      x: (i % scenario.columns) * scenario.gap, y: Math.floor(i / scenario.columns) * scenario.gap,
      w: 250, h: 200, color: "#d6e4d3",
    }));
    const edges = Array.from({ length: scenario.edges }, (_, i) => ({
      id: `edge-${i}`, from: `node-${i % nodes.length}`,
      to: `node-${(i + 1 + Math.floor(i / nodes.length)) % nodes.length}`, routing: i % 2 ? "elbow" : "curve",
    }));
    // Seed fixtures without carrying a previous 100k-object operation into the next case.
    board = await store.write(store.file(project.id, "boards", board.id), { ...board, nodes, edges, operations: [] }, "", await store.read(store.file(project.id, "boards", board.id)));
    const page = await browser.newPage({ viewport: { width: 1440, height: 1050 } });
    const errors = [];
    page.on("pageerror", e => errors.push(e.message));
    await page.addInitScript(() => {
      window.longTasks = [];
      new PerformanceObserver(list => window.longTasks.push(...list.getEntries().map(e => e.duration)))
        .observe({ type: "longtask", buffered: true });
    });
    const start = performance.now();
    try {
      await page.goto(`${base}/#project/${project.id}/board/${board.id}`);
      await page.waitForFunction(count => document.querySelector("#canvas")?.dataset.objectCount === String(count), scenario.count, { timeout: 120000 });
      const loadMs = performance.now() - start;
      const dom = await page.locator(".board-node").count();
      const initialLongTasks = await page.evaluate(() => { const tasks = window.longTasks; window.longTasks = []; return tasks; });
      const pan = await page.evaluate(async () => {
        const canvas = document.querySelector("#canvas"), samples = [];
        for (let i = 0; i < 30; i++) {
          const start = performance.now();
          canvas.dispatchEvent(new WheelEvent("wheel", { bubbles: true, cancelable: true, deltaX: 80, deltaY: 25, shiftKey: true }));
          await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
          samples.push(performance.now() - start);
        }
        return samples.sort((a, b) => a - b);
      });
      const fit = performance.now();
      await page.locator("[data-action=board-fit]").click();
      await page.waitForTimeout(250);
      const overview = await page.evaluate(() => ({
        detailed: document.querySelectorAll(".board-node").length,
        elements: document.querySelectorAll("*").length,
        connectors: document.querySelector("#canvas-lines")?.childElementCount,
        heapMiB: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null,
        longTasks: window.longTasks,
      }));
      const fitMs = Math.round(performance.now() - fit);
      // A small move uses the same guarded delta contract as SaveQueue.
      const baseRecord = { ...board }; delete baseRecord.native; delete baseRecord.operations;
      const moved = { ...baseRecord, nodes: baseRecord.nodes.map((n, i) => i === 0 ? { ...n, x: n.x + 10 } : n) };
      const body = JSON.stringify({ changes: boardDifference(baseRecord, moved), revision: board.revision, client: "capacity", operationId: `op-${scenario.name}` });
      const saveStart = performance.now();
      const response = await fetch(`${base}/api/projects/${project.id}/boards/${board.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body,
      });
      const saved = await response.json();
      if (!response.ok) throw new Error(JSON.stringify(saved));
      board = saved;
      const result = {
        ...scenario, loadMs: Math.round(loadMs), detailedDOM: dom,
        panMedianMs: Math.round(pan[15]), panP95Ms: Math.round(pan[28]),
        fitMs, saveMs: Math.round(performance.now() - saveStart),
        savePayloadBytes: Buffer.byteLength(body),
        savePayloadKiB: +(Buffer.byteLength(body) / 1024).toFixed(2),
        snapshotKiB: Math.round(Buffer.byteLength(JSON.stringify(saved)) / 1024),
        initialLongestTaskMs: Math.round(Math.max(0, ...initialLongTasks)),
        ...overview, errors,
      };
      results.push(result); console.log(JSON.stringify(result));
    } catch (error) {
      results.push({ ...scenario, error: error.message }); console.log(JSON.stringify(results.at(-1)));
    } finally { await page.close(); }
  }
  await fs.mkdir("artifacts", { recursive: true });
  await fs.writeFile(process.env.CAPACITY_OUTPUT || "artifacts/board-capacity-100k.json", JSON.stringify({
    date: "2026-10-21", cpu: os.cpus()[0].model, cores: os.cpus().length,
    browser: browser.version(), viewport: "1440x1050", production: true, results,
  }, null, 2));
} finally {
  await browser.close(); server.closeAllConnections();
  await new Promise(resolve => server.close(resolve));
  await fs.rm(root, { recursive: true, force: true });
}
