// Owner requests, 30 October 2026: the bottom bar floats over the board and the open document with
// no band of page behind it; the board's view controls form a vertical bar on the right, level with
// the tools on the left, without zoom or fit buttons (double-click the zoom level to fit), and one
// toggle takes the board full screen.
import { test, expect, onDevices, useApp } from "../fixtures.mjs";

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

onDevices(["desktop", "ipad"], () => test("the view controls stand on the right, level with the tools, without zoom buttons", async ({ page, device }) => {
  await openBoard(page);
  const [tools, controls, canvas] = await Promise.all([box(page, ".board-tools"), box(page, ".board-controls"), box(page, "#canvas")]);
  expect(Math.abs(controls.top - tools.top), `${device}: level with the tools`).toBeLessThanOrEqual(0.5);
  expect(Math.abs(canvas.right - controls.right - (tools.left - canvas.left)), `${device}: the same inset as the tools`).toBeLessThanOrEqual(0.5);
  expect(Math.abs(controls.width - tools.width), `${device}: as wide as the tools`).toBeLessThanOrEqual(0.5);
  const items = await page.locator(".board-controls > *").evaluateAll((els) => els.map((el) => el.getBoundingClientRect().toJSON()).filter((r) => r.width));
  expect(items.length).toBeGreaterThanOrEqual(3);
  for (let i = 1; i < items.length; i++) expect(items[i].top, `${device}: stacked ${JSON.stringify(items)}`).toBeGreaterThanOrEqual(items[i - 1].bottom - 0.5);
  await expect(page.locator('[data-action="zoom-in"], [data-action="zoom-out"], [data-action="board-fit"], [data-board-display="fullscreen"]')).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Full screen", exact: true })).toHaveCount(1);
  expect((await box(page, "#canvas-presence")).right, `${device}: presence clears the controls`).toBeLessThanOrEqual(controls.left);
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
