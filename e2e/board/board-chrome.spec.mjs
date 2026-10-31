// Owner requests, 30 October 2026: the bottom bar floats over the board and the open document with
// no band of page behind it; the board has no zoom or fit buttons (double-click the zoom level to
// fit), and one toggle takes the board full screen. Who is here sits in the board bar (0.20.83).
import { test, expect, onDevices, useApp } from "../fixtures.mjs";
import { clickControl, selectProjectView } from "../helpers/menu-controls.mjs";

const app = useApp(async (store) => {
  const project = await store.createProject({ title: "Board chrome" });
  const b = (await store.snapshot(project.id)).boards[0];
  const board = await store.updateBoard(project.id, b.id, {
    revision: b.revision,
    nodes: [
      // A tall board, so fitting it fills the height.
      { id: "a", type: "sticky", text: "Top", x: 0, y: 0, w: 180, h: 130 },
      { id: "b", type: "sticky", text: "Bottom", x: 0, y: 4000, w: 180, h: 130 },
      { id: "f", type: "frame", text: "Slide", x: -40, y: -40, w: 400, h: 300 },
    ],
    edges: [],
  });
  const doc = await store.createDocument(project.id, { title: "Long note", body: Array.from({ length: 80 }, (_, i) => `Line ${i}`).join("\n\n") });
  return { project, board, doc };
});
const box = (page, selector) => page.locator(selector).first().evaluate((el) => el.getBoundingClientRect().toJSON());
async function openBoard(page) {
  await page.goto(`${app.base}/#project/${app.project.id}/board/${app.board.id}`);
  await expect(page.locator("#zoom-label")).toHaveText("85%");
}

// Owner request, 31 October 2026: the view controls (capacity, zoom level, full screen) and undo/redo
// sit at the foot of the tool bar on the left, fixed while the rest of the tools scroll. The capacity
// gauge shows only past 80% (0.20.81; board-capacity-gauge.spec.mjs), so this small board has none.
onDevices(["desktop", "ipad"], () => test("undo, redo and the view controls stay at the foot of the tools while the tools scroll", async ({ page, device }) => {
  await page.setViewportSize({ width: page.viewportSize().width, height: 640 });
  await openBoard(page);
  const tools = page.locator(".board-tools"), scroller = tools.locator(".board-tools-scroll"), controls = tools.locator(".board-controls");
  await expect(page.locator(".board-controls"), `${device}: one set of view controls, in the tool bar`).toHaveCount(1);
  for (const name of ["Undo canvas change", "Redo canvas change", "Full screen"]) await expect(controls.getByRole("button", { name, exact: true }), `${device}: ${name}`).toBeVisible();
  await expect(controls.locator("#zoom-label")).toBeVisible();
  await expect(controls.locator(".board-capacity-toggle")).toBeHidden();
  await expect(scroller.locator('[data-action="board-undo"]')).toHaveCount(0);
  expect(await scroller.evaluate((el) => el.scrollHeight > el.clientHeight), `${device}: the tools scroll`).toBe(true);
  const [bar, before] = [await box(page, ".board-tools"), await box(page, ".board-controls")];
  expect(bar.bottom - before.bottom, `${device}: at the foot of the bar`).toBeLessThanOrEqual(8);
  expect(before.bottom, `${device}: inside the bar's foot`).toBeLessThanOrEqual(bar.bottom);
  expect(before.left >= bar.left && before.right <= bar.right, `${device}: inside the bar`).toBe(true);
  await scroller.evaluate((el) => (el.scrollTop = el.scrollHeight));
  await expect.poll(() => scroller.evaluate((el) => el.scrollTop), `${device}: scrolled`).toBeGreaterThan(0);
  expect(await box(page, ".board-controls"), `${device}: the controls do not scroll`).toEqual(before);
  const items = await controls.locator(":scope > *").evaluateAll((els) => els.map((el) => el.getBoundingClientRect().toJSON()).filter((r) => r.width));
  for (let i = 1; i < items.length; i++) expect(items[i].top, `${device}: stacked ${JSON.stringify(items)}`).toBeGreaterThanOrEqual(items[i - 1].bottom - 0.5);
  // Fit board lives in the zoom level's menu (0.20.73), not beside it.
  await expect(page.locator('[data-action="zoom-in"], [data-action="zoom-out"], [data-action="board-fit"]:not([data-board-menu="zoom"] *), [data-board-display="fullscreen"]')).toHaveCount(0);
}));

// Owner request (T11, 31 October 2026): who is on the board sits in the board bar as a compact
// avatar button, before Session on wider screens and beside View options on phones.
onDevices(["desktop", "ipad", "phone"], () => test("the board bar shows who is here as avatars that open your name", async ({ page, device }) => {
  await openBoard(page);
  const presence = page.locator(".board-toolbar > #canvas-presence > [data-pro=participant]");
  await expect(presence).toHaveAttribute("aria-label", "Your name: George · Just you");
  await expect(presence.locator(".task-assignee")).toHaveText(["Geo"]);
  const [button, avatar] = [await presence.boundingBox(), await presence.locator(".task-assignee").boundingBox()];
  expect(button.width, `${device}: compact`).toBeLessThanOrEqual(44);
  expect(avatar.x >= button.x && avatar.x + avatar.width <= button.x + button.width, `${device}: the avatar fits inside`).toBe(true);
  if (device === "phone") await expect(page.locator(".board-toolbar > .mobile-view-options")).toBeVisible();
  else expect(await page.locator("#canvas-presence").evaluate((el) => el.nextElementSibling?.dataset.boardMenu), "before Session").toBe("session");
  // One, kept by a content-only render (choosing a tool) and back after another view.
  await clickControl(page.locator('[data-tool="hand"]'));
  await expect(page.locator(".board-tools [data-tool=hand]")).toHaveClass(/active/);
  await expect(page.locator("#canvas-presence [data-pro=participant]"), `${device}: after a content render`).toHaveCount(1);
  await selectProjectView(page, "list");
  await expect(page.locator("#canvas-presence")).toHaveCount(0);
  await selectProjectView(page, "board");
  await expect(presence, `${device}: back on the board`).toHaveCount(1);
  await expect(page.locator("#canvas-presence [data-pro=participant]")).toHaveCount(1);
  await presence.click();
  await page.locator("#canvas-name-form").waitFor();
}));

// Phones dock the tool categories and the zoom level (0.20.82); undo and redo sit in Navigate's row.
onDevices(["phone"], () => test("phones dock the tool categories and keep undo and redo in Navigate", async ({ page }) => {
  await openBoard(page);
  for (const action of ["board-undo", "board-redo"]) await expect(page.locator(`#phone-board-navigate [data-action="${action}"]`), action).toHaveCount(1);
  expect(await page.locator(".phone-board-dock :is(button, summary):visible").evaluateAll((els) => els.map((el) => el.dataset.phoneCategory || el.dataset.tool || el.dataset.pro || el.id)))
    .toEqual(["navigate", "add", "draw", "search-toggle", "zoom-label"]); // the capacity gauge shows only past 80% (0.20.81)
}));

// On touch screens just over phone width the centred bar reaches under the tools on the left.
onDevices(["ipad"], () => test("the tools on the left stop above the bottom bar on narrow touch screens", async ({ page }) => {
  await page.setViewportSize({ width: 620, height: 900 });
  await openBoard(page);
  const [bar, tools] = [await box(page, ".topbar .tabs"), await box(page, ".board-tools")];
  expect(bar.left, "the bar reaches under the tools").toBeLessThan(tools.right);
  expect(tools.bottom, "the tools stop above the bar").toBeLessThanOrEqual(bar.top);
}));

onDevices(["desktop", "ipad", "phone"], () => test("double-clicking the zoom level fits the board", async ({ page, device }) => {
  await openBoard(page);
  const label = page.locator("#zoom-label");
  await label.click();
  await expect(label, `${device}: one click leaves the zoom`).toHaveText("85%");
  if (device === "desktop") await label.dblclick();
  else { await label.tap(); await label.tap(); }
  await expect(label, `${device}: fitted`).not.toHaveText("85%");
}));

onDevices(["ipad", "phone"], () => test("the bottom bar floats over the board and the document", async ({ page, device }) => {
  const height = page.viewportSize().height;
  await openBoard(page);
  const bar = await box(page, ".topbar .tabs");
  expect((await box(page, "#canvas")).bottom, `${device}: the board runs under the bar`).toBeGreaterThanOrEqual(height - 0.5);
  for (const selector of device === "phone" ? [".phone-board-dock"] : ["#canvas-minimap"])
    expect((await box(page, selector)).bottom, `${device}: ${selector} stays above the bar`).toBeLessThanOrEqual(bar.top - 4);
  // Fitting keeps the board's content above the bar and the phone dock.
  await page.locator("#zoom-label").tap();
  await page.locator("#zoom-label").tap();
  await expect(page.locator("#zoom-label")).not.toHaveText("85%");
  const floor = device === "phone" ? (await box(page, ".phone-board-dock")).top : bar.top;
  // Zoomed out this far the board draws an overview, so place the lowest card from the camera.
  const lowest = await page.evaluate(() => {
    const [, y, z] = document.querySelector("#canvas-world").style.transform.match(/translate\([-\d.]+px, ?([-\d.]+)px\) scale\(([\d.]+)\)/).map(Number);
    return document.querySelector("#canvas").getBoundingClientRect().top + y + 4130 * z;
  });
  expect(lowest, `${device}: the lowest card clears the bar`).toBeLessThanOrEqual(floor);
  // So do the presentation's controls.
  await page.evaluate(() => document.querySelector('[data-pro="present"]').click());
  expect((await box(page, "#presentation-controls")).bottom, `${device}: presentation controls clear the bar`).toBeLessThanOrEqual(bar.top);
  await page.goto(`${app.base}/#project/${app.project.id}/documents/${app.doc.id}`);
  await page.locator(".cm-content").waitFor();
  expect((await box(page, ".documents-workspace")).bottom, `${device}: the document runs under the bar`).toBeGreaterThanOrEqual(height - 0.5);
  expect((await box(page, ".document-save")).bottom, `${device}: the word count stays above the bar`).toBeLessThanOrEqual(bar.top);
}));
