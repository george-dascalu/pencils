// Note styles: five note shapes (classic, square, rounded, folded top/bottom) that change only
// the shape, with undo/redo, editing, copy/paste formatting, reload, SVG export, backend
// validation of unknown styles, and the style menu on a phone in the dark palette.
import fs from "node:fs/promises";
import { test, expect, onDevices, useApp } from "../fixtures.mjs";
import { clickControl } from "../helpers/menu-controls.mjs";
import { savedBoard, seedBoard, boardSettled, findOnBoard, savesSettled } from "../helpers/board-canvas.mjs";

const styles = ["classic", "square", "rounded", "fold-top", "fold-bottom"];
const fixtures = styles.map((noteStyle, i) => ({
  id: `note-${i}`,
  type: "sticky",
  text: noteStyle + " note",
  x: 80 + (i % 3) * 280,
  y: 80 + Math.floor(i / 3) * 260,
  w: 240,
  h: 220,
  color: ["#f5e7a2", "#d6e4d3", "#aed7dc", "#d4bee5", "#f1a9a0"][i],
  noteStyle,
}));

const app = useApp(async (store) => {
  const project = await store.createProject({ title: "Note styles" });
  return { project };
});

test.use({ viewportSize: { width: 1500, height: 1000 } });

const nodes = async () => (await savedBoard(app.store, app.project.id)).nodes;
const note = (page) => page.locator('[data-node="note-0"]');

// The first note starts with `firstStyle`; the others keep their own styles.
async function open(page, firstStyle = "classic") {
  await seedBoard(app.store, app.project.id, { nodes: fixtures.map((n, i) => (i ? n : { ...n, noteStyle: firstStyle })), edges: [] });
  await page.goto(`${app.base}/#project/${app.project.id}/board`);
  await note(page).waitFor();
  await boardSettled(page);
}
async function choose(page, value) {
  const menu = page.locator('[data-selection-menu="geometry"]');
  if (!(await menu.evaluate((el) => el.open))) await menu.locator(":scope > summary").click();
  await page.locator(`[data-note-style="${value}"]`).click();
  await expect.poll(async () => (await nodes())[0].noteStyle).toBe(value);
}

test("a note style changes only the note's shape, with undo and redo, for every style", async ({ page }) => {
  await open(page);
  await note(page).click();
  await choose(page, "fold-top");
  await expect(note(page).locator(".note-style-art path")).toHaveCount(3);
  expect((await nodes())[0].text).toBe("classic note");
  expect((await nodes())[0].color).toBe("#f5e7a2");
  await page.locator('[data-action="board-undo"]').click();
  await expect.poll(async () => (await nodes())[0].noteStyle).toBe("classic");
  await expect(note(page).locator(".note-style-art")).toHaveCount(0);
  await page.locator('[data-action="board-redo"]').click();
  await expect.poll(async () => (await nodes())[0].noteStyle).toBe("fold-top");
  for (const value of styles) {
    await choose(page, value);
    await expect(note(page).locator(".note-style-art")).toHaveCount(value === "classic" ? 0 : 1);
  }
});

test("a folded note keeps its fold when edited, its style pastes onto another note, and it exports to SVG", async ({ page }) => {
  await open(page, "fold-bottom");
  await note(page).dblclick();
  await page.locator("#canvas-inline-form .inline-rich").fill("Folded note content");
  await page.keyboard.press("Control+Enter");
  await expect.poll(async () => (await nodes())[0].text).toContain("Folded note content");
  await expect(note(page).locator(".note-style-art")).toHaveCount(1);
  await note(page).click();
  await clickControl(page.locator('[data-object-style="copy"]'));
  await page.locator('[data-node="note-1"]').click();
  await clickControl(page.locator('[data-object-style="paste"]'));
  await expect.poll(async () => (await nodes())[1].noteStyle).toBe("fold-bottom");
  await savesSettled(page);
  await page.reload();
  await note(page).waitFor();
  await expect(note(page).locator(".note-style-art path")).toHaveCount(3);
  const download = page.waitForEvent("download");
  await clickControl(page.locator('[data-feature="canvas-svg"]'));
  const svg = await fs.readFile(await (await download).path(), "utf8");
  expect(svg).toMatch(/fill-opacity=".14"/);
  expect(svg, "Exported note text keeps its readable foreground").toMatch(/<text[^>]+fill="#000000"/);
});

test("the backend rejects unknown note styles", async () => {
  const saved = await seedBoard(app.store, app.project.id, { nodes: fixtures, edges: [] });
  await expect(
    app.store.updateBoard(app.project.id, saved.id, { revision: saved.revision, nodes: saved.nodes.map((n) => ({ ...n, noteStyle: "invalid" })), edges: saved.edges }),
  ).rejects.toThrow(/Invalid object geometry/);
});

onDevices(["phone"], () => {
  test.use({ viewportSize: null });
  test("the note style menu fits the screen in the dark palette", async ({ page }) => {
    await open(page, "fold-bottom");
    await page.evaluate(() => window.PencilsAppearance.write({ theme: "dark" }));
    // Find the note to bring the appearance menu into the mobile viewport.
    await findOnBoard(page, "note-0", "classic note");
    await choose(page, "fold-top");
    const menu = page.locator('[data-selection-menu="geometry"]');
    if (!(await menu.evaluate((e) => e.open))) await menu.locator(":scope > summary").click();
    await expect.poll(async () => {
      const bounds = await menu.locator(".selection-popover").boundingBox();
      return bounds.x >= 0 && bounds.x + bounds.width <= 391;
    }, { message: "the style menu stays within the screen" }).toBe(true);
  });
});
