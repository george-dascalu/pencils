// Synthetic frame stress tests. Seed an isolated vault past the old validation cap so
// rendering, navigation and server rejection can be measured separately: each case loads,
// pans, fits, opens the outline and saves a small move, and records how long each step took.
// Results are attached to the test report (and written to FRAME_OUTPUT when it is set).
// FRAME_CASES picks the cases (kind-count: flat, nested, dense or deep); PRODUCTION_ASSETS=1
// serves the built assets.
import fs from "node:fs/promises";
import os from "node:os";
import { test } from "../fixtures.mjs";
import { useCustomApp } from "../helpers/custom-server.mjs";
import { boardSettled } from "../helpers/board-canvas.mjs";
import { boardDifference } from "../../public/board-delta.js";

const cases = (process.env.FRAME_CASES || "flat-1000,flat-5000,nested-5000,dense-1000").split(",");

const app = useCustomApp({
  seed: async (store) => {
    const project = await store.createProject({ title: "Frame capacity" });
    return { project, board: (await store.snapshot(project.id)).boards[0] };
  },
  server: () => ({ productionAssets: process.env.PRODUCTION_ASSETS === "1" }),
});

test.use({ viewportSize: { width: 1500, height: 1000 } });

const results = [];
test.afterAll(async ({ browser }) => {
  if (process.env.FRAME_OUTPUT) await fs.writeFile(process.env.FRAME_OUTPUT, JSON.stringify({ cpu: os.cpus()[0].model, browser: browser.version(), results }, null, 2));
});

function frames(name) {
  const [kind, raw] = name.split("-"), count = Number(raw), nodes = [];
  for (let i = 0; i < count; i++) {
    const depth = kind === "nested" ? i % 5 : kind === "deep" ? i : 0;
    const group = kind === "nested" ? Math.floor(i / 5) : i;
    const gap = kind === "dense" ? 20 : 1000;
    const x = kind === "deep" ? depth * 2 : (group % 100) * gap + depth * 30;
    const y = kind === "deep" ? depth * 2 : Math.floor(group / 100) * gap + depth * 30;
    const size = kind === "deep" ? (count - depth) * 4 + 300 : 800 - depth * 100;
    nodes.push({ id: `f-${i}`, type: "frame", text: `Frame ${i}`, x, y, w: size, h: size, ...(depth ? { frame: `f-${i - 1}` } : {}) });
    nodes.push({ id: `n-${i}`, type: "sticky", text: `Child ${i}`, x: x + 40, y: y + 80, w: 200, h: 120, frame: `f-${i}` });
  }
  return { count, nodes };
}

for (const name of cases) {
  test(`a board with ${name} frames loads, pans, fits, lists its outline and saves a move`, async ({ page }, testInfo) => {
    test.setTimeout(120000);
    page.setDefaultTimeout(20000);
    const { store, project } = app;
    const { count, nodes } = frames(name);
    // Write the vault file directly, past the validation an API save would apply.
    const file = store.file(project.id, "boards", app.board.id);
    const board = await store.write(file, { ...app.board, nodes, edges: [], operations: [] }, "", await store.read(file));
    app.board = board;
    const result = { name, frames: count, objects: nodes.length };

    const start = performance.now();
    await page.goto(`${app.base}/#project/${project.id}/board/${board.id}`);
    await page.waitForFunction((n) => document.querySelector("#canvas")?.dataset.objectCount === String(n), nodes.length);
    result.loadMs = Math.round(performance.now() - start);
    await boardSettled(page);

    const pan = await page.evaluate(async () => {
      const samples = [], canvas = document.querySelector("#canvas");
      for (let i = 0; i < 20; i++) {
        const t = performance.now();
        canvas.dispatchEvent(new WheelEvent("wheel", { bubbles: true, cancelable: true, deltaX: 80, deltaY: 25, shiftKey: true }));
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
        samples.push(performance.now() - t);
      }
      return samples.sort((a, b) => a - b);
    });
    result.panP95Ms = Math.round(pan[18]);

    const fit = performance.now();
    await page.locator("[data-action=board-fit]").click();
    await boardSettled(page);
    result.fitMs = Math.round(performance.now() - fit);

    const outline = performance.now();
    await page.evaluate(() => document.querySelector("[data-pro=outline]").click());
    await page.locator("[data-frame-row]").first().waitFor();
    result.outlineMs = Math.round(performance.now() - outline);
    result.outlineRows = await page.locator("[data-frame-row]").count();
    result.elements = await page.locator("*").count();
    await page.locator("#canvas-outline [data-pro=outline]").click();

    // Save a small move through the API, as a client's delta would.
    const moved = { ...board, nodes: board.nodes.map((n, i) => (i < 2 ? { ...n, x: n.x + 10 } : n)) };
    const body = JSON.stringify({ changes: boardDifference(board, moved), revision: board.revision, client: "frame-capacity", operationId: `move-${name}` });
    const save = performance.now();
    const response = await fetch(`${app.base}/api/projects/${project.id}/boards/${board.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body });
    const saved = await response.json();
    result.saveMs = Math.round(performance.now() - save);
    result.saveStatus = response.status;
    if (response.ok) app.board = saved;
    else result.saveError = saved;

    results.push(result);
    await testInfo.attach(`${name}.json`, { body: JSON.stringify(result, null, 2), contentType: "application/json" });
  });
}
