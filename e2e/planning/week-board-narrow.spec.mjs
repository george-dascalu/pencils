// Owner requests (F0.22-70, F0.22-71): on a narrower window a Week board row's name stays beside its
// handle, like the other rows' names, and the day columns can be narrower before the board scrolls.
import { test, expect, useApp } from '../fixtures.mjs';
import { reveal } from '../helpers/menu-controls.mjs';

const app = useApp(async store => {
  const organisation = await store.createOrganisation({ title: 'Narrow team', people: [{ id: 'ann', name: 'Ann' }], teams: [{ id: 'team', name: 'Team', members: ['ann'] }] });
  const project = await store.createProject({ title: 'Narrow week', key: 'NW', organisation: organisation.id, teams: ['team'] });
  await store.createTask(project.id, { title: 'Ann on Tuesday', assignee: 'Ann', status: 'in-progress', priority: 'high', due: '2026-11-03' });
  await store.createTask(project.id, { title: 'Nobody on Friday', status: 'todo', priority: 'medium', due: '2026-11-06' });
  return { project };
});
async function open(page, width, rows) {
  await page.setViewportSize({ width, height: 800 });
  await page.clock.setFixedTime(new Date('2026-11-04T12:00:00'));
  await page.goto(`${app.base}/#project/${app.project.id}/calendar`);
  await (await reveal(page.locator('#calendar-mode'))).selectOption('board');
  await (await reveal(page.locator('#week-board-rows'))).selectOption(rows);
  await expect(page.locator(`.week-board[data-rows="${rows}"]`)).toBeVisible();
}

test('on a narrow window every row name stays beside its handle @gate', async ({ page }) => {
  await open(page, 1000, 'status');
  // The names' column is at its narrowest.
  await expect.poll(() => page.locator('.week-board').evaluate(el => getComputedStyle(el).gridTemplateColumns.split(' ')[0])).toBe('112px');
  const heads = await page.locator('.week-board-row-head').evaluateAll(els => els.map(head => {
    const handle = head.querySelector('.task-reorder-handle').getBoundingClientRect(), name = head.querySelector('span:not(.sr-only)').getBoundingClientRect();
    return { name: head.textContent.trim(), beside: name.left >= handle.right - 0.5 && Math.abs(name.top - handle.top) < 1 };
  }));
  expect(heads.map(h => h.name)).toContain('In progress');
  for (const head of heads) expect(head.beside, head.name).toBe(true);
});

test('the day columns narrow to fit the window before the board scrolls, keeping each card whole @gate', async ({ page }) => {
  await open(page, 1200, 'none');
  const scroll = page.locator('.week-board-scroll');
  await expect.poll(() => scroll.evaluate(el => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(0);
  // Narrower still, the columns stop at their narrowest and the board scrolls.
  await page.setViewportSize({ width: 800, height: 800 });
  await expect.poll(() => page.locator('.week-board').evaluate(el => getComputedStyle(el).gridTemplateColumns.split(' ').at(-1))).toBe('140px');
  const cards = await page.locator('.week-board .week-board-card').evaluateAll(els => els.map(card => {
    const c = card.getBoundingClientRect(), cell = card.closest('.week-board-cell').getBoundingClientRect(), box = card.querySelector('.field-box').getBoundingClientRect();
    return box.right <= c.right + 0.5 && c.right <= cell.right + 0.5 && card.scrollWidth <= card.clientWidth;
  }));
  expect(cards).toEqual([true, true]);
  await page.setViewportSize({ width: 1200, height: 800 });
  // Cards on the Unscheduled board keep their width, room for their dates when the rows are times of day.
  await (await reveal(page.locator('#week-board-rows'))).selectOption('daypart');
  const backlog = page.locator('.week-board-backlog .week-board-card');
  await expect(backlog).toHaveCount(2);
  await expect(backlog.locator('.row-due').first()).toBeVisible();
  expect(await backlog.evaluateAll(els => els.map(card => {
    const c = card.getBoundingClientRect(), box = card.querySelector('.field-box').getBoundingClientRect();
    return box.right <= c.right + 0.5 && card.scrollWidth <= card.clientWidth;
  }))).toEqual([true, true]);
});
