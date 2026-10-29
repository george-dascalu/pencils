// A 100,000-object board end to end (production assets, 1440×1050): a native Canvas import beyond
// the old 16 MB request ceiling, card edits saved as small deltas, server undo at full capacity,
// an offline draft that survives reload while the complete native file is kept, and a fit
// overview that stays bounded while its bitmap cards remain selectable. Screenshots go to
// artifacts/board-100k-detail.png and artifacts/board-100k-overview.png.
// The steps share the imported board, so the file runs in order.
import fs from "node:fs/promises";
import { test, expect } from "../fixtures.mjs";
import { useCustomApp } from "../helpers/custom-server.mjs";
import { encodeCanvas, decodeCanvas } from "../../public/canvas-format.js";

const app = useCustomApp({
  seed: async (store) => ({ project: await store.createProject({ title: "100k integration" }) }),
  server: () => ({ productionAssets: true }),
});

test.describe.configure({ mode: "serial" });
test.use({ viewportSize: { width: 1440, height: 1050 } });

let board;
const boardFile = () => app.store.file(app.project.id, "boards", board.id);
const current = async () => app.store.public(await app.store.read(boardFile()), boardFile());
const saveLabel = (page) => page.locator("#board-save");

// Opens the board, recording every PATCH delivery; `blocked()` decides whether to drop them.
async function open(page, { blocked = () => false } = {}) {
  page.setDefaultTimeout(60000);
  const deliveries = [];
  await page.route("**/api/projects/*/boards/*", async (route) => {
    if (route.request().method() === "PATCH") {
      deliveries.push(JSON.parse(route.request().postData()));
      if (blocked()) return route.abort();
    }
    await route.continue();
  });
  await page.goto(`${app.base}/#project/${app.project.id}/board/${board.id}`);
  await page.waitForFunction(() => document.querySelector("#canvas")?.dataset.objectCount === "100000", null, { timeout: 120000 });
  return deliveries;
}
async function edit(page, text) {
  await page.locator('[data-node="n-0"]').dblclick();
  await page.locator("[data-rich-mode=source]").click();
  await page.locator("#canvas-inline-form textarea").fill(text);
  await page.locator("#canvas-inline-form textarea").press("Control+Enter");
}
const saved = (page) => expect(saveLabel(page)).toHaveText("Saved automatically", { timeout: 60000 });

test("a 100,000-object native import beyond the old request-size ceiling is accepted", { tag: "@heavy" }, async () => {
  test.setTimeout(180000);
  const nodes = Array.from({ length: 100000 }, (_, i) => ({ id: `n-${i}`, type: "sticky", text: `Idea ${i}`, x: 80 + (i % 400) * 320, y: 150 + Math.floor(i / 400) * 320, w: 240, h: 200 }));
  const edges = Array.from({ length: 200000 }, (_, i) => ({ id: `e-${i}`, from: `n-${i % 100000}`, to: `n-${(i + 1 + Math.floor(i / 100000)) % 100000}`, routing: "curve" }));
  const body = JSON.stringify({ title: "100k native import", canvas: encodeCanvas({ title: "100k native import", nodes, edges }) });
  expect(Buffer.byteLength(body), "Import must exercise the old request-size ceiling").toBeGreaterThan(16_000_000);
  const response = await fetch(`${app.base}/api/projects/${app.project.id}/boards`, { method: "POST", headers: { "Content-Type": "application/json" }, body });
  expect(response.status, await response.clone().text().then((s) => s.slice(0, 200))).toBe(201);
  board = await response.json();
  console.log(`native import ${Math.round(body.length / 1048576)} MiB`);
});

test("a card edit on the 100,000-object board saves as a small delta, and server undo reverts it", { tag: "@heavy" }, async ({ page }) => {
  test.setTimeout(240000);
  const deliveries = await open(page);
  expect(await page.locator(".board-node").count()).toBeLessThanOrEqual(240);
  const start = performance.now();
  await edit(page, "Edited on a 100,000-object board");
  await saved(page);
  await expect.poll(async () => (await current()).nodes[0].text, { timeout: 60000 }).toBe("Edited on a 100,000-object board");
  expect(deliveries.every((d) => d.changes && !d.nodes && !d.base), "only deltas are sent").toBe(true);
  expect(Buffer.byteLength(JSON.stringify(deliveries[0]))).toBeLessThan(1000);
  console.log(`100k UI edit saved in ${Math.round(performance.now() - start)} ms; delta ${JSON.stringify(deliveries[0]).length} bytes`);
  await page.locator("[data-action=board-undo]").click();
  await saved(page);
  await page.waitForFunction(() => document.querySelector('[data-node="n-0"]')?.textContent.includes("Idea 0"));
  await expect.poll(async () => (await current()).nodes[0].text, { timeout: 60000 }).toBe("Idea 0");
});

test("an edit made while saves fail is kept as a compact draft that saves after reload, keeping the complete native file", { tag: "@heavy" }, async ({ page }) => {
  test.setTimeout(240000);
  let block = true;
  await open(page, { blocked: () => block });
  await edit(page, "Recovered after reload");
  await page.waitForFunction(() =>
    Object.keys(localStorage).some((k) => k.startsWith("pencils:pending:") && !k.endsWith(":lease") && localStorage.getItem(k).includes("Recovered after reload")),
  );
  const bytes = await page.evaluate(() =>
    Object.keys(localStorage)
      .filter((k) => k.startsWith("pencils:pending:") && !k.endsWith(":lease"))
      .reduce((sum, k) => sum + localStorage.getItem(k).length, 0),
  );
  expect(bytes, `Single-card draft should stay compact, got ${bytes}`).toBeLessThan(5000);
  await page.reload();
  block = false;
  await saved(page);
  await expect.poll(async () => (await current()).nodes[0].text, { timeout: 60000 }).toBe("Recovered after reload");
  const native = JSON.parse(await fs.readFile(boardFile(), "utf8"));
  expect(decodeCanvas(native).nodes.length).toBe(100000);
  expect(decodeCanvas(native).edges.length).toBe(200000);
  console.log(`offline draft survives reload (${bytes} bytes)`);
});

test("the fit overview stays bounded and its bitmap cards stay selectable", { tag: "@heavy" }, async ({ page }) => {
  test.setTimeout(240000);
  await open(page);
  await fs.mkdir("artifacts", { recursive: true });
  await page.screenshot({ path: "artifacts/board-100k-detail.png" });
  await page.locator("[data-action=board-fit]").click();
  await expect.poll(() => page.locator(".board-node").count()).toBeLessThanOrEqual(24);
  await expect.poll(() => page.locator("#canvas-lines > g[data-edge]").count()).toBeLessThanOrEqual(240);
  const view = await page.evaluate(() => ({
    zoom: document.querySelector("#zoom-label").textContent,
    cards: document.querySelectorAll(".board-node").length,
    edges: document.querySelectorAll("#canvas-lines > g[data-edge]").length,
  }));
  await page.screenshot({ path: "artifacts/board-100k-overview.png" });
  // An overview card remains selectable: use its transformed location.
  const target = await page.evaluate(() => {
    const world = document.querySelector("#canvas-world"), c = document.querySelector("#canvas").getBoundingClientRect();
    const m = new DOMMatrix(getComputedStyle(world).transform);
    return { x: c.x + m.e + (80 + 200 * 320 + 120) * m.a, y: c.y + m.f + (150 + 100 * 320 + 100) * m.d };
  });
  await page.mouse.click(target.x, target.y);
  await page.locator('[data-node="n-40200"]').waitFor();
  console.log("fit overview", JSON.stringify(view));
});
