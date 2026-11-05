// Board component upgrades, split by tier (F0.22-21): local frame PDF export and the board session's
// timer and votes, rare features guarded by the component-upgrades.spec.mjs requests.
import fs from "node:fs/promises";
import { test, expect, useApp } from "../fixtures.mjs";
import { openBoardSearch } from "../helpers/menu-controls.mjs";

const app = useApp(async (store) => {
  const project = await store.createProject({ title: "Components", key: "COMP" });
  let board = (await store.snapshot(project.id)).boards[0];
  board = await store.updateBoard(project.id, board.id, {
    revision: board.revision,
    nodes: [
      { id: "note", type: "sticky", text: "Typography note", x: 150, y: 240, w: 240, h: 180 },
      { id: "frame", type: "frame", text: "Frame one", x: 1100, y: 600, w: 640, h: 400 },
    ],
    edges: [],
  });
  return { project, board };
});

test.use({ viewportSize: { width: 1600, height: 1100 } });

const current = async () => (await app.store.snapshot(app.project.id)).boards[0];
const poll = (fn, message) => expect.poll(fn, { message, timeout: 10000 });
async function openBoard(page) {
  await page.goto(`${app.base}/#project/${app.project.id}/board`);
  await page.locator("#canvas").waitFor();
}
async function menu(page, key) {
  const m = page.locator(`[data-selection-menu="${key}"]`);
  if ((await m.getAttribute("open")) === null) await m.locator(":scope > summary").click();
  return m;
}
async function find(page, id, text) {
  await openBoardSearch(page);
  await page.locator("#canvas-find").fill(text);
  await page.locator(`[data-pro="find-result"][data-id="${id}"]`).click();
  await expect(page.locator(`[data-node="${id}"]`)).toBeVisible();
}

test("frames export locally as a PDF", async ({ page }) => {
  await openBoard(page);
  await find(page, "frame", "Frame one");
  await menu(page, "arrange");
  const download = page.waitForEvent("download");
  await page.locator("[data-feature=frames-pdf]").click();
  const bytes = await fs.readFile(await (await download).path());
  expect(bytes.subarray(0, 4).toString()).toBe("%PDF");
  expect(bytes.length).toBeGreaterThan(1000);
});

test("a board session's timer and votes persist", async ({ page }) => {
  await openBoard(page);
  await find(page, "note", "Typography");
  // Board session lives in Board tools (0.20.94).
  await page.locator("[data-board-menu=tools] > summary").click();
  await page.locator("[data-session=open]").first().click();
  await page.locator("[data-session=timer]").click();
  await poll(async () => (await current()).settings?.session?.timerEnd > Date.now()).toBe(true);
  await page.locator("[data-session=vote-start]").click();
  await poll(async () => !!(await current()).settings?.session?.voting).toBe(true);
  await page.locator("[data-session=vote-cast]").click();
  await poll(async () => !!(await current()).settings?.session?.votes?.[0]?.nodes.includes("note")).toBe(true);
  await page.locator("[data-action=dialog-close]").click();
});
