// Steps shared by the board (canvas) tests: seeding a board, waiting for the camera and
// card rendering to settle, finding objects with board search, and board <-> screen points.
import { expect } from "@playwright/test";
import { openBoardSearch } from "./menu-controls.mjs";

// The project's board as saved in the vault (the first board unless `boardId` is given).
export async function savedBoard(store, projectId, boardId) {
  const boards = (await store.snapshot(projectId)).boards;
  return boardId ? boards.find((b) => b.id === boardId) : boards[0];
}

// Replace parts of a saved board (nodes, edges, settings, presentation) before a test opens it.
export async function seedBoard(store, projectId, patch, boardId) {
  const board = await savedBoard(store, projectId, boardId);
  return store.updateBoard(projectId, board.id, { revision: board.revision, ...patch });
}

// Start the page on a given camera for a board (the app restores it from localStorage).
export async function presetCamera(page, boardId, camera) {
  await page.addInitScript(([id, value]) => localStorage.setItem(`pencils:camera:${id}`, JSON.stringify(value)), [boardId, camera]);
}

// The camera has stopped moving and no more cards are being built (two unchanged frames).
export async function boardSettled(page) {
  await expect
    .poll(
      () =>
        page.evaluate(
          () =>
            new Promise((resolve) => {
              const read = () => {
                const world = document.querySelector("#canvas-world");
                return [world ? getComputedStyle(world).transform : "", document.querySelectorAll(".board-node").length, document.querySelector("#canvas")?.dataset.detailedCount].join("|");
              };
              const before = read();
              requestAnimationFrame(() => requestAnimationFrame(() => resolve(before !== "|0|" && read() === before)));
            }),
        ),
      { message: "the board camera and cards settle" },
    )
    .toBe(true);
}

// Jump to an object with board search (phones keep Search behind "More canvas tools").
export async function findOnBoard(page, id, text) {
  await page.locator("#canvas").waitFor();
  const more = page.locator(".phone-board-more");
  if (!(await page.locator("#canvas-find").isVisible()) && (await more.isVisible())) await more.click();
  await openBoardSearch(page);
  await page.locator("#canvas-find").fill(text);
  await page.locator(`#canvas-find-results [data-id="${id}"]`).click();
  await expect(page.locator(`[data-node="${id}"]`), "the chosen search result is shown and selected").toHaveClass(/\bselected\b/);
  await expect(page.locator(`[data-node="${id}"]`)).toBeVisible();
  await boardSettled(page);
}

// Screen coordinates of a board point under the current camera.
export function worldPoint(page, x, y) {
  return page.evaluate(
    ({ x, y }) => {
      const r = document.querySelector("#canvas").getBoundingClientRect();
      const m = new DOMMatrix(getComputedStyle(document.querySelector("#canvas-world")).transform);
      return { x: r.x + m.e + x * m.a, y: r.y + m.f + y * m.a };
    },
    { x, y },
  );
}

export function canvasZoom(page) {
  return page.locator("#canvas-world").evaluate((el) => new DOMMatrix(getComputedStyle(el).transform).a);
}

// Screen coordinates of a point part-way along a connector's path.
export async function connectorPoint(page, id, fraction = 0.5) {
  await page.locator(`path.canvas-edge[data-edge="${id}"]`).waitFor({ state: "attached" });
  return page.evaluate(
    ({ id, fraction }) => {
      const el = document.querySelector(`path.canvas-edge[data-edge="${id}"]`);
      const p = el.getPointAtLength(el.getTotalLength() * fraction);
      const q = new DOMPoint(p.x, p.y).matrixTransform(el.getScreenCTM());
      return { x: q.x, y: q.y };
    },
    { id, fraction },
  );
}

// The browser has finished its board saves: none are left queued in localStorage. Seeing a
// change in the vault is not enough before a reload or an external edit, because the page
// keeps a save queued until it has handled the response; if the board then changes on disk,
// the reloaded page treats the queued save as a conflict and opens the board gallery with
// local checkpoints instead of the board.
export async function savesSettled(page) {
  await expect
    .poll(
      () =>
        page.evaluate(() =>
          Object.keys(localStorage)
            .filter((key) => key.startsWith("pencils:pending:") && !key.endsWith(":lease"))
            .some((key) => JSON.parse(localStorage.getItem(key) || "[]").length),
        ),
      { message: "the browser has no queued board saves" },
    )
    .toBe(false);
}
