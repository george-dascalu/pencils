// Owner request: Agenda rows show the same editable field box as List and Tree, on the right.
import { test, expect, useApp, onDevices } from '../fixtures.mjs';
import { agendaDates } from '../helpers/agenda-range.mjs';
import { reveal } from '../helpers/menu-controls.mjs';

const app = useApp(async store => {
  const organisation = await store.createOrganisation({ title: 'Agenda team', people: [{ id: 'george', name: 'George' }, { id: 'alex', name: 'Alex' }], teams: [{ id: 'team', name: 'Team', members: ['george', 'alex'] }] });
  const project = await store.createProject({ title: 'Editable Agenda', organisation: organisation.id, teams: ['team'] });
  for (let i = 0; i < 28; i++) await store.createTask(project.id, { title: `Scheduled ${i}`, due: '2026-11-03' });
  const card = await store.createTask(project.id, { title: 'Edit Agenda fields', assignee: 'George', status: 'todo', priority: 'medium', start: '2026-11-03', due: '2026-11-03', start_time: '09:00', due_time: '10:00' });
  return { project, card };
});
const current = async () => (await app.store.snapshot(app.project.id)).tasks.find(t => t.id === app.card.id);
const row = (page, id = app.card.id) => page.locator(`.calendar-agenda .agenda-row[data-calendar-card="${id}"]`);
async function openAgenda(page, project = app.project) {
  await page.goto(`${app.base}/#project/${project.id}/calendar`);
  await (await reveal(page.locator('#calendar-mode'))).selectOption('agenda');
  await agendaDates(page, '2026-11-02', '2026-11-08');
  if (await page.locator('.mobile-view-options[open]').count()) await page.getByRole('button', { name: 'Close view options', exact: true }).click();
}
test.beforeEach(async () => {
  const card = await current();
  await app.store.updateTask(app.project.id, card.id, { revision: card.revision, assignee: 'George', status: 'todo', priority: 'medium', start: '2026-11-03', due: '2026-11-03', start_time: '09:00', due_time: '10:00' });
});

onDevices(['desktop', 'ipad', 'phone'], () => {
  test('Agenda fields save inline, preserve the scrolled list and leave card opening on the title', { tag: '@gate' }, async ({ page, device }) => {
    await openAgenda(page);
    const item = row(page), fields = item.locator('.agenda-fields');
    await expect(fields).toBeVisible();
    await fields.scrollIntoViewIfNeeded();
    const scroller = page.locator('.calendar-agenda');
    const position = await scroller.evaluate(el => el.scrollTop);
    expect(position).toBeGreaterThan(0);
    expect(await fields.locator('[data-row-field], [data-row-dates]').evaluateAll(els => els.map(el => el.dataset.rowField || 'dates'))).toEqual(['assignee', 'status', 'priority', 'dates']);
    const geometry = await fields.evaluate(el => {
      const box = el.getBoundingClientRect(), parent = el.closest('.agenda-row').getBoundingClientRect();
      return { right: box.right, parentRight: parent.right, paintedHeight: parseFloat(getComputedStyle(el, '::before').height), sizes: [...el.querySelectorAll('select, [data-row-dates]')].map(control => ({ height: control.getBoundingClientRect().height, width: control.getBoundingClientRect().width })) };
    });
    expect(geometry.right).toBeGreaterThan(geometry.parentRight - 16);
    expect(geometry.right).toBeLessThanOrEqual(geometry.parentRight);
    expect(geometry.paintedHeight).toBe(device === 'desktop' ? 24 : 32);
    for (const size of geometry.sizes) {
      expect(size.height).toBeGreaterThanOrEqual(device === 'desktop' ? 32 : 44);
      expect(size.width).toBeGreaterThanOrEqual(device === 'desktop' ? 28 : 44);
    }
    if (device !== 'phone') await expect(fields.locator('[data-row-dates]')).toContainText('09:00 – 10:00');
    for (const [field, name, value] of [['assignee', 'Alex', 'Alex'], ['priority', 'High', 'high'], ['status', 'In progress', 'in-progress']]) {
      await fields.locator(`[data-row-field="${field}"]`).click();
      await page.locator('#shared-select-menu').getByRole('option', { name, exact: true }).click();
      await expect.poll(async () => (await current())[field]).toBe(value);
      await expect(fields.locator(`[data-row-field="${field}"]`)).toHaveValue(value);
      await expect(page.locator('#task-form, .calendar-drag-preview')).toHaveCount(0);
      await expect.poll(() => scroller.evaluate(el => el.scrollTop)).toBeCloseTo(position, 0);
    }
    await fields.locator('[data-row-dates]').click();
    const dates = page.locator('#task-dates-form');
    await dates.getByLabel('Due date', { exact: true }).fill('2026-11-05');
    await dates.getByLabel('Due date', { exact: true }).blur();
    await expect.poll(async () => (await current()).due).toBe('2026-11-05');
    await dates.getByRole('button', { name: 'Close date editor', exact: true }).click();
    await expect(fields.locator('[data-row-dates]')).toContainText('5 Nov');
    await expect.poll(() => scroller.evaluate(el => el.scrollTop)).toBeCloseTo(position, 0);
    await expect(page.locator('#task-form')).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
    await item.locator('.agenda-task').click();
    await expect(page.locator('#task-form')).toBeVisible();
    await page.locator('[data-action="dialog-close"]').first().click();
    await page.reload();
    await openAgenda(page);
    await expect(row(page).locator('[data-row-field=assignee]')).toHaveValue('Alex');
    await expect(row(page).locator('[data-row-field=status]')).toHaveValue('in-progress');
    await expect(row(page).locator('[data-row-field=priority]')).toHaveValue('high');
  });
});

test('Agenda honours disabled fields and field interactions never drag the card', { tag: '@gate' }, async ({ page }) => {
  const project = await app.store.createProject({ title: 'Minimal Agenda' });
  const card = await app.store.createTask(project.id, { title: 'Start only', start: '2026-11-03', due: '2026-11-05' });
  await app.store.updateProject(project.id, { revision: project.revision, schema: { ...project.schema, off: ['assignee', 'priority', 'due'] } });
  await openAgenda(page, project);
  const fields = row(page, card.id).locator('.agenda-fields');
  await expect(fields.locator('.row-assignee')).toBeHidden();
  await expect(fields.locator('.row-priority')).toBeHidden();
  await expect(fields.locator('[data-row-field=status]')).toBeVisible();
  await expect(fields.locator('[data-row-dates]')).toHaveAccessibleName(/Start 3 Nov/);
  const status = await fields.locator('.row-status').boundingBox();
  await page.mouse.move(status.x + status.width / 2, status.y + status.height / 2);
  await page.mouse.down();
  await page.mouse.move(status.x + status.width / 2 + 35, status.y + status.height / 2 + 35, { steps: 5 });
  await expect(page.locator('.calendar-drag-preview')).toHaveCount(0);
  await page.mouse.up();
  await expect(page.locator('.calendar-drag-preview')).toHaveCount(0);
  await expect(page.locator('#task-form')).toHaveCount(0);
});
