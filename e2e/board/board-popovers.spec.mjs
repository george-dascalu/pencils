// Board popovers: board settings apply automatically (no Apply or Cancel), paint live, and undo
// and redo with the board, including browser-local display preferences and Reset, without moving
// the camera. Comments open in a compact, nonmodal panel beside the object that keeps a draft
// while reacting and fits a dark phone screen.
import { test, expect, onDevices, useApp } from "../fixtures.mjs";

const app = useApp(async (store) => {
  const project = await store.createProject({ title: "Popover lab" });
  const b = (await store.snapshot(project.id)).boards[0];
  const board = await store.updateBoard(project.id, b.id, {
    revision: b.revision,
    nodes: [{ id: "note", type: "sticky", text: "Discuss this idea", x: 150, y: 120, w: 220, h: 220 }],
    edges: [],
  });
  return { project, board };
});

const current = async () => (await app.store.snapshot(app.project.id)).boards.find((x) => x.id === app.board.id);
// Every test starts from the seeded board: default settings, one note without comments.
test.beforeEach(async () => {
  const board = await current();
  await app.store.updateBoard(app.project.id, board.id, { revision: board.revision, title: app.board.title, settings: app.board.settings, nodes: app.board.nodes, edges: [] });
});
async function openBoard(page) {
  await page.goto(`${app.base}/#project/${app.project.id}/board`);
  await page.locator("#canvas").waitFor();
  await page.locator("[data-node=note]").waitFor();
}
async function openSettings(page) {
  await page.getByRole("button", { name: "Board settings", exact: true }).click();
  return page.locator("#board-settings-form");
}
const saved = (page) => expect(page.locator("#board-save")).toHaveText("Saved automatically");

test("board settings apply automatically, with undo and redo of the snap and the title", async ({ page }) => {
  await openBoard(page);
  const form = await openSettings(page);
  const snap = form.locator("[name=snap]");
  await expect(form.getByRole("button", { name: /Apply settings|Cancel/ })).toHaveCount(0);
  const reset = await form.locator("[data-board-settings-reset]").boundingBox();
  const close = await form.locator("[data-board-settings-close]").boundingBox();
  expect(reset.x + reset.width <= close.x && Math.abs(reset.y - close.y) < 5, "Reset sits left of Close in one row").toBe(true);
  await snap.uncheck();
  await saved(page);
  await expect.poll(async () => (await current()).settings.snap).toBe(false);
  await page.keyboard.press("Control+z");
  await expect(snap).toBeChecked();
  await expect(form).toBeVisible();
  await page.keyboard.press("Control+Shift+z");
  await expect(snap).not.toBeChecked();
  await page.keyboard.press("Control+z");
  await expect(snap).toBeChecked();
  const title = form.locator("[name=title]");
  await title.fill("Auto renamed");
  await expect(page.locator("#board-select option:checked")).toHaveText("Auto renamed");
  await saved(page);
  await page.keyboard.press("Control+z");
  await expect(title).toHaveValue(app.board.title);
  await page.keyboard.press("Control+Shift+z");
  await expect(title).toHaveValue("Auto renamed");
  await expect.poll(async () => (await current()).title, { message: "the redone title is saved" }).toBe("Auto renamed");
});

test("a continuous slider gesture paints the canvas immediately and saves as one undoable edit", async ({ page }) => {
  await openBoard(page);
  const form = await openSettings(page);
  const spacing = form.locator("[name=spacing]");
  for (const value of ["24", "28", "32"])
    await spacing.evaluate((el, v) => {
      el.value = v;
      el.dispatchEvent(new Event("input", { bubbles: true }));
    }, value);
  expect(await page.locator("#canvas").evaluate((el) => el.style.backgroundSize)).toMatch(/27.2/);
  await spacing.dispatchEvent("change");
  await saved(page);
  await page.keyboard.press("Control+z");
  await expect(spacing, "one undo returns to before the gesture").toHaveValue("20");
});

test("hiding the minimap is a local preference that undo and redo follow", async ({ page }) => {
  await openBoard(page);
  const form = await openSettings(page);
  const minimap = form.locator("[name=show-minimap]");
  await minimap.uncheck();
  await expect(page.locator("#canvas-minimap")).toBeHidden();
  await page.keyboard.press("Control+z");
  await expect(minimap).toBeChecked();
  await expect(page.locator("#canvas-minimap")).toBeVisible();
  await page.keyboard.press("Control+Shift+z");
  await expect(minimap).not.toBeChecked();
});

test("Reset restores shared and local preferences together as one undoable step, without moving the camera", async ({ page }) => {
  await openBoard(page);
  const camera = await page.locator("#canvas-world").getAttribute("style");
  const form = await openSettings(page);
  const minimap = form.locator("[name=show-minimap]");
  const pattern = form.locator("[name=pattern]:checked");
  await minimap.uncheck();
  await form.locator('[name=pattern][value="fine-grid"]').check();
  await saved(page);
  await form.locator("[data-board-settings-reset]").click();
  await saved(page);
  await expect(minimap).toBeChecked();
  await page.keyboard.press("Control+z");
  await expect(pattern).toHaveValue("fine-grid");
  await expect(minimap).not.toBeChecked();
  await page.keyboard.press("Control+Shift+z");
  await expect(pattern).toHaveValue("dots");
  await expect(minimap).toBeChecked();
  await form.locator("[data-board-settings-close]").click();
  await expect(page.locator("#canvas-world"), "settings never move the camera").toHaveAttribute("style", camera);
});

async function openComments(page) {
  await page.locator("[data-node=note]").click();
  await page.locator("#selection-tools [data-pro=comments]").click();
  const panel = page.locator(".board-comments");
  await panel.waitFor();
  return panel;
}

test("comments open beside the object without a modal and keep a draft while reacting", async ({ page }) => {
  await openBoard(page);
  const note = page.locator("[data-node=note]");
  const panel = await openComments(page);
  // Since 0.18.2 the composer is rich text; the Markdown textarea stays hidden.
  const composer = panel.locator(".inline-rich");
  await expect(page.locator("dialog:modal")).toHaveCount(0);
  const pb = await panel.boundingBox(), nb = await note.boundingBox();
  // Since 0.18.4 the resizable comments panel opens at 360 x 480 by default.
  expect(pb.width <= 361 && pb.height > pb.width && pb.x >= nb.x + nb.width, JSON.stringify({ pb, nb })).toBe(true);
  await composer.fill("First comment");
  await composer.press("Control+Enter");
  await expect.poll(async () => (await current()).nodes[0].comments?.length).toBe(1);
  await expect(composer).toHaveText("");
  await composer.fill("Draft to keep");
  // Since 0.18.2 reactions are chosen from the comment's Add reaction picker.
  await panel.getByLabel("Add reaction", { exact: true }).click();
  await panel.getByRole("button", { name: "Thumbs up", exact: true }).click();
  await expect(composer).toHaveText("Draft to keep");
  await panel.getByRole("button", { name: "Thumbs up (1)", exact: true }).click();
  await panel.locator("[data-comments-close]").click();
  await page.locator("#selection-tools [data-pro=comments]").click();
  await expect(composer).toHaveText("Draft to keep");
  await composer.fill("Second comment");
  await panel.getByRole("button", { name: "Add comment", exact: true }).click();
  await expect.poll(async () => (await current()).nodes[0].comments.length).toBe(2);
  await expect(panel.locator(".board-comment")).toHaveCount(2);
});

onDevices(["phone"], () => {
  test("the comments panel fits a dark phone screen and Escape closes it", async ({ page }) => {
    await openBoard(page);
    const panel = await openComments(page);
    await page.evaluate(() => window.PencilsAppearance.write({ theme: "dark" }));
    await expect.poll(async () => {
      const box = await panel.boundingBox();
      return box.x >= 0 && box.x + box.width <= 390 && box.y >= 0 && box.y + box.height <= 844;
    }, { message: "panel inside the phone screen" }).toBe(true);
    await panel.locator(".inline-rich").press("Escape");
    await expect(panel).toHaveCount(0);
  });
});
