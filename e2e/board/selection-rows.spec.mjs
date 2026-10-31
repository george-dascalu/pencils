// Owner request (T20/T21, 31 October 2026): the selected object's toolbar has at most two rows,
// each one line that scrolls sideways: common tools (edit, colour, comment, organise, layer
// order, duplicate, lock, delete) above, and the selected type's own tools below.
import { test, expect, onDevices, useApp } from "../fixtures.mjs";
import { findOnBoard } from "../helpers/board-canvas.mjs";

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
  expect(count, `${label}: at most two rows`).toBeLessThanOrEqual(2);
  expect(count, `${label}: at least one row`).toBeGreaterThanOrEqual(1);
  let tallest = 0;
  for (let i = 0; i < count; i++) tallest = Math.max(tallest, await oneLine(page, i, label));
  const box = await toolbar(page).boundingBox();
  expect(box.height, `${label}: no third line`).toBeLessThanOrEqual(2 * tallest + 20);
  for (const selector of common) await expect(rows(page).first().locator(selector), `${label}: ${selector} in the common row`).toHaveCount(1);
  for (const selector of specific) await expect(rows(page).nth(1).locator(selector), `${label}: ${selector} in the type's row`).toHaveCount(1);
}

onDevices(["desktop", "phone"], () => test("each selection shows common tools above the type's own tools, two scrolling lines at most", async ({ page, device }) => {
  await page.goto(`${app.base}/#project/${app.project.id}/board/${app.board.id}`);
  await page.locator("#canvas").waitFor();
  await findOnBoard(page, "note", "First idea");
  await check(page, `${device} note`, { common: ["[data-feature=selection-delete]", "[data-feature=bring-front]", "[data-feature=duplicate]"], specific: ["[data-selection-menu=text-align]", ".selection-kind, [data-selection-menu=convert]"] });
  await findOnBoard(page, "task-a", "Write specification");
  await check(page, `${device} task`, { common: ["[data-feature=selection-delete]"], specific: ["[data-selection-menu=text-align]"] });
  await findOnBoard(page, "frame", "Slide one");
  await check(page, `${device} frame`, { common: ["[data-feature=selection-delete]", "[data-feature=lock]"], specific: ["[data-feature=frame-fit]", "[data-selection-menu=frame-size]"] });
  if (device === "phone") {
    // The frame's row is wider than a phone: it scrolls instead of wrapping.
    const row = rows(page).nth(1);
    expect(await row.evaluate((el) => el.scrollWidth > el.clientWidth), "the type's row overflows").toBe(true);
    const scrolledTo = await row.evaluate((el) => { el.scrollLeft = 120; return el.scrollLeft; });
    expect(scrolledTo, "and scrolls").toBeGreaterThan(0);
    const box = await toolbar(page).boundingBox();
    expect(box.x >= 0 && box.x + box.width <= page.viewportSize().width, JSON.stringify(box)).toBe(true);
    // A change rebuilds the toolbar; the row stays where it was scrolled to.
    await rows(page).first().locator("[data-feature=lock]").click();
    await expect(rows(page).first().locator("[data-feature=lock]")).toHaveAttribute("aria-pressed", "true");
    expect(await rows(page).nth(1).evaluate((el) => el.scrollLeft), "the scroll survives a rebuild").toBe(scrolledTo);
    await rows(page).first().locator("[data-feature=lock]").click();
    await expect(rows(page).first().locator("[data-feature=lock]")).toHaveAttribute("aria-pressed", "false");
    // An open menu follows its button when the row scrolls: opened with the row scrolled to its
    // end, it moves with the button when the row returns to the start.
    const sizeMenu = rows(page).nth(1).locator("[data-selection-menu=frame-size]");
    await rows(page).nth(1).evaluate((el) => (el.scrollLeft = el.scrollWidth));
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
    await rows(page).nth(1).evaluate((el) => (el.scrollLeft = 0));
    await expect.poll(async () => (await summary.boundingBox()).x, "the button moved with the row").not.toBe(before);
    await expect.poll(aligned, "the menu follows").toBe(true);
    await expect.poll(async () => Math.abs((await panel.boundingBox()).x - (await sizeMenu.boundingBox()).x), "the menu follows").toBeLessThanOrEqual(1);
    await page.keyboard.press("Escape");
    return;
  }
  // Select all takes the connector too: the mixed selection has common tools only.
  await page.keyboard.press("Control+a");
  await check(page, "desktop all", { common: ["[data-feature=selection-delete]", "[data-feature=duplicate]", ".selection-filter-total"], specific: [] });
  await expect(rows(page)).toHaveCount(1);
  // A connector: its own endpoints and line tools below the common actions.
  await page.keyboard.press("Escape");
  await page.locator('[data-edge="e1"]').first().click({ force: true });
  await check(page, "desktop connector", { common: ["[data-action=edge-delete]"], specific: ["[data-selection-menu=dependency]", '[role=group][aria-label="Endpoints"]'] });
}));
