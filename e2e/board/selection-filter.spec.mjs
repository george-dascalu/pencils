// Board selection filter: a Select all can be narrowed by object type (counts per type,
// linked notes counted as notes, Only, several types with Apply, Restore). Filtering is
// selection-only, edits apply just to the filtered subset, grouped and framed objects that
// were filtered out stay put, locks hold, offscreen objects still count, and the panel fits
// desktop and phone in both themes. A fresh selection or a reload resets the filter.
import { test, expect, onDevices, useApp } from "../fixtures.mjs";
import { clickControl, openBoardSearch } from "../helpers/menu-controls.mjs";

const nodes = (a, b) => [
  { id: "frame", type: "frame", text: "Area", x: 20, y: 80, w: 1200, h: 500 },
  { id: "note", type: "sticky", text: "First idea", x: 100, y: 200, w: 220, h: 200, group: "g" },
  { id: "task-a", type: "task", task: a, x: 450, y: 200, w: 300, h: 240, group: "g" },
  { id: "linked", type: "task", task: b, displayAs: "note", x: 840, y: 200, w: 300, h: 240 },
  { id: "text", type: "text", text: "Some text", x: 100, y: 650, w: 250, h: 120 },
  { id: "locked", type: "shape", text: "Locked shape", locked: true, x: 500, y: 650, w: 180, h: 120 },
  { id: "far", type: "shape", text: "Off screen", x: 6000, y: 3000, w: 200, h: 120 },
];

const app = useApp(async (store) => {
  const project = await store.createProject({ title: "Board lab" });
  const a = await store.createTask(project.id, { title: "Write specification", assignee: "Alice", due: "2020-01-01", body: "## Scope\nOriginal scope.\n\n## Other\nKeep this.\n" });
  const b = await store.createTask(project.id, { title: "Build prototype", assignee: "Bob" });
  return { project, a, b };
});

test.use({ viewportSize: { width: 1600, height: 1100 } });

const current = async () => (await app.store.snapshot(app.project.id)).boards[0];
const saved = async (id) => (await current()).nodes.find((n) => n.id === id);
// Each test starts from the seeded board.
async function resetBoard() {
  const board = await current();
  await app.store.updateBoard(app.project.id, board.id, { revision: board.revision, nodes: nodes(app.a.id, app.b.id), edges: [] });
}

let external;
test.beforeEach(async ({ page }) => {
  await resetBoard();
  external = [];
  page.on("request", (r) => {
    if (!r.url().startsWith(app.base) && !r.url().startsWith("data:")) external.push(r.url());
  });
  await page.goto(`${app.base}/#project/${app.project.id}/board`);
  await page.locator('[data-node="note"]').waitFor();
});
test.afterEach(() => expect(external, "no external requests").toEqual([]));

const selectedIds = async (page) => (await page.locator(".board-node.selected").evaluateAll((els) => els.map((e) => e.dataset.node))).sort();
async function all(page) {
  await page.locator("#canvas").focus();
  await page.keyboard.press("Control+a");
}
async function filter(page) {
  await page.locator('[data-selection-menu="filter"] > summary').click();
  // The panel is positioned on the next frame.
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
}
async function only(page, type) {
  await filter(page);
  await page.locator(`[data-selection-only="${type}"]`).click();
}
async function restore(page) {
  await filter(page);
  await page.locator("[data-selection-restore]").click();
}
async function drag(page, from, to) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 6 });
  await page.mouse.up();
}

test("filtering a Select all by type counts each type and changes only the selection", async ({ page }) => {
  const before = await current();
  await all(page);
  await filter(page);
  await expect(page.locator("[data-selection-type]")).toHaveCount(5);
  // A task shown as a note counts as a note.
  expect((await page.locator('[data-selection-type="sticky"]').locator("..").textContent()).trim()).toBe("Notes2");
  await page.locator('[data-selection-only="sticky"]').click();
  expect(await selectedIds(page)).toEqual(["linked", "note"]);
  expect(await current(), "filtering is selection-only; no saved data changes").toEqual(before);
});

test("filtered notes move without their grouped task, and Restore brings back the whole selection", async ({ page }) => {
  await all(page);
  await only(page, "sticky");
  await page.locator("#canvas").focus();
  await page.keyboard.press("ArrowRight");
  await expect.poll(async () => (await saved("note")).x).toBe(105);
  expect((await saved("task-a")).x).toBe(450);
  // Dragging a filtered member must not reselect its group or frame siblings.
  const box = await page.locator('[data-node="note"]').boundingBox();
  const from = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  await drag(page, from, { x: from.x + 60, y: from.y + 50 });
  await expect.poll(async () => (await saved("note")).x).toBeGreaterThan(105);
  await expect(page.locator("#board-save")).toHaveText("Saved automatically");
  expect(await selectedIds(page)).toEqual(["linked", "note"]);
  expect((await saved("task-a")).x).toBe(450);
  await restore(page);
  await expect(page.locator(".selection-filter-total")).toHaveText("7");
});

test("filtering to tasks keeps the convert and filter menus", async ({ page }) => {
  await all(page);
  await only(page, "task");
  expect(await selectedIds(page)).toEqual(["task-a"]);
  await expect(page.locator('[data-selection-menu="convert"]')).toBeVisible();
  await expect(page.locator('[data-selection-menu="filter"]')).toBeVisible();
});

test("several types apply together and a colour edit changes only that subset", async ({ page }) => {
  await all(page);
  await only(page, "task");
  await restore(page);
  await filter(page);
  for (const cb of await page.locator("[data-selection-type]").all()) await cb.uncheck();
  await expect(page.locator("[data-selection-apply]")).toBeDisabled();
  await page.locator('[data-selection-type="task"]').check();
  await page.locator('[data-selection-type="text"]').check();
  await expect(page.locator("[data-selection-apply]")).toHaveText("Apply (2)");
  await page.locator("[data-selection-apply]").click();
  expect(await selectedIds(page)).toEqual(["task-a", "text"]);
  await page.locator('[data-selection-menu="color"] summary').click();
  await page.locator('[data-color-choice="#edc48b"]').click();
  await expect.poll(async () => (await saved("text")).color).toBe("#edc48b");
  expect((await saved("note")).color).toBeUndefined();
});

test("a frame filtered on its own moves without the contents that were filtered out", async ({ page }) => {
  await all(page);
  await only(page, "frame");
  const childBefore = await saved("task-a");
  const frameBefore = await saved("frame");
  const frame = await page.locator('[data-node="frame"]').boundingBox();
  await drag(page, { x: frame.x + frame.width - 3, y: frame.y + 60 }, { x: frame.x + frame.width - 43, y: frame.y + 90 });
  await expect.poll(async () => {
    const after = await saved("frame");
    return after.x !== frameBefore.x || after.y !== frameBefore.y;
  }, { message: "the filtered frame actually moved" }).toBe(true);
  await expect(page.locator("#board-save")).toHaveText("Saved automatically");
  expect(await saved("task-a"), "excluded frame contents stay put").toEqual(childBefore);
});

test("offscreen shapes still count and move, while locked shapes stay put", async ({ page }) => {
  await all(page);
  await only(page, "shape");
  await expect(page.locator(".selection-filter-total")).toHaveText("2");
  await page.locator("#canvas").focus();
  await page.keyboard.press("ArrowRight");
  await expect.poll(async () => (await saved("far")).x).toBe(6005);
  expect((await saved("locked")).x).toBe(500);
});

onDevices(["desktop", "phone"], (device) => {
  test.use({ viewportSize: device === "desktop" ? { width: 1600, height: 1000 } : null });
  test("the filter panel stays on screen and closes with Escape", async ({ page }) => {
    if (device === "phone") await page.evaluate(() => (document.documentElement.dataset.theme = "dark"));
    const { width, height } = page.viewportSize();
    await all(page);
    await filter(page);
    const panel = await page.locator('[data-selection-menu="filter"] .selection-popover').boundingBox();
    expect(panel.x).toBeGreaterThanOrEqual(0);
    expect(panel.x + panel.width).toBeLessThanOrEqual(width + 1);
    expect(panel.y).toBeGreaterThanOrEqual(0);
    expect(panel.y + panel.height).toBeLessThanOrEqual(height + 1);
    await page.keyboard.press("Escape");
    await expect(page.locator('[data-selection-menu="filter"]')).not.toHaveAttribute("open");
  });
});

test("a fresh selection drops the filter; deleting a filtered subset is undoable and a reload resets the filter", async ({ page }) => {
  await all(page);
  await only(page, "shape");
  // A fresh manual selection discards the previous filter pool.
  await openBoardSearch(page);
  await page.locator("#canvas-find").fill("Some text");
  await page.locator('[data-pro=find-result][data-id="text"]').click();
  await expect(page.locator("#canvas-search-panel")).toBeHidden();
  await page.locator('[data-node="text"]').click();
  await expect(page.locator('[data-selection-menu="filter"]')).toHaveCount(0);
  await all(page);
  await only(page, "sticky");
  await clickControl(page.locator('[data-feature="selection-delete"]'));
  await expect.poll(async () => (await current()).nodes.length).toBe(5);
  expect((await current()).nodes.some((n) => n.id === "task-a")).toBe(true);
  await page.getByRole("button", { name: "Undo canvas change", exact: true }).click();
  await expect.poll(async () => (await current()).nodes.length).toBe(7);
  await page.reload();
  await page.locator("#canvas").waitFor();
  await expect(page.locator('[data-selection-menu="filter"]')).toHaveCount(0);
});
