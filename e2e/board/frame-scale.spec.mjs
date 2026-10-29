// Frames at scale: copying and pasting 5,000 frames with their children saves 10,000 frames
// with every child still in its own frame; after a reload the outline pages through them 50
// at a time, the vault keeps all 20,000 objects natively, and 10,000 frames can be presented.
// PRODUCTION_ASSETS=1 serves the built assets.
import { test, expect } from "../fixtures.mjs";
import { useCustomApp } from "../helpers/custom-server.mjs";
import { savedBoard, boardSettled, savesSettled } from "../helpers/board-canvas.mjs";
import { BOARD_LIMITS } from "../../public/board-limits.js";

const app = useCustomApp({
  seed: async (store) => {
    const project = await store.createProject({ title: "Frame duplication" });
    const board = (await store.snapshot(project.id)).boards[0];
    const nodes = [];
    for (let i = 0; i < 5000; i++) {
      const x = (i % 100) * 1000, y = Math.floor(i / 100) * 1000;
      nodes.push({ id: `frame-${i}`, type: "frame", text: `Frame ${i}`, x, y, w: 800, h: 600 });
      nodes.push({ id: `child-${i}`, type: "sticky", text: `Child ${i}`, x: x + 50, y: y + 100, w: 200, h: 160, frame: `frame-${i}` });
    }
    return { project, board: await store.updateBoard(project.id, board.id, { revision: board.revision, nodes, edges: [] }) };
  },
  server: () => ({ productionAssets: process.env.PRODUCTION_ASSETS === "1" }),
});

// The second test reloads the board the first one pasted into.
test.describe.configure({ mode: "serial" });
test.use({ viewportSize: { width: 1500, height: 1000 } });

const current = () => savedBoard(app.store, app.project.id, app.board.id);
const frameCount = (page, count) => page.waitForFunction((count) => document.querySelector(".board-capacity")?.dataset.frameCount === count, String(count), { timeout: 60000 });

test("copying and pasting 5,000 frames with their children saves 10,000 frames, each child in its own frame", async ({ page }) => {
  test.setTimeout(180000);
  page.setDefaultTimeout(60000);
  await page.goto(`${app.base}/#project/${app.project.id}/board/${app.board.id}`);
  await frameCount(page, 5000);
  await boardSettled(page);
  await page.locator("#canvas").focus();
  await page.keyboard.press("Control+a");
  await page.keyboard.press("Control+c");
  const start = performance.now();
  await page.keyboard.press("Control+v");
  await frameCount(page, 10000);
  await expect.poll(async () => (await current()).nodes.length, { timeout: 30000 }).toBe(20000);
  test.info().annotations.push({ type: "paste saved", description: `${Math.round(performance.now() - start)} ms` });
  const saved = await current();
  const ids = new Set(saved.nodes.map((n) => n.id));
  expect(ids.size).toBe(20000);
  expect(saved.nodes.filter((n) => n.type === "frame")).toHaveLength(10000);
  expect(saved.nodes.filter((n) => n.type !== "frame").every((n) => ids.has(n.frame))).toBe(true);
  expect(saved.nodes.filter((n) => n.id.startsWith("child-")).every((n) => n.frame === n.id.replace("child-", "frame-")), "Pasting frames preserves the original frames’ children").toBe(true);
  await page.keyboard.press("Escape");
  await savesSettled(page);
});

test("after a reload the outline pages through 10,000 frames, the vault keeps every object, and all frames can be presented", async ({ page }) => {
  test.setTimeout(180000);
  page.setDefaultTimeout(60000);
  await page.goto(`${app.base}/#project/${app.project.id}/board/${app.board.id}`);
  await frameCount(page, 10000);
  await boardSettled(page);
  await page.evaluate(() => document.querySelector("[data-pro=outline]").click());
  await expect(page.locator("[data-frame-row]")).toHaveCount(50);
  await page.getByRole("button", { name: "Next frames", exact: true }).click();
  await page.locator('[data-frame-row="frame-50"]').waitFor();
  await page.getByRole("button", { name: "Previous frames", exact: true }).click();
  await page.locator('[data-frame-row="frame-0"]').waitFor();
  // The large board also lays out at phone width.
  await page.getByRole("button", { name: "Collapse sidebar", exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator(".phone-board-dock")).toBeVisible();
  await page.setViewportSize({ width: 1500, height: 1000 });

  const board = await current();
  const presentation = board.nodes.filter((n) => n.type === "frame").map((n) => n.id);
  const saved = await app.store.updateBoard(app.project.id, app.board.id, { revision: board.revision, presentation });
  expect(saved.presentation).toHaveLength(10000);
  expect((await app.store.read(app.store.file(app.project.id, "boards", app.board.id))).data.nodes).toHaveLength(20000);
  expect(BOARD_LIMITS.frames).toBeGreaterThanOrEqual(10000);
});
