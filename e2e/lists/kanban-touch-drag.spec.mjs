// Owner request, 30 October 2026 (iPhone screen recording): dragging a Kanban card by touch showed a
// tiny framed copy, no target in an empty column, and didn't place the card. A long press now lifts
// the card, which follows the finger over a placeholder and lands where it's let go, with a haptic
// tick on lift and drop. Moving first still scrolls. A press selects no text on the board, and
// lifting a card clears any selection (owner request, T7, 0.20.79: dragging selected the text
// underneath).
import { test, expect, onDevices, useApp } from "../fixtures.mjs";

const app = useApp(async (store) => {
  const project = await store.createProject({ title: "Touch drag", key: "TD" });
  const first = await store.createTask(project.id, { title: "First card", status: "backlog" });
  // The phone test reorders its own pair, as the iPad test moves the first card.
  const third = await store.createTask(project.id, { title: "Third card", status: "backlog" });
  const fourth = await store.createTask(project.id, { title: "Fourth card", status: "backlog" });
  return { project, first, third, fourth };
});
const card = (page, t) => page.locator(`[data-drag-task="${t.id}"]`);
const saved = async (t) => (await app.store.snapshot(app.project.id)).tasks.find((x) => x.id === t.id);
async function open(page) {
  // Count haptic ticks: Chromium has the Vibration API, which Android uses.
  await page.addInitScript(() => { window.ticks = 0; navigator.vibrate = () => { window.ticks++; return true; }; });
  await page.goto(`${app.base}/#project/${app.project.id}/kanban`);
  await card(page, app.first).waitFor();
  return page.context().newCDPSession(page);
}
const centre = (box) => ({ x: box.x + box.width / 2, y: box.y + box.height / 2 });

onDevices(["ipad"], () => test("a long press lifts a card, which lands in another column, even an empty one", async ({ page }) => {
  const touch = await open(page);
  const from = centre(await card(page, app.first).boundingBox());
  const width = (await card(page, app.first).boundingBox()).width;
  await touch.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [from] });
  const ghost = page.locator(".kanban-drag-image");
  await expect(ghost, "the long press lifts it").toBeVisible();
  expect(Math.abs((await ghost.boundingBox()).width - width), "a full-size copy follows the finger").toBeLessThanOrEqual(width * 0.1);
  expect(await page.evaluate(() => window.ticks), "a tick on lift").toBe(1);
  const column = page.locator('.kanban-column[data-drop-status="todo"]');
  const to = centre(await column.boundingBox());
  await touch.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [to] });
  await expect(column, "the empty column takes it").toHaveClass(/\bover\b/);
  await expect(column.locator(".kanban-drop-placeholder")).toBeVisible();
  const g = await ghost.boundingBox();
  expect(Math.abs(g.x + g.width / 2 - to.x) < width && Math.abs(g.y - to.y) < 120, `the copy is under the finger ${JSON.stringify(g)}`).toBe(true);
  await touch.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await expect.poll(async () => (await saved(app.first)).status, "it lands there").toBe("todo");
  await expect(column.locator(`[data-drag-task="${app.first.id}"]`)).toBeVisible();
  await expect(ghost).toHaveCount(0);
  expect(await page.evaluate(() => window.ticks), "a tick on drop").toBe(2);
  await expect(page.locator("#task-form"), "letting go doesn't open the card").toHaveCount(0);
}));

onDevices(["phone"], () => test("on phones a long press reorders a column, and moving first scrolls instead", async ({ page }) => {
  const touch = await open(page);
  let from = centre(await card(page, app.third).boundingBox());
  // A finger that moves before the long press scrolls the board; no card lifts. Nothing in the
  // page marks a long press not happening, so wait past its 350ms.
  await touch.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [from] });
  await touch.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: from.x, y: from.y + 40 }] });
  await page.waitForTimeout(500);
  await expect(page.locator(".kanban-drag-image"), "moving first scrolls").toHaveCount(0);
  await touch.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  // The column may have scrolled under that finger.
  from = centre(await card(page, app.third).boundingBox());
  const below = await card(page, app.fourth).boundingBox();
  await touch.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [from] });
  await expect(page.locator(".kanban-drag-image")).toBeVisible();
  await touch.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: from.x, y: below.y + below.height - 4 }] });
  await touch.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await expect.poll(async () => (await saved(app.third)).order > (await saved(app.fourth)).order, "the third card now follows the fourth").toBe(true);
  await expect(page.locator("#task-form")).toHaveCount(0);
  // Lifted and let go in place, nothing changes: not even the sort, which a drop sets to Manual order.
  await page.locator("[data-sort-menu]").click();
  await page.locator("#shared-select-menu").getByRole("option", { name: "Date created", exact: true }).click();
  from = centre(await card(page, app.fourth).boundingBox());
  await touch.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [from] });
  await expect(page.locator(".kanban-drag-image")).toBeVisible();
  await touch.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await expect(page.locator(".kanban-drag-image")).toHaveCount(0);
  await expect(card(page, app.fourth)).toBeVisible();
  await page.reload(); // a drop saves Manual order as the sort
  await expect(page.locator("[data-sort-menu]"), "the sort stays").toHaveAttribute("aria-label", "Sort: Date created");
}));

onDevices(["phone"], () => test("a touch drag selects no text: the board is unselectable and lifting clears a selection", async ({ page }) => {
  const touch = await open(page);
  expect(await page.locator(".kanban").evaluate((el) => getComputedStyle(el).userSelect), "column titles and counts can't be selected by a long press").toBe("none");
  // A stray selection elsewhere on the page, as a long press near the board can leave.
  await page.evaluate(() => {
    const stray = Object.assign(document.createElement("p"), { id: "stray", textContent: "Stray text" });
    document.body.append(stray);
    getSelection().selectAllChildren(stray);
  });
  expect(await page.evaluate(() => getSelection().toString())).toBe("Stray text");
  // The backlog column shows first on phones (the iPad test moves the first card out of it).
  const from = centre(await card(page, app.fourth).boundingBox());
  await touch.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [from] });
  await expect(page.locator(".kanban-drag-image")).toBeVisible();
  expect(await page.evaluate(() => getSelection().toString()), "lifting the card clears it").toBe("");
  await touch.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await expect(page.locator(".kanban-drag-image")).toHaveCount(0);
}));
