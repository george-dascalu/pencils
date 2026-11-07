// Owner request (F0.22-48): the Week board's Group by can split the week's cards into the morning
// (before 12:00), afternoon (until 17:00) and evening; a card dropped in another part of the day starts
// at its hour (9:00, 13:00, 18:00) and keeps its length. Owner request (F0.22-56): there is no Any time
// row: the week's cards without times wait on the Unscheduled board, in turn, with their date, and a
// card dropped there loses its date and times.
import { test, expect, useApp } from '../fixtures.mjs';
import { reveal } from '../helpers/menu-controls.mjs';

const day = '2026-11-05';
const app = useApp(async store => {
  const project = await store.createProject({ title: 'Day parts', key: 'DP' });
  const card = (title, start_time, due_time) => store.createTask(project.id, { title, start: day, due: day, ...(start_time ? { start_time, due_time } : {}) });
  return { project, standup: await card('Standup', '09:00', '09:30'), lunch: await card('Lunch', '12:30', '13:30'), gym: await card('Gym', '18:00', '19:00'), errand: await card('Errand'), idea: await store.createTask(project.id, { title: 'Idea' }), note: await store.createTask(project.id, { title: 'Note', start: '2026-11-06', due: '2026-11-06' }) };
});
const rows = (page) => page.locator('.week-board-row[data-week-board-value]').evaluateAll(els => els.map(el => [el.dataset.weekBoardValue, el.querySelector('.week-board-row-head > span').textContent, [...el.querySelectorAll('.week-board-title')].map(t => t.textContent.replace(/^DP-\d+ /, ''))]));
const saved = async (id) => (await app.store.snapshot(app.project.id)).tasks.find(t => t.id === id);
const backlog = (page) => page.locator('.week-board-backlog .week-board-title').evaluateAll(els => els.map(t => t.textContent.replace(/^DP-\d+ /, '')));
async function drag(page, title, part) {
  const from = await page.locator('.week-board-title', { hasText: title }).boundingBox();
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(from.x + from.width / 2 + 10, from.y + from.height / 2 + 10, { steps: 3 });
  // The landing place moves the rows it passes, so aim again at where the cell now is.
  for (const steps of [8, 2]) {
    const to = await page.locator(part === null ? '.week-board-backlog-board' : `.week-board-cell[data-week-board-value="${part}"][data-calendar-date="${day}"]`).boundingBox();
    await page.mouse.move(to.x + to.width / 2, to.y + to.height - 6, { steps });
    await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
  }
  await page.mouse.up();
}

test('Group by Time of day splits the week into morning, afternoon and evening, and a drop sets the time', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-11-04T12:00:00'));
  await page.goto(`${app.base}/#project/${app.project.id}/calendar`);
  await (await reveal(page.locator('#calendar-mode'))).selectOption('board');
  await expect(page.locator('.week-board')).toBeVisible();
  await (await reveal(page.locator('#week-board-rows'))).selectOption({ label: 'Time of day' });
  await expect.poll(() => rows(page)).toEqual([
    ['morning', 'Morning', ['Standup']], ['afternoon', 'Afternoon', ['Lunch']], ['evening', 'Evening', ['Gym']],
  ]);
  // The week's cards without times wait on the Unscheduled board, first, by day, with their dates.
  await expect.poll(() => backlog(page)).toEqual(['Errand', 'Note', 'Idea']);
  const errand = page.locator('.week-board-backlog .week-board-card', { hasText: 'Errand' });
  await expect(errand.locator('.row-due')).toBeVisible();
  await expect(errand.locator('.row-due')).toContainText('5 Nov');
  await expect(page.locator('.week-board-backlog .week-board-card', { hasText: 'Idea' }).locator('.row-due')).toHaveCSS('display', 'none');
  // Into a part of the day: it starts at its hour, an hour long for a card without times.
  await drag(page, 'Errand', 'afternoon');
  await expect.poll(async () => { const t = await saved(app.errand.id); return [t.start, t.start_time, t.due, t.due_time]; }).toEqual([day, '13:00', day, '14:00']);
  // A timed card keeps its length.
  await drag(page, 'Standup', 'evening');
  await expect.poll(async () => { const t = await saved(app.standup.id); return [t.start_time, t.due_time]; }).toEqual(['18:00', '18:30']);
  // Onto the Unscheduled board: the date and times go.
  await drag(page, 'Gym', null);
  await expect.poll(async () => { const t = await saved(app.gym.id); return [t.start ?? null, t.due ?? null, t.start_time ?? null, t.due_time ?? null, !!t.backlog]; }).toEqual([null, null, null, null, true]);
  await expect.poll(() => rows(page)).toEqual([
    ['morning', 'Morning', []], ['afternoon', 'Afternoon', ['Lunch', 'Errand']], ['evening', 'Evening', ['Standup']],
  ]);
  await expect.poll(async () => (await backlog(page)).sort()).toEqual(['Gym', 'Idea', 'Note']);
});

test('Alt and an arrow on a dated card on the Unscheduled board takes its date away, as a drop does', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-11-04T12:00:00'));
  await page.goto(`${app.base}/#project/${app.project.id}/calendar`);
  await (await reveal(page.locator('#calendar-mode'))).selectOption('board');
  await (await reveal(page.locator('#week-board-rows'))).selectOption({ label: 'Time of day' });
  const title = page.locator('.week-board-backlog .week-board-title', { hasText: 'Note' });
  const at = await title.evaluate(el => { const card = el.closest('.week-board-card'); return { x: card.offsetLeft, y: card.offsetTop }; });
  await title.focus();
  await page.keyboard.press('Alt+ArrowDown');
  await expect.poll(async () => { const t = await saved(app.note.id); return [t.start ?? null, t.due ?? null, t.backlog?.x, t.backlog?.y]; }).toEqual([null, null, at.x, at.y + 8]);
  await expect(title).toBeFocused();
});
