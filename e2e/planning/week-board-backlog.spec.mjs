// Owner request (F0.22-53): a row at the bottom of the Week board, Unscheduled, holds the cards with
// no dates that aren't done, on a grid as wide as the days. Each card stays where it's put (saved in
// the card, so everyone sees it, and kept while the card is scheduled); dropping on another card swaps
// them; a card dropped there loses its dates, and one dragged to a day is scheduled.
import { test, expect, useApp } from '../fixtures.mjs';
import { reveal } from '../helpers/menu-controls.mjs';

const day = '2026-11-05';
const app = useApp(async store => {
  const project = await store.createProject({ title: 'Backlog', key: 'BL' });
  const card = (title, fields = {}) => store.createTask(project.id, { title, ...fields });
  const plan = await card('Plan');
  // Archived cards stay out of the row and take no place in it.
  await card('Old', { archived: true });
  return { project, plan, draft: await card('Draft'), shipped: await card('Shipped', { status: 'done' }), meeting: await card('Meeting', { due: day }) };
});
const saved = async (id) => (await app.store.snapshot(app.project.id)).tasks.find(t => t.id === id);
test.beforeEach(async () => {
  for (const [t, fields] of [[app.plan, { due: null, backlog: null }], [app.draft, { due: null, backlog: null }], [app.meeting, { due: day, backlog: null }]]) {
    const current = await saved(t.id);
    await app.store.updateTask(app.project.id, t.id, { revision: current.revision, ...fields });
  }
});
// Each card in the Unscheduled row as "title@col,row".
const backlog = (page) => page.locator('.week-board-backlog-slot').evaluateAll(els => els.filter(el => el.querySelector('.week-board-title')).map(el => `${el.querySelector('.week-board-title').textContent.replace(/^BL-\d+ /, '')}@${el.dataset.backlogCol},${el.dataset.backlogRow}`));
const slot = (page, col, row) => page.locator(`.week-board-backlog-slot[data-backlog-col="${col}"][data-backlog-row="${row}"]`);
async function open(page) {
  await page.clock.setFixedTime(new Date('2026-11-04T12:00:00'));
  await page.goto(`${app.base}/#project/${app.project.id}/calendar`);
  await (await reveal(page.locator('#calendar-mode'))).selectOption('board');
  await expect(page.locator('.week-board')).toBeVisible();
}
async function drag(page, title, target) {
  const from = await page.locator('.week-board-title', { hasText: title }).boundingBox();
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(from.x + from.width / 2 + 10, from.y + from.height / 2 + 10, { steps: 3 });
  // The landing place can move what it passes, so aim again at where the target now is.
  for (const steps of [8, 2]) {
    const to = await target.boundingBox();
    await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps });
    await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
  }
  await page.mouse.up();
}

test('the Unscheduled row holds the matching cards with no dates that aren’t done', async ({ page }) => {
  await open(page);
  const row = page.locator('.week-board-backlog');
  await expect(row.getByRole('rowheader')).toHaveAccessibleName('Unscheduled');
  await expect.poll(() => backlog(page)).toEqual(['Plan@0,0', 'Draft@1,0']);
  // It sits under the other rows, its places under the days.
  const [last, days, places] = await page.evaluate(() => [
    Math.max(...[...document.querySelectorAll('.week-board-row:not(.week-board-backlog) > .week-board-cell')].map(el => el.getBoundingClientRect().bottom)),
    [...document.querySelectorAll('.week-board-day-head')].map(el => Math.round(el.getBoundingClientRect().left)),
    [...document.querySelectorAll('.week-board-backlog-slot[data-backlog-row="0"]')].map(el => Math.round(el.getBoundingClientRect().left)),
  ]);
  expect(places).toEqual(days);
  // Set apart from the rows above by a heavier rule.
  expect(await row.locator('.week-board-backlog-grid').evaluate(el => getComputedStyle(el).borderTopWidth)).toBe('2px');
  expect(await row.locator('.week-board-backlog-grid').evaluate(el => el.getBoundingClientRect().top)).toBeGreaterThanOrEqual(last - 1);
  // Filters apply, as to the rest of the board; the cards they hide keep their places.
  await page.locator('#search').fill('Draft');
  await expect.poll(() => backlog(page)).toEqual(['Draft@1,0']);
  // The toolbar's list of unscheduled cards stays.
  await expect(page.locator('[data-calendar-unscheduled]')).toBeVisible();
  // Without grouping there is no column of row names, so the row's name heads its grid.
  await page.locator('#search').fill('');
  await (await reveal(page.locator('#week-board-rows'))).selectOption('none');
  await expect(row.locator('.week-board-backlog-caption')).toBeVisible();
  await expect(row.locator('.week-board-backlog-caption')).toHaveText('Unscheduled');
  await expect(row.getByRole('rowheader')).toHaveAccessibleName('Unscheduled');
});

test('cards stay where they are put in the Unscheduled row, and swap when dropped on each other', async ({ page }) => {
  await open(page);
  await expect.poll(() => backlog(page)).toEqual(['Plan@0,0', 'Draft@1,0']);
  await drag(page, 'Plan', slot(page, 3, 1));
  await expect.poll(async () => (await saved(app.plan.id)).backlog).toEqual({ col: 3, row: 1 });
  await expect.poll(() => backlog(page)).toEqual(['Draft@1,0', 'Plan@3,1']);
  // Onto another card: they swap.
  await drag(page, 'Draft', slot(page, 3, 1));
  await expect.poll(async () => [(await saved(app.draft.id)).backlog, (await saved(app.plan.id)).backlog]).toEqual([{ col: 3, row: 1 }, { col: 1, row: 0 }]);
  // From the keyboard: Alt and an arrow moves a card one place.
  await page.locator('.week-board-title', { hasText: 'Plan' }).focus();
  await page.keyboard.press('Alt+ArrowDown');
  await expect.poll(async () => (await saved(app.plan.id)).backlog).toEqual({ col: 1, row: 1 });
  await expect(page.locator('.week-board-title', { hasText: 'Plan' })).toBeFocused();
  await expect(page.locator('[data-calendar-announcement]')).toHaveText('Plan moved to column 2, row 2 of Unscheduled.');
  await expect(page.locator('.week-board-title', { hasText: 'Plan' })).toHaveAttribute('aria-keyshortcuts', /Alt\+ArrowLeft/);
  // At the grid's edge it stays.
  await page.keyboard.press('Alt+ArrowLeft');
  await expect.poll(async () => (await saved(app.plan.id)).backlog).toEqual({ col: 0, row: 1 });
  await page.keyboard.press('Alt+ArrowLeft');
  await expect(page.locator('[data-calendar-announcement]')).toHaveText('Plan is at column 1, row 2 of Unscheduled.');
  expect((await saved(app.plan.id)).backlog).toEqual({ col: 0, row: 1 });
  // Everyone sees the same places.
  await page.reload();
  await expect.poll(() => backlog(page)).toEqual(['Plan@0,1', 'Draft@3,1']);
});

test('a card dropped in the Unscheduled row loses its dates; one dragged to a day keeps its place for later', async ({ page }) => {
  await open(page);
  await expect.poll(() => backlog(page)).toEqual(['Plan@0,0', 'Draft@1,0']);
  await drag(page, 'Meeting', slot(page, 2, 0));
  await expect.poll(async () => { const t = await saved(app.meeting.id); return [t.due, t.start, t.backlog]; }).toEqual([null, null, { col: 2, row: 0 }]);
  await expect.poll(() => backlog(page)).toEqual(['Plan@0,0', 'Draft@1,0', 'Meeting@2,0']);
  await drag(page, 'Meeting', page.locator(`.week-board-cell[data-calendar-date="${day}"]`).first());
  await expect.poll(async () => { const t = await saved(app.meeting.id); return [t.due, t.backlog]; }).toEqual([day, { col: 2, row: 0 }]);
  await expect.poll(() => backlog(page)).toEqual(['Plan@0,0', 'Draft@1,0']);
});

test('a drop let go over a row name still swaps the two cards', async ({ page }) => {
  await open(page);
  await expect.poll(() => backlog(page)).toEqual(['Plan@0,0', 'Draft@1,0']);
  const from = await page.locator('.week-board-title', { hasText: 'Draft' }).boundingBox();
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(from.x + from.width / 2 + 10, from.y + from.height / 2 + 10, { steps: 3 });
  const to = await slot(page, 0, 0).boundingBox();
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 8 });
  await expect(slot(page, 0, 0).locator('.calendar-placement')).toHaveCount(1);
  // Over a row's name the landing place stays where it was.
  const head = await page.locator('.week-board-backlog > .week-board-row-head').boundingBox();
  await page.mouse.move(head.x + head.width / 2, head.y + head.height / 2, { steps: 4 });
  await page.mouse.up();
  await expect.poll(async () => [(await saved(app.draft.id)).backlog, (await saved(app.plan.id)).backlog]).toEqual([{ col: 0, row: 0 }, { col: 1, row: 0 }]);
});
