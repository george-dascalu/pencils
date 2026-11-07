// Owner request (F0.21-97): no card counts or drag grips, a row-name column that differs from the day
// columns, dividers between days, one-line titles, and a date picker on the heading.
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
  for (const [t, fields] of [[app.one, { assignee: 'Ann', status: 'todo', due: '2026-11-03' }], [app.span, { assignee: 'Bo', status: 'in-progress', start: '2026-11-04', due: '2026-11-06' }], [app.loose, { assignee: '', status: 'todo', priority: 'medium', due: '2026-11-06' }]]) {
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
  const grip = card(page, id).locator('.week-board-title');
  // The last drag's save can repaint the board just now, replacing the grip: find it again.
  let from;
  await expect(async () => { await grip.scrollIntoViewIfNeeded({ timeout: 1000 }); from = await grip.boundingBox(); expect(from).toBeTruthy(); }).toPass();
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(from.x + from.width / 2 + 10, from.y + from.height / 2 + 10, { steps: 3 });
  await target.scrollIntoViewIfNeeded();
  const to = await target.boundingBox();
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 8 });
  await page.mouse.up();
}

// F0.22-9: over a day's name the landing place stays where it was, instead of going away and letting
// the rows below jump, and a drop there lands in it.
test('over a day name the landing place stays where it was, and a drop there lands in it', async ({ page }) => {
  await open(page);
  const from = await card(page, app.one.id).locator('.week-board-title').boundingBox();
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(from.x + from.width / 2 + 10, from.y + from.height / 2 + 10, { steps: 3 });
  // Ann's is the first row: straight up from its cell, the pointer meets only the day's name.
  const to = await cell(page, 'Ann', '2026-11-04').boundingBox();
  await page.mouse.move(to.x + to.width / 2, to.y + 20, { steps: 8 });
  await expect(cell(page, 'Ann', '2026-11-04').locator('.calendar-placement')).toHaveCount(1);
  const head = await page.locator('.week-board-day-head').filter({ hasText: '4 Nov' }).boundingBox();
  await page.mouse.move(to.x + to.width / 2, head.y + head.height / 2, { steps: 4 });
  // The copy beside the pointer follows it once a frame: the pointer has been seen over the name.
  await expect.poll(async () => (await page.locator('.calendar-drag-preview').boundingBox()).y).toBeLessThan(to.y + 30);
  await expect(cell(page, 'Ann', '2026-11-04').locator('.calendar-placement'), 'the landing place stays').toHaveCount(1);
  await page.mouse.up();
  await expect.poll(async () => { const t = await saved(app.one.id); return [t.due, t.assignee]; }).toEqual(['2026-11-04', 'Ann']);
});

// F0.22-29: the Unassigned row (or No tag, No type) shows only while it holds a card that week.
test('a week where every card has an assignee shows no Unassigned row', async ({ page }) => {
  const loose = await saved(app.loose.id);
  await app.store.updateTask(app.project.id, loose.id, { revision: loose.revision, assignee: 'Ann' });
  await open(page);
  await expect(page.locator('.week-board-row[data-week-board-value]')).toHaveCount(2);
  expect(await page.locator('.week-board-row[data-week-board-value]').evaluateAll(els => els.map(el => el.dataset.weekBoardValue))).toEqual(['Ann', 'Bo']);
});

onDevices(['desktop', 'ipad', 'phone'], () => {
  test('Week board shows the week as day columns with rows by a field, without hours @gate', async ({ page, device }) => {
    await open(page);
    await expect(page.locator('.calendar-hours-day')).toHaveCount(0);
    await expect(page.locator('.week-board-day-head')).toHaveCount(7);
    const rows = () => page.locator('.week-board-row[data-week-board-value]').evaluateAll(els => els.map(el => el.dataset.weekBoardValue));
    // Assignee rows by default: people A to Z, then Unassigned.
    expect(await rows()).toEqual(['Ann', 'Bo', '']);
    await expect(cell(page, 'Ann', '2026-11-03').locator(`[data-calendar-card="${app.one.id}"]`)).toBeVisible();
    // Assistive technology reads a table: days as column headers, rows' names as row headers.
    await expect(page.getByRole('table', { name: 'Week board' })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Tue 3 Nov' })).toBeVisible();
    await expect(page.getByRole('rowheader', { name: /^Ann/ })).toBeVisible();
    await expect(page.getByRole('row').filter({ has: page.getByRole('rowheader', { name: /^Ann/ }) }).getByRole('cell').nth(1)).toContainText('Ann on Tuesday');
    // A multi-day card shows once, on its first day. The day names the date, so no card shows one (F0.22-55).
    await expect(card(page, app.span.id)).toHaveCount(1);
    await expect(cell(page, 'Bo', '2026-11-04').locator(`[data-calendar-card="${app.span.id}"]`)).toBeVisible();
    expect(await page.locator('.week-board-card .row-due').evaluateAll(els => els.map(el => getComputedStyle(el).display))).toEqual(['none', 'none', 'none']);
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
    expect(await page.locator('.week-board-card .week-board-fields').evaluateAll(els => els.every(el => { const r = el.getBoundingClientRect(); return r.right <= el.closest('.week-board-card').getBoundingClientRect().right + 1 && [...el.children].every(c => !c.getClientRects().length || c.getBoundingClientRect().right <= r.right + 1); })), 'every field fits').toBe(true);
    if (device === 'desktop') {
      // Shared controls keep their place after the Tags | Time of day switch (F0.22-52) and a divider;
      // Group by waits in Filters, like List's.
      const order = await page.locator('.planning-options').evaluate(el => [...el.children].filter(c => c.getClientRects().length).map(c => c.matches('.planning-separator') ? 'separator' : c.matches('[data-calendar-weekends]') ? 'weekends' : c.querySelector('#calendar-mode') ? 'layout' : c.querySelector('#week-board-rows') ? 'rows' : c.matches('.week-board-row-switch') ? 'row switch' : 'other'));
      expect(order).toEqual(['row switch', 'separator', 'weekends', 'layout']);
      await expect(page.locator('#view-toolbar [data-board-menu="filters"] #week-board-rows')).toHaveCount(1);
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

onDevices(['desktop', 'ipad', 'phone'], () => {
  test('Week board rows have no count, the row names stand apart from the days, days have dividers and titles are one line @gate', async ({ page }) => {
    await open(page);
    await expect(page.locator('.week-board-row-head .count')).toHaveCount(0);
    await expect(page.locator('.week-board [data-calendar-move]')).toHaveCount(0);
    const style = (selector, prop) => page.locator(selector).first().evaluate((el, prop) => getComputedStyle(el)[prop], prop);
    const head = await style('.week-board-row-head', 'backgroundColor');
    expect(head).not.toBe(await style('.week-board-day-head', 'backgroundColor'));
    expect(await style('.week-board-corner', 'backgroundColor')).toBe(head);
    for (const selector of ['.week-board-day-head', '.week-board-cell']) expect(await style(selector, 'borderLeftWidth')).toBe('1px');
    const title = card(page, app.one.id).locator('.week-board-title');
    expect(await title.evaluate(el => { const s = getComputedStyle(el); return [s.whiteSpace, s.textOverflow, s.overflowX]; })).toEqual(['nowrap', 'ellipsis', 'hidden']);
    await expect(title).toHaveAttribute('title', /Ann on Tuesday/);
  });

  test('the period heading opens a date picker that shows the week holding the chosen day @gate', async ({ page }) => {
    await open(page);
    const heading = page.locator('.planning-period h2');
    await expect(heading).toHaveText('2 Nov – 8 Nov 2026');
    await heading.locator('[data-date-picker]').click();
    const picker = page.locator('.date-picker-popover');
    await expect(picker).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(picker).toHaveCount(0);
    await heading.locator('[data-date-picker]').click();
    await picker.locator('[data-date-value="2026-11-18"]').click();
    await expect(heading).toHaveText('16 Nov – 22 Nov 2026');
    await expect(page.locator('.week-board-day-head').first()).toHaveAttribute('data-calendar-date', '2026-11-16');
  });
});

onDevices(['phone'], () => {
  test('a long press anywhere on a Week board card lifts it, and a swipe does not @gate', async ({ page, browserName }) => {
    await open(page);
    const title = card(page, app.span.id).locator('.week-board-title');
    await title.scrollIntoViewIfNeeded();
    const box = await title.boundingBox(), x = box.x + 20, y = box.y + box.height / 2;
    // Synthetic touch pointers (both engines): moving before the press is long enough scrolls, and
    // holding still lifts the card.
    const touch = (type, dy = 0) => title.evaluate((el, [type, x, y]) => el.dispatchEvent(new PointerEvent(type, { pointerType: 'touch', pointerId: 7, isPrimary: true, bubbles: true, cancelable: true, composed: true, button: 0, buttons: type === 'pointerup' ? 0 : 1, clientX: x, clientY: y })), [type, x, y + dy]);
    await touch('pointerdown');
    await touch('pointermove', 30);
    await page.waitForTimeout(450); // intentional: outlasts the 350ms hold, so a move that arrived first must have cancelled it
    await expect(card(page, app.span.id)).not.toHaveClass(/calendar-armed/);
    await touch('pointerup', 30);
    await touch('pointerdown');
    await expect(card(page, app.span.id)).toHaveClass(/calendar-armed/);
    await touch('pointerup');
    await expect(card(page, app.span.id)).not.toHaveClass(/calendar-armed/);
    if (browserName !== 'chromium') return;
    // Real touches (DevTools): hold, then drag to the next day, scrolled in beside the card's column.
    await page.locator('.week-board-scroll').evaluate((el, id) => { el.scrollLeft += el.querySelector(`[data-calendar-card="${id}"]`).closest('.week-board-cell').getBoundingClientRect().left - el.getBoundingClientRect().left - 110; }, app.span.id);
    const at = await title.boundingBox(), to = await cell(page, 'Bo', '2026-11-05').boundingBox(), px = at.x + 20, py = at.y + at.height / 2;
    const client = await page.context().newCDPSession(page);
    await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: px, y: py }] });
    await expect(card(page, app.span.id)).toHaveClass(/calendar-armed/);
    await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: px + 10, y: py + 10 }] });
    await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: to.x + 20, y: to.y + to.height / 2 }] });
    await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await expect.poll(async () => { const t = await saved(app.span.id); return [t.start, t.due]; }).toEqual(['2026-11-05', '2026-11-07']);
  });
});

// Owner report (F0.22-40): a card's status and priority on the Week board save like Kanban's, and
// the box shows them; they didn't save at all. (Assignee names the rows, so the box leaves it out.)
test('the Week board saves a card\'s status and priority from its field box', async ({ page }) => {
  await open(page);
  const fields = card(page, app.loose.id).locator('.week-board-fields');
  const choose = async (name, value) => {
    await fields.getByRole('combobox', { name: `${name} for Nobody on Friday`, exact: true }).click();
    await page.locator('#shared-select-menu').getByRole('option', { name: value, exact: true }).click();
  };
  await choose('Status', 'Done');
  await expect.poll(async () => (await saved(app.loose.id)).status).toBe('done');
  await expect(card(page, app.loose.id).locator('.field-chip-status')).toHaveText('Done');
  await choose('Priority', 'High');
  await expect.poll(async () => (await saved(app.loose.id)).priority).toBe('high');
  await expect(card(page, app.loose.id).locator('.field-chip-priority')).toHaveClass(/\bhigh\b/);
});
