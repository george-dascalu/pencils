import { test, expect, useApp, onDevices } from '../fixtures.mjs';
import { reveal } from '../helpers/menu-controls.mjs';
const app = useApp(async store => ({ project: await store.createProject({ title: 'Resize across days' }) }));
async function open(page) {
  const task = await app.store.createTask(app.project.id, { title: 'Review', start: '2026-11-03', due: '2026-11-03', start_time: '09:00', due_time: '10:00' });
  await page.clock.setFixedTime(new Date('2026-11-02T12:00:00'));
  await page.goto(`${app.base}/#project/${app.project.id}/calendar`);
  await (await reveal(page.locator('#calendar-mode'))).selectOption('week');
  if (await page.locator('.mobile-view-options[open]').count()) await page.getByRole('button', { name: 'Close view options', exact: true }).click();
  const cards = page.locator(`.calendar-timed-card[data-id="${task.id}"]`);
  await cards.first().hover();
  const saved = async () => (await app.store.snapshot(app.project.id)).tasks.find(t => t.id === task.id);
  const drag = async (end, date, minutes, cancel = false) => {
    const handle = cards.locator(`[data-calendar-time-end="${end}"]`);await handle.hover();
    const a = await handle.boundingBox(), day = await page.locator(`.calendar-hours-day[data-calendar-date="${date}"]`).boundingBox();
    await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);await page.mouse.down();
    await page.mouse.move(day.x + day.width / 2, day.y + day.height * minutes / 1440, { steps: 8 });
    await expect(page.locator('.calendar-drag-preview')).toBeVisible();
    if (cancel) await page.keyboard.press('Escape');
  };
  return { cards, saved, drag };
}
onDevices(['desktop', 'ipad', 'phone'], () => test('resize across days in both directions, shorten the range and cancel precisely @gate', async ({ page }) => {
  const { cards, saved, drag } = await open(page);
  await drag('due', '2026-11-04', 630);
  await expect(page.locator('.calendar-drag-preview')).toContainText('2026-11-04 10:30');
  const preview = page.locator('.calendar-hours-day[data-calendar-date="2026-11-04"] .calendar-placement');
  await expect(preview).toBeVisible();
  await expect(preview).toHaveCSS('top', '0px');
  await page.mouse.up();await expect.poll(async () => [(await saved()).due, (await saved()).due_time]).toEqual(['2026-11-04', '10:30']);
  await drag('start', '2026-11-02', 510);
  await expect(page.locator('.calendar-resize-sibling').first()).toHaveCSS('visibility', 'hidden');
  await page.mouse.up();
  await expect.poll(async () => [(await saved()).start, (await saved()).start_time]).toEqual(['2026-11-02', '08:30']);
  await expect(cards).toHaveCount(3);
  await drag('start', '2026-11-03', 570);await page.mouse.up();
  await expect.poll(async () => [(await saved()).start, (await saved()).start_time]).toEqual(['2026-11-03', '09:30']);
  await drag('due', '2026-11-03', 660);await page.mouse.up();
  await expect.poll(async () => [(await saved()).due, (await saved()).due_time]).toEqual(['2026-11-03', '11:00']);
  await expect(cards).toHaveCount(1);
  const before = await saved();await drag('due', '2026-11-04', 660, true);await page.mouse.up();
  expect((await saved()).revision).toBe(before.revision);
  await expect(cards).toHaveCount(1);await expect(page.locator('.calendar-placement')).toHaveCount(0);
  await expect(page.locator('.calendar-resize-sibling')).toHaveCount(0);
  await page.reload();await expect(cards).toHaveCount(1);await expect(cards).toContainText('09:30 – 11:00');
}));

test('resize handles never cross, including pointer moves into the wrong day and keyboard day changes', async ({ page }) => {
  const { cards, saved, drag } = await open(page);
  await drag('start', '2026-11-04', 660);await page.mouse.up();
  await expect.poll(async () => [(await saved()).start, (await saved()).start_time]).toEqual(['2026-11-03', '09:45']);
  // The server write can finish before the calendar replaces its old drag handles.
  await expect(cards).toContainText('09:45 – 10:00');
  await drag('due', '2026-11-02', 480);await page.mouse.up();
  await expect.poll(async () => [(await saved()).due, (await saved()).due_time]).toEqual(['2026-11-03', '10:00']);
  const end = cards.locator('[data-calendar-time-end="due"]');await end.focus();await page.keyboard.press('ArrowRight');
  await expect.poll(async () => (await saved()).due).toBe('2026-11-04');
  await expect(cards).toHaveCount(2);
  await expect(cards.locator('[data-calendar-time-end="due"]')).toBeFocused();
  await page.keyboard.press('ArrowLeft');await expect.poll(async () => (await saved()).due).toBe('2026-11-03');
});
