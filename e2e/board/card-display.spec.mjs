// Owner request, 2 November 2026: choose the details shown on cards in Board appearance.
import { test, expect, useApp, onDevices } from '../fixtures.mjs';
import { clickControl } from '../helpers/menu-controls.mjs';
const app = useApp(async store => {
  const project = await store.createProject({ title: 'Card display', key: 'CD', schema: { fields: [{ id: 'cost', name: 'Cost', type: 'number' }, { id: 'approved', name: 'Approved', type: 'checkbox' }, { id: 'note', name: 'Custom note', type: 'text' }] } });
  const task = await store.createTask(project.id, { title: 'Board details', assignee: 'George', status: 'todo', priority: 'high', start: '2026-11-01', due: '2026-11-12', fields: { cost: 150, approved: false, note: '<img src=x onerror=alert(1)>' }, body: 'Card description' });
  const board = (await store.snapshot(project.id)).boards[0];
  await store.updateBoard(project.id, board.id, { revision: board.revision, nodes: [{ id: 'card', type: 'task', task: task.id, x: 100, y: 100, w: 440, h: 300 }] });
  const other = await store.createBoard(project.id, { title: 'Other board' });
  return { project, task, board, other };
});
const savedBoard = async id => (await app.store.snapshot(app.project.id)).boards.find(board => board.id === id);
const open = async page => {
  const board = (await app.store.snapshot(app.project.id)).boards.find(b => b.id === app.board.id);
  await app.store.updateBoard(app.project.id, board.id, { revision: board.revision, settings: { ...board.settings, card_fields: { hidden: ['estimate', 'tags'], custom: [] } } });
  await page.goto(`${app.base}/#project/${app.project.id}/board/${app.board.id}`);
  await page.locator('[data-node="card"] .canvas-task-status').waitFor();
};
const appearance = async page => {
  await clickControl(page.locator('[data-feature="board-settings"]'));
  return page.getByRole('dialog', { name: 'Board appearance', exact: true });
};
onDevices(['desktop', 'ipad', 'phone'], () => test('Board appearance saves card details per board and renders selected custom fields @gate', async ({ page }) => {
  await open(page);
  let panel = await appearance(page);
  await panel.getByLabel('ID', { exact: true }).uncheck();
  await panel.getByLabel('Status', { exact: true }).uncheck();
  await panel.getByLabel('Start date', { exact: true }).uncheck();
  await panel.getByLabel('Cost', { exact: true }).check();
  await panel.getByLabel('Approved', { exact: true }).check();
  await panel.getByLabel('Custom note', { exact: true }).check();
  const card = page.locator('[data-node="card"]');
  await expect(card.locator('.canvas-task-key')).toBeHidden();
  await expect(card.locator('.canvas-task-status')).toBeHidden();
  await expect(card.locator('.canvas-task-date-arrow')).toBeHidden();
  await expect(card.locator('.canvas-task-custom-fields')).toContainText('Cost150');
  await expect(card.locator('.canvas-task-custom-fields')).toContainText('ApprovedNo');
  await expect(card.locator('.canvas-task-custom-fields')).toContainText('<img src=x onerror=alert(1)>');
  await expect(card.locator('.canvas-task-custom-fields img')).toHaveCount(0);
  await expect(card.locator('.canvas-task-dates')).toBeVisible();
  await panel.getByRole('button', { name: 'Close board appearance' }).click();
  await expect.poll(async () => (await savedBoard(app.board.id)).settings.card_fields.custom.length).toBe(3);
  const savedTask = (await app.store.snapshot(app.project.id)).tasks.find(t => t.id === app.task.id);
  expect(savedTask.status).toBe('todo');expect(savedTask.assignee).toBe('George');
  expect((await savedBoard(app.other.id)).settings?.card_fields).toBeUndefined();
  await page.reload();await expect(card.locator('.canvas-task-status')).toBeHidden();
  await expect(card.locator('.canvas-task-custom-fields')).toContainText('150');
  panel = await appearance(page);
  await expect(panel.getByLabel('Status', { exact: true })).not.toBeChecked();
  await panel.getByRole('button', { name: 'Reset', exact: true }).click();
  await expect(card.locator('.canvas-task-status')).toBeVisible();
  await expect(card.locator('.canvas-task-custom-fields')).toHaveCount(0);
}));

test('hiding every detail leaves card actions available without an empty field group', async ({ page }) => {
  await open(page);const panel = await appearance(page);
  for (const checkbox of await panel.locator('[data-board-card-field]').all()) await checkbox.uncheck();
  const card = page.locator('[data-node="card"]');
  await expect(card.locator('.canvas-task-identity')).toBeHidden();
  await expect(card.locator('.task-title')).toBeHidden();
  await expect(card.locator('.live-card-state')).toBeHidden();
  await expect(card.locator('.task-card-description')).toBeHidden();
  await panel.getByRole('button', { name: 'Close board appearance' }).click();
  await expect(card.getByRole('button', { name: 'Open card details', exact: true })).toBeVisible();
});

test('undo restores card visibility and project-disabled fields stay out of the appearance panel', async ({ page }) => {
  await open(page);let panel = await appearance(page);
  await panel.getByLabel('Title', { exact: true }).uncheck();
  const title = page.locator('[data-node="card"] .live-card-heading > .task-title');
  await expect(title).toBeHidden();
  await panel.getByRole('button', { name: 'Close board appearance' }).click();
  await page.locator('#canvas').focus();await page.keyboard.press('Control+z');
  await expect(title).toBeVisible();
  const project = (await app.store.snapshot(app.project.id)).project;
  await app.store.updateProject(project.id, { revision: project.revision, schema: { ...project.schema, off: ['priority', 'start'] } });
  await page.reload();panel = await appearance(page);
  await expect(panel.getByLabel('Priority', { exact: true })).toHaveCount(0);
  await expect(panel.getByLabel('Start date', { exact: true })).toHaveCount(0);
  await expect(page.locator('[data-node="card"] .canvas-task-priority')).toBeHidden();
});
