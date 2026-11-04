// Owner request (F0.21-70): Agenda's range is a quick-range picker with dates, replacing Period and
// the date field, and the calendar's shared controls keep one place in Month, Week and Agenda.
import { test, expect, useApp, onDevices } from '../fixtures.mjs';
import { reveal } from '../helpers/menu-controls.mjs';

const app = useApp(async store => {
  const project = await store.createProject({ title: 'Agenda range' });
  await store.createTask(project.id, { title: 'October card', due: '2026-10-05' });
  await store.createTask(project.id, { title: 'Later October card', due: '2026-10-14' });
  return { project };
});
const menu = page => page.locator('.agenda-range-menu');
const closeOptions = async page => { if (await page.locator('.mobile-view-options[open]').count()) await page.getByRole('button', { name: 'Close view options', exact: true }).click(); };
async function layout(page, mode) {
  await (await reveal(page.locator('#calendar-mode'))).selectOption(mode);
  await closeOptions(page);
}
async function openRange(page) {
  const summary = await reveal(menu(page).locator('summary'));
  if (!(await menu(page).evaluate(el => el.open))) await summary.click();
  await expect(menu(page).locator('.agenda-range-panel')).toBeVisible();
}
const today = () => { const d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };
const shown = page => page.locator('.calendar-agenda .agenda-day').evaluateAll(days => days.map(d => d.dataset.calendarDate));

onDevices(['desktop', 'ipad', 'phone'], () => {
  test('Agenda picks quick ranges or dates in one menu, with no Period or date field @gate', async ({ page, device }) => {
    await page.goto(`${app.base}/#project/${app.project.id}/calendar`);
    await layout(page, 'agenda');
    await expect(page.locator('#agenda-period, #agenda-date')).toHaveCount(0);
    await expect(await reveal(menu(page).locator('summary'))).toHaveAccessibleName('Agenda range: This week');
    await openRange(page);
    const quick = menu(page).locator('[data-range-quick]');
    await expect(quick).toHaveText(['Today', 'Tomorrow', 'This week', 'Next week', 'This month', 'Next month', 'Next 7 days', 'Next 14 days', 'Next 30 days']);
    await expect(quick.filter({ hasText: 'This week' })).toHaveAttribute('aria-pressed', 'true');
    if (device !== 'desktop') for (const box of await quick.evaluateAll(els => els.map(el => el.getBoundingClientRect().height))) expect(box).toBeGreaterThanOrEqual(44);
    const panel = await menu(page).locator('.agenda-range-panel').boundingBox(), viewport = page.viewportSize();
    expect(panel.x).toBeGreaterThanOrEqual(0);
    expect(panel.x + panel.width).toBeLessThanOrEqual(viewport.width);
    // Dates, checked before they apply.
    const dates = menu(page).locator('form');
    await dates.locator('input[name="from"]').fill('2026-10-09');
    await dates.locator('input[name="to"]').fill('2026-10-01');
    await dates.getByRole('button', { name: 'Show dates' }).click();
    await expect(dates.locator('[data-range-error]')).toBeVisible();
    // A day chosen in the field's date picker keeps the menu open.
    await dates.locator('.date-field:has(input[name="from"]) [data-date-picker]').click();
    await page.locator('.date-picker-popover [data-date-value="2026-10-02"]').click();
    await expect(dates.locator('input[name="from"]')).toHaveValue('2026-10-02');
    await expect(menu(page).locator('.agenda-range-panel')).toBeVisible();
    await dates.locator('input[name="from"]').fill('2026-10-01');
    await dates.locator('input[name="to"]').fill('2026-10-09');
    await dates.getByRole('button', { name: 'Show dates' }).click();
    await closeOptions(page);
    await expect(page.locator('.planning-period h2')).toHaveText(/1 Oct – 9 Oct 2026/);
    await expect.poll(() => shown(page)).toEqual(['2026-10-05']);
    // Previous and next keep the range's length.
    await page.locator('[data-feature="month-next"]').click();
    await expect(page.locator('.planning-period h2')).toHaveText(/10 Oct – 18 Oct 2026/);
    await expect.poll(() => shown(page)).toEqual(['2026-10-14']);
    // A quick range closes the menu and is remembered.
    await openRange(page);
    await menu(page).locator('[data-range-quick="tomorrow"]').click();
    await expect(menu(page)).not.toHaveAttribute('open', '');
    await expect(menu(page).locator('summary'), 'focus returns to the range').toBeFocused();
    await closeOptions(page);
    await expect(await reveal(menu(page).locator('summary'))).toHaveAccessibleName('Agenda range: Tomorrow');
    await closeOptions(page);
    const tomorrow = new Date(`${today()}T12:00:00Z`); tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    await expect(page.locator('.planning-period h2')).toHaveText(tomorrow.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }));
    await page.reload();
    await expect(await reveal(menu(page).locator('summary'))).toHaveAccessibleName('Agenda range: Tomorrow');
  });
});

onDevices(['desktop', 'ipad'], () => {
  test('shared calendar controls stay on the right in every layout, after the layout’s own @gate', async ({ page }) => {
    await page.goto(`${app.base}/#project/${app.project.id}/calendar`);
    const spots = {};
    for (const mode of ['month', 'week', 'agenda']) {
      await layout(page, mode);
      const options = page.locator('.planning-options');
      const order = await options.evaluate(el => [...el.children].filter(c => c.getClientRects().length).map(c => c.matches('.planning-separator') ? 'separator' : c.matches('[data-calendar-weekends]') ? 'weekends' : c.querySelector('#calendar-mode') ? 'layout' : 'own'));
      expect(order.slice(-2), `${mode}: shared controls last`).toEqual(['weekends', 'layout']);
      expect(order.slice(0, -2), `${mode}: own controls, then a divider`).toEqual(mode === 'month' ? [] : [...order.slice(0, -3).map(() => 'own'), 'separator']);
      if (mode !== 'month') {
        const line = await options.locator('.planning-separator').evaluate(el => { const s = getComputedStyle(el); return { width: s.width, color: s.backgroundColor }; });
        expect(line.width).toBe('1px');
        expect(line.color).not.toBe('rgba(0, 0, 0, 0)');
      }
      spots[mode] = await Promise.all(['[data-calendar-weekends]', '#calendar-mode'].map(async s => Math.round((await page.locator(s).boundingBox()).x)));
    }
    expect(spots.week, 'Week keeps the shared controls where Month has them').toEqual(spots.month);
    expect(spots.agenda, 'Agenda keeps the shared controls where Month has them').toEqual(spots.month);
  });
});
