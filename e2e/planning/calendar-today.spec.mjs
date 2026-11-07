// Owner request (F0.22-74): in the Calendar, today's date is underlined, in every layout.
import { test, expect, useApp } from '../fixtures.mjs';
import { reveal } from '../helpers/menu-controls.mjs';

const app = useApp(async store => {
  const project = await store.createProject({ title: 'Today' });
  // Agenda lists only days with cards.
  await store.createTask(project.id, { title: 'Due today', due: '2026-11-04' });
  await store.createTask(project.id, { title: 'Due tomorrow', due: '2026-11-05' });
  return { project };
});
// Each layout's label for a date.
const labels = {
  month: (day) => `.calendar-day[data-calendar-date="${day}"] > button:first-child`,
  week: (day) => `.calendar-day[data-calendar-date="${day}"] > button:first-child`,
  board: (day) => `.week-board-day-head[data-calendar-date="${day}"]`,
  agenda: (day) => `.agenda-day[data-calendar-date="${day}"] > h3`,
};
const underline = (page, selector) => page.locator(selector).evaluate(el => getComputedStyle(el).textDecorationLine);

test('today is underlined in every Calendar layout, and no other day is @gate', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-11-04T12:00:00'));
  await page.goto(`${app.base}/#project/${app.project.id}/calendar`);
  for (const [mode, label] of Object.entries(labels)) {
    await (await reveal(page.locator('#calendar-mode'))).selectOption(mode);
    await expect(page.locator(label('2026-11-04'))).toBeVisible();
    expect(await underline(page, label('2026-11-04')), mode).toBe('underline');
    expect(await underline(page, label('2026-11-05')), mode).toBe('none');
  }
});
