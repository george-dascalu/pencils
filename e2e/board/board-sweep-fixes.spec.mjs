// Board sweep T95, 1 November 2026 (owner: "fix the issues found by the sweep"): Select all keeps
// the objects' tools with a connector selected, Arrange's Match and Tidy wait for two objects, the
// selection toolbar stays clear of the tool rail, scrolling tool rows and the rail show a shadow
// where more tools lie, Insert › Live note lists documents by title, and on phones Project cards
// sits between the top and the dock and closes with Escape, and Fit board uses the phone's width.
// A closed tab leaves the board's presence at once.
import { test, expect, onDevices, useApp } from "../fixtures.mjs";
import { seedBoard, presetCamera } from "../helpers/board-canvas.mjs";
import { reveal } from "../helpers/menu-controls.mjs";

const app = useApp(async (store) => {
  const project = await store.createProject({ title: "Sweep fixes", key: "SF" });
  await store.createDocument(project.id, { title: "Meeting notes", body: "Agenda." });
  return { project, board: (await store.snapshot(project.id)).boards[0] };
});
test.beforeEach(() => seedBoard(app.store, app.project.id, {
  nodes: [
    { id: "left", type: "sticky", text: "Left idea", x: 0, y: 0, w: 200, h: 120, color: "#f5e7a2" },
    { id: "right", type: "shape", text: "Right shape", x: 1000, y: 0, w: 200, h: 120 },
  ],
  edges: [{ id: "link", from: "left", to: "right" }],
}, app.board.id));
const open = async (page) => {
  await page.goto(`${app.base}/#project/${app.project.id}/board/${app.board.id}`);
  await page.locator('[data-node="left"]').waitFor();
};
const rect = (locator) => locator.evaluate((el) => el.getBoundingClientRect().toJSON());

test("Select all with a connector keeps the objects' colour, Arrange and Lock", async ({ page }) => {
  await open(page);
  await page.locator('[data-node="left"]').click();
  await page.keyboard.press("ControlOrMeta+a");
  const toolbar = page.locator("#selection-tools");
  await expect(toolbar.locator('[data-selection-menu="arrange"]')).toBeVisible();
  await expect(toolbar.locator('[data-feature="lock"]')).toBeVisible();
  await expect(toolbar.locator(".color-picker").first()).toBeVisible();
});

test("Arrange's Match and Tidy wait for two objects, like Align", async ({ page }) => {
  await open(page);
  await page.locator('[data-node="left"]').click();
  await page.locator('#selection-tools [data-selection-menu="arrange"] > summary').click();
  for (const tool of ["match-width", "match-height", "tidy"])
    await expect(page.locator(`#selection-tools [data-layout-tool="${tool}"]`), tool).toBeDisabled();
});

test("the selection toolbar stays clear of the tool rail", async ({ page }) => {
  await presetCamera(page, app.board.id, { x: 0, y: 160, z: 1 });
  await open(page);
  await page.locator('[data-node="left"]').click({ position: { x: 170, y: 60 } });
  await expect(page.locator("#selection-tools")).toBeVisible();
  expect((await rect(page.locator("#selection-tools"))).left).toBeGreaterThanOrEqual((await rect(page.locator(".board-tools"))).right);
});

test("Insert › Live note lists the project's documents by title", async ({ page }) => {
  await open(page);
  await page.locator("[data-board-menu=insert] > summary").click();
  await page.locator('[data-board-menu=insert] [data-pro="note-add"]').click();
  await expect(page.locator('#canvas-note-form select[name="file"] option')).toHaveText(["Meeting notes"]);
  await page.locator('#canvas-note-form button.primary').click();
  await expect(page.locator(".board-node strong", { hasText: "Meeting notes" })).toBeVisible();
});

onDevices(["desktop", "ipad"], () => test("the tool rail and selection rows show a shadow where more tools lie", async ({ page }) => {
  await open(page);
  await page.locator('[data-node="left"]').click();
  for (const selector of [".board-tools-scroll", "#selection-tools .selection-row"])
    expect(await page.locator(selector).first().evaluate((el) => getComputedStyle(el).backgroundAttachment), selector).toContain("local");
}));

onDevices(["phone"], () => {
  test("Project cards sits between the top and the dock, and Escape closes it", async ({ page }) => {
    await open(page);
    await page.locator('[data-phone-category="add"]').click();
    await page.locator('#phone-board-add [data-action="board-task"]').click();
    const panel = page.locator("#board-task-panel");
    await expect(panel).toBeVisible();
    const box = await rect(panel), dock = await rect(page.locator(".phone-board-dock")), width = page.viewportSize().width;
    expect(box.left, "full width on a phone").toBeLessThanOrEqual(16);
    expect(box.right).toBeGreaterThanOrEqual(width - 16);
    expect(box.bottom, "above the dock").toBeLessThanOrEqual(dock.top);
    await page.keyboard.press("Escape");
    await expect(panel).toBeHidden();
  });

  test("Fit board fills the phone's width", async ({ page }) => {
    await open(page);
    await page.locator('[data-phone-category="navigate"]').click();
    await reveal(page.locator('[data-action="board-fit"]'));
    await page.locator('[data-action="board-fit"]').click();
    const width = await page.locator("#canvas").evaluate((el) => el.clientWidth);
    // The board is 1200 wide: 16px margins leave (width - 32) / 1200.
    await expect.poll(async () => parseInt(await page.locator("#zoom-label").textContent())).toBe(Math.round(((width - 32) / 1200) * 100));
  });
});

test("a closed tab leaves the board's presence at once", async ({ page }) => {
  await open(page);
  const second = await page.context().newPage();
  await second.goto(`${app.base}/#project/${app.project.id}/board/${app.board.id}`);
  await second.locator('[data-node="left"]').waitFor();
  const here = page.locator("#canvas-presence .task-assignee");
  await expect(here).toHaveCount(2, { timeout: 12000 });
  await second.close({ runBeforeUnload: true });
  // Well before the 15-second timeout.
  await expect(here).toHaveCount(1, { timeout: 5000 });
});
