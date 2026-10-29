// Board selection toolbar: a compact toolbar with layer and delete actions on view, keyboard
// menus that return focus on Escape, colour with undo, locking, bulk colour/alignment/grouping
// for every selected object, layer order, delete and undo, persistence across reloads, menus
// kept inside the board on desktop and phone, and a dark surface in dark mode.
import { test, expect, useApp } from "../fixtures.mjs";
import { clickControl, openBoardSearch, openSettingsPage } from "../helpers/menu-controls.mjs";

const nodes = (a, b, extra = {}) => [
  { id: "note", type: "sticky", text: "First idea", x: 80, y: 150, w: 240, h: 200, color: "#f5e7a2" },
  { id: "task-a", type: "task", task: a, x: 420, y: 150, w: 310, h: 300 },
  { id: "task-b", type: "task", task: b, x: 830, y: 150, w: 300, h: 240 },
  { id: "far", type: "text", text: "A distant idea", x: 6000, y: 3000, w: 300, h: 150 },
].map((n) => ({ ...n, ...extra }));

const app = useApp(async (store) => {
  const project = await store.createProject({ title: "Board lab" });
  const a = await store.createTask(project.id, { title: "Write specification", assignee: "Alice", due: "2020-01-01", body: "## Scope\nOriginal scope.\n\n## Other\nKeep this.\n" });
  const b = await store.createTask(project.id, { title: "Build prototype", assignee: "Bob" });
  return { project, a, b };
});

test.use({ viewportSize: { width: 1600, height: 1100 } });

const current = async () => (await app.store.snapshot(app.project.id)).boards[0];
const saved = async (id) => (await current()).nodes.find((n) => n.id === id);
async function resetBoard(extra) {
  const board = await current();
  await app.store.updateBoard(app.project.id, board.id, { revision: board.revision, nodes: nodes(app.a.id, app.b.id, extra), edges: [] });
}
async function openBoard(page) {
  await page.goto(`${app.base}/#project/${app.project.id}/board`);
  await page.locator('[data-node="note"]').waitFor();
}

let external;
test.beforeEach(async ({ page }) => {
  external = [];
  page.on("request", (r) => {
    if (!r.url().startsWith(app.base) && !r.url().startsWith("data:")) external.push(r.url());
  });
});
test.afterEach(() => expect(external, "no external requests").toEqual([]));

const toolbar = (page) => page.locator("#selection-tools");
const menu = (page, key) => toolbar(page).locator(`[data-selection-menu=${key}] > summary`);
const savedLabel = (page) => expect(page.locator("#board-save")).toHaveText("Saved automatically");
// Select an object through board search (phones keep Search behind "More canvas tools").
async function find(page, id, text) {
  await openBoardSearch(page);
  await page.locator("#canvas-find").fill(text);
  await page.locator(`[data-pro=find-result][data-id="${id}"]`).click();
  await expect(page.locator("#canvas-search-panel")).toBeHidden();
}

test("the toolbar is compact, with layer order and delete outside menus", async ({ page }) => {
  await resetBoard();
  await openBoard(page);
  await find(page, "note", "First idea");
  const box = await toolbar(page).boundingBox();
  expect(box.width < 720 && box.height < 55, JSON.stringify(box)).toBe(true);
  await expect(toolbar(page)).toHaveAttribute("role", "toolbar");
  await expect(toolbar(page).locator('[data-selection-menu="more"]')).toHaveCount(0);
  for (const action of ["bring-front", "send-back", "selection-delete"]) {
    const button = toolbar(page).locator(`[data-feature="${action}"]`);
    await expect(button).toBeVisible();
    expect(await button.evaluate((el) => !!el.closest("details"))).toBe(false);
  }
});

test("menus open from the keyboard and Escape returns focus to their button", async ({ page }) => {
  await resetBoard();
  await openBoard(page);
  await find(page, "note", "First idea");
  await menu(page, "arrange").focus();
  await menu(page, "arrange").press("Space");
  await expect(toolbar(page).locator("[data-feature=align-left]")).toBeDisabled();
  await page.keyboard.press("Escape");
  await expect(menu(page, "arrange")).toBeFocused();
});

test("a colour change saves and Ctrl+Z undoes it", async ({ page }) => {
  await resetBoard();
  await openBoard(page);
  await find(page, "note", "First idea");
  await menu(page, "color").click();
  await page.getByRole("button", { name: "Rose", exact: true }).click();
  await expect.poll(async () => (await saved("note")).color).toBe("#f1a9a0");
  await savedLabel(page);
  await page.keyboard.press("Control+z");
  await expect.poll(async () => (await saved("note")).color).toBe("#f5e7a2");
});

test("locking disables text editing and colour until the selection is unlocked", async ({ page }) => {
  await resetBoard();
  await openBoard(page);
  await find(page, "note", "First idea");
  const lock = toolbar(page).locator("[data-feature=lock]");
  await lock.click();
  await expect.poll(async () => (await saved("note")).locked).toBe(true);
  await savedLabel(page);
  await expect(lock).toHaveAttribute("aria-label", "Unlock selection");
  await expect(toolbar(page).locator("[data-pro=inline]")).toBeDisabled();
  await menu(page, "color").click();
  await expect(toolbar(page).locator("details[open]")).toHaveCount(0);
  await lock.click();
  await expect.poll(async () => !!(await saved("note")).locked).toBe(false);
  await savedLabel(page);
});

test("a bulk selection adapts the toolbar and colours, aligns and groups every object", async ({ page }) => {
  await resetBoard();
  await openBoard(page);
  await find(page, "note", "First idea");
  await page.keyboard.press("Control+a");
  await expect(toolbar(page).locator(".selection-filter-total")).toHaveText("4");
  await expect(toolbar(page).locator("[data-pro=inline]")).toHaveCount(0);
  await menu(page, "color").click();
  await page.getByRole("button", { name: "Sky", exact: true }).click();
  await expect.poll(async () => (await current()).nodes.every((n) => n.color === "#aed7dc")).toBe(true);
  await clickControl(toolbar(page).locator("[data-feature=align-center]"));
  await expect.poll(async () => new Set((await current()).nodes.map((n) => n.x + n.w / 2)).size).toBe(1);
  await clickControl(toolbar(page).locator("[data-feature=group]"));
  await expect.poll(async () => (await current()).nodes.every((n) => n.group)).toBe(true);
  await clickControl(toolbar(page).locator("[data-feature=ungroup]"));
  await expect.poll(async () => (await current()).nodes.every((n) => !n.group)).toBe(true);
});

test("layer order and delete apply to the selection, undo restores it, and the result persists", async ({ page }) => {
  // The state a bulk Sky colour leaves behind.
  await resetBoard({ color: "#aed7dc" });
  await openBoard(page);
  await find(page, "note", "First idea");
  await clickControl(toolbar(page).locator("[data-feature=bring-front]"));
  await expect.poll(async () => (await current()).nodes.at(-1).id).toBe("note");
  await savedLabel(page);
  await toolbar(page).locator('[data-feature="send-back"]').click();
  await expect.poll(async () => (await current()).nodes[0].id).toBe("note");
  await toolbar(page).locator('[data-feature="selection-delete"]').click();
  await expect.poll(async () => (await current()).nodes.some((n) => n.id === "note")).toBe(false);
  await page.keyboard.press("Control+z");
  await expect.poll(async () => (await current()).nodes.some((n) => n.id === "note")).toBe(true);
  await savedLabel(page);
  await page.reload();
  await page.locator("#canvas").waitFor();
  await find(page, "note", "First idea");
  expect((await saved("note")).color).toBe("#aed7dc");
});

// Phone width with a fine pointer, as the bounds were set for: on touch phones the 44px
// targets make the toolbar taller.
for (const viewportSize of [{ width: 1600, height: 1100 }, { width: 390, height: 844 }]) test.describe(`${viewportSize.width}px`, () => {
  test.use({ viewportSize });
  test("the toolbar and its menus stay inside the board", async ({ page }) => {
    await resetBoard();
    await openBoard(page);
    const size = page.viewportSize();
    await find(page, "note", "First idea");
    await page.locator("[data-node=note]").click();
    const box = await toolbar(page).boundingBox();
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(size.width);
    expect(box.height, JSON.stringify(box)).toBeLessThan(140);
    for (const action of ["bring-front", "send-back", "selection-delete"]) {
      const button = await toolbar(page).locator(`[data-feature="${action}"]`).boundingBox();
      expect(button && button.x >= 0 && button.x + button.width <= size.width, action).toBe(true);
    }
    const canvas = await page.locator("#canvas").boundingBox();
    for (const key of ["color", "arrange", "text-align"]) {
      await menu(page, key).click();
      // The open menu is positioned on the next frame.
      await expect.poll(async () => {
        const panel = await toolbar(page).locator("details[open] .selection-popover").boundingBox();
        return panel && panel.x >= canvas.x && panel.x + panel.width <= canvas.x + canvas.width && panel.y >= canvas.y && panel.y + panel.height <= canvas.y + canvas.height;
      }, { message: `${key} menu inside the board` }).toBe(true);
      await page.keyboard.press("Escape");
    }
  });
});

test("in dark mode the toolbar has a dark surface", async ({ page }) => {
  await resetBoard();
  await openBoard(page);
  // Since 0.19.31 the former Personal settings are the Settings page's "You" section, and
  // "Back to project" returns to the board.
  await openSettingsPage(page, "personal");
  await page.locator("[name=personal-theme][value=dark]").check();
  await page.locator("[data-action=settings-close]").click();
  await page.locator("#canvas").waitFor();
  await find(page, "note", "First idea");
  await menu(page, "arrange").click();
  expect(await toolbar(page).evaluate((el) => getComputedStyle(el).backgroundColor)).not.toBe("rgb(255, 255, 255)");
});
