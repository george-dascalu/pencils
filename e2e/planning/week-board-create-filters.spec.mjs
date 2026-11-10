// Owner request: new Week board cards inherit active status, assignee, tag and other field filters.
import { test, expect, useApp, onDevices } from '../fixtures.mjs';
import { reveal } from '../helpers/menu-controls.mjs';
import { newCard } from '../helpers/new-card.mjs';

const day = '2026-11-05';
const app = useApp(async store => {
  const org = await store.createOrganisation({ title: 'Filtered creation', people: [{ id: 'ann', name: 'Ann' }, { id: 'bob', name: 'Bob' }], teams: [{ id: 'team', name: 'Team', members: ['ann', 'bob'] }] });
  const fields = [{ id: 'points', name: 'Points', type: 'number' }, { id: 'approved', name: 'Approved', type: 'checkbox' }];
  const project = await store.createProject({ title: 'Filtered week', key: 'FW', organisation: org.id, teams: ['team'], schema: { fields, default_assignee: 'bob', tags: [{ name: 'Home' }, { name: 'Work' }] } });
  await store.createTask(project.id, { title: 'Existing match', type: 'bug', status: 'review', assignee: 'Ann', priority: 'high', tags: ['Home', 'Work'], start: day, due: day, start_time: '09:00', due_time: '10:00', fields: { points: 0, approved: false } });
  return { project };
});
const saved = async title => (await app.store.snapshot(app.project.id)).tasks.find(t => t.title === title);
const cell = page => page.locator(`.week-board-cell[data-calendar-date="${day}"][data-week-board-value="afternoon"]`);
async function closeOptions(page) {
  if (await page.locator('.mobile-view-options[open]').count()) await page.getByRole('button', { name: 'Close view options', exact: true }).click();
  else await page.keyboard.press('Escape');
}
async function choose(page, selector, value) { await (await reveal(page.locator(selector))).selectOption(value); }
async function open(page) {
  await page.clock.setFixedTime(new Date('2026-11-04T12:00:00'));
  await page.goto(`${app.base}/#project/${app.project.id}/calendar`);
  await choose(page, '#calendar-mode', 'board');
  await choose(page, '#week-board-rows', 'daypart');
  await closeOptions(page);
  await page.getByRole('button', { name: 'Hide Unscheduled', exact: true }).click();
}
async function filters(page) {
  for (const [selector, value] of [['#filter-status', 'review'], ['#filter-type', 'bug'], ['#filter-assignee', '@person:Ann'], ['#filter-priority', 'high']]) await choose(page, selector, value);
  await (await reveal(page.getByRole('button', { name: 'Filter by tags', exact: true }))).click();
  for (const name of ['Home', 'Work']) await page.locator('#shared-select-menu').getByRole('checkbox', { name, exact: true }).check();
  await page.keyboard.press('Escape');
  await choose(page, '[data-filter-custom="approved"]', 'false');
  const points = await reveal(page.locator('[data-filter-custom="points"]'));
  await points.fill('0'); await points.blur();
  await closeOptions(page);
}
async function inline(page, title) {
  await cell(page).getByRole('button', { name: /Add card/ }).click();
  await cell(page).getByRole('textbox', { name: 'Card title' }).fill(title);
  await cell(page).getByRole('button', { name: 'Create card', exact: true }).click();
  await expect.poll(() => saved(title)).toBeTruthy();
}

onDevices(['desktop', 'phone'], () => test('inline cards inherit all active field filters and remain visible in the chosen cell', async ({ page, device }) => {
  await open(page); await filters(page);
  const title = `Filtered inline ${device}`;
  await inline(page, title);
  await expect(cell(page).locator('.week-board-title', { hasText: title })).toBeVisible();
  expect(await saved(title)).toMatchObject({ type: 'bug', status: 'review', assignee: 'Ann', priority: 'high', tags: ['Home', 'Work'], fields: { points: 0, approved: false }, start: day, due: day, start_time: '13:00', due_time: '14:00' });
  await page.reload();
  await expect(cell(page).locator('.week-board-title', { hasText: title })).toBeVisible();
}));

onDevices(['desktop', 'phone'], () => test('New Card prefills Week board filters and respects edits made in the form', async ({ page, device }) => {
  await open(page); await filters(page); await newCard(page);
  const form = page.locator('#task-form');
  for (const [name, value] of Object.entries({ type: 'bug', status: 'review', assignee: 'Ann', priority: 'high', tags: '["Home","Work"]' })) await expect(form.locator(`[name="${name}"]`)).toHaveValue(value);
  await form.locator('[data-task-picker="priority"] .task-picker-trigger').click();
  await form.locator('[data-task-picker="priority"] [data-picker-value="low"]').click();
  const title = `Filtered New card ${device}`;
  await form.locator('[name="title"]').fill(title);
  await form.getByRole('button', { name: 'Create card', exact: true }).click();
  await expect(form).toHaveCount(0);
  // Custom fields are retained by the shared form, which has no custom-field inputs.
  expect(await saved(title)).toMatchObject({ type: 'bug', status: 'review', assignee: 'Ann', priority: 'low', tags: ['Home', 'Work'], fields: { points: 0, approved: false } });
}));

test('Unassigned overrides the project default and clearing filters restores normal defaults', async ({ page }) => {
  await open(page);
  await choose(page, '#filter-assignee', '@unassigned'); await closeOptions(page);
  await inline(page, 'Deliberately unassigned');
  expect((await saved('Deliberately unassigned')).assignee).toBe('');
  await (await reveal(page.locator('[data-board-menu="filters"] [data-action="filters-reset"]'))).click();
  await closeOptions(page);
  await inline(page, 'Default assignee again');
  expect((await saved('Default assignee again')).assignee).toBe('Bob');
});

test('filters in other calendar layouts do not silently prefill new cards', async ({ page }) => {
  await open(page); await filters(page);
  await choose(page, '#calendar-mode', 'month'); await closeOptions(page); await newCard(page);
  const form = page.locator('#task-form');
  for (const [name, value] of Object.entries({ type: 'task', status: 'todo', assignee: 'Bob', priority: 'medium', tags: '[]' })) await expect(form.locator(`[name="${name}"]`)).toHaveValue(value);
});
