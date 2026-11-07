// Owner request (F0.22-60): the Week board has no Tags | Time of day switch (F0.22-52); Group by,
// in the bar since F0.22-59 (View options on phones), chooses the rows, tags and time of day included.
import { test, expect, useApp, onDevices } from '../fixtures.mjs';
import { reveal } from '../helpers/menu-controls.mjs';

const day = '2026-11-05';
const app = useApp(async store => {
  const project = await store.createProject({ title: 'Row choice', key: 'RS' });
  await store.createTask(project.id, { title: 'Standup', start: day, due: day, start_time: '09:00', due_time: '09:30', tags: ['team'] });
  await store.createTask(project.id, { title: 'Gym', start: day, due: day, start_time: '18:00', due_time: '19:00', tags: ['health'] });
  // Without start dates there is no time of day to group by.
  const dateless = await store.createProject({ title: 'No start', key: 'NS', schema: { off: ['start'] } });
  return { project, dateless };
});
const rows = (page) => page.locator('.week-board-row[data-week-board-value]').evaluateAll(els => els.map(el => el.querySelector('.week-board-row-head > span').textContent));
async function open(page, project) {
  await page.clock.setFixedTime(new Date('2026-11-04T12:00:00'));
  await page.goto(`${app.base}/#project/${project.id}/calendar`);
  await (await reveal(page.locator('#calendar-mode'))).selectOption('board');
  await expect(page.locator('.week-board')).toBeVisible();
}

onDevices(['desktop', 'ipad', 'phone'], () => {
  test('Group by alone chooses the Week board rows, with no Tags | Time of day switch', async ({ page }) => {
    await open(page, app.project);
    await expect(page.getByRole('group', { name: 'Rows' })).toHaveCount(0);
    await expect(page.locator('[data-week-board-rows]')).toHaveCount(0);
    await (await reveal(page.locator('#week-board-rows'))).selectOption('tags');
    await expect.poll(() => rows(page)).toEqual(['health', 'team']);
    await (await reveal(page.locator('#week-board-rows'))).selectOption('daypart');
    await expect.poll(() => rows(page)).toEqual(['Morning', 'Afternoon', 'Evening']);
    // The choice is kept.
    await page.reload();
    await expect.poll(() => rows(page)).toEqual(['Morning', 'Afternoon', 'Evening']);
  });
});

test('without start dates Group by offers no time of day, and keeps its place before the divider', async ({ page }) => {
  await open(page, app.dateless);
  await expect(page.locator('#week-board-rows option')).not.toHaveCount(0);
  await expect(page.locator('#week-board-rows option[value="daypart"]')).toHaveCount(0);
  // Group by stays in the bar (F0.22-59), so the divider before the shared controls stays too.
  await expect(page.locator('.planning-options > .planning-separator')).toHaveCount(1);
});
