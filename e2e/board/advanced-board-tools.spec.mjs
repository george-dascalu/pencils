// Additional board tools: adding several notes in one undoable step, connector bends and
// extra draggable labels, importing an image then cropping, replacing (same ID and layout)
// and resetting it, and the lasso selecting the objects it encloses.
import { test, expect, useApp } from "../fixtures.mjs";
import { newGrid } from "../../public/grid-model.js";
import { savedBoard, seedBoard, findOnBoard } from "../helpers/board-canvas.mjs";

const app = useApp(async (store) => {
  const project = await store.createProject({ title: "Components", key: "COMP" });
  await store.createTask(project.id, { title: "Scheduled task", start: "2026-10-14", due: "2026-10-18" });
  await store.createTask(project.id, { title: "Unscheduled task" });
  const grid = newGrid();
  grid.cells[0][0].text = "Alpha";
  grid.cells[0][1].text = "Beta";
  const board = await seedBoard(store, project.id, {
    nodes: [
      { id: "note", type: "sticky", text: "Typography note", x: 150, y: 240, w: 240, h: 180 },
      { id: "note2", type: "sticky", text: "Second note", x: 500, y: 240, w: 180, h: 120 },
      { id: "shape", type: "shape", text: "Decision", x: 850, y: 240, w: 240, h: 180 },
      { id: "grid", type: "grid", text: "", x: 150, y: 550, w: 540, h: 312, grid },
      { id: "frame", type: "frame", text: "Frame one", x: 1100, y: 600, w: 640, h: 400 },
      { id: "query", type: "query", text: "Live work", x: 850, y: 1100, w: 800, h: 500, query: {}, viewType: "table" },
    ],
    edges: [{ id: "edge", from: "note", to: "note2", label: "Connection" }],
  });
  return { project, board };
});

test.use({ viewportSize: { width: 1600, height: 1100 } });

const current = () => savedBoard(app.store, app.project.id);
// Every test starts from the board as seeded.
test.beforeEach(async () => {
  const { nodes, edges } = app.board;
  await seedBoard(app.store, app.project.id, { nodes, edges });
});
async function open(page) {
  await page.goto(`${app.base}/#project/${app.project.id}/board`);
  await page.locator('[data-node="note"]').waitFor();
}
async function menu(page, key) {
  const m = page.locator(`[data-selection-menu="${key}"]`);
  if ((await m.getAttribute("open")) === null) await m.locator(":scope > summary").click();
  return m;
}
async function dragBy(page, locator, to) {
  const h = await locator.boundingBox();
  await page.mouse.move(h.x + h.width / 2, h.y + h.height / 2);
  await page.mouse.down();
  await page.mouse.move(...to(h), { steps: 8 });
  await page.mouse.up();
}
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aZ1kAAAAASUVORK5CYII=", "base64");

test("several notes are added at once and removed with one undo", async ({ page }) => {
  await open(page);
  const more = page.locator("[data-board-menu=more]");
  if ((await more.getAttribute("open")) === null) await more.locator(":scope > summary").click();
  await page.locator("[data-layout-tool=bulk-notes]").click();
  await page.locator("#bulk-stickies-form textarea").fill("First bulk note\nSecond bulk note");
  await page.locator("#bulk-stickies-form button[type=submit],#bulk-stickies-form .dialog-foot button").click();
  await expect.poll(async () => (await current()).nodes.filter((n) => n.text?.includes("bulk note")).length).toBe(2);
  await page.getByRole("button", { name: "Undo canvas change", exact: true }).click();
  await expect.poll(async () => (await current()).nodes.every((n) => !n.text?.includes("bulk note"))).toBe(true);
});

test("a connector gets a bend and extra labels that can be dragged on the main board", async ({ page }) => {
  await open(page);
  await findOnBoard(page, "note", "Typography");
  await page.keyboard.press("Escape");
  const p = await page.locator("path.canvas-edge[data-edge=edge]").evaluate((el) => {
    const p = el.getPointAtLength(el.getTotalLength() / 2), q = new DOMPoint(p.x, p.y).matrixTransform(el.getScreenCTM());
    return { x: q.x, y: q.y };
  });
  await page.mouse.click(p.x, p.y);
  await page.locator(".connector-tools").waitFor();
  await dragBy(page, page.locator("[data-bend=new]"), (h) => [h.x, h.y + 80]);
  await expect.poll(async () => (await current()).edges[0].bends?.length).toBe(1);
  await menu(page, "label");
  await page.locator("[data-connector-command=add-label]").click();
  await expect.poll(async () => (await current()).edges[0].labels?.length).toBe(1);
  await menu(page, "label");
  await page.locator('[data-extra-label="0"]').fill("Extra context");
  await page.locator('[data-extra-label="0"]').press("Tab");
  await expect.poll(async () => (await current()).edges[0].labels[0].text).toBe("Extra context");
  await dragBy(page, page.locator('[data-edge-label="0"]'), (h) => [h.x + 50, h.y + 60]);
  await expect.poll(async () => (await current()).edges[0].labels[0].y).toBeGreaterThan(24);
});

test("an imported image can be cropped, replaced without changing its ID or layout, and reset", async ({ page }) => {
  await open(page);
  const chooser = page.waitForEvent("filechooser");
  await page.locator(".board-tools [data-feature=image-add]").click();
  await (await chooser).setFiles({ name: "image.png", mimeType: "image/png", buffer: png });
  await expect.poll(async () => (await current()).nodes.some((n) => n.type === "image")).toBe(true);
  const img = (await current()).nodes.find((n) => n.type === "image");
  const image = async () => (await current()).nodes.find((n) => n.id === img.id);
  await findOnBoard(page, img.id, "image.png");
  await menu(page, "geometry");
  await page.locator('[data-crop-side="0"]').evaluate((el) => {
    el.value = "20";
    el.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await expect.poll(async () => (await image()).crop?.[0]).toBe(0.2);
  await menu(page, "geometry");
  const replacement = page.waitForEvent("filechooser");
  await page.locator("[data-image-command=replace]").click();
  await (await replacement).setFiles({ name: "replacement.png", mimeType: "image/png", buffer: png });
  await expect.poll(async () => (await image()).src).not.toBe(img.src);
  const after = await image();
  expect(after.w).toBe(img.w);
  expect(after.x).toBe(img.x);
  expect(after.crop[0]).toBe(0.2);
  await menu(page, "geometry");
  await page.locator("[data-image-command=reset]").click();
  await expect.poll(async () => (await image()).crop ?? null).toBeNull();
});

test("the lasso selects the objects inside a freehand boundary", async ({ page }) => {
  await open(page);
  await findOnBoard(page, "note", "Typography");
  await page.keyboard.press("p");
  await page.locator("[data-pen-mode=lasso]").click();
  const n = await page.locator("[data-node=note]").boundingBox();
  await page.mouse.move(n.x - 15, n.y - 15);
  await page.mouse.down();
  for (const [x, y] of [[n.x + n.width + 15, n.y - 15], [n.x + n.width + 15, n.y + n.height + 15], [n.x - 15, n.y + n.height + 15], [n.x - 15, n.y - 15]])
    await page.mouse.move(x, y, { steps: 5 });
  await page.mouse.up();
  await expect(page.locator("[data-node=note]")).toHaveClass(/\bselected\b/);
});
