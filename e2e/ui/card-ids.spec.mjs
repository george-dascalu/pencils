// Owner request (F0.22-61): one Card IDs button, in every view's bar (View options on phones), shows
// or hides the card IDs (the project key and the card's number) on every card tile and row. IDs show
// by default; the choice is kept, the same in every view.
import { test, expect, useApp, onDevices } from '../fixtures.mjs';
import { reveal } from '../helpers/menu-controls.mjs';

const day = '2026-11-05';
const app = useApp(async store => {
  const project = await store.createProject({ title: 'Card IDs', key: 'CI' });
  const plan = await store.createTask(project.id, { title: 'Plan', start: day, due: day });
  // A deleted card's tile on a board, which its ID names.
  const gone = await store.createTask(project.id, { title: 'Gone' });
  const board = (await store.snapshot(project.id)).boards[0];
  await store.updateBoard(project.id, board.id, { revision: board.revision, nodes: [{ id: 'plan', type: 'task', task: plan.id, x: 20, y: 40, w: 220, h: 160 }, { id: 'gone', type: 'task', task: gone.id, x: 300, y: 40, w: 220, h: 160 }] });
  await store.deleteTask(project.id, gone.id, gone.revision);
  return { project };
});
const button = (page) => page.getByRole('button', { name: 'Card IDs', exact: true, includeHidden: true });
const shown = (locator) => locator.first().evaluate(el => getComputedStyle(el).display !== 'none');
const go = async (page, view) => {
  await page.clock.setFixedTime(new Date('2026-11-04T12:00:00'));
  await page.goto(`${app.base}/#project/${app.project.id}/${view}`);
};
async function calendar(page, layout) {
  await go(page, 'calendar');
  await (await reveal(page.locator('#calendar-mode'))).selectOption(layout);
  if (await page.locator('.mobile-view-options[open]').count()) await page.getByRole('button', { name: 'Close view options', exact: true }).click();
}

onDevices(['desktop', 'ipad', 'phone'], () => {
  test('one Card IDs button in the bar shows and hides the IDs, and keeps the choice', { tag: '@gate' }, async ({ page, device }) => {
    await go(page, 'list');
    const key = page.locator(device === 'phone' ? '.phone-task-meta > span:not([class])' : '.task-row .task-id');
    await expect(key.first()).toHaveText('CI-1');
    await expect(button(page)).toHaveCount(1);
    // In the bar beside Filters and Sort (on iPad, with them in the top bar); phones list it in View options.
    expect(await button(page).evaluate((el, home) => !!el.closest(home), { desktop: '#view-toolbar .toolbar-left', ipad: '.topbar-view-tools', phone: '.mobile-view-options' }[device])).toBe(true);
    await expect(button(page)).toHaveAttribute('aria-pressed', 'true');
    expect(await shown(key)).toBe(true);
    // Bordered like Sort; a filled accent background clearly marks IDs as on.
    const filled = () => button(page).evaluate(el => { const probe = document.body.appendChild(Object.assign(document.createElement('span'), { style: 'color: var(--green)' })); const green = getComputedStyle(probe).color; probe.remove(); return getComputedStyle(el).backgroundColor === green; });
    if (device !== 'phone') {
      const look = (l) => l.evaluate(el => { const s = getComputedStyle(el); return [s.borderTopWidth, s.borderTopStyle, s.height]; });
      expect(await look(button(page))).toEqual(await look(page.locator('#sort-button')));
    }
    expect(await filled()).toBe(true);
    await (await reveal(button(page))).click();
    await expect(button(page)).toHaveAttribute('aria-pressed', 'false');
    expect(await filled()).toBe(false);
    await expect.poll(() => shown(key)).toBe(false);
    // Kept, and the same in another view.
    await page.reload();
    await expect.poll(() => shown(key)).toBe(false);
    await go(page, 'kanban');
    await expect(button(page)).toHaveAttribute('aria-pressed', 'false');
    await expect.poll(() => shown(page.locator('.kanban-card .task-id'))).toBe(false);
    await (await reveal(button(page))).click();
    await expect.poll(() => shown(page.locator('.kanban-card .task-id'))).toBe(true);
  });
});

onDevices(['desktop', 'ipad', 'phone'], () => {
  for (const theme of ['light', 'dark']) test(`Card IDs has distinct on and off states even while hovered (${theme})`, { tag: '@gate' }, async ({ page }) => {
    await go(page, 'list');
    await page.evaluate(theme => window.PencilsAppearance.write({ theme, density: 'compact' }), theme);
    for (const view of ['list', 'calendar']) {
      if (view === 'calendar') await calendar(page, 'board');
      const control = await reveal(button(page));
      const colours = await control.evaluate(el => {
        const probe = document.body.appendChild(document.createElement('span'));
        probe.style.color = 'var(--green)'; const accent = getComputedStyle(probe).color;
        probe.style.color = 'var(--surface)'; const surface = getComputedStyle(probe).color;
        probe.remove(); return { accent, surface };
      });
      await control.hover();
      await expect(control).toHaveAttribute('aria-pressed', 'true');
      await expect(control).toHaveCSS('background-color', colours.accent);
      await expect(control).toHaveCSS('color', colours.surface);
      await expect(control).toHaveAttribute('title', 'Hide card IDs');
      const size = await control.evaluate(el => [el.offsetWidth, el.offsetHeight]);
      await control.click();
      await expect(control).toHaveAttribute('aria-pressed', 'false');
      await expect(control).not.toHaveCSS('background-color', colours.accent);
      await expect(control).toHaveAttribute('title', 'Show card IDs');
      expect(await control.evaluate(el => [el.offsetWidth, el.offsetHeight])).toEqual(size);
      await control.click();
      await expect(control).toHaveCSS('background-color', colours.accent);
    }
  });
});

test('hidden card IDs leave the cards in Kanban, the Week board, Agenda, Timeline and boards', { tag: '@gate' }, async ({ page }) => {
  const views = [
    [() => go(page, 'kanban'), '.kanban-card .task-id'],
    [() => calendar(page, 'board'), '.week-board-title .card-key'],
    [() => calendar(page, 'agenda'), '.agenda-task .card-key'],
    [() => go(page, 'timeline'), '.timeline-task-label .timeline-key-full'],
    [() => go(page, 'board'), '#canvas .canvas-task-key'],
  ];
  // Shown by default, Kanban included.
  for (const [open, key] of views) {
    await open();
    await expect(page.locator(key).first()).toHaveText('CI-1');
    expect(await shown(page.locator(key)), key).toBe(true);
  }
  await go(page, 'list');
  await button(page).click();
  for (const [open, key] of views) {
    await open();
    await expect(page.locator(key).first()).toBeAttached();
    expect(await shown(page.locator(key)), key).toBe(false);
  }
  // A deleted card's tile keeps its ID: it's what names the card there.
  await go(page, 'board');
  await expect(page.locator('[data-node="gone"] .canvas-task-key')).toHaveText('CI-2');
  expect(await shown(page.locator('[data-node="gone"] .canvas-task-key'))).toBe(true);
  // A Timeline showing only numbers keeps them: they are all its list shows.
  await go(page, 'timeline');
  await (await reveal(page.locator('[data-timeline-list]'))).selectOption('number');
  await expect.poll(() => shown(page.locator('.timeline-key-number'))).toBe(true);
});
