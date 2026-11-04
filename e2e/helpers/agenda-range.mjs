import { expect } from "@playwright/test";
import { reveal } from "./menu-controls.mjs";
// Agenda's range menu (F0.21-70): dates, or a quick range such as "this-month".
async function openRange(page) {
  const menu = page.locator(".agenda-range-menu"), summary = await reveal(menu.locator(":scope > summary"));
  if (!(await menu.evaluate((el) => el.open))) await summary.click();
  return menu;
}
export async function agendaDates(page, from, to = from) {
  const menu = await openRange(page);
  await menu.locator('input[name="from"]').fill(from);
  await menu.locator('input[name="to"]').fill(to);
  await menu.getByRole("button", { name: "Show dates", exact: true }).click();
}
export async function agendaQuick(page, key) {
  await (await openRange(page)).locator(`[data-range-quick="${key}"]`).click();
}
// Month and Week move with their arrows; this goes to the month holding `day`.
export async function calendarMonth(page, day) {
  const want = new Date(`${day}T12:00:00Z`).toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
  const heading = page.locator(".planning-period h2");
  for (let i = 0; i < 36 && (await heading.textContent()) !== want; i++) {
    const [y, m] = ((await heading.textContent()) || "").split(" ").reverse();
    const shown = new Date(`${m} 1, ${y} 12:00 UTC`);
    await page.getByRole("button", { name: shown < new Date(`${day}T12:00:00Z`) ? "Next period" : "Previous period", exact: true }).click();
  }
  await expect(heading).toHaveText(want);
}
