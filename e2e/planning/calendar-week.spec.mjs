// Owner request, 30 October 2026: a Week layout, beside Month and Agenda, shows one week of the
// month grid with room for each day's cards; the arrows move a week at a time.
import { test, expect, onDevices, useApp } from "../fixtures.mjs";
import { reveal } from "../helpers/menu-controls.mjs";

const app = useApp(async (store) => {
  const project = await store.createProject({ title: "Week lab", key: "WL" });
  await store.createTask(project.id, { title: "Spanning card", start: "2026-10-23", due: "2026-10-28" });
  await store.createTask(project.id, { title: "This week", due: "2026-10-30" });
  await store.createTask(project.id, { title: "Next week", due: "2026-11-03" });
  return { project };
});

onDevices(["desktop", "phone"], () => test("the Week layout shows one week and moves a week at a time", async ({ page, device }) => {
  await page.clock.setFixedTime(new Date("2026-10-28T12:00:00"));
  await page.goto(`${app.base}/#project/${app.project.id}/calendar`);
  await (await reveal(page.locator("#calendar-mode"))).selectOption("week");
  const options = page.locator(".mobile-view-options[open] > summary"); // phones: close View options
  if (await options.count()) await options.click();
  const heading = page.locator(".planning-period h2");
  await expect(heading, device).toHaveText("26 Oct – 1 Nov 2026");
  await expect(page.locator(".calendar-week")).toHaveCount(1);
  await expect(page.locator(".calendar-week .calendar-day")).toHaveCount(7);
  await expect(page.locator(".calendar-task")).toHaveText([/Spanning card/, /This week/]);
  // Taller than a week in the month grid, so each day has room for its cards.
  const height = (await page.locator(".calendar-week").boundingBox()).height;
  expect(height, `${device}: a tall week`).toBeGreaterThan(300);
  await page.locator('[data-feature="month-next"]').click();
  await expect(heading).toHaveText("2 Nov – 8 Nov 2026");
  await expect(page.locator(".calendar-task")).toHaveText([/Next week/]);
  await page.reload();
  await expect(heading, "the layout is remembered").toHaveText("26 Oct – 1 Nov 2026");
}));

test("the Week heading ignores the Agenda's period, and a card moved out of the week says where it went", async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-10-28T12:00:00"));
  await page.goto(`${app.base}/#project/${app.project.id}/calendar`);
  await page.locator("#calendar-mode").selectOption("agenda");
  await page.locator("#agenda-period").selectOption("month");
  await page.locator("#calendar-mode").selectOption("week");
  await expect(page.locator(".planning-period h2")).toHaveText("26 Oct – 1 Nov 2026");
  // Alt+Right moves a card a day; past Sunday it leaves this week.
  const card = page.locator(".calendar-task", { hasText: "This week" }).locator('[data-action="task-open"]');
  await card.focus();
  for (let i = 0; i < 3; i++) await page.keyboard.press("Alt+ArrowRight");
  await expect(page.locator(".calendar-task", { hasText: "This week" })).toHaveCount(0);
  await expect(page.locator("[data-calendar-announcement]")).toHaveText(/This week.*2026-11-02/);
  await expect(page.locator(".calendar-scroll"), "focus stays on the calendar").toBeFocused();
});
