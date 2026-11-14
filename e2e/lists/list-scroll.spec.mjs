import { test, expect, useApp, onDevices } from '../fixtures.mjs';

// Chromium normally hides native scrollbars, masking an unusable scroll track.
test.use({
  launchOptions: [async ({ browserName, launchOptions }, use) => use(browserName === 'chromium' ? { ...launchOptions, ignoreDefaultArgs: ['--hide-scrollbars'] } : launchOptions), { scope: 'worker' }],
});
const app = useApp(async store => {
  const project = await store.createProject({ title: 'Scrollable List' });
  for (let i = 0; i < 70; i++) await store.createTask(project.id, { title: `Card ${i}`, status: i < 25 ? 'todo' : i < 50 ? 'in-progress' : 'done' });
  return { project };
});
const list = page => page.locator('#view-content');
const toggle = page => page.locator('.list-group [data-list-group-toggle]').first();
async function open(page) {
  await page.goto(`${app.base}/#project/${app.project.id}/list`);
  await toggle(page).waitFor();
}
async function fits(page) {
  const size = await list(page).evaluate(el => ({
    bottom: el.getBoundingClientRect().bottom, height: innerHeight,
    documentHeight: document.documentElement.scrollHeight,
    overflow: getComputedStyle(el).overflowY,
  }));
  expect(size.overflow).toBe('auto');
  expect(size.bottom).toBeLessThanOrEqual(size.height + 1);
  expect(size.documentHeight).toBeLessThanOrEqual(size.height + 1);
}
async function wheel(page) {
  await list(page).evaluate(el => { el.scrollTop = 0; });
  const r = await list(page).boundingBox();
  await page.mouse.move(r.x + r.width / 2, r.y + 150);
  await page.mouse.wheel(0, 350);
  await expect.poll(() => list(page).evaluate(el => el.scrollTop)).toBeGreaterThan(100);
}

test('List scrolls by wheel before and after collapsing, expanding and filtering groups @gate', async ({ page }) => {
  await open(page);
  await wheel(page);
  await fits(page);
  await toggle(page).click();
  await expect(toggle(page)).toHaveAttribute('aria-expanded', 'false');
  await wheel(page);
  await toggle(page).click();
  await wheel(page);
  await page.locator('#search').fill('Card 69');
  await expect(page.locator('.task-row:visible')).toHaveCount(1);
  await fits(page);
  expect(await list(page).evaluate(el => el.scrollHeight - el.clientHeight)).toBeLessThanOrEqual(1);
  await page.locator('#search').fill('');
  await expect(page.locator('.task-row:visible')).toHaveCount(70);
  await wheel(page);
});

test('the native List scrollbar stays within the window and can be dragged @gate', async ({ page, browserName }) => {
  await open(page);
  for (const width of [1440, 860]) {
    await page.setViewportSize({ width, height: 800 });
    await fits(page);
    const m = await list(page).evaluate(async el => {
      el.scrollTop = 0;
      // Native hit testing uses the painted thumb. After a resize or scroll reset,
      // layout can report its new geometry before the compositor has moved it.
      await new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done)));
      const r = el.getBoundingClientRect();
      return { x: r.x, y: r.y, width: r.width, height: el.clientHeight, full: el.scrollHeight, gutter: el.offsetWidth - el.clientWidth };
    });
    // Overlay scrollbars have no track to grab. Chromium's real scrollbar must have one.
    if (browserName === 'chromium') expect(m.gutter).toBeGreaterThan(0);
    if (m.gutter) {
      const x = m.x + m.width - m.gutter / 2, y = m.y + m.height * m.height / m.full / 2;
      await page.mouse.move(x, y); await page.mouse.down();
      await page.mouse.move(x, y + 150, { steps: 10 }); await page.mouse.up();
      await expect.poll(() => list(page).evaluate(el => el.scrollTop)).toBeGreaterThan(100);
    }
    await list(page).evaluate(el => { el.scrollTop = el.scrollHeight; });
    await expect(page.locator('.task-row').last()).toBeInViewport();
  }
});

onDevices(['phone', 'ipad'], () => test('List keeps its last card clear of the bottom bar after a saved collapse', async ({ page }) => {
  await open(page);
  await toggle(page).click();
  await page.reload();
  await expect(toggle(page)).toHaveAttribute('aria-expanded', 'false');
  await fits(page);
  await list(page).evaluate(el => { el.scrollTop = el.scrollHeight; });
  expect(await list(page).evaluate(el => el.scrollTop)).toBeGreaterThan(100);
  const last = await page.locator('.task-row:visible').last().boundingBox();
  const bar = await page.locator('.topbar .tabs').boundingBox();
  expect(last.y + last.height).toBeLessThanOrEqual(bar.y);
}));
