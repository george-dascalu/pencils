// Owner report, 29 October 2026: undo on a board took a long time to show. Undo now applies
// the board the server returns straight away, redrawing only the board instead of reloading
// the project and rebuilding the page.
import { test, expect, useApp } from "../fixtures.mjs";

const app = useApp(async (store) => {
  const project = await store.createProject({ title: "Undo", key: "UN" });
  const board = (await store.snapshot(project.id)).boards[0];
  await store.updateBoard(project.id, board.id, { revision: board.revision, nodes: [{ id: "s", type: "sticky", x: 120, y: 120, w: 180, h: 140, text: "Move me" }] });
  return { project };
});

test("undo and redo apply at once without reloading the project or rebuilding the page", async ({ page }) => {
  await page.goto(`${app.base}/#project/${app.project.id}/board`);
  const sticky = page.locator('#canvas [data-node="s"]');
  await sticky.waitFor();
  const left = () => sticky.evaluate((el) => Math.round(el.getBoundingClientRect().left));
  const start = await left();
  const box = await sticky.boundingBox();
  await page.mouse.move(box.x + 40, box.y + 40);
  await page.mouse.down();
  await page.mouse.move(box.x + 140, box.y + 40, { steps: 6 });
  await page.mouse.up();
  await expect.poll(async () => (await app.store.snapshot(app.project.id)).boards[0].nodes[0].x).not.toBe(120);
  const moved = await left();
  await page.evaluate(() => { document.querySelector(".shell").dataset.before = "yes"; });
  const reloads = [];
  page.on("request", (r) => { const path = new URL(r.url()).pathname; if (r.method() === "GET" && (path.endsWith("/delta") || path === `/api/projects/${app.project.id}`)) reloads.push(path); });
  await page.keyboard.press("Control+z");
  await expect.poll(left).toBe(start);
  expect(reloads, "undo does not reload the project").toEqual([]);
  await page.keyboard.press("Control+Shift+z");
  await expect.poll(left).toBe(moved);
  expect(reloads, "redo does not reload the project").toEqual([]);
  expect(await page.evaluate(() => document.querySelector(".shell").dataset.before), "the page was not rebuilt").toBe("yes");
});
