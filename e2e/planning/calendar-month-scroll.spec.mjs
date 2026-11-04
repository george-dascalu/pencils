// Owner request (F0.21-96): Calendar's Month layout scrolls through the months vertically with no
// visible scroll bar, shows the ISO week number on the left of each week, and its heading follows
// the month in view.
import { test, expect, useApp, onDevices } from '../fixtures.mjs';
import { reveal } from '../helpers/menu-controls.mjs';

const app = useApp(async store => {
  const project = await store.createProject({ title: 'Month scroll' });
  const task = await store.createTask(project.id, { title: 'Spans the turn', start: '2026-11-27', due: '2026-12-02' });
  const drag = await store.createTask(project.id, { title: 'Drag me', due: '2026-12-03' });
  return { project, task, drag };
});
const toWeek = (page, week) => page.locator('.calendar-scroll').evaluate((el, week) => { el.scrollTop += el.querySelector(`.calendar-week[data-week="${week}"]`).getBoundingClientRect().top - el.querySelector('.calendar-weekdays').getBoundingClientRect().bottom; }, week);
const settle = page => page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
// A week being redrawn has no box for a moment: report it as not there yet, so polls retry.
const weekTop = async (page, week) => {
  const [row, head] = [await page.locator(`.calendar-week[data-week="${week}"]`).boundingBox(), await page.locator('.calendar-weekdays').boundingBox()];
  return row && head ? row.y - head.y : Infinity;
};
async function open(page) {
  await page.clock.setFixedTime(new Date('2026-11-04T12:00:00'));
  await page.goto(`${app.base}/#project/${app.project.id}/calendar`);
  await (await reveal(page.locator('#calendar-mode'))).selectOption('month');
  if (await page.locator('.mobile-view-options[open]').count()) await page.getByRole('button', { name: 'Close view options', exact: true }).click();
  await expect(page.locator('.calendar[data-layout="month"]')).toBeVisible();
}

onDevices(['desktop', 'ipad', 'phone'], () => {
  test('Month runs on month after month with week numbers, and scrolls without a scroll bar @gate', async ({ page }) => {
    await open(page);
    const scroll = page.locator('.calendar-scroll');
    await expect(scroll).toHaveCSS('scrollbar-width', 'none');
    expect(await page.locator('.calendar-week').count()).toBeGreaterThan(12);
    await expect(page.locator('.planning-period h2')).toHaveText('November 2026');
    await expect(page.locator('.calendar-week[data-week="2026-11-02"] .calendar-week-number')).toHaveText('45');
    await expect(page.locator('.calendar-week[data-week="2026-12-28"] .calendar-week-number')).toHaveText('53');
    // The week numbers sit left of the grid, inside the screen.
    const box = await page.locator('.calendar-week[data-week="2026-11-02"] .calendar-week-number').boundingBox();
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual((await page.locator('.calendar-week[data-week="2026-11-02"]').boundingBox()).x + 1);
    // The sticky weekday header stays while the weeks scroll under it; the heading follows the month in view.
    await scroll.evaluate(el => { el.scrollTop += el.querySelector('.calendar-week[data-week="2026-11-30"]').getBoundingClientRect().top - el.querySelector('.calendar-weekdays').getBoundingClientRect().bottom; });
    await expect(page.locator('.planning-period h2')).toHaveText('December 2026');
    expect((await page.locator('.calendar-weekdays').boundingBox()).y).toBeCloseTo((await scroll.boundingBox()).y, 0);
    // A card across the turn of the month is one bar per week, not cut at the month's end.
    await expect(page.locator(`[data-calendar-card="${app.task.id}"]`)).toHaveCount(2);
    // Near the end more weeks load, and scrolling back to the start loads earlier ones.
    const count = () => page.locator('.calendar-week').count();
    const before = await count();
    await scroll.evaluate(el => { el.scrollTop = el.scrollHeight; });
    await expect.poll(count).toBeGreaterThan(before);
    const dates = () => page.locator('.calendar-week').evaluateAll(els => [els[0].dataset.week, els.at(-1).dataset.week]);
    const [first] = await dates();
    await scroll.evaluate(el => { el.scrollTop = 0; });
    await expect.poll(async () => (await dates())[0] < first).toBe(true);
    // Next and previous period scroll to a month's start.
    await scroll.evaluate(el => { el.scrollTop += el.querySelector('.calendar-week[data-week="2026-11-30"]').getBoundingClientRect().top - el.querySelector('.calendar-weekdays').getBoundingClientRect().bottom; });
    await expect(page.locator('.planning-period h2')).toHaveText('December 2026');
    await page.getByRole('button', { name: 'Next period', exact: true }).click();
    await expect(page.locator('.planning-period h2')).toHaveText('January 2027');
    await page.getByRole('button', { name: 'Previous period', exact: true }).click();
    await expect(page.locator('.planning-period h2')).toHaveText('December 2026');
    await expect.poll(async () => (await page.locator('.calendar-week[data-week="2026-11-30"]').boundingBox()).y - (await page.locator('.calendar-weekdays').boundingBox()).y).toBeLessThan(60);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
  });
});

test.describe('tall window', () => {
  test.use({ viewportSize: { width: 1280, height: 1600 } });
  test('opening on a month keeps its heading, even when more than a month fits @gate', async ({ page }) => {
    await open(page);
    await settle(page);
    await expect(page.locator('.planning-period h2')).toHaveText('November 2026');
    // Back to Week keeps today's week, as scrolling away and back must not lose the day.
    await toWeek(page, '2026-11-30');
    await expect(page.locator('.planning-period h2')).toHaveText('December 2026');
    await toWeek(page, '2026-10-26');
    await expect(page.locator('.planning-period h2')).toHaveText('November 2026');
    await (await reveal(page.locator('#calendar-mode'))).selectOption('week');
    await expect(page.locator('.planning-period h2')).toHaveText('2 Nov – 8 Nov 2026');
  });
});

onDevices(['desktop', 'phone'], () => {
  test('more weeks load without losing focus and the run of weeks stays capped @gate', async ({ page }) => {
    await open(page);
    const scroll = page.locator('.calendar-scroll'), count = () => page.locator('.calendar-week').count();
    const initial = await count();
    const lastDay = page.locator('.calendar-week').last().locator('.calendar-day button').first();
    await scroll.evaluate(el => { el.scrollTop = el.scrollHeight - el.clientHeight - 20; });
    await page.locator('.calendar-week').nth(initial - 4).locator('.calendar-day button').first().focus();
    const focused = () => page.evaluate(() => document.activeElement?.getAttribute('aria-label'));
    const label = await focused();
    await scroll.evaluate(el => { el.scrollTop = el.scrollHeight; });
    await expect.poll(count).toBeGreaterThan(initial);
    expect(await focused(), 'focus stays on the day button').toBe(label);
    for (let i = 0; i < 8; i++) {
      await scroll.evaluate((el, i) => { el.scrollTop = i % 2 ? el.scrollHeight : 0; }, i);
      await settle(page);
    }
    expect(await count()).toBeLessThanOrEqual(60);
    void lastDay;
  });

  test('the heading names only the period and its picker, with a touch-sized target @gate', async ({ page, device }) => {
    await open(page);
    const heading = page.getByRole('heading', { name: /^November 2026( Choose date)?$/ });
    await expect(heading).toBeVisible();
    await toWeek(page, '2026-11-30');
    await expect(page.getByRole('heading', { name: /^December 2026( Choose date)?$/ })).toBeVisible();
    await expect(page.locator('.period-date')).toHaveValue('2026-12-01');
    const box = await page.locator('.period-field [data-date-picker]').boundingBox();
    expect(box.height).toBeGreaterThanOrEqual(device === 'desktop' ? 18 : 44);
    if (device !== 'desktop') expect(box.width).toBeGreaterThanOrEqual(44);
  });

  test('choosing a day always shows it, even the one the heading already holds, and Escape or a click outside closes the picker @gate', async ({ page }) => {
    await open(page);
    const trigger = page.locator('.period-field [data-date-picker]'), picker = page.locator('.date-picker-popover');
    await toWeek(page, '2026-11-16');
    await trigger.click();
    await picker.locator('table [data-date-value="2026-11-04"]').click();
    await expect.poll(() => weekTop(page, '2026-11-02')).toBeLessThan(40);
    await trigger.click();
    await expect(picker).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(picker).toHaveCount(0);
    await trigger.click();
    await page.locator('.calendar-weekdays').click({ position: { x: 5, y: 5 }, force: true });
    await expect(picker).toHaveCount(0);
    // A day in another month scrolls there and the heading names that day's month.
    await trigger.click();
    await picker.locator('table [data-date-value="2026-10-30"]').click();
    await expect(page.locator('.planning-period h2')).toHaveText('October 2026');
    await expect.poll(() => weekTop(page, '2026-10-26')).toBeLessThan(40);
  });

  test('a drop lands on the day under the pointer and the scroll position survives the save @gate', async ({ page }) => {
    await open(page);
    await toWeek(page, '2026-11-30');
    const bar = page.locator(`[data-calendar-card="${app.drag.id}"]`), target = page.locator('.calendar-day[data-calendar-date="2026-12-10"]');
    const from = await bar.boundingBox(), to = await target.boundingBox();
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
    await page.mouse.down();
    await page.mouse.move(from.x + 20, from.y + 20, { steps: 3 });
    await page.mouse.move(to.x + to.width / 2, to.y + 30, { steps: 8 });
    await page.mouse.up();
    await expect.poll(async () => (await app.store.snapshot(app.project.id)).tasks.find(t => t.id === app.drag.id).due).toBe('2026-12-10');
    await expect(page.locator(`.calendar-day[data-calendar-date="2026-12-10"] ~ [data-calendar-card="${app.drag.id}"], [data-calendar-card="${app.drag.id}"]`).first()).toBeVisible();
    await expect.poll(() => weekTop(page, '2026-11-30')).toBeLessThan(40);
    await expect(page.locator('.planning-period h2')).toHaveText('December 2026');
  });

  test('alternate months, weekends and plain days have three different tints in light and dark @gate', async ({ page }) => {
    await open(page);
    for (const theme of ['light', 'dark']) {
      await page.evaluate(theme => { document.documentElement.dataset.theme = theme; }, theme);
      const tint = date => page.locator(`.calendar-day[data-calendar-date="${date}"]`).evaluate(el => getComputedStyle(el).backgroundColor);
      const [nov, dec, novWeekend, decWeekend] = [await tint('2026-11-05'), await tint('2026-12-02'), await tint('2026-11-07'), await tint('2026-12-05')];
      expect(new Set([nov, dec, novWeekend]).size, `${theme}: ${[nov, dec, novWeekend]}`).toBe(3);
      expect(decWeekend, theme).toBe(novWeekend);
    }
  });
});
