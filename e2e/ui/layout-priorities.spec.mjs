// Layout refinement: navigation and actionable work lead, with context alongside/below.
import { test, expect, onDevices, useApp } from '../fixtures.mjs';

const app = useApp(async store => {
  const project = await store.createProject({ title: 'Project navigation with a long readable name', key: 'LAY' });
  for (let i = 0; i < 8; i++) await store.createTask(project.id, {
    title: `A long deadline title that still leaves room for its date ${i + 1}`, due: '2026-11-05', assignee: 'Alex',
  });
  const capacity = await store.createProject({ title: 'Capacity layout' });
  await store.createTask(capacity.id, { title: 'Unbroken'.repeat(28), assignee: 'Alexandria Verylonglastname' });
  const empty = await store.createOrganisation({ title: 'Empty workspace' });
  return { project, empty, capacity };
});

onDevices(['desktop', 'ipad', 'phone', 'small'], () => {
  test('Home puts project links within the Projects panel without scrolling past a dashboard', { tag: '@gate' }, async ({ page }) => {
    await page.goto(`${app.base}/#organisation/${app.project.organisation}/home`);
    const panel = page.locator('.home-panel[data-type="projects"]');
    const project = panel.locator(`.project-card[data-id="${app.project.id}"]`);
    await expect(project).toBeVisible();
    const size = await project.evaluate(el => {
      const body = el.closest('.home-panel-body'), box = body.getBoundingClientRect(), r = el.getBoundingClientRect();
      return { top: r.top, bottom: r.bottom, bodyTop: box.top, bodyBottom: box.bottom, scroll: body.scrollTop, height: r.height, control: parseFloat(getComputedStyle(el).getPropertyValue('--control-height')) };
    });
    expect(size.scroll).toBe(0);
    expect(size.top).toBeGreaterThanOrEqual(size.bodyTop);
    expect(size.bottom).toBeLessThanOrEqual(size.bodyBottom);
    expect(size.height).toBeGreaterThanOrEqual(size.control);
    expect(size.bottom).toBeLessThan(page.viewportSize().height - 80);
    await project.click();
    await expect(page.locator('.task-row')).toHaveCount(8);
  });

  test('Overview leads with deadlines, keeps context at its own height and dates on one line', { tag: '@gate' }, async ({ page }) => {
    await page.goto(`${app.base}/#project/${app.project.id}/overview`);
    const list = page.locator('.dashboard-deadlines');
    await expect(list.locator('button')).toHaveCount(8);
    const sizes = await page.evaluate(() => {
      const metrics = document.querySelector('.dashboard-metrics'), cols = document.querySelector('.project-overview-columns'), summary = document.querySelector('.overview-summary'), list = document.querySelector('.dashboard-deadlines'), row = list.querySelector('button'), time = row.querySelector('time');
      const r = el => el.getBoundingClientRect(), range = document.createRange(); range.selectNodeContents(time);
      return { first: cols.firstElementChild.className, align: getComputedStyle(cols).alignItems, gap: parseFloat(getComputedStyle(metrics).gap), metricsHeight: r(metrics).height, firstBottom: r(row).bottom, summaryHeight: r(summary).height, listHeight: r(list).height, dateLines: range.getClientRects().length, nowrap: getComputedStyle(time).whiteSpace, dateRight: r(time).right, rowRight: r(row).right };
    });
    expect(sizes.first).toBe('dashboard-deadlines');
    expect(sizes.align).toBe('start');
    expect(sizes.gap).toBe(8);
    expect(sizes.metricsHeight).toBeLessThan(180);
    expect(sizes.firstBottom).toBeLessThan(page.viewportSize().height - 80);
    expect(sizes.summaryHeight).toBeLessThan(sizes.listHeight);
    expect(sizes.nowrap).toBe('nowrap');
    expect(sizes.dateLines).toBe(1);
    expect(sizes.dateRight).toBeLessThanOrEqual(sizes.rowRight);
    await list.locator('button').first().click();
    await expect(page.locator('#task-form')).toBeVisible();
  });

  test('Capacity separates setup actions and keeps long titles and assignees inside the row', { tag: '@gate' }, async ({ page }) => {
    await page.goto(`${app.base}/#project/${app.capacity.id}/capacity`);
    const actions = page.locator('.capacity-view .empty .button'), row = page.locator('.capacity-backlog .capacity-task').first();
    await expect(actions).toHaveCount(2);
    await expect(row).toBeVisible();
    const boxes = await actions.evaluateAll(els => els.map(el => { const r = el.getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom }; }));
    expect(boxes[1].top >= boxes[0].bottom + 3 || boxes[1].left >= boxes[0].right + 3).toBe(true);
    const size = await row.evaluate(el => {
      const r = el.getBoundingClientRect(), title = el.querySelector(':scope > span'), meta = el.querySelector(':scope > small');
      return { width: el.clientWidth, scroll: el.scrollWidth, right: r.right, metaRight: meta.getBoundingClientRect().right, basis: getComputedStyle(meta).flexBasis, max: getComputedStyle(meta).maxWidth, min: getComputedStyle(title).minWidth, wrap: getComputedStyle(title).overflowWrap };
    });
    expect(size.scroll).toBeLessThanOrEqual(size.width + 1);
    expect(size.metaRight).toBeLessThanOrEqual(size.right);
    expect(size.basis).toBe('auto');
    expect(size.max).toBe('40%');
    expect(size.min).toBe('0px');
    expect(size.wrap).toBe('anywhere');
    await row.click();
    await expect(page.locator('#task-form')).toBeVisible();
  });

  test('Home without projects keeps its creation actions visible and reachable', { tag: '@gate' }, async ({ page }) => {
    await page.goto(`${app.base}/#organisation/${app.empty.id}/home`);
    const panel = page.locator('.home-panel[data-type="projects"]');
    const create = panel.getByRole('button', { name: 'Create a project', exact: true });
    await expect(create).toBeVisible();
    const box = await create.boundingBox(), body = await panel.locator('.home-panel-body').boundingBox();
    expect(box.y + box.height).toBeLessThanOrEqual(body.y + body.height);
    await expect(panel.getByRole('button', { name: /Explore an example/ })).toBeVisible();
    await create.click();
    await expect(page.locator('dialog[open]')).toBeVisible();
  });
});

for (const width of [780, 790, 800, 810]) test(`Help navigation follows its single-column breakpoint at ${width}px`, { tag: '@gate' }, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 });
  await page.goto(`${app.base}/#help/start`);
  const navigation = page.locator('.help-navigation'), article = page.locator('.help-article');
  await expect(article).toBeVisible();
  expect(await navigation.evaluate(el => el.open)).toBe(width > 800);
  expect((await article.boundingBox()).y).toBeLessThan(400);
  if (width <= 800) { await navigation.locator('summary').click(); await expect(navigation).toHaveAttribute('open'); }
});
