import { test, expect, useApp, onDevices } from "../fixtures.mjs";
import { reveal } from "../helpers/menu-controls.mjs";

const app = useApp(async store => {
  const project = await store.createProject({ title: "Calendar workspace" });
  await store.createTask(project.id, { title: "All day", due: "2026-11-02" });
  for (let i = 0; i < 20; i++) await store.createTask(project.id, { title: `Unscheduled ${i}` });
  return { project };
});
const toggle = page => page.locator("[data-calendar-unscheduled]");
const panel = page => page.locator(".calendar-unscheduled:popover-open");
async function open(page) {
  await page.clock.setFixedTime(new Date("2026-11-02T12:00:00"));
  await page.goto(`${app.base}/#project/${app.project.id}/calendar`);
  await (await reveal(page.locator("#calendar-mode"))).selectOption("week");
  if (await page.locator(".mobile-view-options[open]").count()) await page.getByRole("button", { name: "Close view options", exact: true }).click();
  await expect(page.locator(".calendar-hours-scroll")).toBeVisible();
}
async function begin(page, id) {
  await toggle(page).click();
  const grip = panel(page).locator(`[data-calendar-card="${id}"] .calendar-move`);
  await grip.scrollIntoViewIfNeeded();
  const r = await grip.boundingBox();
  await page.mouse.move(r.x + r.width / 2, r.y + r.height / 2);
  await page.mouse.down();
  await page.mouse.move(r.x + r.width / 2 + 12, r.y + r.height / 2, { steps: 3 });
  await expect(panel(page)).toHaveCSS("visibility", "hidden");
  await expect(page.locator(".calendar-drag-cancel")).toBeVisible();
}

onDevices(["desktop", "ipad", "phone"], () => test("calendar scrolls inside its viewport and headers align with the hours, including a scrollbar", { tag: "@gate" }, async ({ page, device }) => {
  await open(page);
  await page.addStyleTag({ content: '.calendar-hours-scroll { overflow-y: scroll; scrollbar-width: auto; } .calendar-hours-scroll::-webkit-scrollbar { width: 16px; }' });
  const aligned = () => page.evaluate(() => {
    const headers = [...document.querySelectorAll(".calendar-weekdays > strong")];
    return [".calendar-hours-day", ".calendar-all-day .calendar-day"].every(selector => {
      const days = [...document.querySelectorAll(selector)];
      return headers.every((el, i) => { const a = el.getBoundingClientRect(), b = days[i].getBoundingClientRect(); return Math.abs(a.left - b.left) < 1 && Math.abs(a.right - b.right) < 1; });
    });
  });
  await expect.poll(aligned).toBe(true);
  expect(await page.evaluate(() => document.scrollingElement.scrollHeight - innerHeight)).toBeLessThanOrEqual(1);
  await expect(page.locator('#view-content')).toHaveCSS("overflow-y", "hidden");
  await toggle(page).waitFor();
  const location = await toggle(page).evaluate(el => ({ previous: el.previousElementSibling?.className, fits: el.scrollWidth <= el.clientWidth }));
  expect(location.previous).toContain(device === "phone" ? "mobile-view-options" : "board-menu");
  expect(location.fits).toBe(true);
  await page.locator(".calendar-scroll").evaluate(el => el.scrollLeft = el.scrollWidth);
  await expect.poll(aligned).toBe(true);
  await page.setViewportSize({ width: page.viewportSize().width, height: 600 });
  await expect.poll(aligned).toBe(true);
  expect(await page.evaluate(() => document.scrollingElement.scrollHeight - innerHeight)).toBeLessThanOrEqual(1);
  await toggle(page).click();
  await expect(panel(page)).toBeVisible();
  expect(await panel(page).evaluate(el => el.scrollHeight > el.clientHeight || el.querySelector('.calendar-unscheduled-list').scrollHeight > el.querySelector('.calendar-unscheduled-list').clientHeight)).toBe(true);
  await page.keyboard.press("Escape");
  await expect(panel(page)).toHaveCount(0);
  await expect(toggle(page)).toBeFocused();
}));

onDevices(["desktop", "ipad", "phone"], () => test("unscheduled cards hide their list during drag, can be cancelled, and drop at an hour", { tag: "@gate" }, async ({ page }) => {
  const card = await app.store.createTask(app.project.id, { title: "Schedule this card" });
  await open(page);
  for (const cancel of ["drop", "escape", "outside"]) {
    await begin(page, card.id);
    if (cancel === "drop") {
      const r = await page.locator(".calendar-drag-cancel").boundingBox();
      await page.mouse.move(r.x + r.width / 2, r.y + r.height / 2, { steps: 6 });
      await expect(page.locator(".calendar-drag-cancel")).toHaveClass(/calendar-drop-target/);
    } else if (cancel === "escape") await page.keyboard.press("Escape");
    else await page.mouse.move(2, 2, { steps: 6 });
    await page.mouse.up();
    await expect(page.locator(".calendar-drag-cancel")).toHaveCount(0);
    await expect(panel(page)).toBeVisible();
    await page.keyboard.press("Escape");
  }
  expect((await app.store.snapshot(app.project.id)).tasks.find(t => t.id === card.id).due).toBeNull();
  await begin(page, card.id);
  const slot = await page.locator('.calendar-hours-day').first().locator('[data-hour="10"]').boundingBox();
  await page.mouse.move(slot.x + slot.width / 2, slot.y + 1, { steps: 6 });
  await expect(page.locator(".calendar-drag-preview")).toContainText("10:00");
  await page.mouse.up();
  await expect(panel(page)).toHaveCount(0);
  await expect(page.locator(`.calendar-timed-card[data-id="${card.id}"]`)).toBeVisible();
  await expect.poll(async () => {
    const t = (await app.store.snapshot(app.project.id)).tasks.find(t => t.id === card.id);
    return [t.start, t.due, t.start_time, t.due_time];
  }).toEqual(["2026-11-02", "2026-11-02", "10:00", "11:00"]);
}));

test("Unscheduled opens and closes with shared motion enabled", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await open(page);
  await toggle(page).click();
  await expect(panel(page)).toHaveCSS("opacity", "1");
  await toggle(page).click();
  await expect(panel(page)).toHaveCount(0);
});

test("a rejected drop reports the error and keeps the pending change recoverable without changing the vault", async ({ page }) => {
  const card = await app.store.createTask(app.project.id, { title: "Rejected scheduling" });
  await open(page);
  await page.route(`**/api/projects/${app.project.id}/tasks/${card.id}`, route => route.request().method() === "PATCH" ? route.fulfill({ status: 403, contentType: "application/json", body: JSON.stringify({ error: "Scheduling refused" }) }) : route.continue());
  await begin(page, card.id);
  const day = await page.locator('.calendar-all-day .calendar-day').first().boundingBox();
  await page.mouse.move(day.x + day.width / 2, day.y + day.height / 2, { steps: 6 });
  await page.mouse.up();
  await page.locator('#save-warning-toggle').click();
  await expect(page.locator('#save-warning-details')).toContainText("Scheduling refused");
  expect((await app.store.snapshot(app.project.id)).tasks.find(t => t.id === card.id).due).toBeNull();
  await page.reload();
  await expect(page.locator(`.calendar-all-day .calendar-task[data-id="${card.id}"]`)).toBeVisible();
  await expect(page.locator('#save-warning-toggle')).toBeVisible();
});

onDevices(["ipad", "phone"], () => test("touch dragging from Unscheduled can cancel or schedule an all-day card", async ({ page }) => {
  const cdp = await page.context().newCDPSession(page);
  const card = await app.store.createTask(app.project.id, { title: "Touch scheduling" });
  await open(page);
  await toggle(page).tap();
  for (const cancel of [true, false]) {
    const grip = panel(page).locator(`[data-calendar-card="${card.id}"] .calendar-move`);
    await grip.scrollIntoViewIfNeeded();
    const r = await grip.boundingBox(), x = r.x + r.width / 2, y = r.y + r.height / 2;
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: x + 12, y }] });
    await expect(panel(page)).toHaveCSS("visibility", "hidden");
    const end = await page.locator(cancel ? '.calendar-drag-cancel' : '.calendar-all-day .calendar-day').first().boundingBox();
    for (let i = 1; i <= 12; i++) await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: x + (end.x + end.width / 2 - x) * i / 12, y: y + (end.y + end.height / 2 - y) * i / 12 }] });
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    if (cancel) {
      await expect(panel(page)).toBeVisible();
      expect((await app.store.snapshot(app.project.id)).tasks.find(t => t.id === card.id).due).toBeNull();
    }
  }
  await expect(page.locator(`.calendar-all-day .calendar-task[data-id="${card.id}"]`)).toBeVisible();
}));
