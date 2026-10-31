// Dragging a grid from the board tools: a 3×3 preview that matches the dropped grid at any
// zoom, a single persisted drop with undo/redo, cancelling with Escape or by leaving the
// board, click-to-place as a fallback, icon-only column alignment, reload, and dragging the
// grid out of the phone's canvas tools panel by touch in dark mode.
import { test, expect, onDevices, useApp } from "../fixtures.mjs";
import { savedBoard, seedBoard, boardSettled, savesSettled } from "../helpers/board-canvas.mjs";

const app = useApp(async (store) => {
  const project = await store.createProject({ title: "Grid drag" });
  return { project };
});

test.use({ viewportSize: { width: 1500, height: 1000 } });

const nodes = async () => (await savedBoard(app.store, app.project.id)).nodes;
const source = (page) => page.locator(".board-tools [data-tool=grid]");
const preview = (page) => page.locator(".grid-drop-preview");

async function open(page) {
  await seedBoard(app.store, app.project.id, { nodes: [], edges: [] });
  await page.goto(`${app.base}/#project/${app.project.id}/board`);
  await page.locator("#canvas").waitFor();
  await boardSettled(page);
}
// A point on open board, 40% across and 35% down.
async function dropPoint(page) {
  const c = await page.locator("#canvas").boundingBox();
  return { x: c.x + c.width * 0.4, y: c.y + c.height * 0.35 };
}
async function start(page) {
  const r = await source(page).boundingBox();
  await page.mouse.move(r.x + r.width / 2, r.y + r.height / 2);
  await page.mouse.down();
}

test("a dragged grid shows a 3×3 preview that matches the drop at different zooms, and saves once with undo and redo", async ({ page }) => {
  await open(page);
  const { x, y } = await dropPoint(page);
  for (const delta of [240, -440]) {
    const zoom = await page.locator("#zoom-label").textContent();
    await page.mouse.move(x, y);
    await page.mouse.wheel(0, delta);
    await expect(page.locator("#zoom-label")).not.toHaveText(zoom);
    await boardSettled(page);
    const count = (await nodes()).length;
    await start(page);
    await page.mouse.move(x, y, { steps: 10 });
    await expect(preview(page)).toBeVisible();
    await expect(preview(page).locator(".grid-cell")).toHaveCount(9);
    expect(await nodes(), "Dragging does not persist a grid").toHaveLength(count);
    const before = await preview(page).boundingBox();
    await page.mouse.up();
    await expect.poll(async () => (await nodes()).length).toBe(count + 1);
    const grid = (await nodes()).at(-1);
    const after = await page.locator(`[data-node="${grid.id}"]`).boundingBox();
    for (const key of ["x", "y", "width", "height"]) expect(Math.abs(before[key] - after[key]), `${key} matches preview at zoom (${before[key]}, ${after[key]})`).toBeLessThan(3);
    expect(grid.grid.rows).toHaveLength(3);
    await expect(preview(page)).toHaveCount(0);
    await page.locator("[data-action=board-undo]").click();
    await expect.poll(async () => (await nodes()).length).toBe(count);
    await page.locator("[data-action=board-redo]").click();
    await expect.poll(async () => (await nodes()).length).toBe(count + 1);
  }
});

test("Escape or leaving the board cancels a grid drag without adding a grid", async ({ page }) => {
  await open(page);
  const { x, y } = await dropPoint(page);
  for (const cancel of ["escape", "outside"]) {
    const count = (await nodes()).length;
    await start(page);
    await page.mouse.move(x, y, { steps: 6 });
    await expect(preview(page)).toBeVisible();
    if (cancel === "escape") await page.keyboard.press("Escape");
    else await page.mouse.move(10, 10, { steps: 5 });
    await page.mouse.up();
    await expect(preview(page)).toHaveCount(0);
    await savesSettled(page);
    expect(await nodes()).toHaveLength(count);
  }
});

test("clicking the grid tool then the board places a grid whose column alignment uses icon-only buttons", async ({ page }) => {
  await open(page);
  const { x, y } = await dropPoint(page);
  // Clicking the same sidebar tool still supports click-to-place.
  const count = (await nodes()).length;
  await source(page).click();
  await page.mouse.click(x, y);
  await expect.poll(async () => (await nodes()).length).toBe(count + 1);
  const grid = (await nodes()).at(-1);
  await page.locator(`[data-node="${grid.id}"] .grid-grip`).click();
  await page.getByRole("button", { name: "Select column A", exact: true }).click();
  const menu = page.locator('[data-selection-menu="text-align"]');
  await menu.locator("summary").click();
  expect((await menu.locator(".selection-popover").boundingBox()).width).toBeLessThanOrEqual(210);
  for (const name of ["Align text left", "Centre text", "Align text right", "Align text top", "Align text middle", "Align text bottom"]) {
    const button = menu.getByRole("button", { name, exact: true });
    expect((await button.textContent()).trim(), "Icon-only alignment").toBe("");
    await expect(button.locator("svg")).toHaveCount(1);
  }
  await menu.getByRole("button", { name: "Align text bottom", exact: true }).click();
  await expect.poll(async () => (await nodes()).find((n) => n.id === grid.id).grid.cells.every((row) => row[0].verticalAlign === "bottom")).toBe(true);
  await menu.locator("summary").click();
  await savesSettled(page);
  await page.reload();
  await page.locator(`[data-node="${grid.id}"]`).waitFor();
});

onDevices(["phone"], () => {
  test.use({ viewportSize: null });
  test("on a phone a grid dragged by touch out of the dock's Add row lands on the board", async ({ page }) => {
    await open(page);
    await expect.poll(() => page.locator(".sidebar").evaluate((el) => el.getBoundingClientRect().right)).toBeLessThanOrEqual(1);
    await page.evaluate(() => window.PencilsAppearance.write({ theme: "dark" }));
    // Phones keep the creation tools in the dock's Add row (0.20.82), which scrolls sideways;
    // drag the grid out of it onto open canvas.
    await page.locator(".phone-board-dock").waitFor({ state: "visible" });
    await page.locator('.phone-board-dock [data-phone-category="add"]').click();
    await source(page).waitFor({ state: "visible" });
    await source(page).scrollIntoViewIfNeeded();
    const r = await source(page).boundingBox();
    const row = await page.locator("#phone-board-add").boundingBox();
    const canvas = await page.locator("#canvas").boundingBox();
    const drop = { x: 160, y: (canvas.y + row.y) / 2 };
    const session = await page.context().newCDPSession(page);
    const before = (await nodes()).length;
    await session.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: r.x + r.width / 2, y: r.y + r.height / 2 }] });
    await session.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [drop] });
    await expect(preview(page)).toBeVisible();
    await session.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await expect.poll(async () => (await nodes()).length).toBe(before + 1);
  });
});
