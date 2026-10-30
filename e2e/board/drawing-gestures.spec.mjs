// Pen and touch on the board (iPad): with the pen active a finger still pans, selects,
// moves and resizes objects instead of drawing; a second finger cancels an object edit
// and pinches; the palm is ignored while the pen draws; double tap and two-finger tap
// run the configured gestures (eraser toggle, undo/redo), shared with Personal settings;
// cancelled touches and the pen side button never draw; the preferences fit iPad and phone
// screens in both themes.
import { test, expect, onDevices, useApp } from "../fixtures.mjs";
import { openSettingsPage } from "../helpers/menu-controls.mjs";

const card = { id: "note", type: "sticky", x: 220, y: 160, w: 250, h: 180, text: "Move with fingers" };
const app = useApp(async (store) => {
  const project = await store.createProject({ title: "Board gestures" });
  return { project, board: (await store.snapshot(project.id)).boards[0] };
});
const current = async () => (await app.store.snapshot(app.project.id)).boards.find((b) => b.id === app.board.id);
const strokes = async () => (await current()).nodes.filter((n) => n.type === "draw");
const stickies = async () => (await current()).nodes.filter((n) => n.type === "sticky").length;
const note = async () => (await current()).nodes.find((n) => n.id === "note");
// Each test starts from one note and no ink.
test.beforeEach(async () => {
  const board = await current();
  await app.store.updateBoard(app.project.id, board.id, { revision: board.revision, nodes: [card], edges: [], settings: { snap: false, alignObjects: false } });
});

// Raw touch and pen input through CDP, with board coordinates converted to the screen.
async function open(page) {
  await page.addInitScript((id) => localStorage.setItem(`pencils:camera:${id}`, JSON.stringify({ x: 80, y: 80, z: 1 })), app.board.id);
  const session = await page.context().newCDPSession(page);
  await page.goto(`${app.base}/#project/${app.project.id}/board/${app.board.id}`);
  await page.locator("#canvas.drawing-canvas").waitFor();
  const camera = () => page.locator("#canvas-world").evaluate((el) => {
    const m = new DOMMatrix(el.style.transform);
    return { x: m.e, y: m.f, z: m.a };
  });
  const world = (x, y) => page.locator("#canvas").evaluate((el, { x, y }) => {
    const r = el.getBoundingClientRect(), m = new DOMMatrix(document.querySelector("#canvas-world").style.transform);
    return { x: r.x + m.e + x * m.a, y: r.y + m.f + y * m.a };
  }, { x, y });
  async function touch(type, points) {
    await session.send("Input.dispatchTouchEvent", { type, touchPoints: points.map((p, i) => ({ id: p.id ?? i + 1, radiusX: 2, radiusY: 2, force: 1, ...p })) });
  }
  const tap = async (p) => { await touch("touchStart", [p]); await touch("touchEnd", []); };
  // Gesture timing: a pause first, so earlier taps do not count towards this one.
  const doubleTap = async (p) => { await page.waitForTimeout(400); await tap(p); await tap(p); };
  const twoTap = async (p) => { await page.waitForTimeout(400); await touch("touchStart", [p, { x: p.x + 70, y: p.y }]); await touch("touchEnd", []); };
  const drag = async (from, to) => { await touch("touchStart", [from]); await touch("touchMove", [to]); await touch("touchEnd", []); };
  const pen = (type, p, force = 0.5) => session.send("Input.dispatchMouseEvent", { type, ...p, button: "left", buttons: type === "mouseReleased" ? 0 : 1, pointerType: "pen", force });
  async function stroke(x, y, palm = false) {
    const from = await world(x, y), to = await world(x + 80, y + 40);
    const before = await camera();
    await pen("mousePressed", from, 0.2);
    if (palm) {
      const hand = await world(700, 390);
      await touch("touchStart", [hand]);
      await touch("touchMove", [{ x: hand.x - 60, y: hand.y - 30 }]);
    }
    for (let i = 1; i <= 6; i++) await pen("mouseMoved", { x: from.x + ((to.x - from.x) * i) / 6, y: from.y + ((to.y - from.y) * i) / 6 }, 0.2 + i * 0.1);
    await pen("mouseReleased", to, 0);
    if (palm) {
      await touch("touchEnd", []);
      expect(await camera(), "Palm must not pan while the pen draws").toEqual(before);
    }
  }
  const drawTool = async () => {
    await page.locator('.board-tools [data-feature="draw-tool"]').click();
    await page.locator("#pen-tools").waitFor();
  };
  // One saved stroke, so later checks can tell whether ink was added, erased or undone.
  const oneStroke = async () => {
    await stroke(530, 180);
    await expect.poll(async () => (await strokes()).length, { message: "Pencil stroke should save" }).toBe(1);
  };
  return { session, camera, world, touch, tap, doubleTap, twoTap, drag, pen, stroke, drawTool, oneStroke };
}
const penMode = (page, mode) => page.locator(`[data-pen-mode="${mode}"]`);

onDevices(["ipad"], () => {
  test.use({ viewportSize: { width: 1180, height: 1000 } });

  test("a finger places a note when the note tool is selected", async ({ page }) => {
    const g = await open(page);
    await page.locator('.board-tools [data-tool="sticky"]').click();
    await g.tap(await g.world(500, 450));
    await expect.poll(stickies, { message: "Finger should place a note with the note tool" }).toBe(2);
    await page.keyboard.press("Escape");
    await page.keyboard.press("Delete");
    await expect.poll(stickies).toBe(1);
  });

  test("with the pen active a finger pans empty space and the pen draws pressure-sensitive ink", async ({ page }) => {
    const g = await open(page);
    await g.drawTool();
    await expect(page.locator('.board-tools [data-action="board-task"]')).toBeVisible();
    await expect(page.locator('.board-tools [data-feature="project-frame-add"]')).toBeVisible();
    const p = await g.world(730, 350), before = await g.camera();
    await g.drag(p, { x: p.x - 50, y: p.y + 30 });
    expect((await strokes()).length, "Finger on empty space must not draw").toBe(0);
    await expect.poll(async () => (await g.camera()).x).toBe(before.x - 50);
    expect((await g.camera()).y).toBe(before.y + 30);
    await g.oneStroke();
    expect(new Set((await strokes())[0].pressures).size).toBeGreaterThan(1);
  });

  test("with the pen active a finger selects, moves and resizes a note without drawing", async ({ page }) => {
    const g = await open(page);
    await g.drawTool();
    const node = page.locator('[data-node="note"]');
    await g.tap(await g.world(300, 240));
    await expect(node).toHaveClass(/selected/);
    await expect(node.locator('.resize-handle[data-resize-corner="se"]')).toBeVisible();
    const p = await g.world(300, 240);
    await g.drag(p, { x: p.x + 45, y: p.y + 30 });
    await expect.poll(async () => (await note()).x, { message: "Finger should move selected note in pen mode" }).toBe(card.x + 45);
    const handle = await node.locator('.resize-handle[data-resize-corner="se"]').boundingBox();
    const h = { x: handle.x + handle.width / 2, y: handle.y + handle.height / 2 };
    await g.drag(h, { x: h.x + 30, y: h.y + 20 });
    await expect.poll(async () => (await note()).w, { message: "Finger should resize note in pen mode" }).toBe(card.w + 30);
    expect((await strokes()).length).toBe(0);
  });

  test("a second finger cancels a note move and pinches, and the remaining finger keeps panning", async ({ page }) => {
    const g = await open(page);
    await g.drawTool();
    await g.oneStroke();
    const saved = await note();
    const p = await g.world(saved.x + 90, saved.y + 90);
    const moved = { x: p.x + 60, y: p.y + 25 }, second = { x: p.x + 140, y: p.y + 80 };
    await g.touch("touchStart", [p]);
    await g.touch("touchMove", [moved]);
    await g.touch("touchStart", [moved, second]);
    let before = await g.camera();
    await g.touch("touchMove", [{ x: moved.x - 20, y: moved.y }, { x: second.x + 30, y: second.y }]);
    await expect.poll(async () => (await g.camera()).z, { message: "Pinch must zoom" }).toBeGreaterThan(before.z);
    // Keep contact through a presence heartbeat (and the refresh it may apply); it must not replace this canvas.
    const presence = (r) => r.url().endsWith("/presence") && r.request().method() === "POST";
    await page.waitForResponse(presence);
    await page.waitForResponse(presence);
    await g.touch("touchEnd", [{ id: 1, x: moved.x - 20, y: moved.y }]);
    before = await g.camera();
    await g.touch("touchMove", [{ id: 2, x: second.x + 60, y: second.y + 20 }]);
    await expect.poll(async () => Math.abs((await g.camera()).x - before.x - 30) < 0.1, { message: "Remaining finger should continue panning" }).toBe(true);
    await g.touch("touchEnd", []);
    // Proving nothing is saved: no change to wait for, so allow time for a stray save.
    await page.waitForTimeout(500);
    expect(await note(), "Pinch must cancel the partial object move").toEqual(saved);
    expect((await strokes()).length, "Pinch must not trigger undo").toBe(1);
  });

  test("double tap toggles the eraser, and a finger with the eraser active moves objects instead of erasing", async ({ page }) => {
    const g = await open(page);
    await g.drawTool();
    await g.oneStroke();
    const saved = await note();
    // Fit keeps the test coordinates on screen.
    await page.locator('[data-action="board-fit"]').click();
    await g.doubleTap(await g.world(650, 350));
    await expect(penMode(page, "erase")).toHaveAttribute("aria-pressed", "true");
    const p = await g.world(saved.x + 100, saved.y + 80);
    await g.drag(p, { x: p.x + 20, y: p.y });
    await expect.poll(async () => (await note()).x).toBeGreaterThan(saved.x);
    expect((await strokes()).length, "Finger with eraser active must select/move, not erase").toBe(1);
    await g.doubleTap(await g.world(650, 350));
    await expect(penMode(page, "pen")).toHaveAttribute("aria-pressed", "true");
  });

  test("the palm is ignored while the pen draws, and a two-finger tap undoes", async ({ page }) => {
    const g = await open(page);
    await g.drawTool();
    await g.stroke(540, 260, true);
    await expect.poll(async () => (await strokes()).length, { message: "Pen and palm together should produce one stroke" }).toBe(1);
    await g.twoTap(await g.world(650, 350));
    await expect.poll(async () => (await strokes()).length, { message: "Two-finger tap should undo" }).toBe(0);
  });

  test("gesture preferences set two-finger tap to redo and turn off double tap, fit the iPad and survive a reload", async ({ page }) => {
    const g = await open(page);
    await g.drawTool();
    await g.oneStroke();
    await g.twoTap(await g.world(650, 350));
    await expect.poll(async () => (await strokes()).length, { message: "Two-finger tap should undo" }).toBe(0);
    await page.locator(".pen-preferences summary").click();
    await page.locator('[data-drawing-gesture="twoFingerTap"]').selectOption("redo");
    await page.locator('[data-drawing-gesture="doubleTap"]').selectOption("none");
    const popoverLocator = page.locator(".pen-preferences .selection-popover");
    await expect(popoverLocator).toBeVisible();
    const popover = await popoverLocator.boundingBox();
    expect(popover.x >= 0 && popover.x + popover.width <= 1181, "Preferences should fit iPad width").toBe(true);
    expect(popover.y >= 0 && popover.y + popover.height <= 1001, "Preferences should fit iPad height").toBe(true);
    expect(await popoverLocator.evaluate((el) => {
      const r = el.getBoundingClientRect();
      return el.contains(document.elementFromPoint(r.x + r.width / 2, r.y + 20));
    }), `Preferences must be visible and interactive: ${JSON.stringify(popover)}`).toBe(true);
    await page.locator(".pen-preferences summary").click();
    await g.twoTap(await g.world(650, 350));
    await expect.poll(async () => (await strokes()).length, { message: "Configured two-finger gesture should redo" }).toBe(1);
    await g.doubleTap(await g.world(650, 350));
    await expect(penMode(page, "pen"), "Disabled double tap must not toggle tools").toHaveAttribute("aria-pressed", "true");
    await page.reload();
    await page.locator("#canvas").waitFor();
    await g.drawTool();
    await page.locator(".pen-preferences summary").click();
    await expect(page.locator('[data-drawing-gesture="twoFingerTap"]')).toHaveValue("redo");
    await expect(page.locator('[data-drawing-gesture="doubleTap"]')).toHaveValue("none");
    await page.locator(".pen-preferences summary").click();
  });

  test("a cancelled touch neither draws nor blocks the next pan", async ({ page }) => {
    const g = await open(page);
    await g.drawTool();
    await g.oneStroke();
    const p = await g.world(650, 350), before = await g.camera();
    await g.touch("touchStart", [p]);
    await g.touch("touchCancel", []);
    await g.drag(p, { x: p.x + 25, y: p.y + 15 });
    await expect.poll(async () => (await g.camera()).x).toBe(before.x + 25);
    expect((await strokes()).length).toBe(1);
  });

  test("the pen side button toggles the eraser once per press without drawing", async ({ page }) => {
    const g = await open(page);
    await g.drawTool();
    await g.oneStroke();
    const p = await g.world(650, 350);
    await g.session.send("Input.dispatchMouseEvent", { type: "mousePressed", ...p, pointerType: "pen", button: "right", buttons: 2 });
    await g.session.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: p.x + 2, y: p.y, pointerType: "pen", button: "right", buttons: 2 });
    await g.session.send("Input.dispatchMouseEvent", { type: "mouseReleased", ...p, pointerType: "pen", button: "right", buttons: 0 });
    await expect(penMode(page, "erase")).toHaveAttribute("aria-pressed", "true");
    expect((await strokes()).length, "Pen side button must not create ink").toBe(1);
    await penMode(page, "pen").click();
    await expect(penMode(page, "pen")).toHaveAttribute("aria-pressed", "true");
  });

  test("Personal settings share the gesture preferences, which fit iPad portrait and phone in dark mode", async ({ page }) => {
    const g = await open(page);
    await g.drawTool();
    await page.locator(".pen-preferences summary").click();
    await page.locator('[data-drawing-gesture="twoFingerTap"]').selectOption("redo");
    await page.locator(".pen-preferences summary").click();
    // Since 0.19.31 the former Personal settings are the Settings page's "You" section; its
    // "Back to project" returns to the board with the pen still chosen.
    await openSettingsPage(page, "personal");
    const personal = page.locator("#settings-panel");
    await expect(personal.locator('[data-drawing-gesture="twoFingerTap"]')).toHaveValue("redo");
    await personal.locator('[data-drawing-gesture="twoFingerTap"]').selectOption("none");
    await page.locator('[name="personal-theme"][value="dark"]').check();
    await page.locator('[data-action="settings-close"]').click();
    await expect(page.locator(".settings-navigation")).toHaveCount(0);
    await page.locator("#canvas.drawing-canvas").waitFor();
    await expect(page.locator("#pen-tools"), "the pen stays chosen").toBeVisible();
    for (const [width, height] of [[834, 1194], [390, 844]]) {
      await page.setViewportSize({ width, height });
      await page.waitForFunction((width) => innerWidth === width, width);
      await page.locator(".pen-preferences summary").click();
      const popover = page.locator(".pen-preferences[open] .selection-popover");
      await popover.waitFor();
      await expect(page.locator('[data-drawing-gesture="twoFingerTap"]')).toHaveValue("none");
      // The popover places itself after opening; wait for it to settle inside the viewport.
      const fits = (box) => box.x >= 0 && box.y >= 0 && box.x + box.width <= width + 1 && box.y + box.height <= height + 1;
      await expect.poll(async () => fits(await popover.boundingBox()), { message: `Preferences fit ${width}px viewport` }).toBe(true);
      const box = await popover.boundingBox();
      // The scrollable preferences remain finger-scrollable inside the canvas.
      const start = { x: box.x + box.width - 15, y: box.y + box.height - 30 };
      await g.drag(start, { x: start.x, y: box.y + 30 });
      expect(await popover.evaluate((el) => el.scrollHeight <= el.clientHeight || el.scrollTop > 0), "Finger can scroll gesture preferences").toBe(true);
      await page.keyboard.press("Escape");
      await expect(page.locator(".pen-preferences")).not.toHaveAttribute("open");
      await expect(penMode(page, "pen"), "Closing preferences must keep the pen active").toHaveAttribute("aria-pressed", "true");
    }
  });
});

// Owner request, 30 October 2026: double-tapping the board leaves the pen tools closed unless a
// drawing tool is already open; the gesture only switches between pen and eraser while drawing.
onDevices(["ipad", "phone"], () => test("double tap on the board does not open the pen tools when not drawing", async ({ page, device }) => {
  const g = await open(page);
  await expect(page.locator("#pen-tools")).toBeHidden();
  // Empty board, on screen on both devices.
  await g.doubleTap(await g.world(100, 420));
  await expect(page.locator("#pen-tools")).toBeHidden();
  await expect(penMode(page, "erase")).toHaveCount(0);
  // The same double tap switches to the eraser once the pen is open, so it reached the board.
  if (device === "phone") await page.getByRole("button", { name: "More canvas tools", exact: true }).click();
  await page.locator('[data-feature="draw-tool"]:visible').first().click();
  await page.locator("#pen-tools").waitFor();
  await g.doubleTap(await g.world(100, 420));
  await expect(penMode(page, "erase")).toHaveAttribute("aria-pressed", "true");
}));
