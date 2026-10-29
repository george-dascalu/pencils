// Touch selection on the board: holding a finger on empty space (or inside a frame)
// starts a selection box instead of dragging; a quick swipe still pans, cancelled
// contact and a second finger never leave a delayed selection, selected notes move
// as a group, and a new empty note shows its caret on the first text line.
import { test, expect, onDevices, useApp } from "../fixtures.mjs";

const nodes = [
  { id: "frame", type: "frame", x: 150, y: 130, w: 440, h: 380, text: "Frame" },
  ...["a", "b"].map((id, i) => ({ id, type: "sticky", x: 220 + i * 160, y: 250, w: 130, h: 100, text: `Note ${id}`, frame: "frame" })),
];
const app = useApp(async (store) => {
  const project = await store.createProject({ title: "Touch selection" });
  return { project, board: (await store.snapshot(project.id)).boards[0] };
});
const current = async () => (await app.store.snapshot(app.project.id)).boards[0];
// Each test starts from the same frame with two notes.
test.beforeEach(async () => {
  const board = await current();
  await app.store.updateBoard(app.project.id, board.id, { revision: board.revision, settings: { snap: false, alignObjects: false }, nodes, edges: [] });
});

// The hold that starts a selection box (and the time a finger rests before a second one lands).
const HOLD = 520;
const camera = (page) => page.locator("#canvas-world").evaluate((el) => el.style.transform);
const selected = (page) => page.locator(".board-node.selected").evaluateAll((els) => els.map((el) => el.dataset.node).sort());
const world = (page, x, y) => page.locator("#canvas").evaluate((el, { x, y }) => {
  const r = el.getBoundingClientRect(), m = new DOMMatrix(document.querySelector("#canvas-world").style.transform);
  return { x: r.x + m.e + x * m.a, y: r.y + m.f + y * m.a };
}, { x, y });
const types = { down: "touchStart", move: "touchMove", up: "touchEnd", cancel: "touchCancel" };
const pointer = (cdp, type, p, id = 1) => cdp.send("Input.dispatchTouchEvent", { type: types[type], touchPoints: ["up", "cancel"].includes(type) ? [] : [{ id, ...p, radiusX: 2, radiusY: 2, force: 1 }] });

async function open(page) {
  await page.addInitScript((id) => localStorage.setItem(`pencils:camera:${id}`, JSON.stringify({ x: 80, y: 50, z: 1 })), app.board.id);
  const cdp = await page.context().newCDPSession(page);
  await page.goto(`${app.base}/#project/${app.project.id}/board/${app.board.id}`);
  await page.locator('[data-node="a"]').waitFor();
  await page.locator('.board-tools [data-tool="cursor"]').click();
  return cdp;
}
// Hold at `from` until the selection box appears, then drag it to `to`.
async function holdSelect(page, cdp, from, to) {
  await pointer(cdp, "down", from);
  await page.locator(".marquee").waitFor();
  await pointer(cdp, "move", to);
  await pointer(cdp, "up", to);
}

onDevices(["ipad"], () => {
  test.use({ viewportSize: { width: 1180, height: 1000 } });

  test("holding inside a frame selects its children instead of dragging the frame", async ({ page }) => {
    const cdp = await open(page);
    const originalCamera = await camera(page);
    for (const x of [110, 180]) {
      await page.keyboard.press("Escape");
      await holdSelect(page, cdp, await world(page, x, 190), await world(page, 550, 380));
      expect(await selected(page)).toEqual(["a", "b"]);
    }
    expect(await camera(page)).toBe(originalCamera);
    expect(await page.evaluate(() => getSelection().toString())).toBe("");
  });

  test("notes selected by holding still move together", async ({ page }) => {
    const cdp = await open(page);
    await holdSelect(page, cdp, await world(page, 180, 190), await world(page, 550, 380));
    expect(await selected(page)).toEqual(["a", "b"]);
    const item = await world(page, 270, 300);
    await pointer(cdp, "down", item);
    await pointer(cdp, "move", { x: item.x + 30, y: item.y + 20 });
    await pointer(cdp, "up", { x: item.x + 30, y: item.y + 20 });
    await expect.poll(async () => (await current()).nodes.find((n) => n.id === "a").x).toBe(250);
    expect((await current()).nodes.find((n) => n.id === "b").x).toBe(410);
  });

  test("a swipe before the hold threshold pans instead of selecting", async ({ page }) => {
    const cdp = await open(page);
    const originalCamera = await camera(page);
    const p = await world(page, 700, 550);
    await pointer(cdp, "down", p);
    await pointer(cdp, "move", { x: p.x - 40, y: p.y - 20 });
    // Proving no selection box appears: wait past the hold threshold.
    await page.waitForTimeout(HOLD);
    await expect(page.locator(".marquee")).toHaveCount(0);
    await pointer(cdp, "up", p);
    expect(await camera(page)).not.toBe(originalCamera);
  });

  test("cancelled contact cannot start a delayed selection", async ({ page }) => {
    const cdp = await open(page);
    const p = await world(page, 700, 550);
    await pointer(cdp, "down", p);
    await pointer(cdp, "cancel", p);
    // Proving no selection box appears: wait past the hold threshold.
    await page.waitForTimeout(HOLD);
    await expect(page.locator(".marquee")).toHaveCount(0);
  });

  test("a second finger cancels a pending hold and takes over an active selection box", async ({ page }) => {
    const cdp = await open(page);
    for (const held of ["pending", "active"]) {
      await page.keyboard.press("Escape");
      let p = await world(page, 700, 550);
      await pointer(cdp, "down", p);
      if (held === "pending") {
        // The first finger rests briefly, short of the hold threshold, before the second lands.
        await page.waitForTimeout(100);
      } else {
        await page.locator(".marquee").waitFor();
        p = await world(page, 200, 200);
        await pointer(cdp, "move", p);
        await expect(page.locator(".board-node.selected")).toHaveCount(2);
      }
      await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ id: 1, ...p }, { id: 2, x: p.x + 70, y: p.y }] });
      // Proving no selection box appears (or comes back): wait past the hold threshold.
      await page.waitForTimeout(HOLD);
      await expect(page.locator(".marquee")).toHaveCount(0);
      await pointer(cdp, "up", p);
      await expect(page.locator(".board-node.selected"), "Pinch cancels tentative selection").toHaveCount(0);
    }
  });

  test("a new empty note shows its caret on the same line as the first text", async ({ page }) => {
    const cdp = await open(page);
    await page.locator('.board-tools [data-tool="sticky"]').click();
    const p = await world(page, 650, 160);
    await pointer(cdp, "down", p);
    await pointer(cdp, "up", p);
    const rich = page.locator("#canvas-inline-form .inline-rich");
    await rich.waitFor();
    await rich.tap();
    const caret = () => rich.evaluate((el) => {
      const selection = getSelection(), range = selection.getRangeAt(0), box = range.getBoundingClientRect();
      const line = el.querySelector("p"), rect = line.getBoundingClientRect();
      return { y: box.y, height: box.height, lineY: rect.y, lineHeight: rect.height, html: el.innerHTML, selected: el.contains(selection.anchorNode) };
    });
    const empty = await caret();
    expect(empty.selected).toBe(true);
    await page.keyboard.insertText("First note text");
    const filled = await caret();
    expect(Math.abs(empty.lineY - filled.lineY), JSON.stringify({ empty, filled })).toBeLessThan(2);
    if (empty.height) expect(Math.abs(empty.y - filled.y), JSON.stringify({ empty, filled })).toBeLessThan(2);
    expect(await rich.evaluate((el) => getComputedStyle(el).webkitUserSelect)).toBe("text");
    await page.keyboard.press("Control+Enter");
    await expect.poll(async () => (await current()).nodes.some((n) => n.text === "First note text")).toBe(true);
    await page.locator(".board-node.sticky").filter({ hasText: "First note text" }).click();
    await page.locator('[data-pro="inline"]').click();
    await rich.waitFor();
    await expect.poll(() => rich.textContent()).toBe("First note text\n");
  });
});
