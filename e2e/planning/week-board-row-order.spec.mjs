// Owner request (F0.22-47): the Week board's rows go in the order you put them in, by dragging a
// row's handle (or Alt + Up/Down on it), as List's groups do; kept per project and Group by field.
import { test, expect, onDevices, useApp } from '../fixtures.mjs';
import { reveal } from '../helpers/menu-controls.mjs';

const app = useApp(async store => {
  const organisation = await store.createOrganisation({ title: 'Rows team', people: [{ id: 'ann', name: 'Ann' }, { id: 'bob', name: 'Bob' }, { id: 'cy', name: 'Cy' }], teams: [{ id: 'team', name: 'Team', members: ['ann', 'bob', 'cy'] }] });
  const project = await store.createProject({ title: 'Week rows', key: 'WR', organisation: organisation.id, teams: ['team'] });
  for (const name of ['Ann', 'Bob', 'Cy']) await store.createTask(project.id, { title: `${name}'s card`, assignee: name, due: '2026-11-05' });
  return { project };
});
const rows = (page) => page.locator('.week-board-row[data-week-board-value]').evaluateAll(els => els.map(el => el.dataset.weekBoardValue));
const head = (page, value) => page.locator(`.week-board-row[data-week-board-value="${value}"] > .week-board-row-head`);
const handle = (page, value) => head(page, value).locator('[data-group-reorder]');
async function open(page) {
  await page.clock.setFixedTime(new Date('2026-11-04T12:00:00'));
  await page.goto(`${app.base}/#project/${app.project.id}/calendar`);
  await (await reveal(page.locator('#calendar-mode'))).selectOption('board');
  if (await page.locator('.mobile-view-options[open]').count()) await page.getByRole('button', { name: 'Close view options', exact: true }).click();
  await expect(page.locator('.week-board')).toBeVisible();
}

test('a Week board row dragged by its handle, or moved with Alt + arrows, keeps its place', async ({ page }) => {
  await open(page);
  expect(await rows(page)).toEqual(['Ann', 'Bob', 'Cy']);
  await expect(handle(page, 'Cy')).toHaveAccessibleName('Move group Cy');
  const grip = await handle(page, 'Cy').boundingBox();
  await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2);
  await page.mouse.down();
  await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2 - 10, { steps: 3 });
  await expect(page.locator('.task-group-ghost')).toBeVisible();
  const target = await head(page, 'Ann').boundingBox();
  await page.mouse.move(target.x + 20, target.y + 4, { steps: 8 });
  await expect(page.locator('.task-reorder-marker')).toBeVisible();
  // The lifted heading follows the pointer above the board.
  const ghost = await page.locator('.task-group-ghost').evaluate(el => ({ position: getComputedStyle(el).position, top: el.getBoundingClientRect().top }));
  expect(ghost.position).toBe('fixed');
  expect(Math.abs(ghost.top - (target.y + 4 - (grip.height / 2 + 4)))).toBeLessThan(target.height);
  await page.mouse.up();
  await expect.poll(() => rows(page)).toEqual(['Cy', 'Ann', 'Bob']);
  await expect(handle(page, 'Cy')).toBeFocused();
  await page.reload();
  await expect(page.locator('.week-board')).toBeVisible();
  expect(await rows(page)).toEqual(['Cy', 'Ann', 'Bob']);
  await handle(page, 'Cy').focus();
  await page.keyboard.press('Alt+ArrowDown');
  await expect.poll(() => rows(page)).toEqual(['Ann', 'Cy', 'Bob']);
  await expect(handle(page, 'Cy')).toBeFocused();
  // Another Group by field keeps its own order.
  await (await reveal(page.locator('#week-board-rows'))).selectOption('status');
  await expect.poll(() => rows(page)).toEqual(['backlog', 'todo', 'in-progress', 'review', 'done']);
  await (await reveal(page.locator('#week-board-rows'))).selectOption('assignee');
  await expect.poll(() => rows(page)).toEqual(['Ann', 'Cy', 'Bob']);
});

onDevices(['phone'], () => test('on phones a row handle is a 44px target and the row name stays in its heading', async ({ page }) => {
  await open(page);
  const box = await handle(page, 'Ann').boundingBox();
  expect(Math.min(box.width, box.height)).toBeGreaterThanOrEqual(44);
  const fits = await head(page, 'Ann').evaluate(el => [...el.children].every(child => {
    const r = child.getBoundingClientRect(), h = el.getBoundingClientRect();
    return r.left >= h.left - 0.5 && r.right <= h.right + 0.5 && r.width > 0;
  }));
  expect(fits).toBe(true);
}));
