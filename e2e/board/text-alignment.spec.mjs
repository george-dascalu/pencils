// Text alignment on the board: horizontal and vertical alignment from icon-only menus, across
// components and their inline editors, Markdown preservation, undo/redo, locked objects in a
// multi-selection, persistence, aligned SVG exports, the menu on phones and in dark mode,
// background deselection (click, touch tap, after panning), focus and a fixed camera for
// duplicate/paste, and undoable clean-up of empty text objects.
import fs from "node:fs/promises";
import { test, expect, onDevices, useApp } from "../fixtures.mjs";
import { clickControl } from "../helpers/menu-controls.mjs";
import { savedBoard, seedBoard, boardSettled, findOnBoard, savesSettled } from "../helpers/board-canvas.mjs";

const words = "A paragraph with enough words to wrap over multiple lines and demonstrate justified text inside a note without changing its Markdown content.";

const app = useApp(async (store) => {
  const project = await store.createProject({ title: "Text alignment" });
  const task = await store.createTask(project.id, { title: "Aligned task", body: "Task **body**\n\n- Keep this list", assignee: "Alice" });
  const nodes = ["sticky", "text", "shape", "frame", "task", "query", "link"].map((type, i) => ({
    id: type,
    type,
    x: (i % 3) * 420,
    y: Math.floor(i / 3) * 350,
    w: 340,
    h: 270,
    text: type === "frame" ? "Frame heading" : type === "query" ? "Live task view" : words,
    ...(type === "task" ? { task: task.id } : {}),
    ...(type === "link" ? { url: "https://example.com" } : {}),
  }));
  nodes.push({ id: "locked", type: "sticky", text: "Locked note", x: 900, y: 750, w: 220, h: 170, locked: true });
  return { project, task, nodes, edges: [{ id: "edge", from: "sticky", to: "text", routing: "curve" }] };
});

test.use({ viewportSize: { width: 1500, height: 1100 } });

const current = () => savedBoard(app.store, app.project.id);
const saved = (id) => current().then((b) => b.nodes.find((n) => n.id === id));
const node = (page, id) => page.locator(`[data-node="${id}"]`);
const rich = (page) => page.locator("#canvas-inline-form .inline-rich");
const searchText = (id) => (id === "task" ? app.task.title : id === "locked" ? "Locked note" : id === "frame" ? "Frame heading" : id === "query" ? "Live task view" : words);
const find = (page, id) => findOnBoard(page, id, searchText(id));

test.beforeEach(async () => {
  await seedBoard(app.store, app.project.id, { nodes: app.nodes, edges: app.edges });
});
async function open(page) {
  await page.goto(`${app.base}/#project/${app.project.id}/board`);
  await page.locator("#canvas").waitFor();
}
async function align(page, value, editing = false) {
  const root = page.locator(editing ? ".inline-floating-tools" : "#selection-tools");
  await root.locator('summary[aria-label="Text alignment"]').click();
  await root.locator(`[data-text-align="${value}"]`).click();
}
// An empty spot on the board, once the camera and cards have settled. The spot keeps a
// margin of empty board around it, so a touch tap is not adjusted onto a nearby control.
async function emptyPoint(page) {
  await boardSettled(page);
  return page.locator("#canvas").evaluate((canvas) => {
    const r = canvas.getBoundingClientRect();
    const empty = (x, y) => {
      const hit = document.elementFromPoint(x, y);
      return hit?.closest("#canvas") && !hit.closest("[data-node],[data-edge],button,input,select,.canvas-panel,.board-tools,.board-controls,#selection-tools,.inline-floating-tools,#canvas-presence");
    };
    for (let y = r.bottom - 130; y > r.top + 80; y -= 50)
      for (let x = r.right - 260; x > r.left + 100; x -= 70)
        if ([[0, 0], [-24, 0], [24, 0], [0, -24], [0, 24]].every(([dx, dy]) => empty(x + dx, y + dy))) return { x, y };
    throw Error("No empty canvas point");
  });
}
async function clear(page) {
  const p = await emptyPoint(page);
  await page.mouse.click(p.x, p.y);
}
async function exportedSVG(page) {
  const download = page.waitForEvent("download");
  await clickControl(page.locator('[data-feature="canvas-svg"]'));
  return fs.readFile(await (await download).path(), "utf8");
}
const expectClear = (page) => expect(page.locator(".board-node.selected,.canvas-edge.selected,.connector-endpoint,.connection-port,#selection-tools")).toHaveCount(0);

test("objects share one padding, and vertical alignment applies from an icon-only text menu", async ({ page }) => {
  await open(page);
  await find(page, "sticky");
  expect(await page.locator(".board-node").evaluateAll((els) => [...new Set(els.map((el) => getComputedStyle(el).padding))])).toEqual(["16px"]);
  const textMenu = page.locator('[data-selection-menu="text-align"]');
  for (const [value, expected] of [["top", "flex-start"], ["middle", "center"], ["bottom", "flex-end"]]) {
    if (!(await textMenu.evaluate((el) => el.open))) await textMenu.locator("summary").click();
    await textMenu.locator(`[data-text-style="verticalAlign"][value="${value}"]`).click();
    await expect.poll(async () => (await saved("sticky")).verticalAlign).toBe(value);
    await expect(node(page, "sticky").locator(".board-node-content")).toHaveCSS("justify-content", expected);
  }
  if (!(await textMenu.evaluate((el) => el.open))) await textMenu.locator("summary").click();
  expect((await textMenu.locator(".selection-popover").boundingBox()).width).toBeLessThanOrEqual(210);
  for (const button of await textMenu.locator("[data-text-align],button[data-text-style=verticalAlign],[data-object-style]").all()) {
    expect((await button.innerText()).trim()).toBe("");
    expect(await button.getAttribute("aria-label")).toBeTruthy();
    await expect(button.locator("svg")).not.toHaveCount(0);
  }
});

test("horizontal alignment applies to a note with undo and redo, persists, and exports as centred SVG text", async ({ page }) => {
  await open(page);
  await find(page, "sticky");
  for (const value of ["center", "right", "justify", "left"]) {
    await align(page, value);
    await expect.poll(async () => (await saved("sticky")).textAlign).toBe(value);
    await expect(node(page, "sticky").locator(".node-text")).toHaveCSS("text-align", value);
  }
  await align(page, "center");
  await expect.poll(async () => (await saved("sticky")).textAlign).toBe("center");
  await page.locator('[data-action="board-undo"]').click();
  await expect.poll(async () => (await saved("sticky")).textAlign).toBe("left");
  await page.locator('[data-action="board-redo"]').click();
  await expect.poll(async () => (await saved("sticky")).textAlign).toBe("center");
  await savesSettled(page);
  await page.reload();
  await find(page, "sticky");
  await expect(node(page, "sticky").locator(".node-text")).toHaveCSS("text-align", "center");
  expect(await exportedSVG(page)).toMatch(/text-anchor="middle"/);
  expect((await saved("sticky")).text).toBe(words);
});

test("the inline editor justifies text without changing its Markdown, and the SVG export justifies it too", async ({ page }) => {
  await open(page);
  await find(page, "sticky");
  await node(page, "sticky").dblclick();
  await rich(page).waitFor();
  await align(page, "justify", true);
  await expect(rich(page)).toBeVisible();
  await expect(rich(page)).toHaveCSS("text-align", "justify");
  await expect(page.locator('#canvas-inline-form [name="text"]')).toHaveValue(words);
  await clear(page);
  await expectClear(page);
  await expect.poll(async () => (await saved("sticky")).textAlign).toBe("justify");
  expect(await exportedSVG(page)).toMatch(/textLength="[0-9]+" lengthAdjust="spacing"/);
});

test("every component aligns its text from the toolbar and from its inline editor, keeping the shared padding", async ({ page }) => {
  await open(page);
  for (const id of ["text", "shape", "frame", "task", "query"]) {
    await find(page, id);
    await align(page, "right");
    await expect.poll(async () => (await saved(id)).textAlign).toBe("right");
    const target = id === "task" ? ".task-title" : id === "query" ? ".query-label" : ".node-text";
    await expect(node(page, id).locator(target)).toHaveCSS("text-align", "right");
    await page.locator('#selection-tools [data-pro="inline"]').click();
    await align(page, "center", true);
    await expect(node(page, id), "Editing preserves shared object padding").toHaveCSS("padding", "16px");
    await expect(rich(page)).toHaveCSS("text-align", "center");
    await clear(page);
    await expectClear(page);
  }
});

test("an emptied frame keeps its surface with no placeholder title", async ({ page }) => {
  await open(page);
  await find(page, "frame");
  await page.locator('#selection-tools [data-pro="inline"]').click();
  await rich(page).fill("");
  await clear(page);
  await expect.poll(async () => (await saved("frame")).text).toBe("");
  await expect(node(page, "frame").locator(".frame-title")).toHaveText("");
  await expect(node(page, "frame")).toBeVisible();
});

test("emptying a text object removes it and its connectors as one undoable change", async ({ page }) => {
  await open(page);
  await find(page, "text");
  await page.locator('#selection-tools [data-pro="inline"]').click();
  await rich(page).fill("   ");
  await clear(page);
  await expect.poll(async () => (await current()).nodes.some((n) => n.id === "text")).toBe(false);
  await expect(node(page, "text")).toHaveCount(0);
  expect((await current()).edges.some((e) => e.from === "text" || e.to === "text")).toBe(false);
  await page.locator('[data-action="board-undo"]').click();
  await expect.poll(async () => (await current()).nodes.some((n) => n.id === "text")).toBe(true);
  expect((await saved("text")).text).toBe(words);
  expect((await current()).edges.some((e) => e.id === "edge")).toBe(true);
  await node(page, "text").waitFor({ state: "attached" });
});

test("abandoning a newly placed empty text object removes it again", async ({ page }) => {
  await open(page);
  const count = (await current()).nodes.length;
  await page.locator('[data-tool="text"]').click();
  await page.locator('[data-tool="text"].active').waitFor();
  const empty = await emptyPoint(page);
  await page.mouse.click(empty.x, empty.y);
  await rich(page).waitFor({ timeout: 5000 });
  await clear(page);
  await savesSettled(page);
  await expect.poll(async () => (await current()).nodes.length).toBe(count);
  expect((await app.store.snapshot(app.project.id)).tasks[0].body).toBe(app.task.body);
});

test("aligning a multi-selection leaves locked objects alone", async ({ page }) => {
  // Every unlocked object starts right-aligned, so each one must change.
  await seedBoard(app.store, app.project.id, { nodes: app.nodes.map((n) => (n.locked ? n : { ...n, textAlign: "right" })), edges: app.edges });
  await open(page);
  await page.locator("#canvas").focus();
  await page.keyboard.press("Control+a");
  await page.locator('[data-selection-menu="filter"] > summary').click();
  await page.locator('[data-selection-type="edge"]').uncheck();
  await page.locator("[data-selection-apply]").click();
  await align(page, "center");
  await expect.poll(async () => (await current()).nodes.filter((n) => !n.locked).every((n) => n.textAlign === "center")).toBe(true);
  expect((await saved("locked")).textAlign).toBeUndefined();
  await clear(page);
  await expectClear(page);
});

test("panning with the hand tool keeps the selection, and a background click clears it", async ({ page }) => {
  await open(page);
  await find(page, "sticky");
  await page.locator('[data-tool="hand"]').click();
  const p = await emptyPoint(page);
  await page.mouse.move(p.x, p.y);
  await page.mouse.down();
  await page.mouse.move(p.x + 30, p.y + 20, { steps: 5 });
  await page.mouse.up();
  await expect(node(page, "sticky")).toHaveClass(/\bselected\b/);
  await clear(page);
  await expectClear(page);
});

test("pressing a connector shows its two endpoints until a background click", async ({ page }) => {
  await open(page);
  await page.locator("#zoom-label").dblclick();
  await boardSettled(page);
  await page.locator('path.canvas-edge[data-edge="edge"]').dispatchEvent("pointerdown", { button: 0 });
  await expect(page.locator(".connector-endpoint[data-edge-end]")).toHaveCount(2);
  await clear(page);
  await expectClear(page);
});

test("duplicate and paste focus the new copy without moving the camera", async ({ page }) => {
  await open(page);
  await find(page, "sticky");
  const camera = await page.locator("#canvas-world").getAttribute("style");
  let ids = (await current()).nodes.map((n) => n.id);
  await page.locator('#selection-tools [data-feature="duplicate"]').click();
  await expect.poll(async () => (await current()).nodes.length).toBe(ids.length + 1);
  const duplicate = (await current()).nodes.find((n) => !ids.includes(n.id));
  await expect.poll(() => page.evaluate(() => document.activeElement.dataset.node)).toBe(duplicate.id);
  expect(await page.locator("#canvas-world").getAttribute("style")).toBe(camera);
  ids = (await current()).nodes.map((n) => n.id);
  await page.keyboard.press("Control+c");
  await page.keyboard.press("Control+v");
  await expect.poll(async () => (await current()).nodes.length).toBe(ids.length + 1);
  const pasted = (await current()).nodes.find((n) => !ids.includes(n.id));
  await expect.poll(() => page.evaluate(() => document.activeElement.dataset.node)).toBe(pasted.id);
  await expect(page.locator(".board-node.selected")).toHaveCount(1);
  expect(await page.locator("#canvas-world").getAttribute("style")).toBe(camera);
});

onDevices(["ipad"], () => {
  test.use({ viewportSize: null });
  test("a touch tap on empty board space clears the selection", async ({ page }) => {
    await open(page);
    await find(page, "sticky");
    await expect(node(page, "sticky")).toHaveClass(/\bselected\b/);
    const touch = await emptyPoint(page);
    await page.touchscreen.tap(touch.x, touch.y);
    await expectClear(page);
  });
});

onDevices(["desktop", "phone"], () => {
  test.use({ viewportSize: null });
  test("the text menu stays on screen in dark mode", async ({ page }) => {
    await open(page);
    await page.evaluate(() => (document.documentElement.dataset.theme = "dark"));
    await find(page, "sticky");
    await page.locator('[data-selection-menu="text-align"] > summary').click();
    const width = page.viewportSize().width;
    await expect.poll(async () => {
      const r = await page.locator('[data-selection-menu="text-align"] .selection-popover').boundingBox();
      return r.x >= 0 && r.x + r.width <= width + 1;
    }, { message: "the text menu stays within the viewport" }).toBe(true);
    await page.keyboard.press("Escape");
  });
});
