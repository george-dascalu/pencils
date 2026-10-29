// Selecting arrows (connectors): modifier clicks, mixed arrow and card selection, one shared
// highlight overlay, the marquee, select all, the selection filter, shared styles, nudging
// bends, duplicate and copy/paste, deletion and undo, a fixed camera, and the phone layout.
import { test, expect, onDevices, useApp } from "../fixtures.mjs";
import { savedBoard, seedBoard, connectorPoint } from "../helpers/board-canvas.mjs";

const nodes = [
  { id: "one", type: "sticky", text: "First idea", x: 100, y: 230, w: 220, h: 180, color: "#f5e7a2" },
  { id: "two", type: "sticky", text: "Second idea", x: 600, y: 230, w: 220, h: 180 },
];
const edges = [
  { id: "edge", from: "one", to: "two", routing: "straight" },
  { id: "other", from: "one", to: "two", fromSide: "bottom", toSide: "bottom", bends: [{ x: 450, y: 500 }] },
];

const app = useApp(async (store) => {
  const project = await store.createProject({ title: "Colours" });
  return { project, board: (await store.snapshot(project.id)).boards[0] };
});

test.use({ viewportSize: { width: 1500, height: 1100 } });

const current = () => savedBoard(app.store, app.project.id, app.board.id);
async function open(page) {
  await seedBoard(app.store, app.project.id, { nodes, edges }, app.board.id);
  await page.goto(`${app.base}/#project/${app.project.id}/board`);
  await page.locator('[data-node="one"]').waitFor();
}
async function selectArrow(page, id, modifier) {
  const p = await connectorPoint(page, id, 0.35);
  if (modifier) await page.keyboard.down(modifier);
  await page.mouse.click(p.x, p.y);
  if (modifier) await page.keyboard.up(modifier);
}
const selectedEdges = (page) => page.locator("path.canvas-edge.selected").evaluateAll((els) => els.map((e) => e.dataset.edge).sort());
const selectedNodes = (page) => page.locator(".board-node.selected").evaluateAll((els) => els.map((e) => e.dataset.node).sort());
// Selected arrows share one highlight overlay; list the arrows it draws.
const highlightedEdges = (page) =>
  page.locator("#canvas-lines").evaluate((svg) => {
    const halos = svg.querySelectorAll(".connector-selection");
    if (halos.length > 1) throw new Error("Connector highlights must share one overlay");
    const path = halos[0]?.getAttribute("d") || "";
    return [...svg.querySelectorAll(".canvas-edge.selected")].filter((el) => path.includes(el.getAttribute("d"))).map((el) => el.dataset.edge).sort();
  });
const selection = async (page, expectedEdges, expectedNodes) => {
  await expect.poll(() => selectedEdges(page)).toEqual(expectedEdges);
  if (expectedNodes) await expect.poll(() => selectedNodes(page)).toEqual(expectedNodes);
};
const camera = (page) => page.locator("#canvas-world").getAttribute("style");
const filter = (page) => page.locator('[data-selection-menu="filter"] > summary').click();
const undo = (page) => page.getByRole("button", { name: "Undo canvas change", exact: true }).click();
async function selectAll(page) {
  await page.locator("#canvas").focus();
  await page.keyboard.press("Control+a");
}
const edgeCount = async () => (await current()).edges.length;

test("modifier clicks build a mixed arrow and card selection with shared styles, filters and background deselection", async ({ page }) => {
  await open(page);
  await selectArrow(page, "edge");
  await selection(page, ["edge"]);
  await selectArrow(page, "other", "Shift");
  await selection(page, ["edge", "other"]);
  await expect.poll(() => highlightedEdges(page)).toEqual(["edge", "other"]);
  await expect(page.locator(".connector-endpoint")).toHaveCount(0);
  // Styles apply to every selected arrow.
  await page.locator('[data-selection-menu="width"] > summary').click();
  await page.getByRole("button", { name: "Thickness: 5 px", exact: true }).click();
  await expect.poll(async () => (await current()).edges.every((e) => e.width === 5)).toBe(true);
  await page.locator('[data-selection-menu="toEnd"] > summary').click();
  await page.locator('[data-edge-head="toEnd"][data-value="diamond"]').click();
  await expect.poll(async () => (await current()).edges.every((e) => e.toEnd === "diamond")).toBe(true);
  // Control-click removes an arrow; Shift-click on a card adds it.
  await selectArrow(page, "edge", "Control");
  await selection(page, ["other"]);
  await expect.poll(() => highlightedEdges(page)).toEqual(["other"]);
  await page.locator('[data-node="one"]').click({ modifiers: ["Shift"], position: { x: 60, y: 20 } });
  await selection(page, ["other"], ["one"]);
  await expect(page.locator(".selection-filter-total")).toHaveText("2");
  await filter(page);
  await page.locator('[data-selection-only="edge"]').click();
  await selection(page, ["other"], []);
  await filter(page);
  await page.locator("[data-selection-restore]").click();
  await selection(page, ["other"], ["one"]);
  // Background click clears both selection kinds.
  const canvas = await page.locator("#canvas").boundingBox();
  await page.mouse.click(canvas.x + canvas.width - 250, canvas.y + 100);
  await selection(page, [], []);
  await expect.poll(() => highlightedEdges(page)).toEqual([]);
});

test("a selection box includes the contained arrow along with its cards", async ({ page }) => {
  await open(page);
  const first = await page.locator('[data-node="one"]').boundingBox(), last = await page.locator('[data-node="two"]').boundingBox();
  await page.mouse.move(first.x - 10, first.y - 20);
  await page.mouse.down();
  await page.mouse.move(last.x + last.width + 10, last.y + last.height + 10, { steps: 8 });
  await page.mouse.up();
  await selection(page, ["edge"], ["one", "two"]);
  await expect.poll(() => highlightedEdges(page)).toEqual(["edge"]);
});

test("select all includes both arrows, and nudging moves their bends with undo", async ({ page }) => {
  await open(page);
  await selectAll(page);
  await selection(page, ["edge", "other"], ["one", "two"]);
  await page.keyboard.press("ArrowRight");
  await expect.poll(async () => (await current()).edges.find((e) => e.id === "other").bends[0].x).toBe(455);
  await undo(page);
  await expect.poll(async () => (await current()).edges.find((e) => e.id === "other").bends[0].x).toBe(450);
});

test("duplicating filtered arrows keeps the camera, and deleting them keeps the cards", async ({ page }) => {
  await open(page);
  await selectAll(page);
  await selection(page, ["edge", "other"], ["one", "two"]);
  await filter(page);
  await page.locator('[data-selection-only="edge"]').click();
  await selection(page, ["edge", "other"], []);
  const beforeCamera = await camera(page);
  await page.locator("#canvas").focus();
  await page.keyboard.press("Control+d");
  await expect.poll(edgeCount).toBe(4);
  expect(await selectedEdges(page)).toHaveLength(2);
  expect(await camera(page)).toBe(beforeCamera);
  await page.keyboard.press("Delete");
  await expect.poll(edgeCount).toBe(2);
  expect((await current()).nodes).toHaveLength(2);
  await undo(page);
  await expect.poll(edgeCount).toBe(4);
  await undo(page);
  await expect.poll(edgeCount).toBe(2);
});

test("copying and pasting arrows selects the copies without adding cards or moving the camera", async ({ page }) => {
  await open(page);
  const beforeCamera = await camera(page);
  await selectArrow(page, "edge");
  await selectArrow(page, "other", "Shift");
  await selection(page, ["edge", "other"]);
  await page.keyboard.press("Control+c");
  await page.keyboard.press("Control+v");
  await expect.poll(edgeCount).toBe(4);
  expect(await selectedEdges(page)).toHaveLength(2);
  expect((await current()).nodes).toHaveLength(2);
  expect(await camera(page)).toBe(beforeCamera);
  await page.keyboard.press("Delete");
  await expect.poll(edgeCount).toBe(2);
});

test("deleting cards and arrows together, then one undo, restores the linked graph", async ({ page }) => {
  await open(page);
  await selectAll(page);
  await selection(page, ["edge", "other"], ["one", "two"]);
  await page.keyboard.press("Delete");
  await expect.poll(async () => (await current()).nodes.length).toBe(0);
  expect((await current()).edges).toHaveLength(0);
  await undo(page);
  await expect.poll(async () => (await current()).nodes.length).toBe(2);
  expect((await current()).edges).toHaveLength(2);
});

onDevices(["phone"], () => {
  test.use({ viewportSize: null });
  test("the arrow selection toolbar stays inside the board in dark mode", async ({ page }) => {
    await open(page);
    await selectAll(page);
    await filter(page);
    await page.locator('[data-selection-only="edge"]').click();
    await selection(page, ["edge", "other"], []);
    await page.evaluate(() => (document.documentElement.dataset.theme = "dark"));
    await expect.poll(async () => {
      const tools = await page.locator("#selection-tools").boundingBox(), canvas = await page.locator("#canvas").boundingBox();
      return tools.x >= canvas.x && tools.x + tools.width <= canvas.x + canvas.width + 1;
    }, { message: "the selection toolbar stays within the board" }).toBe(true);
    await expect.poll(() => highlightedEdges(page)).toEqual(["edge", "other"]);
  });
});
