// Owner request (F0.21-83, 3 November 2026): the pen bar on one line, organised into groups, with a
// choice of what draws: the pen (fingers select and pan), a finger (the pen selects), or both.
import { test, expect, onDevices, useApp } from "../fixtures.mjs";

const app = useApp(async (store) => {
  const project = await store.createProject({ title: "Pen bar" });
  return { project, board: (await store.snapshot(project.id)).boards[0] };
});
const current = async () => (await app.store.snapshot(app.project.id)).boards[0];
const strokeCount = async () => (await current()).nodes.filter((n) => n.type === "draw").length;
test.beforeEach(async () => {
  const board = await current();
  await app.store.updateBoard(app.project.id, board.id, { revision: board.revision, nodes: [], edges: [], settings: { snap: false } });
});
async function open(page) {
  await page.goto(`${app.base}/#project/${app.project.id}/board/${app.board.id}`);
  await page.locator("#canvas").waitFor();
  await page.locator("#canvas").evaluate((el) => el.focus());
  await page.keyboard.press("p");
  await expect(page.locator("#pen-tools")).toBeVisible();
}

onDevices(["desktop", "ipad", "ipad-portrait", "phone"], () => test("the pen bar is one line of groups, with Pressure and Shapes in Pen settings", async ({ page, device }) => {
  await open(page);
  const bar = page.locator("#pen-tools");
  const rows = await bar.evaluate((el) => {
    const tops = [...el.querySelectorAll(":scope > *, :scope > .selection-group > *")].filter((c) => c.getClientRects().length && getComputedStyle(c).position !== "fixed").map((c) => Math.round(c.getBoundingClientRect().top + c.getBoundingClientRect().height / 2));
    return { spread: Math.max(...tops) - Math.min(...tops), wrap: getComputedStyle(el).flexWrap, scrolls: el.scrollWidth > el.clientWidth + 1, x: getComputedStyle(el).overflowX };
  });
  expect(rows.wrap, "it never wraps").toBe("nowrap");
  expect(rows.spread, "every control sits on one line").toBeLessThanOrEqual(2);
  if (device !== "phone") expect(rows.scrolls, `${device}: the whole bar fits`).toBe(false);
  else expect(rows.x, "a phone's bar scrolls sideways").toMatch(/auto|scroll/);
  // Groups, in order: the tools, the presets, the colour and width, what draws and the settings, then Done.
  const groups = await bar.evaluate((el) => [...el.children].map((c) => c.dataset.penGroup || c.className));
  expect(groups.filter((g) => /^(Tools|Presets|Style|Input|Done)$/.test(g))).toEqual(["Tools", "Presets", "Style", "Input", "Done"]);
  await expect(bar.locator(":scope > [data-pen-pressure], :scope > [data-pen-recognise], .selection-group > [data-pen-pressure], .selection-group > [data-pen-recognise]")).toHaveCount(0);
  await bar.locator(".pen-preferences > summary").click();
  const settings = page.getByRole("group", { name: "Pen settings" });
  await expect(settings.getByRole("checkbox", { name: "Pressure sensitivity" })).toBeVisible();
  await expect(settings.getByRole("checkbox", { name: "Recognise shapes" })).toBeVisible();
}));

test("Draw with: the pen, a finger or both, remembered after a reload", async ({ page, browserName }) => {
  test.skip(browserName !== "chromium", "Pen and touch input need Chromium's CDP");
  await page.setViewportSize({ width: 1200, height: 900 });
  await open(page);
  const input = page.locator("select[data-pen-input]");
  await expect(input).toHaveValue("pen");
  expect(await input.locator("option").allTextContents()).toEqual(["Pen", "Finger", "Both"]);
  const cdp = await page.context().newCDPSession(page);
  const box = await page.locator("#canvas").boundingBox();
  const at = (dx, dy) => ({ x: box.x + box.width / 2 + dx, y: box.y + box.height / 2 + dy });
  const touch = async (dy) => {
    const p = at(-100, dy);
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ ...p, id: 1 }] });
    for (let i = 1; i <= 6; i++) await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: p.x + i * 20, y: p.y + i * 5, id: 1 }] });
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  };
  const pen = async (dy) => {
    const p = at(-100, dy), send = (type, x, y, buttons) => cdp.send("Input.dispatchMouseEvent", { type, x, y, button: "left", buttons, pointerType: "pen", force: 0.5 });
    await send("mousePressed", p.x, p.y, 1);
    for (let i = 1; i <= 6; i++) await send("mouseMoved", p.x + i * 20, p.y + i * 5, 1);
    await send("mouseReleased", p.x + 120, p.y + 30, 0);
  };
  // Pen (the default): a finger doesn't draw, the pen does.
  await touch(-150);
  await page.waitForTimeout(300);
  expect(await strokeCount(), "a finger pans while the pen draws").toBe(0);
  await pen(-100);
  await expect.poll(strokeCount).toBe(1);
  // Finger: one finger draws, and the pen doesn't.
  await input.selectOption("finger");
  await touch(-50);
  await expect.poll(strokeCount, "a finger draws").toBe(2);
  await pen(0);
  await page.waitForTimeout(300);
  expect(await strokeCount(), "the pen selects instead").toBe(2);
  // A second finger turns a finger stroke into a pinch, keeping no ink.
  const p = at(-100, 50), send = (type, touchPoints) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints });
  await send("touchStart", [{ ...p, id: 1 }]);
  await send("touchMove", [{ x: p.x + 20, y: p.y, id: 1 }]);
  await send("touchStart", [{ x: p.x + 20, y: p.y, id: 1 }, { x: p.x + 80, y: p.y, id: 2 }]);
  await send("touchMove", [{ x: p.x, y: p.y, id: 1 }, { x: p.x + 110, y: p.y, id: 2 }]);
  await send("touchEnd", []);
  await page.waitForTimeout(300);
  expect(await strokeCount(), "a pinch keeps no ink").toBe(2);
  // Both: either draws.
  await page.locator("select[data-pen-input]").selectOption("both");
  await touch(100);
  await expect.poll(strokeCount).toBe(3);
  await pen(150);
  await expect.poll(strokeCount).toBe(4);
  await page.reload();
  await page.locator("#canvas").waitFor();
  await page.locator("#canvas").evaluate((el) => el.focus());
  await page.keyboard.press("p");
  await expect(page.locator("select[data-pen-input]"), "remembered").toHaveValue("both");
});

test("with Draw with on a finger, the Hand tool still pans and quick dots never switch tools", async ({ page, browserName }) => {
  test.skip(browserName !== "chromium", "Touch input needs Chromium's CDP");
  await page.setViewportSize({ width: 1200, height: 900 });
  await open(page);
  await page.locator("select[data-pen-input]").selectOption("finger");
  const cdp = await page.context().newCDPSession(page);
  const box = await page.locator("#canvas").boundingBox();
  const c = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  const send = (type, touchPoints) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints });
  // Two quick dots: two strokes, and the pen stays the pen (a double tap would switch to the eraser).
  for (const dx of [0, 18]) { await send("touchStart", [{ x: c.x + dx, y: c.y, id: 1 }]); await send("touchEnd", []); }
  await expect.poll(strokeCount).toBe(2);
  await page.waitForTimeout(400);
  await expect(page.locator('[data-pen-mode="pen"]')).toHaveAttribute("aria-pressed", "true");
  // The Hand tool: one finger pans the board and draws nothing.
  await page.locator('.board-tools [aria-label="Pan canvas"]').click();
  await expect(page.locator("#canvas")).toHaveClass(/\bpan-mode\b/);
  const before = await page.locator("#canvas-world").getAttribute("style");
  await send("touchStart", [{ x: c.x, y: c.y + 100, id: 1 }]);
  for (let i = 1; i <= 6; i++) await send("touchMove", [{ x: c.x + i * 20, y: c.y + 100, id: 1 }]);
  await send("touchEnd", []);
  await expect.poll(() => page.locator("#canvas-world").getAttribute("style"), "the board moved").not.toBe(before);
  expect(await strokeCount()).toBe(2);
});
