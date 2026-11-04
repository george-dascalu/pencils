// F0.21-58: every object and connector toolbar shares one scrolling line on every device.
import { test, expect, onDevices, useApp } from "../fixtures.mjs";
import { findOnBoard } from "../helpers/board-canvas.mjs";
import { newGrid } from "../../public/grid-model.js";

const app = useApp(async (store) => {
  const project = await store.createProject({ title: "Toolbar rows" });
  const task = await store.createTask(project.id, { title: "Write specification" });
  const b = (await store.snapshot(project.id)).boards[0];
  const board = await store.updateBoard(project.id, b.id, {
    revision: b.revision,
    nodes: [
      { id: "frame", type: "frame", text: "Slide one", x: 0, y: 0, w: 900, h: 600 },
      { id: "note", type: "sticky", text: "First idea", x: 80, y: 150, w: 240, h: 200, color: "#f5e7a2" },
      { id: "task-a", type: "task", task: task.id, x: 420, y: 150, w: 310, h: 300 },
      { id: "text", type: "text", text: "A loose thought", x: 1100, y: 150, w: 300, h: 150 },
      { id: "grid", type: "grid", x: 1500, y: 150, w: 600, h: 400, grid: { ...newGrid(), title: "Research grid" } },
    ],
    edges: [{ id: "e1", from: "note", to: "task-a" }],
  });
  return { project, board };
});
const toolbar = (page) => page.locator("#selection-tools");
const rows = (page) => toolbar(page).locator(":scope > .selection-row:visible");
// Every visible child of a row sits on one line, and the row scrolls sideways when it must.
async function oneLine(page, index, label) {
  const row = rows(page).nth(index);
  const shape = await row.evaluate((el) => {
    // Children share a line when their centres line up (a label is shorter than a button).
    const centres = [...el.children].filter((c) => c.getClientRects().length).map((c) => { const r = c.getBoundingClientRect(); return Math.round(r.top + r.height / 2); });
    return { lines: new Set(centres).size, overflow: getComputedStyle(el).overflowX, height: el.getBoundingClientRect().height };
  });
  expect(shape.lines, `${label}: row ${index + 1} is one line`).toBe(1);
  expect(shape.overflow, `${label}: row ${index + 1} scrolls sideways`).toBe("auto");
  return shape.height;
}
async function check(page, label, { common, specific }) {
  await toolbar(page).waitFor();
  const count = await rows(page).count();
  expect(count, `${label}: exactly one scrolling row`).toBe(1);
  let tallest = 0;
  for (let i = 0; i < count; i++) tallest = Math.max(tallest, await oneLine(page, i, label));
  const deletion = toolbar(page).locator('[data-feature="selection-delete"], [data-action="edge-delete"]');
  await expect(rows(page).last().locator(':scope > :last-child').locator('[data-feature="selection-delete"], [data-action="edge-delete"]')).toHaveCount(1);
  const color = await deletion.evaluate(el => getComputedStyle(el).color);
  const rgb = color.match(/\d+/g).map(Number);expect(rgb[0]).toBeGreaterThan(rgb[1]);expect(rgb[0]).toBeGreaterThan(rgb[2]);
  const box = await toolbar(page).boundingBox();
  expect(box.height, `${label}: no second line`).toBeLessThanOrEqual(tallest + 14);
  await expect(toolbar(page)).toHaveCSS("flex-wrap", "nowrap");
  for (const selector of [...common, ...specific]) await expect(rows(page).first().locator(selector), `${label}: ${selector} in the shared row`).toHaveCount(1);
}

onDevices(["desktop", "ipad", "ipad-portrait", "phone", "small"], () => test("keyboard navigation reaches both ends of one scrolling toolbar and retains touch targets @gate", async ({ page, device }) => {
  await page.goto(`${app.base}/#project/${app.project.id}/board/${app.board.id}`);
  await findOnBoard(page, "note", "First idea");
  await expect(rows(page)).toHaveCount(1);
  const row = rows(page).first();
  await expect(row).toHaveCSS("flex-wrap", "nowrap");
  if (device !== "desktop") await expect(row).toHaveCSS("scrollbar-width", "none");
  const first = row.locator("button:visible, summary:visible").first();
  const last = row.locator('[data-feature="selection-delete"]');
  await first.focus();
  await page.keyboard.press("End");
  await expect(last).toBeFocused();
  const fullyVisible = async locator => locator.evaluate(el => {
    const r=el.getBoundingClientRect(),s=el.closest('.selection-row').getBoundingClientRect();
    return r.left>=s.left && r.right<=s.right && r.top>=s.top && r.bottom<=s.bottom;
  });
  await expect.poll(()=>fullyVisible(last)).toBe(true);
  await page.keyboard.press("Home");
  await expect(first).toBeFocused();
  await expect.poll(()=>fullyVisible(first)).toBe(true);
  const targets = await row.locator(":scope > .selection-group > button, :scope > .selection-group > details > summary, :scope > details > summary").evaluateAll(els=>els.filter(el=>el.getClientRects().length).map(el=>el.getBoundingClientRect().height));
  expect(targets.every(height=>height >= (device === "desktop" ? 32 : 44))).toBe(true);
}));

onDevices(["desktop", "ipad", "ipad-portrait", "phone", "small"], () => test("each selection shows all common and type-specific tools on one scrolling line @gate", async ({ page, device }) => {
  await page.goto(`${app.base}/#project/${app.project.id}/board/${app.board.id}`);
  await page.locator("#canvas").waitFor();
  await findOnBoard(page, "note", "First idea");
  for (const theme of ["light", "dark"]) for (const density of ["comfortable", "compact"]) {
    await page.evaluate(({theme,density})=>window.PencilsAppearance.write({theme,density}),{theme,density});
    await check(page, `${device} ${theme} ${density} note`, { common: ["[data-selection-menu=convert]", "[data-feature=duplicate]"], specific: ["[data-selection-menu=text-align]"] });
  }
  await page.evaluate(()=>window.PencilsAppearance.write({density:"comfortable"}));
  await check(page, `${device} note`, { common: ["[data-selection-menu=convert]", "[data-selection-menu=layer-order]", "[data-feature=duplicate]"], specific: ["[data-selection-menu=text-align]"] });
  await page.screenshot({path:test.info().outputPath(`note-toolbar-${device}.png`)});
  await findOnBoard(page, "task-a", "Write specification");
  await check(page, `${device} task`, { common: [], specific: ["[data-selection-menu=text-align]"] });
  await findOnBoard(page, "grid", "Research grid");
  await check(page, `${device} grid`, { common: ["[data-feature=duplicate]"], specific: ["[data-selection-menu=text-align]"] });
  await findOnBoard(page, "frame", "Slide one");
  await check(page, `${device} frame`, { common: ["[data-feature=lock]"], specific: ["[data-feature=frame-fit]", "[data-selection-menu=frame-size]"] });
  if (device !== "desktop" && await rows(page).first().evaluate(el=>el.scrollWidth > el.clientWidth)) {
    // The toolbar scrolls instead of wrapping and retains its offset after an edit.
    const row = rows(page).first();
    const rowId = await row.getAttribute("id");
    const hints = toolbar(page).locator(`[data-scroll-toolbar="${rowId}"]`);
    await expect(hints.locator('[data-toolbar-scroll="end"]')).toBeVisible();
    await hints.locator('[data-toolbar-scroll="end"]').tap();
    await expect.poll(()=>row.evaluate(el=>el.scrollLeft)).toBeGreaterThan(0);
    const box = await toolbar(page).boundingBox();
    expect(box.x >= 0 && box.x + box.width <= page.viewportSize().width, JSON.stringify(box)).toBe(true);
    // A change rebuilds the toolbar; the row stays where it was scrolled to.
    const lock = row.locator("[data-feature=lock]");
    await lock.scrollIntoViewIfNeeded();
    const scrolledTo = await row.evaluate(el=>el.scrollLeft);
    await lock.click();
    await expect(rows(page).first().locator("[data-feature=lock]")).toHaveAttribute("aria-pressed", "true");
    await expect.poll(()=>rows(page).first().evaluate(el=>el.scrollLeft), "the scroll survives a rebuild").toBe(scrolledTo);
    await rows(page).first().locator("[data-feature=lock]").click();
    await expect(rows(page).first().locator("[data-feature=lock]")).toHaveAttribute("aria-pressed", "false");
    // An open menu follows its button when the row scrolls: opened with the row scrolled to its
    // end, it moves with the button when the row returns to the start.
    const sizeMenu = rows(page).first().locator("[data-selection-menu=frame-size]");
    await rows(page).first().evaluate((el) => (el.scrollLeft = el.scrollWidth));
    await sizeMenu.locator("summary").click();
    const panel = sizeMenu.locator(".selection-popover"), summary = sizeMenu.locator("summary");
    await expect(panel).toBeVisible();
    // Beside its button, or as near as the board's edge allows.
    const aligned = async () => {
      const [p, s, c] = [await panel.boundingBox(), await summary.boundingBox(), await page.locator("#canvas").boundingBox()];
      const expected = Math.max(c.x + 8, Math.min(s.x, Math.min(page.viewportSize().width, c.x + c.width) - p.width - 8));
      return Math.abs(p.x - expected) <= 1;
    };
    await expect.poll(aligned, "positioned beside its button").toBe(true);
    const before = (await summary.boundingBox()).x;
    await rows(page).first().evaluate((el) => (el.scrollLeft = 0));
    await expect.poll(async () => (await summary.boundingBox()).x, "the button moved with the row").not.toBe(before);
    await expect.poll(aligned, "the menu follows").toBe(true);
    await page.keyboard.press("Escape");
  }
  // Select all takes the connector too: the objects' tools stay, and duplicate and delete cover
  // the connector (board sweep T95, board-sweep-fixes.spec.mjs).
  await page.keyboard.press("Control+a");
  await check(page, `${device} all`, { common: ["[data-feature=duplicate]", "[data-feature=lock]", ".selection-filter-total"], specific: [] });
  // A connector keeps its endpoints, line tools and common actions on the same line.
  await page.keyboard.press("Escape");
  await page.locator('[data-edge="e1"]').first().click({ force: true });
  await check(page, `${device} connector`, { common: ["[data-feature=duplicate]"], specific: ["[data-selection-menu=dependency]", '[role=group][aria-label="Endpoints"]'] });
  await page.screenshot({path:test.info().outputPath(`object-toolbar-${device}.png`)});
}));
