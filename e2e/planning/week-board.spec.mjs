// Owner request (F0.21-71): a Week board layout, days as columns without hours and cards in rows
// by a chosen field; dragging moves a card's dates or changes its row's field.
import { test, expect, useApp, onDevices } from '../fixtures.mjs';
import { reveal } from '../helpers/menu-controls.mjs';

const app = useApp(async store => {
  const organisation = await store.createOrganisation({ title: 'Board team', people: [{ id: 'ann', name: 'Ann' }, { id: 'bo', name: 'Bo' }], teams: [{ id: 'team', name: 'Team', members: ['ann', 'bo'] }] });
  const project = await store.createProject({ title: 'Week board', key: 'WB', organisation: organisation.id, teams: ['team'] });
  const one = await store.createTask(project.id, { title: 'Ann on Tuesday', assignee: 'Ann', status: 'todo', priority: 'high', due: '2026-11-03' });
  const span = await store.createTask(project.id, { title: 'Bo across days', assignee: 'Bo', status: 'in-progress', start: '2026-11-04', due: '2026-11-06' });
  const loose = await store.createTask(project.id, { title: 'Nobody on Friday', status: 'todo', due: '2026-11-06' });
  return { project, one, span, loose };
});
// Drags change the shared seed; each test starts from it.
test.beforeEach(async () => {
  for (const [t, fields] of [[app.one, { assignee: 'Ann', status: 'todo', due: '2026-11-03' }], [app.span, { assignee: 'Bo', status: 'in-progress', start: '2026-11-04', due: '2026-11-06' }], [app.loose, { assignee: '', status: 'todo', due: '2026-11-06' }]]) {
    const current = (await app.store.snapshot(app.project.id)).tasks.find(x => x.id === t.id);
    await app.store.updateTask(app.project.id, t.id, { revision: current.revision, ...fields });
  }
});
const saved = async id => (await app.store.snapshot(app.project.id)).tasks.find(t => t.id === id);
const card = (page, id) => page.locator(`.week-board [data-calendar-card="${id}"]`);
const cell = (page, value, day) => page.locator(`.week-board-cell[data-week-board-value="${value}"][data-calendar-date="${day}"]`);
const closeOptions = async page => { if (await page.locator('.mobile-view-options[open]').count()) await page.getByRole('button', { name: 'Close view options', exact: true }).click(); };
async function open(page) {
  await page.clock.setFixedTime(new Date('2026-11-04T12:00:00'));
  await page.goto(`${app.base}/#project/${app.project.id}/calendar`);
  await (await reveal(page.locator('#calendar-mode'))).selectOption('board');
  await closeOptions(page);
  await expect(page.locator('.week-board')).toBeVisible();
}
async function drag(page, id, target) {
  const grip = card(page, id).locator('[data-calendar-move]');
  await grip.scrollIntoViewIfNeeded();
  const from = await grip.boundingBox();
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(from.x + from.width / 2 + 10, from.y + from.height / 2 + 10, { steps: 3 });
  await target.scrollIntoViewIfNeeded();
  const to = await target.boundingBox();
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 8 });
  await page.mouse.up();
}

onDevices(['desktop', 'ipad', 'phone'], () => {
  test('Week board shows the week as day columns with rows by a field, without hours @gate', async ({ page, device }) => {
    await open(page);
    await expect(page.locator('.calendar-hours-day')).toHaveCount(0);
    await expect(page.locator('.week-board-day-head')).toHaveCount(7);
    const rows = () => page.locator('.week-board-row').evaluateAll(els => els.map(el => el.dataset.weekBoardValue));
    // Assignee rows by default: people A to Z, then Unassigned.
    expect(await rows()).toEqual(['Ann', 'Bo', '']);
    await expect(cell(page, 'Ann', '2026-11-03').locator(`[data-calendar-card="${app.one.id}"]`)).toBeVisible();
    // Assistive technology reads a table: days as column headers, rows' names as row headers.
    await expect(page.getByRole('table', { name: 'Week board' })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Tue 3 Nov' })).toBeVisible();
    await expect(page.getByRole('rowheader', { name: /^Ann/ })).toBeVisible();
    await expect(page.getByRole('row').filter({ has: page.getByRole('rowheader', { name: /^Ann/ }) }).getByRole('cell').nth(1)).toContainText('Ann on Tuesday');
    // A multi-day card shows once, on its first day, with its range.
    await expect(card(page, app.span.id)).toHaveCount(1);
    await expect(cell(page, 'Bo', '2026-11-04').locator(`[data-calendar-card="${app.span.id}"]`)).toContainText('4 Nov – 6 Nov');
    // Each card's field box fits inside the card and leaves out the row's own field.
    for (const box of await page.locator('.week-board-card .week-board-fields').evaluateAll(els => els.map(el => {
      const card = el.closest('.week-board-card').getBoundingClientRect(), r = el.getBoundingClientRect();
      return { inside: r.right <= card.right + 1 && [...el.children].every(c => !c.getClientRects().length || c.getBoundingClientRect().right <= r.right + 1), assignee: !!el.querySelector('.row-assignee')?.getClientRects().length };
    }))) expect(box).toEqual({ inside: true, assignee: false });
    await (await reveal(page.locator('#week-board-rows'))).selectOption('status');
    await closeOptions(page);
    await expect.poll(rows).toEqual(['backlog', 'todo', 'in-progress', 'review', 'done']);
    await page.reload();
    await expect.poll(rows, 'the rows are remembered').toEqual(['backlog', 'todo', 'in-progress', 'review', 'done']);
    await (await reveal(page.locator('#week-board-rows'))).selectOption('priority');
    await closeOptions(page);
    await expect.poll(rows, 'every priority is a row to drop into').toEqual(['urgent', 'high', 'medium', 'low', 'none']);
    await expect(cell(page, 'medium', '2026-11-06').locator(`[data-calendar-card="${app.loose.id}"]`)).toBeVisible();
    // By card type every field shows, and still fits, at the narrowest desktop column width too.
    if (device === 'desktop') await page.setViewportSize({ width: 1280, height: 800 });
    await (await reveal(page.locator('#week-board-rows'))).selectOption('type');
    await closeOptions(page);
    await expect.poll(rows).toEqual(['epic', 'milestone', 'story', 'task', 'activity', 'bug']);
    expect(await page.locator('.week-board-card .week-board-fields').evaluateAll(els => els.every(el => { const r = el.getBoundingClientRect(); return r.right <= el.closest('.week-board-card').getBoundingClientRect().right + 1 && [...el.children].every(c => !c.getClientRects().length || c.getBoundingClientRect().right <= r.right + 1); })), 'all four fields fit').toBe(true);
    if (device === 'desktop') {
      // Shared controls keep their place; Rows is Week board's own control, before the divider.
      const order = await page.locator('.planning-options').evaluate(el => [...el.children].filter(c => c.getClientRects().length).map(c => c.matches('.planning-separator') ? 'separator' : c.matches('[data-calendar-weekends]') ? 'weekends' : c.querySelector('#calendar-mode') ? 'layout' : c.querySelector('#week-board-rows') ? 'rows' : 'other'));
      expect(order).toEqual(['rows', 'separator', 'weekends', 'layout']);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
  });

  test('dragging on the Week board moves dates and changes the row’s field @gate', async ({ page }) => {
    await open(page);
    // Alt + arrows on a card's own fields leave its dates alone.
    await card(page, app.one.id).locator('[data-row-field="status"]').focus();
    await page.keyboard.press('Alt+ArrowRight');
    await expect.poll(async () => (await saved(app.one.id)).due).toBe('2026-11-03');
    // To another day in the same row: dates move, the length stays.
    await drag(page, app.span.id, cell(page, 'Bo', '2026-11-02'));
    await expect.poll(async () => { const t = await saved(app.span.id); return [t.start, t.due, t.assignee]; }).toEqual(['2026-11-02', '2026-11-04', 'Bo']);
    // To another row and day: both change.
    await drag(page, app.loose.id, cell(page, 'Ann', '2026-11-05'));
    await expect.poll(async () => { const t = await saved(app.loose.id); return [t.due, t.assignee]; }).toEqual(['2026-11-05', 'Ann']);
    await expect(cell(page, 'Ann', '2026-11-05').locator(`[data-calendar-card="${app.loose.id}"]`)).toBeVisible();
    await expect(page.locator('#task-form')).toHaveCount(0);
  });
});

test('a status no longer in the workflow and a card without a priority keep rows, and an empty week says so @gate', async ({ page }) => {
  // Its own project: a record written straight to disk, as an import or an older workflow leaves it.
  const project = await app.store.createProject({ title: 'Week board legacy', key: 'WBL' });
  const legacy = await app.store.createTask(project.id, { title: 'Retired status', due: '2026-11-03' });
  const file = app.store.file(project.id, 'tasks', legacy.id), record = await app.store.read(file);
  await app.store.write(file, { ...record.data, status: 'retired', priority: '' }, record.body, record);
  const at = (value, day) => page.locator(`.week-board-cell[data-week-board-value="${value}"][data-calendar-date="${day}"] [data-calendar-card="${legacy.id}"]`);
  await page.clock.setFixedTime(new Date('2026-11-04T12:00:00'));
  await page.goto(`${app.base}/#project/${project.id}/calendar`);
  await (await reveal(page.locator('#calendar-mode'))).selectOption('board');
  await (await reveal(page.locator('#week-board-rows'))).selectOption('status');
  await closeOptions(page);
  await expect(at('retired', '2026-11-03')).toBeVisible();
  await (await reveal(page.locator('#week-board-rows'))).selectOption('priority');
  await closeOptions(page);
  await expect(at('none', '2026-11-03')).toBeVisible();
  await expect(page.locator('.week-board-row[data-week-board-value="none"] .week-board-row-head')).toContainText('Lowest');
  await page.getByRole('button', { name: 'Next period', exact: true }).click();
  await expect(page.locator('.week-board-empty')).toHaveText('No cards scheduled this week.');
  await expect(page.locator('.week-board-cell').first()).toBeVisible();
});
