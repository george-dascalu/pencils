// Owner request, 2 November 2026: zoom the hourly calendar vertically with buttons or Shift + scroll.
import { test, expect, useApp, onDevices } from "../fixtures.mjs";
import { reveal } from "../helpers/menu-controls.mjs";

const app = useApp(async store => {
  const project = await store.createProject({ title: "Zoom the day" });
  const card = await store.createTask(project.id, { title: "Review", start: "2026-11-02", due: "2026-11-02", start_time: "09:30", due_time: "10:30" });
  await store.createTask(project.id, { title: "All day", due: "2026-11-02" });
  return { project, card };
});
const scroll = page => page.locator(".calendar-hours-scroll");
const height = page => page.locator(".calendar-hours-day").first().evaluate(el => el.getBoundingClientRect().height / 24);
const button = (page, direction) => page.getByRole("button", { name: `Zoom ${direction} hours`, exact: true, includeHidden: true });
async function closeOptions(page) {
  if (await page.locator(".mobile-view-options[open]").count()) await page.getByRole("button", { name: "Close view options", exact: true }).click();
}
async function open(page) {
  await page.clock.setFixedTime(new Date("2026-11-02T12:00:00"));
  await page.goto(`${app.base}/#project/${app.project.id}/calendar`);
  await (await reveal(page.locator("#calendar-mode"))).selectOption("week");
  await closeOptions(page);
  await expect(page.locator(".calendar-hour-slot").first()).toHaveCSS("height", "64px");
}

onDevices(["desktop", "ipad", "phone"], () => test("zoom buttons fit all 24 hours, preserve cards, remember the scale and fit again after resize", { tag: "@gate" }, async ({ page, device }) => {
  await open(page);
  const allDay = await page.locator(".calendar-all-day").boundingBox();
  await (await reveal(button(page, "in"))).click();
  await expect.poll(() => height(page)).toBe(96);
  await expect(page.locator(".calendar-timed-card")).toHaveCSS("height", "96px");
  await expect(button(page, "in")).toHaveCSS("height", device === "desktop" ? "32px" : "44px");
  expect((await page.locator(".calendar-all-day").boundingBox()).height).toBe(allDay.height);
  for (let i = 0; i < 12 && await button(page, "out").isEnabled(); i++) await (await reveal(button(page, "out"))).click();
  await expect(button(page, "out")).toBeDisabled();
  await closeOptions(page);
  expect(await scroll(page).evaluate(el => el.scrollHeight - el.clientHeight)).toBeLessThanOrEqual(1);
  await expect(page.locator(".calendar-timed-card .calendar-event-time")).toHaveCSS("display", "none");
  const label = await page.locator(".calendar-timed-card strong").boundingBox(), cardBox = await page.locator(".calendar-timed-card .calendar-card-title").boundingBox();
  expect(label.y).toBeGreaterThanOrEqual(cardBox.y - .5);
  expect(label.y + label.height).toBeLessThanOrEqual(cardBox.y + cardBox.height + .5);
  const fit = await height(page);
  await page.reload();
  await expect.poll(() => height(page)).toBeCloseTo(fit, 1);
  await page.setViewportSize({ width: page.viewportSize().width, height: page.viewportSize().height + 120 });
  await expect.poll(() => height(page)).toBeGreaterThan(fit);
  expect(await scroll(page).evaluate(el => el.scrollHeight - el.clientHeight)).toBeLessThanOrEqual(1);
  for (let i = 0; i < 12 && await button(page, "in").isEnabled(); i++) await (await reveal(button(page, "in"))).click();
  await expect(button(page, "in")).toBeDisabled();
  await expect.poll(() => height(page)).toBe(256);
  await page.reload();
  await expect.poll(() => height(page)).toBe(256);
  const card = (await app.store.snapshot(app.project.id)).tasks.find(t => t.id === app.card.id);
  expect([card.start_time, card.due_time]).toEqual(["09:30", "10:30"]);
  await (await reveal(page.locator("#calendar-mode"))).selectOption("month");
  await expect(page.locator(".calendar-zoom")).toHaveCount(0);
}));

test("Shift + wheel zooms around the pointer, including horizontal wheel deltas; ordinary scroll stays scroll", { tag: "@gate" }, async ({ page }) => {
  await open(page);
  const box = await scroll(page).boundingBox(), y = Math.min(160, box.height / 2);
  const timeAtPointer = () => scroll(page).evaluate((el, y) => (el.scrollTop + y) / (el.querySelector(".calendar-hours-day").getBoundingClientRect().height / 24), y);
  const before = await timeAtPointer();
  await page.mouse.move(box.x + 100, box.y + y);
  await page.keyboard.down("Shift"); await page.mouse.wheel(0, -120); await page.keyboard.up("Shift");
  await expect.poll(() => height(page)).toBeGreaterThan(64);
  expect(await timeAtPointer()).toBeCloseTo(before, 1);
  const bigger = await height(page);
  await scroll(page).dispatchEvent("wheel", { shiftKey: true, deltaX: 80, deltaY: 0, clientY: box.y + y, bubbles: true, cancelable: true });
  await expect.poll(() => height(page)).toBeLessThan(bigger);
  expect(await timeAtPointer()).toBeCloseTo(before, 1);
  const size = await height(page), top = await scroll(page).evaluate(el => el.scrollTop);
  await page.mouse.wheel(0, 120);
  await expect.poll(() => scroll(page).evaluate(el => el.scrollTop)).toBeGreaterThan(top);
  expect(await height(page)).toBe(size);
  const cancelled = await scroll(page).evaluate(el => !el.dispatchEvent(new WheelEvent("wheel", { bubbles: true, cancelable: true, ctrlKey: true, shiftKey: true, deltaY: -100 })));
  expect(cancelled).toBe(false);
  expect(await height(page)).toBe(size);
});

test("dragging a range after zooming still opens the correct start and end times", async ({ page }) => {
  await open(page);
  await button(page, "in").click();
  await scroll(page).evaluate(el => el.scrollTop = 8 * 96);
  const day = page.locator('.calendar-hours-day[data-calendar-date="2026-11-03"]');
  const a = await day.locator('[data-hour="9"]').boundingBox(), b = await day.locator('[data-hour="10"]').boundingBox();
  await page.mouse.move(a.x + a.width / 2, a.y + 1); await page.mouse.down();
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 8 });
  await expect(page.locator(".calendar-time-selection")).toHaveText("09:00 – 10:30");
  await page.mouse.up();
  await expect(page.locator('#task-form [name="start_time"]')).toHaveValue("09:00");
  await expect(page.locator('#task-form [name="due_time"]')).toHaveValue("10:30");
});
