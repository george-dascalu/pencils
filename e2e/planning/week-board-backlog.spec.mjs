// Owner requests (F0.22-53, F0.22-54, F0.22-62, F0.22-63): the Week board's cards with no dates that aren't
// done sit on one Unscheduled board docked at the bottom, not tied to the days, with no scroll bar. A
// card moves live where it's dragged, to the pixel, lining up with a card nearby, saved in the card so
// everyone sees it; cards may overlap, the one moved last on top. A card dropped there loses its dates, and one dragged to a day is scheduled and keeps its
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

test('the Unscheduled board is docked under the week, apart from the days, with the matching cards that have no dates', { tag: '@gate' }, async ({ page }) => {
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
  // No scroll bar (F0.22-62): it still scrolls by wheel, trackpad or touch.
  expect(await board(page).locator('.week-board-backlog-board').evaluate(el => getComputedStyle(el).scrollbarWidth)).toBe('none');
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

test('cards go exactly where they are dropped, line up with a card nearby, and may overlap, the one moved last on top', async ({ page }) => {
  await open(page);
  const before = await place(page, 'Plan');
  // Away from the other cards' edges nothing pulls it: it lands to the pixel (F0.22-62).
  await drag(page, 'Plan', (start) => ({ x: start.x + 563, y: start.y + 25 }));
  await expect.poll(async () => (await saved(app.plan.id)).backlog).toEqual({ x: before.x + 563, y: before.y + 25, z: 1 });
  await expect.poll(() => place(page, 'Plan')).toEqual({ x: before.x + 563, y: before.y + 25, z: '1' });
  // Dropped 4 px from Plan's left edge, half over it, Draft lines up with it, a guide showing the line
  // while it moves, and sits on top.
  const plan = await board(page).locator('.week-board-card', { hasText: 'Plan' }).boundingBox();
  const draft = await board(page).locator('.week-board-card', { hasText: 'Draft' }).boundingBox();
  const grip = await page.locator('.week-board-title', { hasText: 'Draft' }).boundingBox();
  const start = { x: grip.x + grip.width / 2, y: grip.y + grip.height / 2 };
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x + 10, start.y + 10, { steps: 3 });
  await page.mouse.move(start.x + plan.x + 4 - draft.x, start.y + plan.y + 16 - draft.y, { steps: 8 });
  await expect(board(page).locator('.alignment-guides path').first()).toBeAttached();
  // Live, as on boards (F0.22-63): the card itself moves there, lined up, with its title and fields
  // and no dashed outline; it leaves its old place, and no copy follows the pointer.
  const live = board(page).locator('.week-board-live');
  await expect(live).toHaveCount(1);
  await expect(live.locator('.week-board-title')).toHaveText('BL-3 Draft');
  await expect(live.locator('.week-board-fields')).toHaveCount(1);
  const planAt = await place(page, 'Plan');
  expect(await live.evaluate(el => ({ x: el.offsetLeft, border: getComputedStyle(el).borderTopStyle, events: getComputedStyle(el).pointerEvents }))).toEqual({ x: planAt.x, border: 'solid', events: 'none' });
  expect(await board(page).locator('.week-board-card[data-calendar-card]', { hasText: 'Draft' }).evaluate(el => getComputedStyle(el).opacity)).toBe('0');
  expect(await page.locator('.calendar-drag-preview').evaluate(el => getComputedStyle(el).visibility)).toBe('hidden');
  // As tall as the card, so the guides line up with what lands.
  const [landing, card] = await board(page).evaluate(el => [el.querySelector('.week-board-live').offsetHeight, el.querySelector('.week-board-card[data-calendar-card]:not(.week-board-live)').offsetHeight]);
  expect(landing).toBe(card);
  // Above the cards and the card moving.
  expect(await board(page).locator('.alignment-guides').evaluate(el => Number(getComputedStyle(el).zIndex))).toBeGreaterThan(await live.evaluate(el => Number(getComputedStyle(el).zIndex)));
  await page.mouse.up();
  await expect(board(page).locator('.alignment-guides')).toHaveCount(0);
  await expect(live).toHaveCount(0);
  await expect.poll(async () => (await saved(app.draft.id)).backlog).toMatchObject({ x: before.x + 563, z: 2 });
  await expect.poll(async () => { const [p, d] = [await place(page, 'Plan'), await place(page, 'Draft')]; return Number(d.z) > Number(p.z) && d.x === p.x && Math.abs(d.y - p.y) < 40; }).toBe(true);
  // From the keyboard: Alt and an arrow moves a card 1 px, with Shift 10 px; it comes to the top.
  const at = (await saved(app.plan.id)).backlog;
  await page.locator('.week-board-title', { hasText: 'Plan' }).focus();
  await page.keyboard.press('Alt+ArrowRight');
  await expect.poll(async () => (await saved(app.plan.id)).backlog).toEqual({ x: at.x + 1, y: at.y, z: 3 });
  await expect(page.locator('.week-board-title', { hasText: 'Plan' })).toBeFocused();
  await page.keyboard.press('Alt+Shift+ArrowDown');
  await expect.poll(async () => (await saved(app.plan.id)).backlog).toEqual({ x: at.x + 1, y: at.y + 10, z: 3 });
  await expect(page.locator('[data-calendar-announcement]')).toHaveText('Plan moved down on Unscheduled.');
  await expect(page.locator('.week-board-title', { hasText: 'Plan' })).toHaveAttribute('aria-keyshortcuts', /Alt\+ArrowLeft/);
  // Everyone sees the same places.
  await page.reload();
  await expect.poll(() => place(page, 'Plan')).toEqual({ x: at.x + 1, y: at.y + 10, z: '3' });
});

test('a card dragged from the toolbar list of unscheduled cards moves on the board as itself', async ({ page }) => {
  await open(page);
  await page.locator('[data-calendar-unscheduled]').click();
  const grip = await page.locator('.calendar-unscheduled .agenda-row', { hasText: 'Draft' }).locator('[data-calendar-move]').boundingBox();
  const canvas = await board(page).locator('.week-board-backlog-canvas').boundingBox();
  await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2);
  await page.mouse.down();
  await page.mouse.move(grip.x + 20, grip.y + 20, { steps: 3 });
  await page.mouse.move(canvas.x + 900, canvas.y + 40, { steps: 8 });
  const live = board(page).locator('.week-board-live');
  await expect(live.locator('.week-board-title')).toHaveText('BL-3 Draft');
  expect(await live.evaluate(el => [getComputedStyle(el).position, el.offsetWidth === document.querySelector('.week-board-backlog .week-board-card[data-calendar-card]').offsetWidth])).toEqual(['absolute', true]);
  // The card on the board is the one moving.
  expect(await board(page).locator('.week-board-card[data-calendar-card]', { hasText: 'Draft' }).evaluate(el => getComputedStyle(el).opacity)).toBe('0');
  await page.mouse.up();
  await expect.poll(async () => (await saved(app.draft.id)).backlog?.z).toBe(1);
  await expect(live).toHaveCount(0);
});

test('with Alt held a card lands to the pixel beside another, without lining up, as on boards', async ({ page }) => {
  await open(page);
  await drag(page, 'Plan', (start) => ({ x: start.x + 563, y: start.y + 25 }));
  await expect.poll(async () => (await saved(app.plan.id)).backlog?.z).toBe(1);
  const at = await place(page, 'Plan');
  const plan = await board(page).locator('.week-board-card', { hasText: 'Plan' }).boundingBox();
  const draft = await board(page).locator('.week-board-card', { hasText: 'Draft' }).boundingBox();
  await page.keyboard.down('Alt');
  await drag(page, 'Draft', (start) => ({ x: start.x + plan.x + 4 - draft.x, y: start.y + plan.y + 16 - draft.y }));
  await page.keyboard.up('Alt');
  await expect.poll(async () => (await saved(app.draft.id)).backlog).toEqual({ x: at.x + 4, y: at.y + 16, z: 2 });
  await expect(board(page).locator('.alignment-guides')).toHaveCount(0);
});

test('at the edge of the board, Alt and an arrow says so instead of saving', async ({ page }) => {
  await open(page);
  const title = page.locator('.week-board-title', { hasText: 'Plan' });
  await title.focus();
  await page.keyboard.press('Alt+Shift+ArrowLeft');
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

// Owner report (F0.22-69): a card dropped on the board flickered back to where it was until the save
// came back. It stays where it landed in every frame.
test('a dropped card stays where it lands while its save is under way', async ({ page }) => {
  await open(page);
  await page.route('**/tasks/**', async (route) => {
    if (route.request().method() !== 'GET') await new Promise((done) => setTimeout(done, 400));
    await route.continue();
  });
  const grip = await page.locator('.week-board-title', { hasText: 'Plan' }).boundingBox();
  const start = { x: grip.x + grip.width / 2, y: grip.y + grip.height / 2 };
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x + 10, start.y + 10, { steps: 3 });
  await page.mouse.move(start.x + 563, start.y + 25, { steps: 8 });
  // The live card follows the pointer on the next frame.
  await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
  const landed = await board(page).locator('.week-board-live').evaluate((el) => Math.round(el.getBoundingClientRect().left));
  await page.evaluate(() => {
    window.planFrames = [];
    const tick = () => {
      const shown = [...document.querySelectorAll('.week-board-backlog-canvas .week-board-card')].filter((el) => el.textContent.includes('Plan') && getComputedStyle(el).opacity !== '0');
      window.planFrames.push(shown.map((el) => Math.round(el.getBoundingClientRect().left)));
      if (window.planFrames.length < 45) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  await page.mouse.up();
  await expect.poll(async () => (await saved(app.plan.id)).backlog?.z).toBe(1);
  await expect.poll(() => page.evaluate(() => window.planFrames.length)).toBe(45);
  for (const frame of await page.evaluate(() => window.planFrames)) expect(frame).toEqual([landed]);
});
