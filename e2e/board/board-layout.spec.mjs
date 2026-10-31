// Board layout: a compact header leaves the canvas most of the screen; the board menus open from
// the keyboard, close with Escape and keep exactly one of each action through full redraws and
// view switches; menus fit on iPad and phone screens without page overflow; the tool column
// scrolls without moving the board; menus follow the dark theme; and connection warnings stay
// visible above the full-height canvas. No request leaves the app.
import { test, expect, onDevices, useApp } from "../fixtures.mjs";
import { clickControl, openSettingsPage, reveal, selectProjectView } from "../helpers/menu-controls.mjs";
import { newCard } from "../helpers/new-card.mjs";

const app = useApp(async (store) => {
  const project = await store.createProject({ title: "Board lab" });
  const a = await store.createTask(project.id, { title: "Write specification", assignee: "Alice", due: "2020-01-01", body: "## Scope\nOriginal scope.\n\n## Other\nKeep this.\n" });
  const b = await store.createTask(project.id, { title: "Build prototype", assignee: "Bob" });
  const board = (await store.snapshot(project.id)).boards[0];
  await store.updateBoard(project.id, board.id, {
    revision: board.revision,
    nodes: [
      { id: "note", type: "sticky", text: "First idea", x: 80, y: 150, w: 240, h: 200, color: "#f5e7a2" },
      { id: "task-a", type: "task", task: a.id, x: 420, y: 150, w: 310, h: 300 },
      { id: "task-b", type: "task", task: b.id, x: 830, y: 150, w: 300, h: 240 },
      { id: "far", type: "text", text: "A distant idea", x: 6000, y: 3000, w: 300, h: 150 },
    ],
    edges: [],
  });
  return { project };
});

async function openBoard(page) {
  await page.goto(`${app.base}/#project/${app.project.id}/board`);
  await page.locator("#canvas").waitFor();
}
const summary = (page, key) => page.locator(`[data-board-menu=${key}] > summary`);

let external;
test.beforeEach(async ({ page }) => {
  external = [];
  page.on("request", (r) => {
    if (!r.url().startsWith(app.base) && !r.url().startsWith("data:")) external.push(r.url());
  });
});
test.afterEach(() => expect(external, "no requests leave the app").toEqual([]));

test.describe("wide desktop", () => {
  test.use({ viewportSize: { width: 2065, height: 936 } });

  test("a compact header leaves the canvas most of the screen, and the board menus work from the keyboard", async ({ page }) => {
    await openBoard(page);
    const rect = await page.locator("#canvas").boundingBox();
    expect(rect.y, "compact header").toBeLessThan(160);
    expect(rect.height, "canvas height").toBeGreaterThan(750);
    await expect(page.locator(".hero")).toBeHidden();
    await summary(page, "more").focus();
    await summary(page, "more").press("Space");
    await expect(summary(page, "project")).toHaveCount(0);
    await expect(page.locator('[data-board-menu="more"] [data-pro=outline]')).toBeVisible();
    // Owner request, 31 October 2026: Board has no saved views; frames, the outline and bookmarks get you around.
    await expect(page.locator('#saved-view,[data-feature="view-save"],[data-feature="view-save-as"],[data-feature="view-delete"]')).toHaveCount(0);
    await page.keyboard.press("Escape");
    await expect(summary(page, "more")).toBeFocused();
    await summary(page, "more").click();
    await expect(page.locator("[data-feature=canvas-json]")).toBeVisible();
    await summary(page, "board").click();
    await expect(page.locator("[data-feature=canvas-json]")).toBeHidden();
    await expect(summary(page, "navigate")).toHaveCount(0);
    await expect(page.locator('[data-action="board-rename"]')).toHaveCount(0);
    await summary(page, "more").click();
    await expect(page.locator(".board-toolbar [data-pro=outline]")).toBeVisible();
    await expect(page.locator(".board-toolbar [data-pro=present]")).toBeVisible();
    await expect(page.locator("#frame-nav")).toBeVisible();
    await page.locator(".breadcrumb strong").click();
    await expect(page.locator(".board-menu[open]")).toHaveCount(0);
  });

  test("settings, full redraws and view switches keep exactly one of each board action", async ({ page }) => {
    await openBoard(page);
    // Since 0.19.31 the top bar's Settings button opens the Settings page on the project's General.
    await openSettingsPage(page);
    await page.locator("#project-form").waitFor();
    await selectProjectView(page, "board");
    // Trigger a complete content redraw; every menu must keep exactly one action.
    await clickControl(page.locator(".board-menu [data-pro=outline]"));
    await selectProjectView(page, "list");
    await expect(page.locator(".hero")).toBeHidden();
    await expect(page.locator("#board-project-tools")).toHaveCount(1);
    await page.locator(".tabs [data-view=board]").click();
    await page.locator("#canvas").waitFor();
    for (const selector of [".board-settings-button", "[data-action=board-new]", ".board-menu [data-pro=outline]"])
      await expect(page.locator(selector), selector).toHaveCount(1);
  });
});

onDevices(["ipad", "phone"], () => {
  test("the canvas fills the screen without page overflow, and the board menus fit on screen", async ({ page, device }) => {
    await openBoard(page);
    const viewport = page.viewportSize();
    const rect = await page.locator("#canvas").boundingBox();
    expect(rect.height).toBeGreaterThan(viewport.height * 0.65);
    const overflow = await page.evaluate(() => ({ x: document.documentElement.scrollWidth - innerWidth, y: document.documentElement.scrollHeight - innerHeight }));
    expect(overflow.x <= 1 && overflow.y <= 1, JSON.stringify(overflow)).toBe(true);
    // Since 0.19.26 phones reach settings from the drawer's settings row; since 0.19.31 one
    // Settings button (top bar or drawer) opens the Settings page on the project's General.
    await openSettingsPage(page);
    await page.locator("#project-form").waitFor();
    await selectProjectView(page, "board");
    // Since 0.19.2 the header New control is a menu offering a card or a document.
    await newCard(page);
    await page.locator("[data-action=dialog-close]").first().click();
    for (const key of ["board", "more"]) {
      // Since 0.18.26 phones keep the board menus in the View options panel;
      // reveal opens it, then the menu, as summary(key).click() does elsewhere.
      const menuPanel = page.locator(`[data-board-menu=${key}] .board-menu-panel`);
      await reveal(menuPanel);
      const box = await menuPanel.boundingBox();
      expect(box.x >= 0 && box.x + box.width <= viewport.width, `${key} menu within the width`).toBe(true);
      // There the menu flows inline and View options scrolls, so it must fit.
      const options = page.locator(".mobile-view-options-panel");
      const fit = (await options.isVisible()) ? await options.boundingBox() : box;
      expect(fit.y + fit.height, `${key} menu within the height`).toBeLessThanOrEqual(viewport.height);
      await page.keyboard.press("Escape");
    }
    // Since 0.18.26 phones dock the tools at the bottom with a Canvas tools panel.
    if (device === "phone") await expect(page.locator(".phone-board-dock .board-tools")).toHaveCount(1);
  });
});

test.describe("short iPad window", () => {
  // Phones dock the tools instead of the scrolling column, so check scrolling on a shorter iPad
  // window, with a mouse wheel.
  test.use({ viewportSize: { width: 1024, height: 600 } });

  test("the tool column scrolls without moving the board and keeps its scroll when a tool is chosen", async ({ page }) => {
    // Widening from a phone-sized window removes the phone dock.
    await page.setViewportSize({ width: 390, height: 844 });
    await openBoard(page);
    await expect(page.locator(".phone-board-dock .board-tools")).toHaveCount(1);
    await page.setViewportSize({ width: 1024, height: 600 });
    await page.locator(".phone-board-dock").waitFor({ state: "detached" });
    const tools = page.locator(".board-tools-scroll");
    const cameraBeforeScroll = await page.locator("#canvas-world").getAttribute("style");
    await tools.evaluate((el) => (el.scrollTop = 0));
    await tools.hover();
    await page.mouse.wheel(0, 300);
    await page.waitForFunction(() => document.querySelector(".board-tools-scroll").scrollTop > 0);
    await expect(page.locator("#canvas-world"), "scrolling the tool categories does not zoom or pan the board").toHaveAttribute("style", cameraBeforeScroll);
    await tools.getByRole("button", { name: "Connect two objects", exact: true }).click();
    expect(await tools.evaluate((el) => el.scrollTop), "selecting a tool keeps the toolbar scroll position").toBeGreaterThan(0);
    await page.keyboard.press("v");
  });
});

test("the More menu follows the dark theme", async ({ page }) => {
  await openBoard(page);
  // Since 0.19.31 the former Personal settings are the Settings page's "You" section, and
  // "Back to project" returns to the board.
  await openSettingsPage(page, "personal");
  await page.locator("[name=personal-theme][value=dark]").check();
  await page.locator("[data-action=settings-close]").click();
  await page.locator("#canvas").waitFor();
  await summary(page, "more").click();
  const panel = page.locator("[data-board-menu=more] .board-menu-panel");
  await expect(panel).toBeVisible();
  expect(await panel.evaluate((el) => getComputedStyle(el).backgroundColor)).not.toBe("rgb(255, 255, 255)");
  await page.keyboard.press("Escape");
});

test("a connection warning stays visible above the full-height canvas", async ({ page }) => {
  await openBoard(page);
  // Since 0.18.10 layout follows the rendered view rather than later DOM edits,
  // so cut the server off and let the app render its own offline banner. A change on the
  // server makes the open page refresh, and that request fails.
  await page.route("**/api/**", (r) => r.abort());
  const failed = page.waitForEvent("requestfailed");
  await selectProjectView(page, "list");
  app.store.changed();
  await failed;
  await selectProjectView(page, "board");
  await page.locator("#canvas").waitFor();
  await expect(page.locator(".connection-banner")).toBeVisible();
  const warning = await page.locator(".connection-banner").boundingBox();
  expect(warning.height).toBeGreaterThan(0);
  expect(warning.y).toBeLessThan((await page.locator("#canvas").boundingBox()).y);
});
