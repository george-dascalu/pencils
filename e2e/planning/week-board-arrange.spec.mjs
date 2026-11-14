// One-shot dock arrangements move only the matching cards' positions; dates and fields stay intact.
import { test, expect, useApp, onDevices } from '../fixtures.mjs';
import { reveal } from '../helpers/menu-controls.mjs';

const day = '2026-11-05';
const app = useApp(async store => {
  const project = await store.createProject({ title: 'Arrange dock', key: 'AD' });
  const parent = await store.createTask(project.id, { title: 'Parent project', type: 'epic', due: day });
  const cards = [];
  for (const fields of [
    { title: 'Urgent work', priority: 'urgent', status: 'todo', tags: ['Work'], parent: parent.id },
    { title: 'Low home', priority: 'low', status: 'in-progress', tags: ['Home'] },
    { title: 'Urgent both', priority: 'urgent', status: 'todo', tags: ['Work', 'Home'], parent: parent.id },
    { title: 'Untimed day', priority: 'high', status: 'todo', tags: [], due: day },
  ]) cards.push(await store.createTask(project.id, fields));
  const done = await store.createTask(project.id, { title: 'Finished', status: 'done' });
  return { project, cards, parent, done };
});
const saved = async () => (await app.store.snapshot(app.project.id)).tasks;
test.beforeEach(async () => {
  for (const t of await saved()) if (t.backlog) await app.store.updateTask(app.project.id, t.id, { revision: t.revision, backlog: null });
});
async function open(page) {
  await page.clock.setFixedTime(new Date('2026-11-04T12:00:00'));
  await page.goto(`${app.base}/#project/${app.project.id}/calendar`);
  await (await reveal(page.locator('#calendar-mode'))).selectOption('board');
  await (await reveal(page.locator('#week-board-rows'))).selectOption('daypart');
  if (await page.locator('.mobile-view-options[open]').count()) await page.getByRole('button', { name: 'Close view options', exact: true }).click();
}
const dock = page => page.locator('.week-board-backlog');
const arrange = (page, name) => dock(page).getByRole('button', { name: `Arrange by ${name}`, exact: true });

onDevices(['desktop', 'phone', 'small', 'ipad'], () => test('dock arrangement buttons fit and save groups once, leaving cards freely movable', { tag: '@gate' }, async ({ page, device }) => {
  await open(page);
  const initial = await saved();
  for (const name of ['priority', 'parent', 'tags', 'status']) {
    const button = arrange(page, name);
    await expect(button).toBeVisible();
    const r = await button.boundingBox();
    expect(r.width).toBe(r.height);
    expect(r.height).toBe(device === 'desktop' ? 32 : 44);
    expect(r.x + r.width).toBeLessThanOrEqual(page.viewportSize().width);
    await button.click();
    await expect(button).toBeEnabled();
    await expect(dock(page).locator('.week-board-backlog-group').first()).toBeVisible();
    await expect(dock(page).locator('.week-board-backlog-group').first()).toHaveCSS('position', 'absolute');
    await expect.poll(async () => (await saved()).filter(t => t.id !== app.done.id && !t.start && !t.due).every(t => !!t.backlog)).toBe(true);
  }
  const after = await saved();
  for (const t of after) {
    const before = initial.find(a => a.id === t.id);
    if (t.start || t.due) {
      expect(t.backlog).toEqual(before.backlog);
      await expect(page.locator(`.week-board-all-day [data-calendar-card="${t.id}"]`)).toHaveCount(1);
    }
    for (const field of ['parent', 'tags', 'priority', 'status', 'start', 'due', 'start_time', 'due_time']) expect(t[field]).toEqual(before[field]);
  }
  expect(after.find(t => t.id === app.done.id).backlog).toBeFalsy();
  await arrange(page, 'priority').click();
  await expect(arrange(page, 'priority')).toBeEnabled();
  const id = app.cards[0].id, current = (await saved()).find(t => t.id === id).backlog;
  const title = dock(page).locator(`[data-calendar-card="${id}"] .week-board-title`);
  await title.focus();
  await page.keyboard.press('Alt+Shift+ArrowRight');
  await expect.poll(async () => (await saved()).find(t => t.id === id).backlog.x).toBe(current.x + 10);
  await page.reload();
  await expect(dock(page).locator(`[data-calendar-card="${id}"]`)).toHaveCSS('left', `${current.x + 10}px`);
  await expect(dock(page).locator('.week-board-backlog-group').first()).toHaveText('Urgent');
  await page.getByRole('button', { name: 'Hide Unscheduled', exact: true }).click();
  await expect(arrange(page, 'priority')).toBeHidden();
  await expect(page.getByRole('button', { name: 'Show Unscheduled', exact: true })).toBeVisible();
}));

test('arrangement respects the filter and has one card per tag combination', async ({ page }) => {
  await open(page);
  await page.locator('#search').fill('Urgent');
  await arrange(page, 'tags').click();
  await expect(arrange(page, 'tags')).toBeEnabled();
  await expect(dock(page).locator('.week-board-card')).toHaveCount(2);
  await expect(dock(page).locator('.week-board-backlog-group')).toHaveText(['Home · Work', 'Work']);
  await expect.poll(async () => (await saved()).filter(t => t.backlog).map(t => t.title).sort()).toEqual(['Urgent both', 'Urgent work']);
});

test('a refused arrangement stays recoverable and leaves saved dates and positions intact', async ({ page }) => {
  await open(page);
  await page.route(`**/api/projects/${app.project.id}/tasks/*`, route => route.request().method() === 'PATCH' ? route.fulfill({ status: 403, contentType: 'application/json', body: JSON.stringify({ error: 'Arrangement refused' }) }) : route.continue());
  await arrange(page, 'priority').click();
  await expect(arrange(page, 'priority')).toBeEnabled();
  await expect(page.locator('#save-warning-toggle')).toBeVisible();
  expect((await saved()).every(t => !t.backlog)).toBe(true);
  expect((await saved()).find(t => t.id === app.cards[3].id).due).toBe(day);
  await page.reload();
  await expect(page.locator('#save-warning-toggle')).toBeVisible();
  await expect(dock(page).locator('.week-board-card').first()).toHaveCSS('position', 'absolute');
});

test('arrangement leaves out fields the project has turned off', async ({ page }) => {
  const project = await app.store.createProject({ title: 'Simple dock', schema: { off: ['priority', 'parent', 'tags'] } });
  await app.store.createTask(project.id, { title: 'Arrange me' });
  await page.goto(`${app.base}/#project/${project.id}/calendar`);
  await page.locator('#calendar-mode').selectOption('board');
  await expect(dock(page).locator('[data-backlog-arrange]')).toHaveCount(1);
  await expect(arrange(page, 'status')).toBeVisible();
});
