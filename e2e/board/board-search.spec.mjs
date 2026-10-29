// Board search: a collapsed panel opened from the toolbar or Ctrl+F, result navigation,
// owner/status filters shown on the toggle, dismissal (Escape, Close, outside), phone and
// dark layouts, and no interference from background refreshes. Searching never edits the board.
import { test, expect, onDevices, useApp } from "../fixtures.mjs";

const app = useApp(async (store) => {
  const project = await store.createProject({ title: "Search board" });
  const task = await store.createTask(project.id, { title: "Find this task", assignee: "Alice" });
  const board = (await store.snapshot(project.id)).boards[0];
  await store.updateBoard(project.id, board.id, {
    revision: board.revision,
    nodes: [
      { id: "task", type: "task", task: task.id, x: 500, y: 300, w: 310, h: 240 },
      { id: "note", type: "sticky", text: "Distant idea", x: 5000, y: 3000, w: 240, h: 200 },
    ],
  });
  return { project, before: await store.snapshot(project.id) };
});

const openBoard = async (page) => {
  await page.goto(`${app.base}/#project/${app.project.id}/board`);
  await page.locator('[data-node="task"]').waitFor();
};
const toggle = (page) => page.locator('[data-pro="search-toggle"]');
const panel = (page) => page.locator("#canvas-search-panel");
const field = (page) => page.locator("#canvas-find");
// Phones (0.18.26) keep Search in the canvas tools panel behind "More canvas tools".
async function openSearch(page, device) {
  if (device !== "desktop") await page.locator(".phone-board-more").click();
  await toggle(page).click();
  await expect(toggle(page)).toHaveAttribute("aria-expanded", "true");
}

test.afterEach(async () => {
  const after = await app.store.snapshot(app.project.id);
  expect(after.boards, "searching does not change the board").toEqual(app.before.boards);
  expect(after.tasks).toEqual(app.before.tasks);
});

test("search opens from the toolbar and jumps to a result", { tag: "@gate" }, async ({ page }) => {
  await openBoard(page);
  await expect(panel(page)).toBeHidden();
  await expect(toggle(page)).toHaveAttribute("aria-expanded", "false");
  await toggle(page).click();
  await expect(field(page)).toBeFocused();
  await field(page).fill("Distant idea");
  await page.locator('#canvas-find-results [data-id="note"]').click();
  await expect(panel(page)).toBeHidden();
  await expect(page.locator('[data-node="note"]')).toBeVisible();
  await toggle(page).click();
  await page.locator('[data-pro="return-viewport"]').click();
  await expect(panel(page)).toBeHidden();
});

test("Ctrl+F opens search, filters show on the toggle, Escape and outside clicks close it", { tag: "@gate" }, async ({ page }) => {
  await openBoard(page);
  await page.keyboard.press("Control+f");
  await expect(field(page)).toBeFocused();
  await page.locator("#canvas-owner").fill("Alice");
  await page.locator("#canvas-status").selectOption("todo");
  await page.keyboard.press("Escape");
  await expect(panel(page)).toBeHidden();
  await expect(toggle(page)).toBeFocused();
  await expect(toggle(page)).toHaveClass(/has-filters/);
  await toggle(page).click();
  await expect(page.locator("#canvas-owner")).toHaveValue("Alice");
  await page.locator("#canvas-owner").fill("");
  await page.locator("#canvas-status").selectOption("");
  await expect(toggle(page)).not.toHaveClass(/has-filters/);
  await page.locator("#canvas").click({ position: { x: 800, y: 100 } });
  await expect(panel(page)).toBeHidden();
});

onDevices(["desktop", "phone"], () => test("the panel stays on screen in both themes and closes with its Close button", async ({ page, device }) => {
  await openBoard(page);
  const width = page.viewportSize().width;
  for (const theme of ["light", "dark"]) {
    await page.evaluate((theme) => (document.documentElement.dataset.theme = theme), theme);
    await openSearch(page, device);
    const box = await panel(page).boundingBox();
    expect(box.height, "the object navigator stays bounded").toBeLessThan(550);
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(width);
    await expect(page.locator("#canvas-status")).toBeVisible();
    // AGENTS.md: Escape, a Close button and tapping outside. Phones need the button,
    // because their toggle sits in the closed tools panel.
    await panel(page).getByRole("button", { name: "Close search" }).click();
    await expect(panel(page)).toBeHidden();
  }
}));

onDevices(["phone"], () => test("a refresh in flight does not steal search focus or reset the field", async ({ page, device }) => {
  await openBoard(page);
  let unblock, reached;
  const gate = new Promise((resolve) => (unblock = resolve));
  const intercepted = new Promise((resolve) => (reached = resolve));
  let delayed = false;
  await page.route(`**/api/projects/${app.project.id}`, async (route) => {
    if (!delayed && route.request().method() === "GET") {
      delayed = true;
      const response = await route.fetch();
      reached();
      await gate;
      await route.fulfill({ response });
    } else await route.continue();
  });
  app.store.changed();
  await intercepted;
  await openSearch(page, device);
  await field(page).fill("Keep this search");
  await field(page).evaluate((el) => (el.dataset.refreshProbe = "same"));
  unblock();
  // The refresh applies nothing while search has focus, so there is no state to wait for.
  await page.waitForTimeout(1000);
  await expect(field(page)).toHaveValue("Keep this search");
  await expect(field(page)).toHaveAttribute("data-refresh-probe", "same");
  await expect(field(page), "the in-flight refresh does not steal search focus").toBeFocused();
  // Escape closes search. The toggle sits in the closed tools panel, so focus returns to the
  // board rather than staying in the hidden field (which would hold back every later refresh).
  await page.keyboard.press("Escape");
  await expect(panel(page)).toBeHidden();
  await expect(page.locator("#canvas")).toBeFocused();
}));
