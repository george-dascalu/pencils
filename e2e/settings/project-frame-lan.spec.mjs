// Project frame updates over plain HTTP on the local network, as on an iPad reaching the server
// by its LAN address. Loopback counts as a secure context even over HTTP, so this serves a real
// private address where crypto.randomUUID is missing. The preview is a small non-modal panel
// anchored beside the frame (AGENTS.md "Dialogs and contextual panels"): touch, Escape and outside
// taps dismiss it, a dismissed pending update is never applied, and it fits a phone in dark mode.
// Updates add cards and arrows with UUID-style IDs that stay stable, undo and reload keep them,
// and nothing prompts to discard a draft. Set LAN_TEST_HOST to choose the address.
import os from "node:os";
import { test as base, expect } from "../fixtures.mjs";
import { useCustomApp } from "../helpers/custom-server.mjs";

const host =
  process.env.LAN_TEST_HOST ||
  Object.values(os.networkInterfaces())
    .flat()
    .find((a) => a.family === "IPv4" && !a.internal && /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(a.address))?.address;

// A touch-capable tablet window in the project's browser (the release gate runs it in Firefox and WebKit too).
const test = base.extend({
  context: async ({ browser }, use) => {
    const context = await browser.newContext({ viewport: { width: 1366, height: 1024 }, hasTouch: true, reducedMotion: "reduce" });
    await use(context);
    await context.close();
  },
});
test.skip(!host, "Set LAN_TEST_HOST to a local private IPv4 address for this test.");
// Later steps build on the cards and IDs the first update creates.
test.describe.configure({ mode: "serial" });

const frame = { id: "n-plan", type: "frame", projectFrame: true, x: 150, y: 100, w: 700, h: 400 };
const note = { id: "n-other", type: "sticky", text: "Keep this note", x: 950, y: 100, w: 200, h: 200 };
const app = useCustomApp({
  host,
  seed: async (store) => {
    const project = await store.createProject({ title: "Local network plan" });
    const parent = await store.createTask(project.id, { title: "Design" });
    const child = await store.createTask(project.id, { title: "Build", parent: parent.id, dependencies: [parent.id] });
    const board = (await store.snapshot(project.id)).boards[0];
    await store.updateBoard(project.id, board.id, { revision: board.revision, nodes: [{ ...frame, text: project.title }, note], edges: [] });
    return { project, parent, child, before: (await store.snapshot(project.id)).boards[0] };
  },
});

const current = async () => (await app.store.snapshot(app.project.id)).boards[0];
const ids = (b) => ({ nodes: b.nodes.map((n) => n.id), edges: b.edges.map((e) => e.id) });
const panel = (page) => page.getByRole("dialog", { name: "Update project frame" });
const camera = (page) => page.locator("#canvas-world").evaluate((el) => getComputedStyle(el).transform);
const closeButton = (page) => page.getByRole("button", { name: "Close frame update", exact: true });
async function openPreview(page) {
  await page.locator('[data-node="n-plan"] .project-frame-update').tap();
  await page.locator("#frame-apply").waitFor();
}
let confirmations;
test.beforeEach(async ({ page }) => {
  confirmations = [];
  page.on("dialog", async (dialog) => {
    confirmations.push(dialog.message());
    await dialog.dismiss();
  });
  await page.goto(`${app.base}/#project/${app.project.id}/board`);
  await page.locator('[data-node="n-plan"]').waitFor();
});
test.afterEach(() => expect(confirmations, "Preview options do not prompt to discard a draft").toEqual([]));

let board, stableIds;

test("the page runs without randomUUID, and the preview is a small non-modal panel beside the frame that changes nothing when closed", { tag: "@gate" }, async ({ page }) => {
  expect(await page.evaluate(() => [isSecureContext, typeof crypto.randomUUID, typeof crypto.getRandomValues])).toEqual([false, "undefined", "function"]);
  await openPreview(page);
  await expect(page.locator("dialog:modal")).toHaveCount(0);
  await expect(panel(page)).toHaveAttribute("aria-modal", "false");
  const panelBox = await panel(page).boundingBox();
  const frameBox = await page.locator('[data-node="n-plan"]').boundingBox();
  expect(panelBox.width).toBeLessThanOrEqual(310);
  expect(panelBox.height).toBeLessThan(450);
  expect(Math.abs(panelBox.y - frameBox.y), "Panel follows the frame's top edge").toBeLessThan(3);
  expect(panelBox.x >= frameBox.x && panelBox.x <= frameBox.x + frameBox.width + 14, "Panel stays beside the frame, clamping at the viewport edge").toBe(true);
  await page.locator("#frame-relayout").check();
  await closeButton(page).tap();
  await panel(page).waitFor({ state: "detached" });
  expect(confirmations, "Preview options do not prompt to discard a draft").toEqual([]);
  expect(await current(), "Preview/cancel leaves the board untouched").toEqual(app.before);
});

test("Escape returns focus to the frame's update button, and an outside tap closes the preview and activates the target", { tag: "@gate" }, async ({ page }) => {
  await openPreview(page);
  await page.keyboard.press("Escape");
  await panel(page).waitFor({ state: "detached" });
  await expect(page.locator('[data-node="n-plan"] .project-frame-update')).toBeFocused();
  await openPreview(page);
  await page.getByRole("button", { name: "Board appearance", exact: true }).tap();
  await page.locator("#board-settings-form").waitFor();
  await expect(panel(page), "An outside tap dismisses the panel and activates the target").toHaveCount(0);
  await page.locator("[data-board-settings-close]").tap();
  expect(await current()).toEqual(app.before);
});

test("dismissing a pending update neither applies it nor closes a newer preview", { tag: "@gate" }, async ({ page }) => {
  await openPreview(page);
  let release, received, heldRequest;
  const held = new Promise((resolve) => (release = resolve));
  const requested = new Promise((resolve) => (received = resolve));
  await page.route(`${app.base}/api/projects/${app.project.id}`, async (route) => {
    heldRequest = route.request();
    received();
    await held;
    await route.continue();
  }, { times: 1 });
  await page.locator("#frame-apply").tap();
  await requested;
  await closeButton(page).tap();
  await openPreview(page);
  const response = page.waitForResponse((r) => r.request() === heldRequest);
  release();
  await (await response).finished();
  // Two frames let the late response settle; nothing should change.
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await expect(panel(page), "The dismissed request leaves the newer preview open").toBeVisible();
  expect(await current(), "The dismissed update never changes the board").toEqual(app.before);
});

test("applying adds cards and arrows with UUID-style IDs, which stay the same on a repeat update", { tag: "@gate" }, async ({ page }) => {
  await openPreview(page);
  await page.locator("#frame-apply").tap();
  await expect.poll(async () => { const b = await current(); return [b.nodes.length, b.edges.length]; }).toEqual([4, 2]);
  board = await current();
  for (const item of [...board.nodes.filter((n) => n.projectFrameOwner), ...board.edges])
    expect(item.id).toMatch(/^[ne]-[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/);
  stableIds = ids(board);
  await openPreview(page);
  await page.locator("#frame-apply").tap();
  await page.locator("#frame-apply").waitFor({ state: "detached" });
  expect(ids(await current())).toEqual(stableIds);
});

test("a later task joins beside its prerequisite, undo restores the board and camera, and reload keeps the IDs", { tag: "@gate" }, async ({ page }) => {
  const originalCamera = await camera(page);
  const third = await app.store.createTask(app.project.id, { title: "Ship", dependencies: [app.child.id] });
  await openPreview(page);
  await page.locator("#frame-apply").tap();
  await expect.poll(async () => { const b = await current(); return b.nodes.some((n) => n.task === third.id) && b.edges.length === 3; }).toBe(true);
  const expanded = await current();
  const prerequisite = expanded.nodes.find((n) => n.task === app.child.id);
  const dependent = expanded.nodes.find((n) => n.task === third.id);
  expect(dependent.x).toBe(prerequisite.x + prerequisite.w + 100);
  expect(dependent.y).toBe(prerequisite.y);
  for (const kept of board.nodes.filter((n) => n.type === "task")) expect(expanded.nodes.find((n) => n.id === kept.id)).toEqual(kept);
  await expect(page.locator("#board-save")).toHaveText("Saved automatically");
  await page.locator('[data-action="board-undo"]').tap();
  await expect.poll(async () => (await current()).nodes.some((n) => n.task === third.id)).toBe(false);
  expect(ids(await current())).toEqual(stableIds);
  expect(await camera(page)).toBe(originalCamera);
  expect((await current()).nodes.find((n) => n.id === note.id)).toEqual(app.before.nodes.find((n) => n.id === note.id));
  await page.reload();
  await page.locator('[data-node="n-plan"]').waitFor();
  expect(ids(await current())).toEqual(stableIds);
});

test("the open preview fits a phone-sized window in the dark theme", { tag: "@gate" }, async ({ page }) => {
  await openPreview(page);
  await page.setViewportSize({ width: 390, height: 650 });
  await page.evaluate(() => window.PencilsAppearance.write({ theme: "dark" }));
  await page.waitForFunction(() => {
    const r = document.querySelector(".frame-update-panel").getBoundingClientRect();
    return r.x >= 0 && r.right <= innerWidth && r.y >= 0 && r.bottom <= innerHeight;
  });
  await page.waitForFunction(() => document.querySelector(".sidebar").getBoundingClientRect().right <= 1);
  await expect(page.locator("#frame-apply")).toBeVisible();
  await closeButton(page).tap();
  await panel(page).waitFor({ state: "detached" });
});
