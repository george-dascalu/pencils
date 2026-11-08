// Owner request (F0.22-80): the Week board's Unscheduled board acts as a dock. A button at its head hides
// it down to its head and shows it again, kept per browser; while a card is dragged the dock tucks away to
// its head, showing the week, until the card is over it.
import { test, expect, useApp, onDevices } from '../fixtures.mjs';
import { reveal } from '../helpers/menu-controls.mjs';

const day = '2026-11-05';
const app = useApp(async store => {
  const project = await store.createProject({ title: 'Dock', key: 'DK' });
  // A row each, more than the week shows at once.
  for (const name of ['Ann', 'Bo', 'Cy', 'Di', 'Ed', 'Flo', 'Gus', 'Hal']) await store.createTask(project.id, { title: `${name}'s card`, assignee: name, due: day });
  return { project, plan: await store.createTask(project.id, { title: 'Plan' }), meeting: await store.createTask(project.id, { title: 'Meeting', due: day }) };
});
const saved = async (id) => (await app.store.snapshot(app.project.id)).tasks.find(t => t.id === id);
test.beforeEach(async () => {
  for (const [t, fields] of [[app.plan, { due: null, backlog: null }], [app.meeting, { due: day, backlog: null }]]) {
    const current = await saved(t.id);
    await app.store.updateTask(app.project.id, t.id, { revision: current.revision, ...fields });
  }
});
const dock = (page) => page.locator('.week-board-backlog');
const cards = (page) => dock(page).locator('.week-board-backlog-board');
const box = (locator) => locator.evaluate(el => { const r = el.getBoundingClientRect(); return { top: Math.round(r.top), bottom: Math.round(r.bottom), height: Math.round(r.height) }; });
async function open(page) {
  await page.clock.setFixedTime(new Date('2026-11-04T12:00:00'));
  await page.goto(`${app.base}/#project/${app.project.id}/calendar`);
  await (await reveal(page.locator('#calendar-mode'))).selectOption('board');
  await expect(cards(page).locator('.week-board-card')).toHaveCount(1);
}
// Picks a card up and moves it a little, so the drag has begun.
async function lift(page, title) {
  const grip = typeof title === 'string' ? page.locator('.week-board-title', { hasText: title }) : title;
  await grip.scrollIntoViewIfNeeded();
  const from = await grip.boundingBox();
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(from.x + from.width / 2 + 10, from.y + from.height / 2 - 10, { steps: 3 });
}
const frames = (page) => page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
async function overHead(page) {
  const head = await dock(page).locator('.week-board-backlog-head').boundingBox();
  await page.mouse.move(head.x + 40, head.y + head.height / 2, { steps: 4 });
}

onDevices(['desktop', 'ipad'], () => {
  test('a button at the dock\'s head hides it down to its head and shows it again, kept per browser', async ({ page }) => {
    await open(page);
    const hide = dock(page).getByRole('button', { name: 'Hide Unscheduled', exact: true });
    await expect(hide).toHaveAttribute('aria-expanded', 'true');
    const shown = await box(dock(page));
    await hide.click();
    const show = dock(page).getByRole('button', { name: 'Show Unscheduled', exact: true });
    await expect(show).toHaveAttribute('aria-expanded', 'false');
    await expect(cards(page)).toBeHidden();
    // Only its head is left, and the week takes the room.
    const [head, tucked, week] = await Promise.all([box(dock(page).locator('.week-board-backlog-head')), box(dock(page)), box(page.locator('.week-board-scroll'))]);
    expect(tucked.height).toBe(head.height + 1);
    expect(week.bottom).toBe(tucked.top);
    expect(tucked.bottom).toBe(shown.bottom);
    // A whole control (a touch target on iPad), not resized while hidden.
    expect(await show.evaluate(el => el.getBoundingClientRect().height >= parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--control-height')))).toBe(true);
    await expect(dock(page).getByRole('separator', { name: /Unscheduled/ })).toBeHidden();
    await page.reload();
    await expect(show).toBeVisible();
    await expect(cards(page)).toBeHidden();
    await show.click();
    await expect(cards(page)).toBeVisible();
    await expect(hide).toBeFocused();
    expect((await box(dock(page))).height).toBe(shown.height);
  });
});

// With the mouse on iPad too: in WebKit, a card lifted from the dock keeps its drag while the dock is tucked.
onDevices(['desktop', 'ipad'], () => {
  test('a dragged card tucks the dock away until the card is over it, where a drop takes its dates away', async ({ page }) => {
    await open(page);
    await lift(page, 'Meeting');
    await expect(cards(page)).toBeHidden();
    // Over its head it opens, to drop on.
    await overHead(page);
    await expect(cards(page)).toBeVisible();
    const area = await cards(page).boundingBox();
    await page.mouse.move(area.x + area.width - 160, area.y + 40, { steps: 4 });
    await frames(page);
    await expect(cards(page)).toBeVisible();
    await page.mouse.up();
    await expect.poll(async () => { const t = await saved(app.meeting.id); return [t.due ?? null, !!t.backlog]; }).toEqual([null, true]);
    await expect(cards(page).locator('.week-board-card')).toHaveCount(2);
  });

  test('a card dragged up out of the dock tucks it away as it leaves, and the dock comes back after the drop', async ({ page }) => {
    await open(page);
    const cell = await page.locator(`.week-board-cell[data-calendar-date="${day}"]`).first().boundingBox();
    await lift(page, 'Plan');
    // Moving within the dock keeps it open.
    await frames(page);
    await expect(cards(page)).toBeVisible();
    await page.mouse.move(cell.x + cell.width / 2, cell.y + 20, { steps: 8 });
    await expect(cards(page)).toBeHidden();
    await frames(page);
    await page.mouse.up();
    await expect.poll(async () => (await saved(app.plan.id)).due).toBe(day);
    await expect(cards(page)).toBeVisible();
  });

  test('a dock hidden with its button opens under a dragged card, and hides again after the drop', async ({ page }) => {
    await open(page);
    await dock(page).getByRole('button', { name: 'Hide Unscheduled', exact: true }).click();
    await lift(page, 'Meeting');
    await overHead(page);
    await expect(cards(page)).toBeVisible();
    const area = await cards(page).boundingBox();
    await page.mouse.move(area.x + 200, area.y + 40, { steps: 4 });
    await frames(page);
    await page.mouse.up();
    await expect.poll(async () => (await saved(app.meeting.id)).due ?? null).toBe(null);
    await expect(cards(page)).toBeHidden();
    await expect(dock(page).getByRole('button', { name: 'Show Unscheduled', exact: true })).toBeVisible();
  });

  test('a week scrolled to its end stays put as the dock tucks away under a dragged card', async ({ page }) => {
    await open(page);
    const week = page.locator('.week-board-scroll');
    const end = await week.evaluate((el) => { el.scrollTop = el.scrollHeight; return el.scrollTop; });
    expect(end).toBeGreaterThan(0);
    const title = page.locator('.week-board-row').last().locator('.week-board-title').first(), at = await title.boundingBox();
    await lift(page, title);
    await expect(cards(page)).toBeHidden();
    await frames(page);
    expect(await week.evaluate((el) => el.scrollTop)).toBe(end);
    expect((await title.boundingBox()).y).toBe(at.y);
    await page.keyboard.press('Escape');
    await expect(cards(page)).toBeVisible();
    expect(await week.evaluate((el) => el.scrollTop)).toBe(end);
  });
});
