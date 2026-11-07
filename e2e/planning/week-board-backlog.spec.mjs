// Owner requests (F0.22-53, F0.22-54): the Week board's cards with no dates that aren't done sit on
// one Unscheduled board docked at the bottom, not tied to the days. A card goes where it's dropped,
// to the nearest 8 px, saved in the card so everyone sees it; cards may overlap, the one moved last
// on top. A card dropped there loses its dates, and one dragged to a day is scheduled and keeps its
// place for later. The board can be made taller or shorter.
import { test, expect, useApp } from '../fixtures.mjs';
import { reveal } from '../helpers/menu-controls.mjs';

const day = '2026-11-05';
const app = useApp(async store => {
  const project = await store.createProject({ title: 'Backlog', key: 'BL' });
  const card = (title, fields = {}) => store.createTask(project.id, { title, ...fields });
  const plan = await card('Plan');
  // Archived cards stay off the board.
  await card('Old', { archived: true });
  return { project, plan, draft: await card('Draft'), shipped: await card('Shipped', { status: 'done' }), meeting: await card('Meeting', { due: day }), legacy: await card('Legacy') };
});
const saved = async (id) => (await app.store.snapshot(app.project.id)).tasks.find(t => t.id === id);
test.beforeEach(async () => {
  for (const [t, fields] of [[app.plan, { due: null, backlog: null }], [app.draft, { due: null, backlog: null }], [app.meeting, { due: day, backlog: null }], [app.legacy, { due: null, backlog: { col: 1, row: 1 } }]]) {
    const current = await saved(t.id);
    await app.store.updateTask(app.project.id, t.id, { revision: current.revision, ...fields });
  }
});
const board = (page) => page.locator('.week-board-backlog');
const onBoard = (page) => board(page).locator('.week-board-title').evaluateAll(els => els.map(el => el.textContent.replace(/^BL-\d+ /, '')).sort());
// A card's place on the board, from its own box.
const place = (page, title) => board(page).locator('.week-board-card', { hasText: title }).evaluate(el => ({ x: el.offsetLeft, y: el.offsetTop, z: getComputedStyle(el).zIndex }));
async function open(page) {
  await page.clock.setFixedTime(new Date('2026-11-04T12:00:00'));
  await page.goto(`${app.base}/#project/${app.project.id}/calendar`);
  await (await reveal(page.locator('#calendar-mode'))).selectOption('board');
  await expect(page.locator('.week-board')).toBeVisible();
}
async function drag(page, title, to) {
  const from = await page.locator('.week-board-title', { hasText: title }).boundingBox();
  const start = { x: from.x + from.width / 2, y: from.y + from.height / 2 };
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x + 10, start.y + 10, { steps: 3 });
  const target = typeof to === 'function' ? await to(start) : to;
  await page.mouse.move(target.x, target.y, { steps: 8 });
  await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
  await page.mouse.up();
}
const snap = (value) => Math.max(0, Math.round(value / 8) * 8);

test('the Unscheduled board is docked under the week, apart from the days, with the matching cards that have no dates', async ({ page }) => {
  await open(page);
  await expect(board(page).getByRole('heading', { name: 'Unscheduled' })).toBeVisible();
  await expect.poll(() => onBoard(page)).toEqual(['Draft', 'Legacy', 'Plan']);
  // Not part of the week's table, and at the bottom of the view.
  await expect(page.locator('.week-board .week-board-backlog')).toHaveCount(0);
  const [panel, view, week] = await Promise.all([board(page), page.locator('#view-content'), page.locator('.week-board-scroll')].map(l => l.boundingBox()));
  expect(panel.y).toBeGreaterThanOrEqual(week.y + week.height - 1);
  expect(view.y + view.height - (panel.y + panel.height)).toBeLessThanOrEqual(16);
  // A place saved on the old grid of 0.22.53 becomes a place on the board.
  expect(await place(page, 'Legacy')).toMatchObject({ x: 192, y: 80 });
  // The cards' layers stay inside the board, under menus and popovers.
  expect(await board(page).locator('.week-board-backlog-canvas').evaluate(el => getComputedStyle(el).isolation)).toBe('isolate');
  // Like the cards under the days, these show no date (F0.22-55).
  expect(await board(page).locator('.row-due').evaluateAll(els => els.map(el => getComputedStyle(el).display))).toEqual(['none', 'none', 'none']);
  // Filters apply, as to the rest of the board.
  await page.locator('#search').fill('Draft');
  await expect.poll(() => onBoard(page)).toEqual(['Draft']);
  // The toolbar's list of unscheduled cards stays.
  await expect(page.locator('[data-calendar-unscheduled]')).toBeVisible();
});

test('cards go where they are dropped, to the nearest 8 px, and may overlap, the one moved last on top', async ({ page }) => {
  await open(page);
  const before = await place(page, 'Plan');
  await drag(page, 'Plan', (start) => ({ x: start.x + 203, y: start.y + 61 }));
  await expect.poll(async () => (await saved(app.plan.id)).backlog).toEqual({ x: snap(before.x + 203), y: snap(before.y + 61), z: 1 });
  await expect.poll(() => place(page, 'Plan')).toEqual({ x: snap(before.x + 203), y: snap(before.y + 61), z: '1' });
  // Draft dropped half over Plan sits on top of it.
  const plan = await board(page).locator('.week-board-card', { hasText: 'Plan' }).boundingBox();
  const draft = await board(page).locator('.week-board-card', { hasText: 'Draft' }).boundingBox();
  await drag(page, 'Draft', (start) => ({ x: start.x + (plan.x + 40 - draft.x), y: start.y + (plan.y + 16 - draft.y) }));
  await expect.poll(async () => (await saved(app.draft.id)).backlog?.z).toBe(2);
  await expect.poll(async () => { const [p, d] = [await place(page, 'Plan'), await place(page, 'Draft')]; return Number(d.z) > Number(p.z) && Math.abs(d.x - p.x) < 100 && Math.abs(d.y - p.y) < 40; }).toBe(true);
  // From the keyboard: Alt and an arrow moves a card 8 px, with Shift 64 px; it comes to the top.
  const at = (await saved(app.plan.id)).backlog;
  await page.locator('.week-board-title', { hasText: 'Plan' }).focus();
  await page.keyboard.press('Alt+ArrowRight');
  await expect.poll(async () => (await saved(app.plan.id)).backlog).toEqual({ x: at.x + 8, y: at.y, z: 3 });
  await expect(page.locator('.week-board-title', { hasText: 'Plan' })).toBeFocused();
  await page.keyboard.press('Alt+Shift+ArrowDown');
  await expect.poll(async () => (await saved(app.plan.id)).backlog).toEqual({ x: at.x + 8, y: at.y + 64, z: 3 });
  await expect(page.locator('[data-calendar-announcement]')).toHaveText('Plan moved down on Unscheduled.');
  await expect(page.locator('.week-board-title', { hasText: 'Plan' })).toHaveAttribute('aria-keyshortcuts', /Alt\+ArrowLeft/);
  // Everyone sees the same places.
  await page.reload();
  await expect.poll(() => place(page, 'Plan')).toEqual({ x: at.x + 8, y: at.y + 64, z: '3' });
});

test('at the edge of the board, Alt and an arrow says so instead of saving', async ({ page }) => {
  await open(page);
  const title = page.locator('.week-board-title', { hasText: 'Plan' });
  await title.focus();
  await page.keyboard.press('Alt+ArrowLeft');
  await expect.poll(async () => (await saved(app.plan.id)).backlog?.x).toBe(0);
  const { revision } = await saved(app.plan.id);
  await expect(title).toBeFocused();
  await page.keyboard.press('Alt+ArrowLeft');
  await expect(page.locator('[data-calendar-announcement]')).toHaveText('Plan is at the edge of Unscheduled.');
  expect((await saved(app.plan.id)).revision).toBe(revision);
});

test('a card dropped on the Unscheduled board loses its dates; one dragged to a day keeps its place for later', async ({ page }) => {
  await open(page);
  const area = await board(page).locator('.week-board-backlog-board').boundingBox();
  await drag(page, 'Meeting', { x: area.x + area.width - 120, y: area.y + 40 });
  await expect.poll(async () => { const t = await saved(app.meeting.id); return [t.due, t.start, !!t.backlog]; }).toEqual([null, null, true]);
  const kept = (await saved(app.meeting.id)).backlog;
  await expect.poll(() => onBoard(page)).toEqual(['Draft', 'Legacy', 'Meeting', 'Plan']);
  const cell = await page.locator(`.week-board-cell[data-calendar-date="${day}"]`).first().boundingBox();
  await drag(page, 'Meeting', { x: cell.x + cell.width / 2, y: cell.y + cell.height / 2 });
  await expect.poll(async () => { const t = await saved(app.meeting.id); return [t.due, t.backlog]; }).toEqual([day, kept]);
  await expect.poll(() => onBoard(page)).toEqual(['Draft', 'Legacy', 'Plan']);
});

test('the Unscheduled board can be made taller or shorter, and keeps its height', async ({ page }) => {
  await open(page);
  const handle = board(page).getByRole('separator', { name: /Unscheduled/ });
  const height = () => board(page).evaluate(el => Math.round(el.getBoundingClientRect().height));
  const start = await height(), box = await handle.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 - 100, { steps: 6 });
  await page.mouse.up();
  await expect.poll(height).toBe(start + 100);
  await handle.focus();
  await page.keyboard.press('ArrowUp');
  await expect.poll(height).toBe(start + 116);
  await expect(handle).toHaveAttribute('aria-valuenow', String(start + 116));
  await page.reload();
  await expect.poll(height).toBe(start + 116);
});
