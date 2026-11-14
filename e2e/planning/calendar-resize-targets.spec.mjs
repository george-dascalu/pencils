import { test, expect, useApp } from '../fixtures.mjs';
import { reveal } from '../helpers/menu-controls.mjs';

const app = useApp(async store => {
  const project = await store.createProject({ title: 'Touching events' });
  const cards = [];
  for (const [title, start_time, due_time] of [['First', '10:30', '11:00'], ['Middle', '11:00', '12:00'], ['Last', '12:00', '13:00']])
    cards.push(await store.createTask(project.id, { title, start: '2026-11-02', due: '2026-11-02', start_time, due_time }));
  return { project, cards };
});
test('fixed corner handles resize the middle of touching events without changing its neighbor @gate', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-11-02T12:00:00'));
  await page.goto(`${app.base}/#project/${app.project.id}/calendar`);
  await (await reveal(page.locator('#calendar-mode'))).selectOption('week');
  const cards = app.cards.map(c => page.locator(`.calendar-timed-card[data-id="${c.id}"]`));
  for (const card of cards) {
    await card.scrollIntoViewIfNeeded(); await card.hover();
    const box = await card.boundingBox();
    const start = await card.locator('[data-calendar-time-end="start"]').boundingBox();
    const end = await card.locator('[data-calendar-time-end="due"]').boundingBox();
    expect(start.x - box.x).toBeCloseTo(0);
    expect(end.x + end.width - box.x - box.width).toBeCloseTo(0);
  }
  await cards[1].hover();
  const grip = cards[1].locator('[data-calendar-time-end="due"]'), r = await grip.boundingBox();
  const x = r.x + r.width / 2, y = r.y + r.height / 2;
  await page.mouse.move(x, y);
  expect(await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.closest('[data-calendar-card]')?.dataset.calendarCard, { x, y })).toBe(app.cards[1].id);
  await page.mouse.down(); await page.mouse.move(x, y + 16, { steps: 4 });
  await expect(page.locator('.calendar-drag-preview')).toContainText('11:00 – 12:15');
  await page.mouse.up();
  await expect.poll(async () => (await app.store.snapshot(app.project.id)).tasks.find(t => t.id === app.cards[1].id).due_time).toBe('12:15');
  const last = (await app.store.snapshot(app.project.id)).tasks.find(t => t.id === app.cards[2].id);
  expect([last.start_time, last.due_time]).toEqual(['12:00', '13:00']);
  await page.reload();
  await expect(cards[1]).toContainText('11:00 – 12:15');
  await expect(cards[1].locator('strong')).toHaveCSS('font-weight', '600');
  await expect(cards[1].locator('.calendar-card-title')).toHaveCSS('border-left-width', '3px');
});
