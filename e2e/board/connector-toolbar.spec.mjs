// The selected connector toolbar: inline labels from the keyboard, every endpoint shape,
// routing, line styles and thickness, colours, undo, persistence with the native Canvas
// fallback, SVG/PNG exports, deleting with undo, and the toolbar on phones and in dark mode.
import fs from "node:fs/promises";
import path from "node:path";
import { test, expect, onDevices, useApp } from "../fixtures.mjs";
import { savedBoard, seedBoard, presetCamera, connectorPoint, savesSettled } from "../helpers/board-canvas.mjs";

const notes = [
  { id: "one", type: "sticky", text: "First idea", x: 100, y: 230, w: 220, h: 180, color: "#f5e7a2" },
  { id: "two", type: "sticky", text: "Second idea", x: 600, y: 230, w: 220, h: 180 },
];

const app = useApp(async (store) => {
  const project = await store.createProject({ title: "Colours" });
  return { project, board: (await store.snapshot(project.id)).boards[0] };
});

const current = () => savedBoard(app.store, app.project.id, app.board.id);
const edge = () => current().then((b) => b.edges[0]);

async function open(page, edgeProps = { label: "Connect" }) {
  await seedBoard(app.store, app.project.id, { nodes: notes, edges: [{ id: "edge", from: "one", to: "two", ...edgeProps }] }, app.board.id);
  await page.goto(`${app.base}/#project/${app.project.id}/board`);
  await page.locator('[data-node="one"]').waitFor();
}
async function selectEdge(page) {
  const p = await connectorPoint(page, "edge", 0.5);
  await page.mouse.click(p.x, p.y);
  await page.getByRole("toolbar", { name: "Selected connector" }).waitFor();
}
async function menu(page, key) {
  const m = page.locator(`[data-selection-menu="${key}"]`);
  if ((await m.getAttribute("open")) === null) await m.locator("summary").click();
  return m;
}
async function head(page, key, value) {
  await menu(page, key);
  await page.locator(`[data-edge-head="${key}"][data-value="${value}"]`).click();
  await expect.poll(async () => (await edge())[key]).toBe(value);
}
const labelField = (page) => page.locator('[data-edge-field="label"]');

test.describe("desktop", () => {
  test.use({ viewportSize: { width: 1500, height: 1100 } });

  test("Enter labels the selected connector inline, including clearing and labelling an empty one", async ({ page }) => {
    await open(page);
    await selectEdge(page);
    await expect(page.locator("dialog")).toHaveCount(0);
    await page.keyboard.press("Enter");
    await expect(labelField(page)).toBeFocused();
    await page.keyboard.press("Control+A");
    await page.keyboard.type("Keyboard connection");
    await page.keyboard.press("Enter");
    await expect.poll(async () => (await edge()).label).toBe("Keyboard connection");
    await expect(page.locator(".edge-label")).toHaveText("Keyboard connection");
    // The same shortcut also labels a previously empty arrow.
    await selectEdge(page);
    await page.keyboard.press("Enter");
    await labelField(page).fill("");
    await labelField(page).press("Enter");
    await expect.poll(async () => (await edge()).label).toBeFalsy();
    await selectEdge(page);
    await page.keyboard.press("Enter");
    await expect(labelField(page)).toBeFocused();
    await page.keyboard.type("New arrow label");
    await page.keyboard.press("Enter");
    await expect.poll(async () => (await edge()).label).toBe("New arrow label");
    await savesSettled(page);
    await page.reload();
    await selectEdge(page);
    await expect(page.locator(".edge-label")).toHaveText("New arrow label");
  });

  test("endpoint shapes, routing, line style, thickness, label and colour apply from the toolbar, persist, and undo", async ({ page }) => {
    await open(page);
    await selectEdge(page);
    for (const kind of ["triangle", "circle", "circle-outline", "diamond", "diamond-outline", "bar", "none", "arrow"]) {
      await head(page, "toEnd", kind);
      const marker = await page.locator("path.canvas-edge").getAttribute("marker-end");
      if (kind === "none") expect(marker).toBeNull();
      else await expect(page.locator(marker.slice(4, -1))).not.toHaveCount(0);
    }
    await head(page, "fromEnd", "diamond");
    await head(page, "toEnd", "triangle");
    await expect(page.locator('[data-selection-menu="line"]')).toHaveCount(0);
    await expect(page.locator('[data-selection-menu="width"] > summary svg').first()).toBeVisible();
    for (const [key, values] of [["routing", ["straight", "curve", "elbow"]], ["lineStyle", ["dotted", "solid", "dashed"]]]) {
      for (const value of values) {
        const control = await menu(page, key);
        await page.locator(`[data-edge-choice="${key}"][data-value="${value}"]`).click();
        await expect.poll(async () => (await edge())[key]).toBe(value);
        expect((await control.locator("summary").getAttribute("title")).toLowerCase()).toMatch(new RegExp(`${value}$`));
        await expect(control).not.toHaveAttribute("open");
      }
    }
    await menu(page, "width");
    expect(await page.locator('[data-edge-choice="width"] path').evaluateAll((paths) => paths.map((p) => getComputedStyle(p).strokeWidth))).toEqual(["1px", "2px", "3px", "5px"]);
    await page.getByRole("button", { name: "Thickness: 3 px", exact: true }).click();
    await expect.poll(async () => (await edge()).width).toBe(3);
    await menu(page, "label");
    await labelField(page).fill("A clear connection");
    await labelField(page).press("Enter");
    await expect.poll(async () => (await edge()).label).toBe("A clear connection");
    await menu(page, "label");
    await labelField(page).fill("Saved on click outside");
    await page.locator('[data-pro="search-toggle"]').click();
    await expect.poll(async () => (await edge()).label).toBe("Saved on click outside");
    await page.keyboard.press("Escape");
    await selectEdge(page);
    await menu(page, "color");
    await page.locator('[data-color-choice="#f1a9a0"]').click();
    await expect.poll(async () => (await edge()).color).toBe("#f1a9a0");
    const rendered = await page.evaluate(() => {
      const el = document.querySelector("path.canvas-edge");
      return { width: getComputedStyle(el).strokeWidth, dash: getComputedStyle(el).strokeDasharray, marker: el.getAttribute("marker-end") };
    });
    expect(rendered.width).toBe("3px");
    expect(rendered.dash).not.toBe("none");
    await expect(page.locator(rendered.marker.slice(4, -1) + " g")).toHaveAttribute("fill", "#f1a9a0");

    await savesSettled(page);
    await page.reload();
    await page.locator("#canvas").waitFor();
    await selectEdge(page);
    const e = await edge();
    expect([e.fromEnd, e.toEnd, e.width, e.label]).toEqual(["diamond", "triangle", 3, "Saved on click outside"]);
    // Plain Canvas readers see a standard arrow; Pencils keeps its own endpoint in `pencils`.
    const native = JSON.parse(await fs.readFile(path.join(app.root, (await current()).file), "utf8"));
    expect(native.edges[0].fromEnd).toBe("arrow");
    expect(native.edges[0].pencils.fromEnd).toBe("diamond");
    await head(page, "toEnd", "circle");
    await page.getByRole("button", { name: "Undo canvas change", exact: true }).click();
    await expect.poll(async () => (await edge()).toEnd).toBe("triangle");
  });

  test("SVG and PNG exports use the same coloured markers and stroke settings", async ({ page }) => {
    await open(page, { label: "Saved on click outside", fromEnd: "diamond", toEnd: "triangle", lineStyle: "dashed", width: 3, color: "#f1a9a0" });
    // A selected connector's highlight is not exported.
    await selectEdge(page);
    const tools = page.locator(".board-toolbar details").filter({ has: page.locator('[data-feature="canvas-svg"]') });
    await tools.locator("summary").click();
    const downloadPromise = page.waitForEvent("download");
    await page.locator('[data-feature="canvas-svg"]').click();
    const svg = await fs.readFile(await (await downloadPromise).path(), "utf8");
    expect(svg).not.toMatch(/connector-selection/);
    expect(svg).toMatch(/stroke-dasharray:8 5/);
    expect(svg).toMatch(/fill="#f1a9a0"/);
    expect(svg).toMatch(/M1 5L5 1L9 5L5 9Z/);
    if ((await tools.getAttribute("open")) === null) await tools.locator("summary").click();
    const pngPromise = page.waitForEvent("download");
    await page.locator('[data-feature="canvas-png"]').click();
    expect((await fs.stat(await (await pngPromise).path())).size).toBeGreaterThan(1000);
  });

  test("deleting a connector from its toolbar can be undone", async ({ page }) => {
    await open(page, { label: "Connect", toEnd: "triangle" });
    await selectEdge(page);
    await page.getByRole("button", { name: "Delete connector", exact: true }).click();
    await expect.poll(async () => (await current()).edges.length).toBe(0);
    await page.getByRole("button", { name: "Undo canvas change", exact: true }).click();
    await expect.poll(async () => (await current()).edges.length).toBe(1);
    expect((await edge()).toEnd).toBe("triangle");
  });
});

// The selected connector's toolbar and its endpoint menu stay inside the board.
onDevices(["desktop", "phone"], (device) => {
  test("the connector toolbar and its menus stay on screen", async ({ page }) => {
    // Phones start zoomed out so the whole connector is on screen to select.
    if (device === "phone") await presetCamera(page, app.board.id, { x: -40, y: 0, z: 0.45 });
    await open(page);
    if (device === "phone") await page.evaluate(() => (document.documentElement.dataset.theme = "dark"));
    await selectEdge(page);
    await menu(page, "toEnd");
    const { width, height } = page.viewportSize();
    const pop = page.locator('[data-selection-menu="toEnd"] .selection-popover');
    await expect.poll(async () => {
      const bar = await page.locator("#selection-tools").boundingBox(), box = await pop.boundingBox();
      return bar.x >= 0 && bar.x + bar.width <= width + 1 && box.x >= 0 && box.x + box.width <= width + 1 && box.y >= 0 && box.y + box.height <= height + 1;
    }, { message: "the toolbar and its endpoint menu stay within the viewport" }).toBe(true);
    await page.keyboard.press("Escape");
  });
});
