// Owner request (F0.22-57): done cards are greyed out on every card tile (Kanban, the Week board,
// Calendar's Month, Week and Agenda, Timeline bars and task cards on boards): the card fades, which
// greys its title, struck through as in List rows, while the title stays readable (4.5:1); hovering
// or focusing the card brings it back.
import { test, expect, useApp } from '../fixtures.mjs';
import { reveal } from '../helpers/menu-controls.mjs';

const day = '2026-11-05';
const app = useApp(async store => {
  const project = await store.createProject({ title: 'Done cards', key: 'DC' });
  const shipped = await store.createTask(project.id, { title: 'Shipped', status: 'done', start: day, due: day });
  const open = await store.createTask(project.id, { title: 'Open', status: 'todo', start: day, due: day });
  for (const [title, status] of [['Shipped call', 'done'], ['Open call', 'todo']]) await store.createTask(project.id, { title, status, start: day, due: day, start_time: '09:00', due_time: '10:00' });
  const board = (await store.snapshot(project.id)).boards[0];
  await store.updateBoard(project.id, board.id, { revision: board.revision, nodes: [{ id: 'a', type: 'task', task: shipped.id, x: 20, y: 40, w: 220, h: 160 }, { id: 'b', type: 'task', task: open.id, x: 300, y: 40, w: 220, h: 160 }] });
  return { project };
});
// The tile's opacity, whether its title is struck through, and the title's contrast with what is
// behind it once the fade is applied over the page.
const look = (tile, title) => tile.evaluate((el, title) => {
  const rgb = (value) => { const n = value.match(/[\d.]+/g).map(Number); return value.startsWith('color(') ? n.map((c, i) => i < 3 ? c * 255 : c) : n; };
  const lum = (c) => c.slice(0, 3).map((v) => { v /= 255; return v <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; }).reduce((sum, v, i) => sum + v * [.2126, .7152, .0722][i], 0);
  const t = el.querySelector(title);
  let back = t; while (rgb(getComputedStyle(back).backgroundColor)[3] === 0) back = back.parentElement;
  const page = rgb(getComputedStyle(document.body).backgroundColor), fade = Number(getComputedStyle(el).opacity);
  const shown = (c) => c.slice(0, 3).map((v, i) => v * fade + page[i] * (1 - fade));
  const [a, b] = [lum(shown(rgb(getComputedStyle(t).color))), lum(shown(rgb(getComputedStyle(back).backgroundColor)))].sort((x, y) => y - x);
  return { opacity: getComputedStyle(el).opacity, struck: getComputedStyle(t).textDecorationLine, readable: (a + .05) / (b + .05) >= 4.5 };
}, title);
async function check(page, tile, title) {
  const done = tile('Shipped'), other = tile('Open');
  await expect(done).toBeVisible();
  expect(await look(done, title)).toEqual({ opacity: '0.7', struck: 'line-through', readable: true });
  expect(await look(other, title)).toMatchObject({ opacity: '1', struck: 'none' });
  // At full strength while the pointer is on it.
  await done.hover();
  await expect.poll(async () => (await look(done, title)).opacity).toBe('1');
  await page.mouse.move(1, 1);
}
async function calendar(page, layout) {
  await page.clock.setFixedTime(new Date('2026-11-04T12:00:00'));
  await page.goto(`${app.base}/#project/${app.project.id}/calendar`);
  await (await reveal(page.locator('#calendar-mode'))).selectOption(layout);
}

for (const scheme of ['light', 'dark']) test(`done cards are greyed out in Kanban and on boards (${scheme})`, { tag: '@gate' }, async ({ page }) => {
  await page.emulateMedia({ colorScheme: scheme });
  await page.goto(`${app.base}/#project/${app.project.id}/kanban`);
  await check(page, name => page.locator('.kanban-card').filter({ has: page.getByRole('button', { name, exact: true }) }), '.task-title');
  await page.goto(`${app.base}/#project/${app.project.id}/board`);
  await check(page, name => page.locator(`#canvas .board-node.task[aria-label="${name}"]`), '.live-card-heading .task-title');
});

test('done cards are greyed out in Calendar Month, Week, Week board and Agenda', { tag: '@gate' }, async ({ page }) => {
  const named = (selector) => name => page.locator(selector).filter({ hasText: new RegExp(`^(DC-\\d+ )?${name}$`) });
  await calendar(page, 'month');
  await check(page, name => page.locator('.calendar-task').filter({ has: page.locator('.calendar-card-title', { hasText: new RegExp(`^${name}$`) }) }), '.calendar-card-title');
  await calendar(page, 'week');
  await check(page, name => page.locator('.calendar-timed-card').filter({ has: page.locator('strong', { hasText: `${name} call` }) }), '.calendar-card-title > strong');
  await calendar(page, 'board');
  await check(page, name => page.locator('.week-board-card').filter({ has: named('.week-board-title')(name) }), '.week-board-title');
  await calendar(page, 'agenda');
  await check(page, name => page.locator('.agenda-row').filter({ has: named('.agenda-task > span:last-child')(name) }), '.agenda-task > span:last-child');
});

for (const scheme of ['light', 'dark']) test(`done cards are greyed out on the Timeline (${scheme})`, { tag: '@gate' }, async ({ page }) => {
  await page.emulateMedia({ colorScheme: scheme });
  await page.clock.setFixedTime(new Date('2026-11-04T12:00:00'));
  await page.goto(`${app.base}/#project/${app.project.id}/timeline`);
  await check(page, name => page.locator('.timeline-bar').filter({ has: page.locator('.timeline-bar-text', { hasText: new RegExp(`^${name}$`) }) }), '.timeline-bar-text');
});

// A done card deleted while its board is open shows as deleted, not greyed out.
test('a done card deleted while its board is open is no longer greyed out', async ({ page }) => {
  const gone = await app.store.createTask(app.project.id, { title: 'Gone', status: 'done' });
  const board = (await app.store.snapshot(app.project.id)).boards[0];
  await app.store.updateBoard(app.project.id, board.id, { revision: board.revision, nodes: [...board.nodes, { id: 'gone', type: 'task', task: gone.id, x: 600, y: 40, w: 220, h: 160 }] });
  await page.goto(`${app.base}/#project/${app.project.id}/board`);
  const node = page.locator('[data-node="gone"]');
  await expect(node).toHaveClass(/\bcard-done\b/);
  await app.store.deleteTask(app.project.id, gone.id, gone.revision);
  await expect(node.getByText('Deleted card', { exact: true })).toBeVisible();
  await expect(node).not.toHaveClass(/\bcard-done\b/);
  await expect(node).toHaveCSS('opacity', '1');
});

// F0.22-76: a card marked done from its own field box fades at once, though its menu keeps focus; a
// card reached with the keyboard still comes back to full strength.
test('a card marked done from its field box fades at once, and keyboard focus brings it back', { tag: '@gate' }, async ({ page }) => {
  const task = await app.store.createTask(app.project.id, { title: 'Cook soup', status: 'todo', start: day, due: day });
  await calendar(page, 'board');
  const tile = page.locator(`.week-board-card[data-calendar-card="${task.id}"]`);
  await tile.getByRole('combobox', { name: 'Status for Cook soup', exact: true }).click();
  await page.locator('#shared-select-menu').getByRole('option', { name: 'Done', exact: true }).click();
  await expect.poll(async () => (await app.store.snapshot(app.project.id)).tasks.find(t => t.id === task.id).status).toBe('done');
  await page.mouse.move(1, 1);
  const opacity = () => page.locator(`.week-board-card[data-calendar-card="${task.id}"]`).evaluate(el => getComputedStyle(el).opacity);
  await expect(page.locator(`.week-board-card[data-calendar-card="${task.id}"]`)).toHaveClass(/\bcard-done\b/);
  await expect.poll(opacity).toBe('0.7');
  // A modifier key alone isn't the keyboard taking over.
  await page.keyboard.press('Shift');
  expect(await opacity()).toBe('0.7');
  // Tabbed to, it's at full strength.
  await page.locator(`.week-board-card[data-calendar-card="${task.id}"]`).getByRole('combobox', { name: 'Status for Cook soup', exact: true }).focus();
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('Tab');
  await expect.poll(opacity).toBe('1');
  // Focus moved with no key or pointer (a screen reader's cursor, on a fresh page) brings it back too.
  await page.reload();
  await page.locator(`.week-board-card[data-calendar-card="${task.id}"]`).getByRole('combobox', { name: 'Status for Cook soup', exact: true }).focus();
  await expect.poll(opacity).toBe('1');
  await app.store.updateTask(app.project.id, task.id, { revision: (await app.store.snapshot(app.project.id)).tasks.find(t => t.id === task.id).revision, status: 'todo' });
});
