// Owner report, 28 October 2026: with a dialog or the card panel open on the
// board, a pinch with one finger on the dialog and one on the board zoomed the
// app. The board zooms only when every finger is on the board, and the page
// itself never zooms on touch devices. iOS Safari still page-zooms pinches that
// start in a dialog or a scrolling panel despite `touch-action`, so Safari's
// gesture events and scaled touch moves are cancelled. Chromium cannot zoom the
// page here, so those checks dispatch the Safari events directly.
import { test, expect, onDevices, useApp } from "../fixtures.mjs";

const app = useApp(async (store) => {
  const project = await store.createProject({ title: "Pinch guard", key: "PG" });
  const task = await store.createTask(project.id, { title: "Pinch task", status: "todo", body: "A description paragraph to pinch on.\n\nSecond paragraph." });
  const board = (await store.snapshot(project.id)).boards[0];
  await store.updateBoard(project.id, board.id, { revision: board.revision, nodes: [{ id: "c", type: "task", task: task.id, x: 420, y: 160, w: 300, h: 220 }] });
  return { project, board };
});
const url = () => `${app.base}/#project/${app.project.id}/board/${app.board.id}`;

// No animation is running: the board and any panel have reached their resting place.
const settled = (page) => page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== "running"));

// Each test gets a CDP session on its page for raw multi-finger touches.
async function open(page) {
  await page.addInitScript(() => localStorage.setItem("pencils:sidebar", "collapsed"));
  const cdp = await page.context().newCDPSession(page);
  await page.goto(url());
  await page.locator('[data-node="c"]').waitFor();
  await expect(page.locator("#zoom-label")).not.toBeEmpty();
  await settled(page);
  return cdp;
}
const camera = (page) => page.evaluate(() => ({ world: document.querySelector("#canvas-world").style.transform, zoom: document.querySelector("#zoom-label").textContent, scale: visualViewport.scale }));
// Two fingers start together and move apart: `a` and `b` are start points, `da`/`db` the per-step movement.
async function twoFingers(cdp, a, b, da, db, steps = 8) {
  const points = (i) => [{ id: 1, x: a.x + da.x * i, y: a.y + da.y * i }, { id: 2, x: b.x + db.x * i, y: b.y + db.y * i }];
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: points(0) });
  for (let i = 1; i <= steps; i++) await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: points(i) });
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
}
// One finger lands, then a second one: the order matters to the board's tracking.
async function fingerThenFinger(cdp, first, second, d1, d2, steps = 8) {
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ id: 1, ...first }] });
  await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ id: 1, x: first.x + d1.x, y: first.y + d1.y }] });
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ id: 1, x: first.x + d1.x, y: first.y + d1.y }, { id: 2, ...second }] });
  for (let i = 2; i <= steps; i++) await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ id: 1, x: first.x + d1.x * i, y: first.y + d1.y * i }, { id: 2, x: second.x + d2.x * i, y: second.y + d2.y * i }] });
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
}
// An empty spot on the board, away from the card and the board controls.
async function emptyBoardPoint(page, avoid) {
  return page.evaluate((avoid) => {
    const canvas = document.querySelector("#canvas").getBoundingClientRect();
    for (let y = canvas.top + 60; y < canvas.bottom - 60; y += 20)
      for (let x = canvas.left + 12; x < canvas.right - 12; x += 10) {
        if (avoid && x > avoid.x - 12 && x < avoid.x + avoid.width + 12 && y > avoid.y - 12 && y < avoid.y + avoid.height + 12) continue;
        const el = document.elementFromPoint(x, y);
        if (el?.matches("#canvas, #canvas-world, .canvas-surface") || (el?.closest("#canvas") && !el.closest("[data-node],[data-edge],button,input,select,textarea,.board-controls,.board-tools,#pen-tools,#selection-tools,#canvas-minimap,.canvas-panel"))) return { x, y };
      }
    return null;
  }, avoid);
}
// Safari's gesture events and a two-finger touch move carrying a scale, as iOS sends them.
const safariPinchCancelled = (page, selector) => page.evaluate((selector) => {
  const target = document.querySelector(selector);
  const r = target.getBoundingClientRect();
  const out = {};
  for (const type of ["gesturestart", "gesturechange"]) {
    const event = new Event(type, { bubbles: true, cancelable: true });
    Object.defineProperty(event, "scale", { value: 1.6 });
    target.dispatchEvent(event);
    out[type] = event.defaultPrevented;
  }
  const touch = (id, dx) => new Touch({ identifier: id, target, clientX: r.left + r.width / 2 + dx, clientY: r.top + r.height / 2 });
  const move = new TouchEvent("touchmove", { bubbles: true, cancelable: true, touches: [touch(1, -30), touch(2, 30)], targetTouches: [touch(1, -30), touch(2, 30)], changedTouches: [touch(2, 30)] });
  Object.defineProperty(move, "scale", { value: 1.6 });
  target.dispatchEvent(move);
  out.touchmove = move.defaultPrevented;
  return out;
}, selector);
const allCancelled = { gesturestart: true, gesturechange: true, touchmove: true };

async function openNameDialog(page) {
  await page.locator('[data-pro="participant"]:visible').first().click();
  await page.locator("#canvas-name-form").waitFor();
  await settled(page);
}
async function openCardPanel(page) {
  await page.locator('[data-node="c"] [data-pro="task-details"]').click();
  await page.locator("#task-form").waitFor();
  await settled(page);
}

onDevices(["phone", "ipad"], () => {
  test("with a dialog open, a finger on the dialog and one on the board zoom nothing", async ({ page }) => {
    const cdp = await open(page);
    await openNameDialog(page);
    const before = await camera(page);
    const dialog = await page.locator("dialog[open]").boundingBox();
    const onDialog = { x: dialog.x + dialog.width / 2, y: dialog.y + dialog.height / 2 };
    const onBoard = { x: dialog.x + dialog.width / 2, y: Math.max(20, dialog.y - 120) };
    expect(await page.evaluate(({ x, y }) => !document.elementFromPoint(x, y).closest(".dialog-body, .dialog-head, .dialog-foot"), onBoard), "second finger is on the backdrop over the board").toBe(true);
    await twoFingers(cdp, onDialog, onBoard, { x: 0, y: 14 }, { x: 0, y: -14 });
    await fingerThenFinger(cdp, onBoard, onDialog, { x: 0, y: -12 }, { x: 0, y: 12 });
    // Proving the camera does not move: nothing changes to wait for, so give a stray zoom time to show.
    await page.waitForTimeout(250);
    expect(await camera(page), "board camera and page scale stay put").toEqual(before);
    await expect(page.locator("#canvas-name-form"), "the dialog stays open").toHaveCount(1);
  });

  test("with a dialog open, Safari's pinch events over the dialog are cancelled", async ({ page }) => {
    await open(page);
    await openNameDialog(page);
    expect(await safariPinchCancelled(page, "#canvas-name-form .dialog-body")).toEqual(allCancelled);
  });

  test("Safari's pinch events never zoom the page over the board or a list", async ({ page }) => {
    await open(page);
    expect(await safariPinchCancelled(page, "#canvas"), "over the board").toEqual(allCancelled);
    await page.goto(url().replace(/board\/.*$/, "list"));
    await page.locator(".task-row").first().waitFor();
    expect(await safariPinchCancelled(page, ".main"), "over the List view").toEqual(allCancelled);
  });

  test("with no dialog, two fingers on the board zoom it", async ({ page }) => {
    const cdp = await open(page);
    const card = await page.locator('[data-node="c"]').boundingBox();
    const a = await emptyBoardPoint(page, card);
    const before = await camera(page);
    await twoFingers(cdp, { x: a.x, y: a.y + 30 }, { x: a.x, y: a.y + 110 }, { x: 0, y: -6 }, { x: 0, y: 8 });
    await expect.poll(async () => (await camera(page)).zoom, { message: "board zooms" }).not.toBe(before.zoom);
  });
});

onDevices(["ipad"], () => {
  test("with the card panel open, a finger on the panel and one on the board leave the board alone", async ({ page }) => {
    const cdp = await open(page);
    await openCardPanel(page);
    const panel = await page.locator("#task-form").boundingBox();
    const desc = await page.locator("#task-form .inline-rich").first().boundingBox();
    const onPanel = { x: desc.x + Math.min(60, desc.width / 2), y: desc.y + Math.min(20, desc.height / 2) };
    const onBoard = await emptyBoardPoint(page, panel);
    expect(onBoard, "an empty spot on the board is visible beside the panel").toBeTruthy();
    expect(await page.evaluate(({ x, y }) => !!document.elementFromPoint(x, y).closest("#task-form"), onPanel), "first finger is on the card panel").toBe(true);
    const before = await camera(page);
    await twoFingers(cdp, onPanel, onBoard, { x: 4, y: 6 }, { x: -12, y: -10 });
    // Proving the camera does not move: give a stray zoom time to show.
    await page.waitForTimeout(250);
    expect(await camera(page), "panel finger first, then board finger").toEqual(before);
    await fingerThenFinger(cdp, onBoard, onPanel, { x: -10, y: -8 }, { x: 4, y: 6 });
    await page.waitForTimeout(250);
    const after = await camera(page);
    expect(after.zoom, "board finger first, then panel finger: no zoom").toBe(before.zoom);
    expect(after.scale, "page scale stays 1").toBe(1);
    // The board finger may pan by up to its first step before the panel finger lands.
    const shift = (t) => t.match(/translate\(([-\d.]+)px, ?([-\d.]+)px\)/).slice(1).map(Number);
    const [bx, by] = shift(before.world), [ax, ay] = shift(after.world);
    expect(Math.abs(ax - bx) <= 12 && Math.abs(ay - by) <= 12, `board stops following once the panel finger lands ${before.world} -> ${after.world}`).toBe(true);
    await expect(page.locator("#task-form"), "the card panel stays open").toHaveCount(1);
  });

  test("with the card panel open, two fingers on the board still zoom it", async ({ page }) => {
    const cdp = await open(page);
    await openCardPanel(page);
    const panel = await page.locator("#task-form").boundingBox();
    const a = await emptyBoardPoint(page, panel);
    const before = await camera(page);
    await twoFingers(cdp, { x: a.x, y: a.y + 40 }, { x: a.x, y: a.y + 140 }, { x: 0, y: -6 }, { x: 0, y: 8 });
    await expect.poll(async () => (await camera(page)).zoom, { message: "board zooms" }).not.toBe(before.zoom);
    expect((await camera(page)).scale).toBe(1);
  });
});

// Owner request, 29 October 2026: a finger must not drag the whole app up or down. Safari's
// rubber-band bounce moves the page even where nothing scrolls; the page itself never
// overscrolls, while lists and panels keep scrolling.
onDevices(["phone", "ipad", "desktop"], () => {
  test("the page itself never bounces or drags with the finger", async ({ page }) => {
    await page.goto(`${app.base}/#project/${app.project.id}/list`);
    await page.locator(".topbar").waitFor();
    const behaviour = await page.evaluate(() => [document.documentElement, document.body].map((el) => {
      const style = getComputedStyle(el);
      return [style.overscrollBehaviorX, style.overscrollBehaviorY];
    }));
    expect(behaviour).toEqual([["none", "none"], ["none", "none"]]);
  });
});
