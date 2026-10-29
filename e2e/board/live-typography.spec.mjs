// Live typography while editing board text: font family and size apply immediately (from
// the input event, before change/blur), line spacing follows the size, vertical alignment,
// a fixed font size even in a small object, the preview, an unsaved draft and the text
// selection survive styling, grid neighbours keep their own style, the shared dropdown keeps
// keyboard selection, reload, and the phone layout in dark mode across board components.
import { test, expect, onDevices, useApp } from "../fixtures.mjs";
import { newGrid, syncGrid } from "../../public/grid-model.js";
import { savedBoard, seedBoard, findOnBoard, savesSettled } from "../helpers/board-canvas.mjs";

const app = useApp(async (store) => {
  const project = await store.createProject({ title: "Live typography" });
  const task = await store.createTask(project.id, { title: "Task typography", body: "Task description" });
  return { project, task };
});

test.use({ viewportSize: { width: 1600, height: 1100 } });

// The grid's first cell starts as `first` (plus any overrides); its neighbour has its own style.
function fixtures(first = {}) {
  const grid = { id: "grid", type: "grid", x: 140, y: 200, w: 600, h: 360, grid: newGrid(2, 2) };
  grid.grid.cells[0][0].autoFit = true; // Legacy files keep the chosen font size too.
  grid.grid.cells[0][0].text = "Draft\n\n- First item\n- Second item";
  Object.assign(grid.grid.cells[0][0], first);
  grid.grid.cells[0][1] = { text: "Neighbour", fontSize: 18, fontFamily: "Lora" };
  syncGrid(grid);
  return [
    grid,
    ...["sticky", "text", "shape", "frame", "task"].map((type, i) => ({
      id: type,
      type,
      text: `Type ${type}`,
      ...(type === "task" ? { task: app.task.id } : {}),
      x: 900 + i * 400,
      y: 200,
      w: 320,
      h: 240,
    })),
  ];
}

const current = () => savedBoard(app.store, app.project.id);
const node = (page, id) => page.locator(`[data-node="${id}"]`);
const control = (page, key) => page.locator(`.inline-floating-tools [data-text-style="${key}"]`);
const rich = (page) => page.locator(".inline-rich");
const cell = (page) => node(page, "grid").locator('[data-grid-row="0"][data-grid-column="0"]');

async function open(page, first) {
  await seedBoard(app.store, app.project.id, { nodes: fixtures(first), edges: [] });
  await page.goto(`${app.base}/#project/${app.project.id}/board`);
  await page.locator("#canvas").waitFor();
}
// Change one typography control while the editor stays open with the control focused.
async function change(page, key, value, inputOnly = false) {
  const field = key === "verticalAlign" ? page.locator(`.inline-floating-tools [data-text-style="verticalAlign"][value="${value}"]`) : control(page, key);
  await field.focus();
  if (key === "verticalAlign") await field.click();
  else if (inputOnly)
    await field.evaluate((el, value) => {
      el.value = value;
      el.dispatchEvent(new Event("input", { bubbles: true }));
    }, value);
  else if (typeof value === "boolean") await field.setChecked(value);
  else await field.selectOption(value);
  await expect(page.locator(".board-node.inline-editing"), "Editor stays open").toHaveCount(1);
  await expect(field, "Toolbar keeps focus").toBeFocused();
}

test("a grid cell's font, size, line spacing and vertical alignment change live, keeping the editor, selection and neighbour", async ({ page }) => {
  await open(page);
  await findOnBoard(page, "grid", "Draft");
  await cell(page).dblclick();
  await rich(page).evaluate((el) => {
    el.dataset.testEditor = "same";
    const r = document.createRange();
    r.selectNodeContents(el);
    const s = getSelection();
    s.removeAllRanges();
    s.addRange(r);
  });
  const selectedText = await page.evaluate(() => getSelection().toString());
  await change(page, "fontSize", "28", true);
  await expect(rich(page), "Input updates visible cell before change/blur").toHaveCSS("font-size", "28px");
  await expect(rich(page), "Line height scales with the font").toHaveCSS("line-height", "42px");
  await change(page, "fontFamily", "Work Sans");
  await expect(rich(page)).toHaveCSS("font-family", /Work Sans/);
  await expect(rich(page), "Typing surface is preserved").toHaveAttribute("data-test-editor", "same");
  expect(await page.evaluate(() => getSelection().toString()), "Text selection survives styling").toBe(selectedText);
  const sibling = node(page, "grid").locator('[data-grid-row="0"][data-grid-column="1"] .grid-cell-text');
  await expect(sibling).toHaveCSS("font-size", "18px");
  await expect(sibling).toHaveCSS("font-family", /^"?Lora"?$/);
  await change(page, "verticalAlign", "bottom");
  await expect(rich(page)).toHaveCSS("justify-content", "flex-end");
  await change(page, "verticalAlign", "top");
  await change(page, "fontSize", "96");
  await expect(page.locator('[data-text-style="autoFit"]')).toHaveCount(0);
  await expect(rich(page), "Text keeps the chosen size even in a small object").toHaveCSS("font-size", "96px");
});

test("the preview shares the live typography, and styling keeps an unsaved draft", async ({ page }) => {
  await open(page);
  await findOnBoard(page, "grid", "Draft");
  await cell(page).dblclick();
  await change(page, "fontSize", "28");
  await page.locator('[data-pro="inline-preview"]').click();
  await expect(page.locator(".inline-preview")).toHaveCSS("font-size", "28px");
  await change(page, "fontSize", "24");
  await expect(page.locator(".inline-preview"), "Preview shares current typography").toHaveCSS("font-size", "24px");
  await page.locator('[data-pro="inline-preview"]').click();
  await expect(rich(page)).toHaveCSS("font-size", "24px");
  await rich(page).fill("Unsaved draft survives styling");
  const draft = await rich(page).textContent();
  await change(page, "fontSize", "28");
  await expect(rich(page)).toHaveText(draft);
});

test("keyboard selection in the shared size dropdown is not intercepted, and the cell keeps its text and size after reload", async ({ page }) => {
  await open(page, { fontSize: 28 });
  await findOnBoard(page, "grid", "Draft");
  await cell(page).dblclick();
  await rich(page).fill("Unsaved draft survives styling");
  // Keyboard selection in the shared dropdown must not be intercepted by toolbar navigation.
  await control(page, "fontSize").focus();
  await page.keyboard.press("ArrowDown");
  await page.locator("#shared-select-menu").waitFor();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await expect(control(page, "fontSize")).toHaveValue("32");
  await expect(rich(page)).toHaveCSS("font-size", "32px");
  await rich(page).focus();
  await page.keyboard.press("Escape");
  await expect.poll(async () => (await current()).nodes.find((n) => n.id === "grid").grid.cells[0][0].text.trim()).toBe("Unsaved draft survives styling");
  await savesSettled(page);
  await page.reload();
  await findOnBoard(page, "grid", "Unsaved draft");
  expect((await current()).nodes.find((n) => n.id === "grid").grid.cells[0][0].fontSize).toBe(32);
  await expect(node(page, "grid").locator('[data-grid-row="0"][data-grid-column="0"] .grid-cell-text')).toHaveCSS("font-size", "32px");
});

test("notes, text, shapes, frames and task cards update their typography immediately while editing", async ({ page }) => {
  await open(page);
  for (const id of ["sticky", "text", "shape", "frame", "task"]) {
    await findOnBoard(page, id, id === "task" ? "Task typography" : `Type ${id}`);
    await (id === "frame" ? node(page, id).locator(".frame-title") : node(page, id)).dblclick();
    await change(page, "fontSize", "28");
    await change(page, "fontFamily", "Work Sans");
    await expect(rich(page), `${id} updates immediately`).toHaveCSS("font-size", "28px");
    await expect(rich(page)).toHaveCSS("font-family", /Work Sans/);
    await page.keyboard.press("Escape");
  }
});

onDevices(["phone"], () => {
  test.use({ viewportSize: null });
  test("on a phone in dark mode a cell's size changes live, and the font name has more room than the size", async ({ page }) => {
    await open(page);
    await page.evaluate(() => (document.documentElement.dataset.theme = "dark"));
    await findOnBoard(page, "grid", "Draft");
    await cell(page).dblclick();
    await change(page, "fontSize", "20");
    await expect(rich(page)).toHaveCSS("font-size", "20px");
    const family = await control(page, "fontFamily").boundingBox(), size = await control(page, "fontSize").boundingBox();
    expect(family.width > size.width * 2 && size.width <= 56, "Font name has more room than the compact size control").toBe(true);
    await page.keyboard.press("Escape");
  });
});
