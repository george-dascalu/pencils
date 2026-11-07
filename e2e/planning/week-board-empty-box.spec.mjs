// Owner report (F0.22-64): with the rows by Status in a project that turns Assignee and Priority off,
// the Week board's cards showed an empty field box over their titles. A card leaves its field box out
// when none of its fields shows there.
import { test, expect, useApp } from '../fixtures.mjs';
import { reveal } from '../helpers/menu-controls.mjs';

const day = '2026-11-05';
const app = useApp(async store => {
  const project = await store.createProject({ title: 'Family', key: 'FAM', schema: { off: ['assignee', 'priority'] } });
  await store.createTask(project.id, { title: 'Vacuum house', start: day, due: day, tags: ['home'] });
  await store.createTask(project.id, { title: 'Cook soup', status: 'in-progress', start: day, due: day });
  await store.createTask(project.id, { title: 'Someday' });
  return { project };
});
const cell = (page) => page.locator('.week-board-cell .week-board-card');
async function rows(page, field) {
  await page.clock.setFixedTime(new Date('2026-11-04T12:00:00'));
  await page.goto(`${app.base}/#project/${app.project.id}/calendar`);
  await (await reveal(page.locator('#calendar-mode'))).selectOption('board');
  await (await reveal(page.locator('#week-board-rows'))).selectOption(field);
  await expect(cell(page)).toHaveCount(2);
}

test('with the rows naming the only field left, the cards show no empty field box over their titles', async ({ page }) => {
  await rows(page, 'status');
  await expect(cell(page).locator('.week-board-fields')).toHaveCount(0);
  for (const fits of await cell(page).evaluateAll(els => els.map(el => { const card = el.getBoundingClientRect(), title = el.querySelector('.week-board-title').getBoundingClientRect(); return title.top >= card.top && title.bottom <= card.bottom; }))) expect(fits).toBe(true);
  // The Unscheduled board names no rows, so its cards keep the status.
  await expect(page.locator('.week-board-backlog .week-board-card', { hasText: 'Someday' }).locator('.week-board-fields .row-status')).toBeVisible();
});

test('rows by another field keep the box with the status', async ({ page }) => {
  await rows(page, 'tags');
  await expect(cell(page).locator('.week-board-fields .row-status')).toHaveCount(2);
  for (const shown of await cell(page).locator('.week-board-fields .row-status').evaluateAll(els => els.map(el => getComputedStyle(el).display !== 'none'))) expect(shown).toBe(true);
});
