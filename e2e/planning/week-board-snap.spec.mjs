// Owner request (F0.22-79): scrolled sideways or up and down, the Week board settles on a day and a
// row, each starting just clear of the sticky day and row names. A card dragged to its edge still
// scrolls it a little at a time.
import { test, expect, useApp, onDevices } from '../fixtures.mjs';
import { reveal } from '../helpers/menu-controls.mjs';

const app = useApp(async store => {
  const project = await store.createProject({ title: 'Snap', key: 'SN' });
  // A row per person, each shorter than the board, more than it shows at once.
  for (const name of ['Ann', 'Bo', 'Cy', 'Di', 'Ed', 'Flo', 'Gus', 'Hal', 'Ivy', 'Jo', 'Kay', 'Lou']) await store.createTask(project.id, { title: `${name}'s card`, assignee: name, due: '2026-11-04' });
  return { project };
});
async function open(page) {
  await page.clock.setFixedTime(new Date('2026-11-04T12:00:00'));
  await page.goto(`${app.base}/#project/${app.project.id}/calendar`);
  await (await reveal(page.locator('#calendar-mode'))).selectOption('board');
  await (await reveal(page.locator('#week-board-rows'))).selectOption('assignee');
  await expect(page.locator('.week-board-row')).toHaveCount(12);
  // The redraw restores scroll in a microtask and an animation frame. Let that first layout
  // finish before a scripted WebKit scroll, or the pending restoration can overwrite it.
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}
const scroller = (page) => page.locator('.week-board-scroll');
// Where the board rests: whether a day starts right after the row names and a row right under the
// day names (or the board is scrolled as far as it goes).
const resting = (page) => scroller(page).evaluate((sc) => {
  const box = sc.getBoundingClientRect(), names = sc.querySelector('.week-board-corner').getBoundingClientRect();
  const lefts = [...sc.querySelectorAll('.week-board-day-head')].map((el) => Math.round(el.getBoundingClientRect().left - names.right));
  const tops = [...sc.querySelectorAll('.week-board-row-head')].map((el) => Math.round(el.getBoundingClientRect().top - names.bottom));
  return {
    day: lefts.some((x) => Math.abs(x) <= 1) || sc.scrollLeft >= sc.scrollWidth - sc.clientWidth - 1,
    row: tops.some((y) => Math.abs(y) <= 1) || sc.scrollTop >= sc.scrollHeight - sc.clientHeight - 1,
    moved: [sc.scrollLeft > 0, sc.scrollTop > 0],
    names: [Math.round(names.width), Math.round(names.height), Math.round(box.left), Math.round(box.top)],
  };
});

onDevices(['narrow', 'ipad'], () => {
  test('scrolled either way, the Week board settles on a day and a row, clear of the sticky names', { tag: '@gate' }, async ({ page, browserName }) => {
    await open(page);
    const style = await scroller(page).evaluate((sc) => {
      const s = getComputedStyle(sc), names = sc.querySelector('.week-board-corner').getBoundingClientRect();
      return { snap: s.scrollSnapType, padding: [s.scrollPaddingTop, s.scrollPaddingLeft], names: [`${Math.round(names.height)}px`, `${Math.round(names.width)}px`], cell: getComputedStyle(sc.querySelector('.week-board-cell')).scrollSnapAlign };
    });
    expect(style).toEqual({ snap: 'both mandatory', padding: style.names, names: style.names, cell: 'start' });
    // Scrolled to between two days and two rows, it moves onto one of each.
    const { dx, dy, at } = await scroller(page).evaluate((sc) => {
      const names = sc.querySelector('.week-board-corner').getBoundingClientRect(), box = sc.getBoundingClientRect();
      return { dx: sc.querySelectorAll('.week-board-day-head')[2].getBoundingClientRect().left - names.right + 30, dy: sc.querySelectorAll('.week-board-row-head')[2].getBoundingClientRect().top - names.bottom + 20, at: { x: box.x + box.width / 2, y: box.y + box.height / 2 } };
    });
    await page.mouse.move(at.x, at.y);
    // Mobile Safari has no wheel, and snaps a scroll made by script as it does a swipe; Chromium snaps
    // only a scroll the user makes, one way at a time (the way the last scroll went).
    const scroll = (x, y) => (browserName === 'webkit' ? scroller(page).evaluate((sc, [x, y]) => sc.scrollBy(x, y), [x, y]) : page.mouse.wheel(x, y));
    await scroll(dx, 0);
    await expect.poll(() => resting(page).then(({ day, moved }) => [day, moved[0]])).toEqual([true, true]);
    await scroll(0, dy);
    await expect.poll(() => resting(page).then(({ day, row, moved }) => ({ day, row, moved }))).toEqual({ day: true, row: true, moved: [true, true] });
  });
});

// Safari snaps a scroll made by script too, so the drag's own scrolling would snap back each step.
onDevices(['ipad'], () => {
  test('a card held at the Week board\'s edge still scrolls it, and the board settles on a day after', async ({ page }) => {
    await open(page);
    const card = await page.locator('.week-board-title', { hasText: "Ann's card" }).boundingBox(), board = await scroller(page).boundingBox();
    await page.mouse.move(card.x + card.width / 2, card.y + card.height / 2);
    await page.mouse.down();
    await page.mouse.move(card.x + card.width / 2 + 10, card.y + card.height / 2, { steps: 3 });
    await page.mouse.move(board.x + board.width - 10, card.y + card.height / 2, { steps: 8 });
    // A step at a time, past a whole day.
    await expect.poll(() => scroller(page).evaluate((sc) => sc.scrollLeft)).toBeGreaterThan(240);
    await page.keyboard.press('Escape');
    await expect.poll(() => resting(page).then(({ day }) => day)).toBe(true);
  });
});
