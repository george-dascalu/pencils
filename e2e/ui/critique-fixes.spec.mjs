// Confirmed usability issues from the independent 2 November critique.
import { test, expect, onDevices, useApp } from '../fixtures.mjs';
import { reveal } from '../helpers/menu-controls.mjs';
const title = 'Share the research notes and choose the next step';
const status = 'Ready for the next review';
const app = useApp(async store => {
  const schema = { statuses: ['todo', 'done'], done: ['done'], status_labels: { todo: status } };
  const project = await store.createProject({ title: 'Critique', key: 'CQ', schema });
  await store.createTask(project.id, { title, status: 'todo', due: '2026-11-05' });
  const hidden = await store.createProject({ title: 'Hidden fields', key: 'HF', schema: { ...schema, off: ['status', 'due'] } });
  await store.createTask(hidden.id, { title, status: 'todo', due: '2026-11-05' });
  const empty = await store.createProject({ title: 'Empty', key: 'EM' });
  return { project, hidden, empty };
});
const url = (view, p = app.project) => `${app.base}/#project/${p.id}/${view}`;
async function fits(locator, page) {
  const r = await locator.boundingBox();
  expect(r).not.toBeNull();
  expect(r.x).toBeGreaterThanOrEqual(0);
  expect(r.x + r.width).toBeLessThanOrEqual(page.viewportSize().width + 1);
}
onDevices(['desktop', 'ipad', 'phone'], () => {
  test('Home uses project labels, short dates and readable titles, respecting hidden fields @gate', async ({ page, device }) => {
    await page.goto(app.base);
    await page.locator('.home-grid').waitFor();
    await page.evaluate(async ({ project, hidden }) => {
      const panels = [
        { id: 'cards', type: 'tasks', x: 0, y: 0, w: 8, h: 5, settings: { project } },
        { id: 'by-status', type: 'breakdown', x: 8, y: 0, w: 4, h: 5, settings: { project } },
        { id: 'hidden', type: 'tasks', x: 0, y: 5, w: 12, h: 5, settings: { project: hidden } },
        { id: 'hidden-status', type: 'breakdown', x: 0, y: 10, w: 6, h: 4, settings: { project: hidden } },
        { id: 'priorities', type: 'breakdown', x: 6, y: 10, w: 6, h: 4, settings: { project, by: 'priority' } },
      ];
      await fetch('/api/home', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ panels }) });
    }, { project: app.project.id, hidden: app.hidden.id });
    await page.reload();
    const card = page.locator('[data-panel="cards"] .home-task');
    await expect(card.locator('.home-task-status')).toHaveText(status);
    await expect(page.locator('[data-panel="by-status"] .home-bar > span')).toHaveText(status);
    await expect(page.locator('[data-panel="hidden-status"]')).toContainText('This field is turned off');
    await expect(page.locator('[data-panel="priorities"] .home-bar > span')).toHaveText('Medium');
    await expect(card.locator('.home-task-due')).toHaveText(/5 Nov/);
    await expect(card).toHaveAttribute('title', title);
    await expect(page.locator('[data-panel="hidden"] .home-task')).toBeVisible();
    await expect(page.locator('[data-panel="hidden"] :is(.home-task-status,.home-task-due)')).toHaveCount(0);
    if (device === 'phone') {
      for (const width of [390, 320]) {
        await page.setViewportSize({ width, height: 844 });
        const geometry = await card.evaluate(el => {
          const text = el.querySelector('.home-task-title').getBoundingClientRect(), key = el.querySelector('.home-task-key').getBoundingClientRect();
          return { display: getComputedStyle(el).display, width: text.width, below: key.top >= text.bottom - 1, overflow: el.scrollWidth > el.clientWidth };
        });
        expect(geometry.display).toBe('grid');
        expect(geometry.width).toBeGreaterThan(220);
        expect(geometry.below).toBe(true);
        expect(geometry.overflow).toBe(false);
      }
    } else {
      expect(await page.locator('#home-save').evaluate(el => getComputedStyle(el).fontSize)).toBe(device === 'ipad' ? '12px' : '11px');
    }
  });

  test('filtered planning keeps its recovery visible and leaves calendar days usable @gate', async ({ page, device }) => {
    if (device === 'phone') await page.setViewportSize({ width: 320, height: 740 });
    for (const view of ['timeline', 'calendar']) {
      await page.goto(url(view));
      await (await reveal(page.locator('#search'))).fill('no-such-card');
      const options = page.locator('.mobile-view-options[open] > summary');
      if (await options.isVisible()) await options.click();
      const content = page.locator('#view-content');
      await expect(content).toContainText('No matching cards');
      const clear = content.locator('[data-action="filters-reset"]');
      await expect(clear).toBeVisible();
      await fits(clear, page);
      if (view === 'timeline') expect(await page.locator('.timeline-scroll').evaluate(el => el.scrollLeft)).toBe(0);
      else {
        await (await reveal(page.locator('#calendar-mode'))).selectOption('month');
        if (await options.isVisible()) await options.click();
        await expect(page.locator('.calendar-day').first()).toBeVisible();
        await fits(clear, page);
      }
      await clear.click();
      await expect(content).not.toContainText('No matching cards');
    }
    await (await reveal(page.locator('#calendar-mode'))).selectOption('agenda');
    await (await reveal(page.locator('#agenda-period'))).selectOption('day');
    await (await reveal(page.locator('#agenda-date'))).fill('2026-12-01');
    await expect(page.locator('.calendar-agenda')).toContainText('No cards scheduled in this period.');
    await page.locator('#search').fill('Share');
    await expect(page.locator('.calendar-agenda')).toContainText('No matching cards scheduled in this period.');
    await page.goto(url('calendar', app.empty));
    await expect(page.locator('.calendar-agenda')).toContainText('No cards scheduled in this period.');
    await expect(page.locator('#view-content [data-action="filters-reset"]')).toHaveCount(0);
    await page.goto(url('timeline', app.empty));
    await fits(page.locator('.empty [data-action="task-new"]'), page);
    await expect(page.locator('.empty')).toContainText('No cards yet');
    for (const view of ['list', 'tree']) {
      await page.goto(url(view, app.empty));
      await expect(page.locator('.empty')).toContainText('Choose New → Card');
    }
  });

  test('search hint uses readable shared contrast in both themes @gate', async ({ page }) => {
    for (const theme of ['light', 'dark']) {
      await page.goto(url('list'));
      await page.evaluate(theme => localStorage.setItem('pencils:appearance', JSON.stringify({ theme })), theme);
      await page.reload();
      const search = await reveal(page.locator('#search'));
      const ratio = await search.evaluate(el => {
        const rgb = color => color.match(/[\d.]+/g).slice(0, 3).map(Number);
        const luminance = color => rgb(color).map(c => { c /= 255; return c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4; }).reduce((s, c, i) => s + c * [.2126, .7152, .0722][i], 0);
        let surface = el;
        while (getComputedStyle(surface).backgroundColor === 'rgba(0, 0, 0, 0)') surface = surface.parentElement;
        const a = luminance(getComputedStyle(el, '::placeholder').color), b = luminance(getComputedStyle(surface).backgroundColor);
        return (Math.max(a, b) + .05) / (Math.min(a, b) + .05);
      });
      expect(ratio, theme).toBeGreaterThanOrEqual(4.5);
      await expect(page.locator('meta[name="description"]')).not.toHaveAttribute('content', /offline/i);
    }
  });
});
onDevices(['phone'], () => test('Board bookmark and tools stay directly in the bar at narrow widths @gate', async ({ page }) => {
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto(url('board'));
    const bar = page.locator('.board-toolbar');
    const tools = bar.locator(':scope > [data-board-menu="tools"] > summary');
    const star = bar.locator(':scope > .bookmark-button');
    await expect(tools).toBeVisible();
    await expect(star).toBeVisible();
    const presence = bar.locator(':scope > #canvas-presence');
    const boxes = await Promise.all([presence, star, tools].map(el => el.boundingBox()));
    expect(boxes[0].x + boxes[0].width).toBeLessThanOrEqual(boxes[1].x + 1);
    expect(boxes[1].x + boxes[1].width).toBeLessThanOrEqual(boxes[2].x + 1);
    for (const el of [star, tools]) { await fits(el, page); expect((await el.boundingBox()).height).toBeGreaterThanOrEqual(44); }
    await tools.click();
    await expect(bar.locator('[data-board-menu="tools"]')).toHaveAttribute('open', '');
    await expect(bar.locator('.mobile-view-options')).toHaveCount(0);
    await expect(bar.locator('[data-board-menu="tools"] .board-save')).toBeVisible();
    await expect(bar.locator('.mobile-view-options .bookmark-button')).toHaveCount(0);
    await page.keyboard.press('Escape');
    await page.setViewportSize({ width: 1024, height: 768 });
    await expect(tools).toBeVisible();
    await expect(page.locator(".topbar .bookmark-button")).toBeVisible();
  }
}));
