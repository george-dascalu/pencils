// Owner request (F0.22-45): the cards in a Week board cell go in the order you put them, by dragging
// a card up or down within its cell (or to a place in another), as in Kanban.
import { test, expect, useApp } from '../fixtures.mjs';
import { reveal } from '../helpers/menu-controls.mjs';

const app = useApp(async store => {
  const organisation = await store.createOrganisation({ title: 'Order team', people: [{ id: 'ann', name: 'Ann' }], teams: [{ id: 'team', name: 'Team', members: ['ann'] }] });
  const project = await store.createProject({ title: 'Week order', key: 'WO', organisation: organisation.id, teams: ['team'] });
  const cards = [];
  for (const title of ['First', 'Second', 'Third']) cards.push(await store.createTask(project.id, { title, assignee: 'Ann', due: '2026-11-05' }));
  const other = await store.createTask(project.id, { title: 'Wednesday', assignee: 'Ann', due: '2026-11-04' });
  // Ranked Bravo, Alpha, Charlie: sorted by title they show in another order.
  const sorted = await store.createProject({ title: 'Week sorted', key: 'WS', organisation: organisation.id, teams: ['team'] });
  for (const [title, order] of [['Alpha', 1024], ['Bravo', 0], ['Charlie', 2048]]) await store.createTask(sorted.id, { title, order, assignee: 'Ann', due: '2026-11-05' });
  return { project, cards, other, sorted };
});
const cell = (page, day) => page.locator(`.week-board-cell[data-week-board-value="Ann"][data-calendar-date="${day}"]`);
const titles = (page, day) => cell(page, day).locator('.week-board-card:not(.calendar-placement) .week-board-title').evaluateAll(els => els.map(el => el.textContent.replace(/^W[OS]-\d+ /, '')));
async function open(page, project = app.project) {
  await page.clock.setFixedTime(new Date('2026-11-04T12:00:00'));
  await page.goto(`${app.base}/#project/${project.id}/calendar`);
  await (await reveal(page.locator('#calendar-mode'))).selectOption('board');
  if (await page.locator('.mobile-view-options[open]').count()) await page.getByRole('button', { name: 'Close view options', exact: true }).click();
  await expect(page.locator('.week-board')).toBeVisible();
}
// Drags a card's title to just above (or below) another card's middle.
async function dragTo(page, title, target, below = false) {
  const from = await page.locator('.week-board-title', { hasText: title }).boundingBox();
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(from.x + from.width / 2 + 10, from.y + from.height / 2 + 10, { steps: 3 });
  // The landing place moves the cards it passes, so aim again at where the target now is, as a
  // person would.
  for (const steps of [8, 2]) {
    const to = await page.locator('.week-board-card:not(.calendar-placement)', { hasText: target }).first().boundingBox();
    await page.mouse.move(to.x + to.width / 2, below ? to.y + to.height - 4 : to.y + 4, { steps });
    await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
  }
}

test('a card dragged within its Week board cell keeps the place it was put in', async ({ page }) => {
  await open(page);
  expect(await titles(page, '2026-11-05')).toEqual(['First', 'Second', 'Third']);
  await dragTo(page, 'Third', 'First');
  // The landing place shows where it will go: above First.
  await expect(cell(page, '2026-11-05').locator('.week-board-card').first()).toHaveClass(/calendar-placement/);
  await page.mouse.up();
  await expect.poll(() => titles(page, '2026-11-05')).toEqual(['Third', 'First', 'Second']);
  const order = async () => Object.fromEntries((await app.store.snapshot(app.project.id)).tasks.map(t => [t.title, t.order || 0]));
  await expect.poll(async () => { const o = await order(); return o.Third < o.First && o.First < o.Second; }).toBe(true);
  await page.reload();
  await expect(page.locator('.week-board')).toBeVisible();
  expect(await titles(page, '2026-11-05')).toEqual(['Third', 'First', 'Second']);
  // A card from another day lands at the place it's dropped: between First and Second.
  await dragTo(page, 'Wednesday', 'First', true);
  await page.mouse.up();
  await expect.poll(() => titles(page, '2026-11-05')).toEqual(['Third', 'First', 'Wednesday', 'Second']);
  await expect.poll(async () => (await app.store.snapshot(app.project.id)).tasks.find(t => t.id === app.other.id).due).toBe('2026-11-05');
});

test('a drop in a cell sorted by another field shows the manual order, even when the ranks already give it', async ({ page }) => {
  await page.addInitScript((id) => localStorage.setItem(`pencils:sort:${id}`, JSON.stringify('title')), app.sorted.id);
  await open(page, app.sorted);
  expect(await titles(page, '2026-11-05')).toEqual(['Alpha', 'Bravo', 'Charlie']);
  await dragTo(page, 'Bravo', 'Alpha');
  await page.mouse.up();
  await expect.poll(() => titles(page, '2026-11-05')).toEqual(['Bravo', 'Alpha', 'Charlie']);
  expect(await page.evaluate((id) => localStorage.getItem(`pencils:sort:${id}`), app.sorted.id)).toBe('"order"');
});
