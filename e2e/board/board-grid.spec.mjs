// Board grids: placement, an editable screen-sized title with autosave and undo/redo, inline cell
// editing (Tab moves on, browser tab shortcuts pass through), rows/columns, pasted tables and the
// real clipboard, cell colour and alignment, column/row/outer-edge resizing with Escape and undo,
// keyboard navigation, CSV export, duplicate/undo, reload, a phone screen, and a title that stays
// attached and readable at any zoom without changing the saved grid.
import { test, expect, onDevices, useApp } from "../fixtures.mjs";

const app = useApp(async (store) => {
  const project = await store.createProject({ title: "Grid lab" });
  const initial = (await store.snapshot(project.id)).boards[0];
  await store.updateBoard(project.id, initial.id, { revision: initial.revision, nodes: [], edges: [] });
  return { project, board: initial };
});
// Clicks on empty board use fixed points at this size.
test.use({ viewportSize: { width: 1600, height: 1100 } });
// One journey: the grid placed first is titled, restructured, resized, duplicated and reloaded.
test.describe.configure({ mode: "serial" });

const current = async () => (await app.store.snapshot(app.project.id)).boards[0];
const grid = async () => (await current()).nodes[0].grid;
const cell = (page, r, c) => page.locator(`.board-node.grid.selected [data-grid-row="${r}"][data-grid-column="${c}"]`);
const camera = (page) => page.locator("#canvas-world").evaluate((el) => el.style.transform);
const titleField = (page) => page.getByRole("textbox", { name: "Grid title", exact: true });
const editTitle = (page) => page.getByRole("button", { name: "Edit grid title", exact: true }).click();
const undo = (page) => page.locator('[aria-label="Undo canvas change"]').click();
async function openBoard(page) {
  await page.goto(`${app.base}/#project/${app.project.id}/board`);
  await page.locator("#canvas").waitFor();
}
async function openGrid(page) {
  await openBoard(page);
  await page.locator(".board-node.grid").waitFor();
  await page.locator(".grid-grip").click();
}
const empty = async (page, x, y) => {
  const box = await page.locator("#canvas").boundingBox();
  await page.mouse.click(box.x + x, box.y + y);
};
// Headless browsers do not switch browser tabs with keyboard.press. Check that the app leaves
// the native Ctrl/Meta/Alt+Tab events uncancelled and does not move focus instead.
async function browserTabShortcutsPassThrough(target) {
  await target.focus();
  const results = await target.evaluate((el) => {
    const focus = document.activeElement;
    return [false, true].flatMap((shiftKey) => ["ctrlKey", "metaKey", "altKey"].map((modifier) => {
      const event = new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true, shiftKey, [modifier]: true });
      el.dispatchEvent(event);
      return { prevented: event.defaultPrevented, keptFocus: document.activeElement === focus };
    }));
  });
  expect(results.every((r) => !r.prevented && r.keptFocus), JSON.stringify(results)).toBe(true);
}

test("a placed grid starts with nine cells and a screen-sized title that saves, undoes and redoes", async ({ page }) => {
  await openBoard(page);
  await page.locator('[aria-label="Add grid"]').click();
  await empty(page, 300, 220);
  await expect.poll(async () => (await current()).nodes.some((n) => n.type === "grid")).toBe(true);
  await expect(page.locator(".grid-cell")).toHaveCount(9);
  const title = page.locator(".grid-title");
  await expect(title).toHaveText("Add a title…");
  const screenFont = await title.evaluate((el) => parseFloat(getComputedStyle(el).fontSize) * new DOMMatrix(getComputedStyle(document.querySelector("#canvas-world")).transform).a);
  expect(Math.abs(screenFont - 14), "the title reads at 14 screen pixels").toBeLessThan(0.1);
  expect(Math.abs((await page.locator(".grid-grip").boundingBox()).height - 24)).toBeLessThan(0.1);
  await title.dblclick();
  await titleField(page).fill("Release planning");
  await empty(page, 950, 600);
  await expect.poll(async () => (await grid()).title).toBe("Release planning");
  await expect(title).toHaveText("Release planning");
  expect((await current()).nodes[0].text).toMatch(/^## Release planning/);
  await undo(page);
  await expect.poll(async () => (await grid()).title ?? "").toBe("");
  await expect(title).toHaveText("Add a title…");
  await page.locator('[aria-label="Redo canvas change"]').click();
  await expect.poll(async () => (await grid()).title).toBe("Release planning");
  await editTitle(page);
  await titleField(page).fill("Roadmap & milestones");
  await page.keyboard.press("Enter");
  await expect.poll(async () => (await grid()).title).toBe("Roadmap & milestones");
  await editTitle(page);
  await titleField(page).fill("");
  await page.keyboard.press("Enter");
  await expect.poll(async () => (await grid()).title ?? "").toBe("");
  await expect(title).toHaveText("Add a title…");
  await undo(page);
  await expect.poll(async () => (await grid()).title).toBe("Roadmap & milestones");
  await editTitle(page);
  await titleField(page).fill("Release planning");
  // Moving straight into a cell commits the title without replacing cell text.
  await page.locator('[data-grid-row="1"][data-grid-column="1"]').click();
  await expect.poll(async () => (await grid()).title).toBe("Release planning");
  await page.locator(".inline-rich").fill("A useful grid");
  await empty(page, 950, 600);
  await expect.poll(async () => (await grid()).cells[1][1].text).toBe("A useful grid");
});

test("rows and columns can be added, and pasted tab-separated text fills the cells", async ({ page }) => {
  await openGrid(page);
  await cell(page, 1, 1).click();
  await page.locator('summary[aria-label="Row controls"]').click();
  await page.locator('[data-grid-action="rows:add"]').click();
  await expect.poll(async () => (await grid()).rows.length).toBe(4);
  await page.locator('summary[aria-label="Column controls"]').click();
  await page.locator('[data-grid-action="columns:add"]').click();
  await expect.poll(async () => (await grid()).columns.length).toBe(4);
  await cell(page, 2, 2).click();
  await cell(page, 2, 2).evaluate((el) => {
    const event = new Event("paste", { bubbles: true, cancelable: true });
    Object.defineProperty(event, "clipboardData", { value: { getData: () => "One\tTwo\nThree\tFour" } });
    el.dispatchEvent(event);
  });
  await expect.poll(async () => (await grid()).cells[3][3].text).toBe("Four");
});

test("a cell's colour and text alignment save and show", async ({ page }) => {
  await openGrid(page);
  await cell(page, 1, 1).click();
  await page.locator('summary[aria-label="Cell colour"]').click();
  await page.locator('[data-color-choice="#edc48b"]:visible').click();
  await expect.poll(async () => (await grid()).cells[1][1].color).toBe("#edc48b");
  await page.locator('[aria-label="Text alignment"]').first().click();
  await page.locator('#selection-tools [data-text-align="center"]').click();
  await expect.poll(async () => (await grid()).cells[1][1].align).toBe("center");
  await expect(cell(page, 1, 1).locator(".grid-cell-text")).toHaveCSS("text-align", "center");
});

test("Tab commits a cell and keeps editing the next, clicking another cell commits too, and browser tab shortcuts pass through", async ({ page }) => {
  await openGrid(page);
  await browserTabShortcutsPassThrough(cell(page, 0, 0));
  await cell(page, 0, 0).dblclick();
  await page.locator(".inline-rich").fill("First heading");
  await browserTabShortcutsPassThrough(page.locator(".inline-rich"));
  await expect(page.locator(".inline-rich")).toHaveText("First heading");
  await page.keyboard.press("Tab");
  await page.locator(".inline-rich").fill("Second heading");
  await cell(page, 0, 2).click();
  await page.locator(".inline-rich").fill("Third heading");
  await empty(page, 1000, 600);
  await expect.poll(async () => (await grid()).cells[0][2].text).toBe("Third heading");
  expect((await grid()).cells[0][0].text).toBe("First heading");
});

test("a real clipboard paste into a cell wins over the board's object clipboard", async ({ page, browserName }) => {
  test.skip(browserName === "firefox", "Firefox does not grant clipboard permissions to tests");
  await openGrid(page);
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.keyboard.press("Control+c");
  await page.evaluate(() => navigator.clipboard.writeText("Clipboard A\tClipboard B"));
  await cell(page, 3, 0).click();
  await page.keyboard.press("Control+v");
  await expect.poll(async () => (await grid()).cells[3][1].text).toBe("Clipboard B");
});

test("dragging a column edge resizes only that column without moving the camera", async ({ page }) => {
  await openGrid(page);
  const before = await camera(page);
  const widths = (await grid()).columns;
  const handle = await page.locator(".grid-track-handle.column").first().boundingBox();
  await page.mouse.move(handle.x + 4, handle.y + 30);
  await page.mouse.down();
  await page.mouse.move(handle.x + 34, handle.y + 30, { steps: 6 });
  await page.mouse.up();
  await expect.poll(async () => (await grid()).columns[0]).not.toBe(widths[0]);
  expect(await camera(page)).toBe(before);
  const resized = await grid();
  expect(resized.columns[0]).toBeGreaterThan(widths[0]);
  for (let i = 1; i < widths.length; i++) expect(Math.abs(resized.columns[i] - widths[i])).toBeLessThan(0.01);
});

test("the outer edge scales every column; Escape cancels the whole gesture and a committed resize undoes as one action", async ({ page }) => {
  await openGrid(page);
  const resized = (await current()).nodes[0];
  const edge = await page.locator(".grid-edge-handle.right").boundingBox();
  await page.mouse.move(edge.x + edge.width / 2, edge.y + 40);
  await page.mouse.down();
  await page.mouse.move(edge.x + edge.width / 2 + 50, edge.y + 40, { steps: 8 });
  await expect(page.locator(".grid-resize-dimensions")).toHaveCount(1);
  const labelWidth = await page.locator('[data-grid-axis="columns"][data-track="0"]').evaluate((el) => parseFloat(el.style.width));
  expect(labelWidth).toBeGreaterThan(resized.grid.columns[0]);
  await page.keyboard.press("Escape");
  await page.mouse.up();
  await expect(page.locator(".grid-resize-dimensions")).toHaveCount(0);
  expect(await grid()).toEqual(resized.grid);
  // Commit an outer-edge resize, then undo it as one action.
  const right = await page.locator(".grid-edge-handle.right").boundingBox();
  await page.mouse.move(right.x + right.width / 2, right.y + 40);
  await page.mouse.down();
  await page.mouse.move(right.x + right.width / 2 + 50, right.y + 40, { steps: 8 });
  await page.mouse.up();
  await expect.poll(async () => (await current()).nodes[0].w).toBeGreaterThan(resized.w + 30);
  const scaled = (await current()).nodes[0];
  for (let i = 0; i < resized.grid.columns.length; i++) {
    expect(scaled.grid.columns[i]).toBeGreaterThan(resized.grid.columns[i]);
    expect(Math.abs(scaled.grid.columns[i] / resized.grid.columns[i] - scaled.w / resized.w)).toBeLessThan(0.001);
  }
  await undo(page);
  await expect.poll(async () => (await current()).nodes[0].w).toBe(resized.w);
});

test("the last row has its own resize handle, separate from the outer edge", async ({ page }) => {
  await openGrid(page);
  const before = await camera(page);
  const resized = (await current()).nodes[0];
  const lastRow = await page.locator(".grid-track-handle.row.last-track").boundingBox();
  await page.mouse.move(lastRow.x + 10, lastRow.y + lastRow.height / 2);
  await page.mouse.down();
  await page.mouse.move(lastRow.x + 10, lastRow.y + lastRow.height / 2 + 30, { steps: 6 });
  await page.mouse.up();
  await expect.poll(async () => (await current()).nodes[0].h).toBeGreaterThan(resized.h + 20);
  const finalRows = (await grid()).rows;
  for (let i = 0; i < finalRows.length - 1; i++) expect(Math.abs(finalRows[i] - resized.grid.rows[i])).toBeLessThan(0.01);
  expect(await camera(page)).toBe(before);
});

test("arrow keys move between cells, the grid exports CSV, and duplicating it can be undone", async ({ page }) => {
  await openGrid(page);
  const before = await camera(page);
  await cell(page, 0, 0).click();
  await page.keyboard.press("ArrowRight");
  await expect(page.locator(".grid-cell.active-cell")).toHaveAttribute("data-grid-column", "1");
  const download = page.waitForEvent("download");
  await page.locator('[data-grid-action="csv"]').click();
  expect((await download).suggestedFilename()).toBe("grid.csv");
  await page.locator('[data-feature="duplicate"]').click();
  await expect.poll(async () => (await current()).nodes.length).toBe(2);
  const nodes = (await current()).nodes;
  expect(nodes[1].grid).toEqual(nodes[0].grid);
  expect(await camera(page)).toBe(before);
  await undo(page);
  await expect.poll(async () => (await current()).nodes.length).toBe(1);
});

test("the grid's title, cells and text survive a reload", async ({ page }) => {
  await openBoard(page);
  await page.locator(".board-node.grid").waitFor();
  await expect(page.locator(".grid-title")).toHaveText("Release planning");
  await expect(page.locator(".grid-cell")).toHaveCount(16);
  await expect(page.locator(".board-node.grid")).toContainText("A useful grid");
});

onDevices(["phone"], () => {
  test.use({ viewportSize: null });
  test("on a phone the toolbar fits, resize targets stay 8px and the title stays 24px high and editable at any zoom", async ({ page }) => {
    await openGrid(page);
    await page.evaluate(() => (document.documentElement.dataset.theme = "dark"));
    // Since 0.20.33 the board has no zoom buttons: double-tap the zoom level to fit, Ctrl+-/= to zoom.
    const settle = () => page.waitForFunction(() => !document.querySelector("#canvas").classList.contains("zooming"));
    await page.locator("#zoom-label").dblclick();
    await settle();
    await expect.poll(async () => {
      const box = await page.locator("#selection-tools").boundingBox();
      return box && box.x >= 0 && box.x + box.width <= 391;
    }, { message: "the selection toolbar fits the phone" }).toBe(true);
    const mobileHandle = await page.locator(".grid-track-handle.column").first().boundingBox();
    expect(Math.abs(mobileHandle.width - 8), "resize target stays 8 screen pixels wide when zoomed out").toBeLessThan(0.2);
    await editTitle(page);
    await titleField(page).fill("Mobile planning");
    await page.keyboard.press("Enter");
    await expect.poll(async () => (await grid()).title).toBe("Mobile planning");
    await expect(page.locator(".grid-title")).toHaveText("Mobile planning");
    for (const key of ["Control+-", "Control+-", "Control+="]) {
      await page.locator("#canvas").focus();
      await page.keyboard.press(key);
      await settle();
      const header = await page.locator(".grid-grip").boundingBox();
      const pencil = await page.locator(".grid-title-edit").boundingBox();
      expect(Math.abs(header.height - 24), "title bar stays 24 screen pixels high").toBeLessThan(0.2);
      expect(Math.abs(pencil.width - 20), "title edit button stays usable at any zoom").toBeLessThan(0.2);
      const column = await page.locator(".grid-axis-label.column").first().boundingBox();
      expect(column.y + column.height, "column handles do not cover the title").toBeLessThanOrEqual(header.y);
    }
    await editTitle(page);
    await titleField(page).fill("Zoomed title");
    await page.keyboard.press("Enter");
    await expect.poll(async () => (await grid()).title).toBe("Zoomed title");
  });
});

test("the title stays attached to the top edge and clear of the cells from 50% to 300% zoom, without changing the saved grid", async ({ page }) => {
  await openBoard(page);
  // The screen-sized title must not drift down through the header at high zoom.
  const savedGrid = (await current()).nodes.find((n) => n.type === "grid");
  for (const z of [0.5, 1, 2, 3]) {
    await page.evaluate(({ id, n, z }) => localStorage.setItem(`pencils:camera:${id}`, JSON.stringify({ x: 150 - n.x * z, y: 200 - n.y * z, z })), { id: app.board.id, n: savedGrid, z });
    await page.reload();
    const grip = page.locator(".grid-grip");
    await grip.click({ position: { x: 12, y: 12 } });
    await expect(page.locator("#zoom-label")).toHaveText(`${z * 100}%`);
    const header = await grip.boundingBox();
    const bounds = await page.locator(".board-node.grid").boundingBox();
    const cells = await page.locator(".grid-cells").boundingBox();
    const column = await page.locator(".grid-axis-label.column").first().boundingBox();
    const last = await page.locator(".grid-track-handle.column.last-track").boundingBox();
    expect(Math.abs(header.height - 24)).toBeLessThan(0.2);
    if (z >= 1) expect(Math.abs(header.y - bounds.y), "grid title stays attached to the top edge when zoomed in").toBeLessThan(2 * z);
    expect(header.y + header.height, "title does not cover cell content").toBeLessThanOrEqual(cells.y + 0.2);
    expect(column.y + column.height, "column controls remain above the anchored title").toBeLessThanOrEqual(header.y);
    expect(Math.abs(last.y - column.y), "last column resize target follows the column controls").toBeLessThan(0.2);
  }
  const afterZoom = (await current()).nodes.find((n) => n.id === savedGrid.id);
  expect(afterZoom, "zooming does not change saved grid geometry or contents").toEqual(savedGrid);
});
