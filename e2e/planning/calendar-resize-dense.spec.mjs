import { test, expect, useApp, onDevices } from '../fixtures.mjs';
import { reveal } from '../helpers/menu-controls.mjs';

const app = useApp();
onDevices(['desktop', 'ipad'], () => test('short overlapping events keep both endpoints reachable @gate', async ({ page, device, browserName }) => {
  test.skip(device === 'ipad' && browserName !== 'chromium', 'Raw touches need Chromium DevTools');
  const project = await app.store.createProject({ title: `Dense events ${device}` });
  const tasks = [];
  for (let i = 0; i < 4; i++) tasks.push(await app.store.createTask(project.id, { title: `Event ${i}`, start: '2026-11-02', due: '2026-11-02', start_time: '11:00', due_time: '11:15' }));
  await page.clock.setFixedTime(new Date('2026-11-02T12:00:00'));
  await page.goto(`${app.base}/#project/${project.id}/calendar`);
  await (await reveal(page.locator('#calendar-mode'))).selectOption('week');
  if (await page.locator('.mobile-view-options[open]').count()) await page.getByRole('button', { name: 'Close view options', exact: true }).click();
  const card = page.locator(`.calendar-timed-card[data-id="${tasks[1].id}"]`);
  await card.scrollIntoViewIfNeeded();
  const cdp = device === 'ipad' ? await page.context().newCDPSession(page) : null;
  for (const end of ['start', 'due']) {
    if (cdp && await card.getAttribute('data-calendar-active') === null) {
      const b = await card.boundingBox();
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: b.x + b.width / 2, y: b.y + b.height / 2 }] });
      await expect(card).toHaveAttribute('data-calendar-active', '');
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    } else if (!cdp) await card.hover();
    const grip = card.locator(`[data-calendar-time-end="${end}"]`), b = await grip.boundingBox();
    const x = b.x + b.width / 2, y = b.y + b.height / 2;
    if (cdp) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y + (end === 'start' ? -16 : 16) }] });
    } else {
      await page.mouse.move(x, y); await page.mouse.down();
      await page.mouse.move(x, y + (end === 'start' ? -16 : 16), { steps: 4 });
    }
    await expect(page.locator('.calendar-drag-preview')).toContainText(end === 'start' ? '10:45 – 11:15' : '11:00 – 11:30');
    await page.keyboard.press('Escape');
    if (cdp) await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    else await page.mouse.up();
    await expect(page.locator('#task-form')).toHaveCount(0);
  }
  const saved = (await app.store.snapshot(project.id)).tasks;
  expect(saved.map(t => [t.start_time, t.due_time])).toEqual(tasks.map(() => ['11:00', '11:15']));
}));
