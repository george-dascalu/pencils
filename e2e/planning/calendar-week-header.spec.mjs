import { test, expect, useApp, onDevices } from '../fixtures.mjs';
import { reveal } from '../helpers/menu-controls.mjs';

const app = useApp();
const head = page => page.locator('.calendar-all-day .calendar-day > button');
const allDay = page => page.locator('.calendar-all-day');
async function open(page, project) {
  await page.clock.setFixedTime(new Date('2026-11-15T08:30:00'));
  await page.goto(`${app.base}/#project/${project.id}/calendar`);
  await (await reveal(page.locator('#calendar-mode'))).selectOption('week');
  if (await page.locator('.mobile-view-options[open]').count()) await page.getByRole('button', { name: 'Close view options', exact: true }).click();
  await expect(page.locator('.calendar-hours-scroll')).toBeVisible();
}

onDevices(['desktop', 'ipad', 'phone'], () => test('an empty Week has one compact row with weekday and date, still usable for all-day creation @gate', async ({ page }) => {
  const project = await app.store.createProject({ title: 'Compact week' });
  await open(page, project);
  await expect(head(page)).toHaveText(['Mon 9', 'Tue 10', 'Wed 11', 'Thu 12', 'Fri 13', 'Sat 14', 'Sun 15']);
  const control = await head(page).first().evaluate(el => parseFloat(getComputedStyle(el).getPropertyValue('--control-height')));
  expect((await allDay(page).boundingBox()).height).toBeLessThanOrEqual(control + 2);
  await expect(head(page).first()).toHaveCSS('white-space', 'nowrap');
  await expect(head(page).first()).toHaveCSS('height', `${control}px`);
  expect((await page.locator('.calendar-hours-scroll').boundingBox()).y).toBeCloseTo((await head(page).first().boundingBox()).y + control, 0);
  await head(page).first().click();
  await expect(page.locator('#task-form [name="due"]')).toHaveValue('2026-11-09');
  await expect(page.locator('#task-form [data-task-allday]')).toHaveAttribute('aria-pressed', 'true');
  await page.locator('[data-action="dialog-close"]').click();
  await (await reveal(page.locator('[data-calendar-weekends]'))).click();
  if (await page.locator('.mobile-view-options[open]').count()) await page.getByRole('button', { name: 'Close view options', exact: true }).click();
  await expect(head(page)).toHaveCount(5);
  expect((await allDay(page).boundingBox()).height).toBeLessThanOrEqual(control + 2);
}));

test('all-day cards add only their lanes, and the weekday/date row stays visible when that strip scrolls @gate', async ({ page }) => {
  const project = await app.store.createProject({ title: 'Busy all-day strip' });
  for (let i = 0; i < 12; i++) await app.store.createTask(project.id, { title: `All day ${i}`, start: '2026-11-09', due: '2026-11-11' });
  await open(page, project);
  const first = head(page).first(), header = await first.boundingBox();
  expect((await page.locator('.calendar-all-day .calendar-task').first().boundingBox()).y).toBeGreaterThanOrEqual(header.y + header.height);
  const strip = page.locator('.calendar-all-day-scroll');
  await strip.evaluate(el => { el.scrollTop = 180; });
  await expect.poll(() => first.boundingBox().then(r => r.y)).toBeCloseTo((await strip.boundingBox()).y, 0);
  await first.click();
  await expect(page.locator('#task-form [name="due"]')).toHaveValue('2026-11-09');
  await page.locator('[data-action="dialog-close"]').click();
  await page.locator('[data-feature="month-next"]').click();
  await expect(page.locator('.calendar-all-day .calendar-task')).toHaveCount(0);
  expect((await allDay(page).boundingBox()).height).toBeCloseTo(header.height, 0);
});

test('the compact empty header accepts an all-day drop and cancellation restores its height @gate', async ({ page }) => {
  const project = await app.store.createProject({ title: 'Empty all-day target' });
  const card = await app.store.createTask(project.id, { title: 'Schedule me' });
  await open(page, project);
  const height = (await allDay(page).boundingBox()).height;
  for (const cancel of [true, false]) {
    await page.locator('[data-calendar-unscheduled]').click();
    const source = await page.locator('.calendar-unscheduled:popover-open .calendar-move').boundingBox();
    const target = await head(page).first().boundingBox();
    await page.mouse.move(source.x + source.width / 2, source.y + source.height / 2); await page.mouse.down();
    await page.mouse.move(source.x + source.width / 2 + 12, source.y + source.height / 2);
    await page.mouse.move(target.x + target.width / 2, target.y + target.height / 2, { steps: 6 });
    await expect(page.locator('.calendar-all-day .calendar-placement')).toBeVisible();
    if (cancel) await page.keyboard.press('Escape');
    await page.mouse.up();
    if (cancel) {
      await expect(page.locator('.calendar-placement')).toHaveCount(0);
      expect((await allDay(page).boundingBox()).height).toBe(height);
      await page.keyboard.press('Escape');
    }
  }
  await expect(page.locator(`.calendar-all-day .calendar-task[data-id="${card.id}"]`)).toBeVisible();
  await expect.poll(async () => (await app.store.snapshot(project.id)).tasks.find(t => t.id === card.id).due).toBe('2026-11-09');
  expect((await allDay(page).boundingBox()).height).toBeCloseTo(height * 2, 0);
});
