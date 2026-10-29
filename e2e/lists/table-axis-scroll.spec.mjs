// Owner request, 28 October 2026: on phones and iPad the Table scrolls either
// horizontally or vertically in one swipe, never both. The first movement picks
// the axis; the other axis stays where it was, including during momentum.
// Taps on cells still work, and mouse/trackpad scrolling is unchanged.
import { test, expect, onDevices, useApp } from "../fixtures.mjs";

const app = useApp(async (store) => {
  const project = await store.createProject({ title: "Table axis", key: "TA" });
  for (let i = 0; i < 60; i++)
    await store.createTask(project.id, { title: `Row ${String(i).padStart(2, "0")} with a reasonably long title`, status: "todo", tags: ["alpha", "beta"], estimate: 3 });
  return { project };
});

const area = (page) => page.locator("#view-content > .table-scroll");
const position = (page) => area(page).evaluate((el) => ({ left: Math.round(el.scrollLeft), top: Math.round(el.scrollTop), maxLeft: el.scrollWidth - el.clientWidth, maxTop: el.scrollHeight - el.clientHeight }));

async function open(page) {
  await page.goto(`${app.base}/#project/${app.project.id}/table`);
  await page.locator(".spreadsheet tbody tr").nth(20).waitFor();
  // Navigation restores the saved scroll position one frame after it records the entry.
  await page.waitForFunction(() => history.state?.kind === "pencils-navigation-v1");
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  // Start away from the edges so both axes can move either way.
  await area(page).evaluate((el) => { el.scrollTop = 300; el.scrollLeft = 120; });
  await expect.poll(async () => { const p = await position(page); return [p.left, p.top]; }).toEqual([120, 300]);
}
async function centre(page) {
  const box = await area(page).boundingBox();
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}
// Waits until scrolling (including momentum) has stopped.
async function settled(page) {
  let last;
  await expect.poll(async () => {
    const p = await position(page);
    const still = !!last && p.left === last.left && p.top === last.top;
    last = p;
    return still;
  }, { intervals: [120] }).toBe(true);
  return last;
}
// A finger swipe of (dx, dy) in `steps` moves, `interval` ms apart. The pause between
// moves sets the finger's speed (slow drag or flick); it is input pacing, not a wait.
async function swipe(cdp, from, dx, dy, { steps = 12, interval = 16 } = {}) {
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ id: 1, ...from }] });
  for (let i = 1; i <= steps; i++) {
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ id: 1, x: from.x + (dx * i) / steps, y: from.y + (dy * i) / steps }] });
    await new Promise((resolve) => setTimeout(resolve, interval));
  }
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
}

onDevices(["phone", "ipad"], () => {
  test("the table can scroll both ways", async ({ page }) => {
    await open(page);
    const p = await position(page);
    expect(p.maxLeft > 200 && p.maxTop > 400, `room to scroll in both directions ${JSON.stringify(p)}`).toBe(true);
  });

  // Chromium already rails touch scrolling to one axis; iOS Safari does not. The
  // app drives Table touch scrolling itself so the lock holds on iPhone and iPad.
  test("the app drives touch scrolling on the table", async ({ page }) => {
    await open(page);
    await expect(area(page)).toHaveCSS("touch-action", "none");
  });

  test("a mostly vertical swipe that drifts sideways scrolls only vertically", async ({ page }) => {
    await open(page);
    const cdp = await page.context().newCDPSession(page);
    const before = await position(page);
    // Slow, so no momentum: up by 240px while drifting 90px left.
    await swipe(cdp, await centre(page), 90, -240, { steps: 16, interval: 30 });
    const after = await settled(page);
    expect(after.top - before.top, `scrolled down ${JSON.stringify({ before, after })}`).toBeGreaterThan(150);
    expect(after.left, `no sideways scroll ${JSON.stringify({ before, after })}`).toBe(before.left);
  });

  test("a mostly horizontal swipe that drifts up or down scrolls only horizontally", async ({ page }) => {
    await open(page);
    const cdp = await page.context().newCDPSession(page);
    const before = await position(page);
    await swipe(cdp, await centre(page), -200, 80, { steps: 16, interval: 30 });
    const after = await settled(page);
    expect(after.left - before.left, `scrolled sideways ${JSON.stringify({ before, after })}`).toBeGreaterThan(120);
    expect(after.top, `no vertical scroll ${JSON.stringify({ before, after })}`).toBe(before.top);
  });

  test("a flick keeps its momentum on the chosen axis only", async ({ page }) => {
    await open(page);
    const cdp = await page.context().newCDPSession(page);
    const before = await position(page);
    await swipe(cdp, await centre(page), 40, -160, { steps: 6, interval: 12 });
    const released = await position(page);
    await expect.poll(async () => (await position(page)).top, "momentum carries on after release").toBeGreaterThan(released.top + 40);
    const after = await settled(page);
    expect(after.left, `momentum never moves sideways ${JSON.stringify({ before, released, after })}`).toBe(before.left);
  });

  test("a tap on a cell still reaches it", async ({ page }) => {
    await open(page);
    const cell = page.locator(".spreadsheet tbody tr").nth(12).locator('td[data-column-key="title"] input');
    await cell.tap();
    await page.waitForFunction(() => document.activeElement?.closest?.('td[data-column-key="title"]'));
  });
});

test("mouse wheel scrolling still moves both ways", async ({ page }) => {
  await open(page);
  const before = await position(page);
  const c = await centre(page);
  await page.mouse.move(c.x, c.y);
  await page.mouse.wheel(60, 200);
  await expect.poll(async () => (await position(page)).top, "wheel scrolls down").toBeGreaterThan(before.top);
  if (before.maxLeft > 0) await expect.poll(async () => (await position(page)).left, "a diagonal wheel still scrolls sideways on desktop").toBeGreaterThan(before.left);
});
