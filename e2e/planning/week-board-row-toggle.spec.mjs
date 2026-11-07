// Owner request (F0.22-52): the Week board switches its rows between tags and time of day in one
// click, from the bar (View options on phones), without going through Filters.
import { test, expect, useApp, onDevices } from '../fixtures.mjs';
import { reveal } from '../helpers/menu-controls.mjs';

const day = '2026-11-05';
const app = useApp(async store => {
  const project = await store.createProject({ title: 'Row switch', key: 'RS' });
  await store.createTask(project.id, { title: 'Standup', start: day, due: day, start_time: '09:00', due_time: '09:30', tags: ['team'] });
  await store.createTask(project.id, { title: 'Gym', start: day, due: day, start_time: '18:00', due_time: '19:00', tags: ['health'] });
  // Without start dates there is no time of day to group by.
  const dateless = await store.createProject({ title: 'No start', key: 'NS', schema: { off: ['start'] } });
  return { project, dateless };
});
const rows = (page) => page.locator('.week-board-row[data-week-board-value]').evaluateAll(els => els.map(el => el.querySelector('.week-board-row-head > span').textContent));
const switcher = (page) => page.getByRole('group', { name: 'Rows' });
const choice = (page, name) => switcher(page).getByRole('button', { name, exact: true });

onDevices(['desktop', 'ipad', 'phone'], (device) => {
  test('the Week board switches its rows between tags and time of day in one click', async ({ page }) => {
    await page.clock.setFixedTime(new Date('2026-11-04T12:00:00'));
    await page.goto(`${app.base}/#project/${app.project.id}/calendar`);
    await (await reveal(page.locator('#calendar-mode'))).selectOption('board');
    await expect(page.locator('.week-board')).toBeVisible();
    // In the bar beside the layout's other controls; phones keep the view's controls in View options.
    await expect(switcher(page)).toHaveCount(1);
    expect(await switcher(page).evaluate((el, home) => !!el.closest(home), device === 'phone' ? '.mobile-view-options' : '#view-toolbar .view-controls')).toBe(true);
    if (device !== 'phone') {
      await expect(switcher(page)).toBeVisible();
      // The bar stays one row.
      const middles = await page.locator('#view-toolbar .view-controls .planning-options > *').evaluateAll(els => els.filter(el => el.getClientRects().length && !el.matches('.planning-separator')).map(el => { const r = el.getBoundingClientRect(); return r.top + r.height / 2; }));
      expect(Math.max(...middles) - Math.min(...middles), `${middles}`).toBeLessThanOrEqual(2);
    }
    await (await reveal(choice(page, 'Tags'))).click();
    await expect.poll(() => rows(page)).toEqual(['health', 'team']);
    await expect(choice(page, 'Tags')).toHaveAttribute('aria-pressed', 'true');
    await expect(choice(page, 'Time of day')).toHaveAttribute('aria-pressed', 'false');
    await (await reveal(choice(page, 'Time of day'))).click();
    await expect.poll(() => rows(page)).toEqual(['Morning', 'Afternoon', 'Evening']);
    await expect(choice(page, 'Time of day')).toHaveAttribute('aria-pressed', 'true');
    // The chosen side is marked by the shared switcher's accent border, the other has none; both are
    // control height (44px on touch screens).
    const look = await switcher(page).locator('button').evaluateAll(els => {
      const probe = document.body.appendChild(Object.assign(document.createElement('span'), { style: 'color: var(--green)' }));
      const green = getComputedStyle(probe).color;
      probe.remove();
      return { green, borders: els.map(el => getComputedStyle(el).borderTopColor), heights: els.map(el => el.getBoundingClientRect().height), control: parseFloat(getComputedStyle(els[0]).getPropertyValue('--control-height')) };
    });
    expect(look.borders).toEqual(['rgba(0, 0, 0, 0)', look.green]);
    expect(look.heights).toEqual([look.control, look.control]);
    if (device !== 'desktop') expect(look.control).toBeGreaterThanOrEqual(44);
    // Group by follows, and the choice is kept.
    await expect(page.locator('#week-board-rows')).toHaveValue('daypart');
    await page.reload();
    await expect.poll(() => rows(page)).toEqual(['Morning', 'Afternoon', 'Evening']);
    // Grouped by anything else, neither side is chosen.
    await (await reveal(page.locator('#week-board-rows'))).selectOption('status');
    await expect(choice(page, 'Tags')).toHaveAttribute('aria-pressed', 'false');
    await expect(choice(page, 'Time of day')).toHaveAttribute('aria-pressed', 'false');
  });
});

test('without times of day the switch stays away and Group by remains', async ({ page }) => {
  await page.goto(`${app.base}/#project/${app.dateless.id}/calendar`);
  await (await reveal(page.locator('#calendar-mode'))).selectOption('board');
  await expect(page.locator('.week-board')).toBeVisible();
  await expect(page.locator('#week-board-rows option')).not.toHaveCount(0);
  await expect(switcher(page)).toHaveCount(0);
  await expect(page.locator('.planning-options > .planning-separator')).toHaveCount(0);
});
