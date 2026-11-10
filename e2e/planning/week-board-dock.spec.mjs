// Owner request: the Week board fills the page; its dock closes to one floating button, kept per
// browser. The dock floats over the grid; a bottom-left target cancels a card drag without saving.
import { test, expect, useApp, onDevices } from '../fixtures.mjs';
import { reveal } from '../helpers/menu-controls.mjs';

const day = '2026-11-05';
const app = useApp(async store => {
  const project = await store.createProject({ title: 'Dock', key: 'DK' });
  // A row each, more than the week shows at once.
  for (const name of ['Ann', 'Bo', 'Cy', 'Di', 'Ed', 'Flo', 'Gus', 'Hal', 'Ivy', 'Jo', 'Kay', 'Lou']) await store.createTask(project.id, { title: `${name}'s card`, assignee: name, due: day });
  return { project, plan: await store.createTask(project.id, { title: 'Plan' }), meeting: await store.createTask(project.id, { title: 'Meeting', assignee: 'Ann', due: day }) };
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

onDevices(['phone'], () => test('a touch drag can be dropped on Cancel without moving the card', async ({ page }) => {
  const cdp = await page.context().newCDPSession(page);
  await open(page);
  if (await page.locator('.mobile-view-options[open]').count()) await page.getByRole('button', { name: 'Close view options', exact: true }).click();
  const before = await saved(app.plan.id), card = cards(page).locator(`[data-calendar-card="${app.plan.id}"]`);
  const r = await card.locator('.week-board-title').boundingBox(), x = r.x + r.width / 2, y = r.y + r.height / 2;
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  await expect(card).toHaveClass(/calendar-armed/);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x + 12, y }] });
  const cancel = page.getByRole('button', { name: 'Cancel drag', exact: true });
  await expect(cancel).toBeVisible();
  const target = await cancel.boundingBox();
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: target.x + target.width / 2, y: target.y + target.height / 2 }] });
  await expect(cancel).toHaveClass(/calendar-drop-target/);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect(cancel).toHaveCount(0);
  await expect(card).toBeVisible();
  expect(await saved(app.plan.id)).toEqual(before);
}));

onDevices(['desktop', 'ipad', 'phone'], () => {
  test('a closed dock leaves only a floating button at the bottom left, kept per browser', { tag: '@gate' }, async ({ page }) => {
    await open(page);
    if (await page.locator('.mobile-view-options[open]').count()) await page.getByRole('button', { name: 'Close view options', exact: true }).click();
    const hide = dock(page).getByRole('button', { name: 'Hide Unscheduled', exact: true });
    await expect(hide).toHaveAttribute('aria-expanded', 'true');
    const shown = await box(dock(page)), before = await box(page.locator('.week-board-scroll'));
    await hide.click();
    const show = dock(page).getByRole('button', { name: 'Show Unscheduled', exact: true });
    await expect(show).toHaveAttribute('aria-expanded', 'false');
    await expect(cards(page)).toBeHidden();
    // Only the floating button remains. No bar takes space from the week.
    await expect(dock(page).locator('h3')).toBeHidden();
    await expect(dock(page)).toHaveCSS('position', 'absolute');
    const [button, tucked, week] = await Promise.all([box(show), box(dock(page)), box(page.locator('.week-board-scroll'))]);
    expect(tucked.height).toBe(button.height);
    expect(week).toEqual(before);
    const r = await show.boundingBox();
    expect(r.x).toBeLessThan(32);
    expect(r.width).toBe(r.height);
    expect(r.y + r.height).toBeLessThanOrEqual(shown.bottom);
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

onDevices(['desktop', 'ipad', 'phone'], () => {
  test('the open dock floats above the full-height grid without moving or resizing it', { tag: '@gate' }, async ({ page }) => {
    await open(page);
    if (await page.locator('.mobile-view-options[open]').count()) await page.getByRole('button', { name: 'Close view options', exact: true }).click();
    await expect(dock(page)).toHaveCSS('position', 'absolute');
    await expect(dock(page)).not.toHaveCSS('box-shadow', 'none');
    const week = page.locator('.week-board-scroll'), before = await box(week), panel = await box(dock(page));
    expect(panel.top).toBeLessThan(before.bottom - 96);
    expect(panel.bottom).toBeLessThanOrEqual(before.bottom);
    expect(await dock(page).evaluate(el => {
      const r = el.getBoundingClientRect();
      return el.contains(document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2));
    })).toBe(true);
    const grid = await box(page.locator('.week-board'));
    await dock(page).getByRole('button', { name: 'Hide Unscheduled', exact: true }).click();
    expect(await box(week)).toEqual(before);
    expect(await box(page.locator('.week-board'))).toEqual(grid);
    await dock(page).getByRole('button', { name: 'Show Unscheduled', exact: true }).click();
    expect(await box(week)).toEqual(before);
    expect(await box(page.locator('.week-board'))).toEqual(grid);
  });

  test('the quarter-circle cancel target restores dock and scheduled cards without saving a drag', { tag: '@gate' }, async ({ page, device }) => {
    const current = await saved(app.plan.id);
    await app.store.updateTask(app.project.id, app.plan.id, { revision: current.revision, backlog: { x: 8, y: 24, z: 3 } });
    await open(page);
    if (await page.locator('.mobile-view-options[open]').count()) await page.getByRole('button', { name: 'Close view options', exact: true }).click();
    let writes = 0;
    page.on('request', r => { if (r.method() === 'PATCH' && r.url().includes('/tasks/')) writes++; });
    for (const task of [app.plan, app.meeting]) {
      const before = await saved(task.id);
      if (task === app.meeting) await dock(page).getByRole('button', { name: 'Hide Unscheduled', exact: true }).click();
      if (task === app.meeting && device === 'desktop') await page.evaluate(() => document.documentElement.dataset.density = 'compact');
      await lift(page, task.title);
      const cancel = page.getByRole('button', { name: 'Cancel drag', exact: true });
      await expect(cancel).toBeVisible();
      await expect(cancel).toHaveCSS('position', 'fixed');
      const r = await cancel.boundingBox();
      expect(r.x).toBe(0);
      expect(r.width).toBe(r.height);
      const height = await cancel.evaluate(el => parseFloat(getComputedStyle(el).getPropertyValue('--control-height')));
      expect(r.height).toBe(height * 2.5);
      await expect(cancel).toHaveCSS('border-top-right-radius', '100%');
      for (const corner of ['top-left', 'bottom-right', 'bottom-left']) await expect(cancel).toHaveCSS(`border-${corner}-radius`, '0px');
      expect(r.y + r.height).toBeCloseTo(await page.locator('#view-content').evaluate(el => el.getBoundingClientRect().bottom - parseFloat(getComputedStyle(el).paddingBottom) + 6), 0);
      expect(await cancel.evaluate(el => {
        const r = el.getBoundingClientRect(), icon = el.querySelector('svg').getBoundingClientRect();
        return icon.left >= r.left && icon.top >= r.top && icon.right <= r.right && icon.bottom <= r.bottom && el.contains(document.elementFromPoint(icon.x + icon.width / 2, icon.y + icon.height / 2));
      })).toBe(true);
      // The cut-away upper-right corner must pass through; the curved area is the drop target.
      expect(await cancel.evaluate(el => { const r = el.getBoundingClientRect(); return el.contains(document.elementFromPoint(r.left + r.width * .9, r.top + r.height * .1)); })).toBe(false);
      expect(await cancel.evaluate(el => { const r = el.getBoundingClientRect(); return el.contains(document.elementFromPoint(r.left + r.width * .6, r.top + r.height * .25)); })).toBe(true);
      await page.mouse.move(r.x + r.width / 2, r.y + r.height / 2, { steps: 6 });
      await expect(cancel).toHaveClass(/calendar-drop-target/);
      await expect(page.locator('.calendar-drag-preview')).toContainText('Release to cancel');
      await expect(cards(page)).toBeHidden();
      await expect(dock(page).locator('[data-backlog-toggle]')).toBeHidden();
      await expect(dock(page)).toHaveCSS('pointer-events', 'none');
      await expect(page.locator('.calendar-placement')).toHaveCount(0);
      await page.mouse.up();
      await expect(cancel).toHaveCount(0);
      await expect(dock(page)).not.toHaveAttribute('data-drag');
      expect(await saved(task.id)).toEqual(before);
    }
    expect(writes).toBe(0);
    await expect(cards(page)).toBeHidden();
    await page.reload();
    await expect(page.locator(`.week-board [data-calendar-card="${app.meeting.id}"]`)).toBeVisible();
    await dock(page).getByRole('button', { name: 'Show Unscheduled', exact: true }).click();
    await expect(cards(page).locator(`[data-calendar-card="${app.plan.id}"]`)).toBeVisible();
  });
});

onDevices(['desktop', 'ipad', 'phone'], () => test('the week grid fills its available height without visible scrollbars', { tag: '@gate' }, async ({ page, device }) => {
  await open(page);
  await (await reveal(page.locator('#week-board-rows'))).selectOption('daypart');
  if (await page.locator('.mobile-view-options[open]').count()) await page.getByRole('button', { name: 'Close view options', exact: true }).click();
  if (device === 'desktop') await page.setViewportSize({ width: 860, height: 1400 });
  const scroll = page.locator('.week-board-scroll');
  for (const closed of [false, true]) {
    if (closed) await page.getByRole('button', { name: 'Hide Unscheduled', exact: true }).click();
    await expect(scroll).toHaveCSS('scrollbar-width', 'none');
    await expect.poll(() => page.locator('.week-board').evaluate(el => {
      const r = el.getBoundingClientRect(), viewport = el.parentElement;
      return r.height + 1 >= viewport.clientHeight && el.scrollHeight <= el.clientHeight + 1;
    })).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
    await expect(page.locator('.week-board-backlog-board')).toHaveCSS('scrollbar-width', 'none');
  }
}));

// With the mouse on iPad too: in WebKit, a card lifted from the dock keeps its drag while the dock is tucked.
onDevices(['desktop', 'ipad'], () => {
  test('dragging at an overlay edge scrolls only the dock and cancelling stops it', { tag: '@gate' }, async ({ page }) => {
    const current = await saved(app.plan.id);
    await app.store.updateTask(app.project.id, app.plan.id, { revision: current.revision, backlog: { x: 8, y: 240, z: 1 } });
    await open(page);
    const week = page.locator('.week-board-scroll');
    const before = await week.evaluate(el => [el.scrollLeft, el.scrollTop]);
    await lift(page, 'Plan');
    const initial = await cards(page).evaluate(el => el.scrollTop);
    const area = await cards(page).boundingBox();
    await page.mouse.move(area.x + area.width - 12, area.y + area.height - 12, { steps: 4 });
    await expect.poll(() => cards(page).evaluate(el => el.scrollTop)).toBeGreaterThan(initial);
    expect(await week.evaluate(el => [el.scrollLeft, el.scrollTop])).toEqual(before);
    const target = await page.getByRole('button', { name: 'Cancel drag', exact: true }).boundingBox();
    await page.mouse.move(target.x + target.width / 2, target.y + target.height / 2);
    await expect(page.locator('.calendar-drag-cancel')).toHaveClass(/calendar-drop-target/);
    const scrolled = await cards(page).evaluate(el => [el.scrollLeft, el.scrollTop]);
    await frames(page);
    expect(await cards(page).evaluate(el => [el.scrollLeft, el.scrollTop])).toEqual(scrolled);
    expect(await week.evaluate(el => [el.scrollLeft, el.scrollTop])).toEqual(before);
    await page.mouse.up();
  });

  test('an open dock remains available to unschedule a card dragged from the week', async ({ page }) => {
    await open(page);
    await lift(page, 'Meeting');

    await expect(cards(page)).toBeVisible();
    const area = await cards(page).boundingBox();
    await page.mouse.move(area.x + area.width - 160, area.y + 40, { steps: 4 });
    await frames(page);
    await expect(cards(page)).toBeVisible();
    await page.mouse.up();
    await expect.poll(async () => { const t = await saved(app.meeting.id); return [t.due ?? null, !!t.backlog]; }).toEqual([null, true]);
    await expect(cards(page).locator('.week-board-card')).toHaveCount(2);
  });

  test('scheduling the last dock card keeps the empty overlay closed after the drop', async ({ page }) => {
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
    await expect(cards(page)).toBeHidden();
    await expect(dock(page).getByRole('button', { name: 'Show Unscheduled', exact: true })).toBeVisible();
    await page.reload();
    await expect(cards(page)).toBeHidden();
  });

  test('a closed dock has no button or invisible reopen target during a drag', async ({ page }) => {
    await open(page);
    await dock(page).getByRole('button', { name: 'Hide Unscheduled', exact: true }).click();
    const at = await dock(page).boundingBox();
    await lift(page, 'Meeting');
    await expect(dock(page).locator('[data-backlog-toggle]')).toBeHidden();
    await page.mouse.move(at.x + at.width / 2, at.y + at.height / 2);
    await frames(page);
    await expect(cards(page)).toBeHidden();
    expect(await dock(page).evaluate(el => { const r = el.getBoundingClientRect(); return el.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)); })).toBe(false);
    await page.keyboard.press('Escape');
    await expect(dock(page).getByRole('button', { name: 'Show Unscheduled', exact: true })).toBeVisible();
    expect((await saved(app.meeting.id)).due).toBe(day);
  });

  test('a week scrolled to its end stays put during a scheduled card drag', async ({ page }) => {
    await open(page);
    const week = page.locator('.week-board-scroll');
    const end = await week.evaluate((el) => { el.scrollTop = el.scrollHeight; return el.scrollTop; });
    expect(end).toBeGreaterThan(0);
    const id = await week.locator('.week-board-title').evaluateAll((els, top) => els.find(el => {
      const r = el.getBoundingClientRect(), view = el.closest('.week-board-scroll').getBoundingClientRect();
      return r.top > view.top + 60 && r.bottom < top - 20;
    })?.closest('[data-calendar-card]').dataset.calendarCard, (await dock(page).boundingBox()).y);
    expect(id).toBeTruthy();
    const title = week.locator(`[data-calendar-card="${id}"] .week-board-title`), at = await title.boundingBox();
    await lift(page, title);
    await expect(cards(page)).toBeVisible();
    await frames(page);
    expect(await week.evaluate((el) => el.scrollTop)).toBe(end);
    expect((await title.boundingBox()).y).toBe(at.y);
    await page.keyboard.press('Escape');
    await expect(cards(page)).toBeVisible();
    expect(await week.evaluate((el) => el.scrollTop)).toBe(end);
  });
});

// Run the actual opening, closing and drag flows with motion allowed, not just reduced-motion fixtures.
test('the dock animates opening and closing and respects reduced motion', { tag: '@gate' }, async ({ page }) => {
  await open(page);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await dock(page).getByRole('button', { name: 'Hide Unscheduled', exact: true }).click();
  await expect(cards(page)).toBeHidden();
  await dock(page).getByRole('button', { name: 'Show Unscheduled', exact: true }).click();
  await expect(dock(page)).toHaveCSS('animation-name', 'week-board-dock-in');
  await expect(cards(page)).toBeVisible();
  await expect.poll(() => dock(page).evaluate(el => el.getAnimations().length)).toBe(0);
  await lift(page, 'Plan');
  const cell = await page.locator('.week-board-cell').first().boundingBox();
  await page.mouse.move(cell.x + cell.width / 2, cell.y + 20, { steps: 5 });
  await expect(dock(page)).toHaveCSS('transition-duration', '0.16s, 0.16s, 0s');
  await expect(dock(page)).toHaveCSS('opacity', '0');
  await expect(cards(page)).toBeHidden();
  await expect(dock(page).locator('[data-backlog-toggle]')).toBeHidden();
  await page.keyboard.press('Escape');
  await page.mouse.up();
  await expect(cards(page)).toBeVisible();
  await expect(dock(page)).toHaveCSS('opacity', '1');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(dock(page)).toHaveCSS('transition-duration', '0s');
  await dock(page).getByRole('button', { name: 'Hide Unscheduled', exact: true }).click();
  await expect(cards(page)).toBeHidden();
  await dock(page).getByRole('button', { name: 'Show Unscheduled', exact: true }).click();
  await expect(dock(page)).toHaveCSS('animation-name', 'none');
});
