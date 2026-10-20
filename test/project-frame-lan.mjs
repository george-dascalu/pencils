import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { chromium, firefox, webkit } from "playwright";
import { Store } from "../server/store.js";
import { createServer } from "../server/index.js";

// Loopback is a secure context even over HTTP. Use a real private address so
// this exercises the same missing browser API as an iPad on the local network.
const host =
  process.env.LAN_TEST_HOST ||
  Object.values(os.networkInterfaces())
    .flat()
    .find(
      (a) =>
        a.family === "IPv4" &&
        !a.internal &&
        /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(a.address),
    )?.address;
assert.ok(
  host,
  "Set LAN_TEST_HOST to a local private IPv4 address for this test.",
);
const root = await fs.mkdtemp(path.join(os.tmpdir(), "pencils-frame-lan-"));
const store = new Store(root);
await store.init();
const project = await store.createProject({ title: "Local network plan" });
const parent = await store.createTask(project.id, { title: "Design" });
const child = await store.createTask(project.id, {
  title: "Build",
  parent: parent.id,
  dependencies: [parent.id],
});
let board = (await store.snapshot(project.id)).boards[0];
const frame = {
  id: "n-plan",
  type: "frame",
  projectFrame: true,
  text: project.title,
  x: 150,
  y: 100,
  w: 700,
  h: 400,
};
const note = {
  id: "n-other",
  type: "sticky",
  text: "Keep this note",
  x: 950,
  y: 100,
  w: 200,
  h: 200,
};
await store.updateBoard(project.id, board.id, {
  revision: board.revision,
  nodes: [frame, note],
  edges: [],
});
const server = createServer(store);
await new Promise((resolve) => server.listen(0, host, resolve));
const browser = await { chromium, firefox, webkit }[
  process.env.BROWSER || "chromium"
].launch();
const page = await browser.newPage({
  viewport: { width: 1366, height: 1024 },
  hasTouch: true,
});
page.setDefaultTimeout(7000);
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
const confirmations = [];
page.on("dialog", async (dialog) => {
  confirmations.push(dialog.message());
  await dialog.dismiss();
});
const current = async () => (await store.snapshot(project.id)).boards[0];
const waitForSave = async (check) => {
  for (let i = 0; i < 100; i++) {
    if (check(await current())) return;
    await page.waitForTimeout(60);
  }
  throw Error("Plan did not save");
};
const ids = (b) => ({
  nodes: b.nodes.map((n) => n.id),
  edges: b.edges.map((e) => e.id),
});
const openPreview = async () => {
  await page.locator('[data-node="n-plan"] .project-frame-update').tap();
  await page.locator("#frame-apply").waitFor();
};
try {
  await page.goto(
    `http://${host}:${server.address().port}/#project/${project.id}/board`,
  );
  await page.locator('[data-node="n-plan"]').waitFor();
  assert.deepEqual(
    await page.evaluate(() => [
      isSecureContext,
      typeof crypto.randomUUID,
      typeof crypto.getRandomValues,
    ]),
    [false, "undefined", "function"],
  );
  const before = await current();
  const camera = () =>
    page
      .locator("#canvas-world")
      .evaluate((el) => getComputedStyle(el).transform);
  const originalCamera = await camera();
  await openPreview();
  const panel = page.getByRole("dialog", { name: "Update project frame" });
  assert.equal(await page.locator("dialog:modal").count(), 0);
  assert.equal(await panel.getAttribute("aria-modal"), "false");
  const panelBox = await panel.boundingBox();
  const frameBox = await page.locator('[data-node="n-plan"]').boundingBox();
  assert.ok(panelBox.width <= 310 && panelBox.height < 450);
  assert.ok(
    Math.abs(panelBox.y - frameBox.y) < 3,
    "Panel follows the frame's top edge",
  );
  assert.ok(
    panelBox.x >= frameBox.x && panelBox.x <= frameBox.x + frameBox.width + 14,
    "Panel stays beside the frame, clamping at the viewport edge",
  );
  await page.screenshot({
    path: `/tmp/pencils-frame-panel-${process.env.BROWSER || "chromium"}.png`,
  });
  await page.locator("#frame-relayout").check();
  await page
    .getByRole("button", { name: "Close frame update", exact: true })
    .tap();
  await panel.waitFor({ state: "detached" });
  assert.deepEqual(
    confirmations,
    [],
    "Preview options do not prompt to discard a draft",
  );
  assert.deepEqual(
    await current(),
    before,
    "Preview/cancel leaves the board untouched",
  );
  await openPreview();
  await page.keyboard.press("Escape");
  await panel.waitFor({ state: "detached" });
  assert.ok(
    await page
      .locator('[data-node="n-plan"] .project-frame-update')
      .evaluate((el) => el === document.activeElement),
  );
  await openPreview();
  await page.getByRole("button", { name: "Board settings", exact: true }).tap();
  await page.locator("#board-settings-form").waitFor();
  assert.equal(
    await panel.count(),
    0,
    "An outside tap dismisses the panel and activates the target",
  );
  await page.locator("[data-board-settings-close]").tap();

  // Dismissing a pending update must not apply it or close a newer preview.
  await openPreview();
  let release, received, heldRequest;
  const held = new Promise((resolve) => {
    release = resolve;
  });
  const requested = new Promise((resolve) => {
    received = resolve;
  });
  const projectURL = `http://${host}:${server.address().port}/api/projects/${project.id}`;
  await page.route(
    projectURL,
    async (route) => {
      heldRequest = route.request();
      received();
      await held;
      await route.continue();
    },
    { times: 1 },
  );
  await page.locator("#frame-apply").tap();
  await requested;
  await page
    .getByRole("button", { name: "Close frame update", exact: true })
    .tap();
  await openPreview();
  const response = page.waitForResponse((r) => r.request() === heldRequest);
  release();
  await (await response).finished();
  await page.evaluate(
    () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      ),
  );
  assert.ok(
    await panel.isVisible(),
    "The dismissed request leaves the newer preview open",
  );
  assert.deepEqual(
    await current(),
    before,
    "The dismissed update never changes the board",
  );
  await page.locator("#frame-apply").tap();
  await waitForSave((b) => b.nodes.length === 4 && b.edges.length === 2);
  board = await current();
  for (const item of [
    ...board.nodes.filter((n) => n.projectFrameOwner),
    ...board.edges,
  ])
    assert.match(
      item.id,
      /^[ne]-[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/,
    );
  const stableIds = ids(board);
  await openPreview();
  await page.locator("#frame-apply").tap();
  await page.locator("#frame-apply").waitFor({ state: "detached" });
  assert.deepEqual(ids(await current()), stableIds);
  const third = await store.createTask(project.id, {
    title: "Ship",
    dependencies: [child.id],
  });
  await openPreview();
  await page.locator("#frame-apply").tap();
  await waitForSave(
    (b) => b.nodes.some((n) => n.task === third.id) && b.edges.length === 3,
  );
  const expanded = await current();
  const prerequisite = expanded.nodes.find((n) => n.task === child.id);
  const dependent = expanded.nodes.find((n) => n.task === third.id);
  assert.equal(dependent.x, prerequisite.x + prerequisite.w + 100);
  assert.equal(dependent.y, prerequisite.y);
  for (const kept of board.nodes.filter((n) => n.type === "task"))
    assert.deepEqual(
      expanded.nodes.find((n) => n.id === kept.id),
      kept,
    );
  await page.waitForFunction(
    () =>
      document.querySelector("#board-save")?.textContent ===
      "Saved automatically",
  );
  await page.locator('[data-action="board-undo"]').tap();
  await waitForSave((b) => !b.nodes.some((n) => n.task === third.id));
  assert.deepEqual(ids(await current()), stableIds);
  assert.equal(await camera(), originalCamera);
  assert.deepEqual(
    (await current()).nodes.find((n) => n.id === note.id),
    before.nodes.find((n) => n.id === note.id),
  );
  await page.reload();
  await page.locator('[data-node="n-plan"]').waitFor();
  assert.deepEqual(ids(await current()), stableIds);
  await openPreview();
  await page.setViewportSize({ width: 390, height: 650 });
  await page.evaluate(() => window.PencilsAppearance.write({ theme: "dark" }));
  await page.waitForFunction(() => {
    const r = document
      .querySelector(".frame-update-panel")
      .getBoundingClientRect();
    return (
      r.x >= 0 && r.right <= innerWidth && r.y >= 0 && r.bottom <= innerHeight
    );
  });
  await page.waitForFunction(
    () => document.querySelector(".sidebar").getBoundingClientRect().right <= 1,
  );
  assert.ok(await page.locator("#frame-apply").isVisible());
  await page.screenshot({
    path: `/tmp/pencils-frame-panel-mobile-${process.env.BROWSER || "chromium"}.png`,
  });
  await page
    .getByRole("button", { name: "Close frame update", exact: true })
    .tap();
  await panel.waitFor({ state: "detached" });
  assert.deepEqual(confirmations, []);
  assert.deepEqual(errors, []);
  await page.screenshot({
    path: `/tmp/pencils-project-frame-lan-${process.env.BROWSER || "chromium"}.png`,
  });
  console.log(
    "PASS: anchored nonmodal frame preview, touch/keyboard dismissal, cancel pending update, responsive dark theme, preview/cancel/update, relationship arrows, stable IDs, adding tasks, undo and reload over insecure local-network HTTP without randomUUID.",
  );
} catch (error) {
  console.error(
    "Visible error:",
    await page.locator(".toast").allTextContents(),
    await page.locator("[data-frame-error]").allTextContents(),
  );
  await page.screenshot({
    path: `/tmp/pencils-frame-panel-failure-${process.env.BROWSER || "chromium"}.png`,
  });
  throw error;
} finally {
  await browser.close();
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
  await store.queue;
  await fs.rm(root, { recursive: true, force: true });
}
