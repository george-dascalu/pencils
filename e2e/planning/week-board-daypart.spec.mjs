// Owner request (F0.22-48): the Week board's Group by can split the week's cards into the morning
// (before 12:00), afternoon (until 17:00) and evening, with cards without times under Any time; a card
// dropped in another part of the day starts at its hour (9:00, 13:00, 18:00) and keeps its length.
import { test, expect, useApp } from '../fixtures.mjs';
import { reveal } from '../helpers/menu-controls.mjs';

const day = '2026-11-05';
const app = useApp(async store => {
  const project = await store.createProject({ title: 'Day parts', key: 'DP' });
  const card = (title, start_time, due_time) => store.createTask(project.id, { title, start: day, due: day, ...(start_time ? { start_time, due_time } : {}) });
  return { project, standup: await card('Standup', '09:00', '09:30'), lunch: await card('Lunch', '12:30', '13:30'), gym: await card('Gym', '18:00', '19:00'), errand: await card('Errand') };
});
const rows = (page) => page.locator('.week-board-row[data-week-board-value]').evaluateAll(els => els.map(el => [el.dataset.weekBoardValue, el.querySelector('.week-board-row-head > span').textContent, [...el.querySelectorAll('.week-board-title')].map(t => t.textContent.replace(/^DP-\d+ /, ''))]));
const saved = async (id) => (await app.store.snapshot(app.project.id)).tasks.find(t => t.id === id);
async function drag(page, title, part) {
  const from = await page.locator('.week-board-title', { hasText: title }).boundingBox();
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(from.x + from.width / 2 + 10, from.y + from.height / 2 + 10, { steps: 3 });
  // The landing place moves the rows it passes, so aim again at where the cell now is.
  for (const steps of [8, 2]) {
    const to = await page.locator(`.week-board-cell[data-week-board-value="${part}"][data-calendar-date="${day}"]`).boundingBox();
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
    ['morning', 'Morning', ['Standup']], ['afternoon', 'Afternoon', ['Lunch']], ['evening', 'Evening', ['Gym']], ['', 'Any time', ['Errand']],
  ]);
  // Into Any time: the times go.
  await drag(page, 'Gym', '');
  await expect.poll(async () => { const t = await saved(app.gym.id); return [t.start_time ?? null, t.due_time ?? null]; }).toEqual([null, null]);
  // Into a part of the day: it starts at its hour, an hour long for a card without times.
  await drag(page, 'Errand', 'afternoon');
  await expect.poll(async () => { const t = await saved(app.errand.id); return [t.start, t.start_time, t.due, t.due_time]; }).toEqual([day, '13:00', day, '14:00']);
  // A timed card keeps its length.
  await drag(page, 'Standup', 'evening');
  await expect.poll(async () => { const t = await saved(app.standup.id); return [t.start_time, t.due_time]; }).toEqual(['18:00', '18:30']);
  await expect.poll(() => rows(page)).toEqual([
    ['morning', 'Morning', []], ['afternoon', 'Afternoon', ['Lunch', 'Errand']], ['evening', 'Evening', ['Standup']], ['', 'Any time', ['Gym']],
  ]);
});
