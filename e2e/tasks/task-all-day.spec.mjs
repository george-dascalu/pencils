import { test, expect, useApp, onDevices } from '../fixtures.mjs';
import { newCard } from '../helpers/new-card.mjs';

const app = useApp();
async function seed() {
  const project = await app.store.createProject({ title: 'All day toggle' });
  const card = await app.store.createTask(project.id, { title: 'Scheduled card', start: '2026-11-02', due: '2026-11-02', start_time: '09:00', due_time: '10:00' });
  return { project, card };
}
onDevices(['desktop', 'ipad', 'phone'], () => {
  test('All day is an icon beside the dates, toggles times and saves without changing dates @gate', async ({ page, device }) => {
    const { project, card } = await seed();
    await page.goto(`${app.base}/#project/${project.id}/list`);
    await page.locator(`[data-action="task-open"][data-id="${card.id}"]:visible`).first().click();
    const form = page.locator('#task-form'), toggle = form.getByRole('button', { name: 'All day', exact: true });
    await expect(toggle).toHaveAttribute('aria-pressed', 'false');
    await expect(toggle).toHaveAttribute('title', 'Timed — switch to all day');
    await expect(toggle.locator('svg:visible')).toHaveCount(1);
    await expect(toggle.locator('[data-task-time-icon="timed"]')).toHaveCSS('display', 'flex');
    await expect(toggle.locator('[data-task-time-icon="all-day"]')).toHaveCSS('display', 'none');
    await expect(toggle).toHaveText('');
    for (const width of device === 'phone' ? [390, 320] : [page.viewportSize().width]) {
      await page.setViewportSize({ width, height: 844 });
      await expect.poll(async () => (await form.boundingBox()).width).toBeLessThanOrEqual(width);
      const dates = await form.locator('.task-date-range').boundingBox(), button = await toggle.boundingBox();
      expect(button.x).toBeGreaterThanOrEqual(dates.x + dates.width);
      expect(button.x + button.width).toBeLessThanOrEqual(width);
      expect(button.y + button.height / 2).toBeCloseTo(dates.y + dates.height / 2, 0);
      expect(button.width).toBe(button.height);
      expect(button.height).toBeGreaterThanOrEqual(device === 'desktop' ? 32 : 44);
    }
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-pressed', 'true');
    await expect(toggle.locator('[data-task-time-icon="all-day"]')).toHaveCSS('display', 'flex');
    await expect(toggle.locator('[data-task-time-icon="timed"]')).toHaveCSS('display', 'none');
    await expect(form.getByLabel('Start time', { exact: true })).toBeHidden();
    const saved = async () => (await app.store.snapshot(project.id)).tasks.find(t => t.id === card.id);
    await expect.poll(async () => (await saved()).start_time).toBe(null);
    expect((await saved()).start).toBe('2026-11-02');
    expect((await saved()).due).toBe('2026-11-02');
    for (const theme of ['light', 'dark']) {
      await page.evaluate(theme => window.PencilsAppearance.write({ theme }), theme);
      const accent = await toggle.evaluate(el => {
        const probe = document.createElement('span'); probe.style.color = 'var(--green)'; el.append(probe);
        const color = getComputedStyle(probe).color; probe.remove(); return color;
      });
      await expect(toggle).toHaveCSS('border-top-color', accent);
      await expect(toggle).toHaveCSS('background-color', accent);
    }
    await toggle.focus(); await page.keyboard.press('Space');
    await expect(toggle).toHaveAttribute('aria-pressed', 'false');
    await expect(form.getByLabel('Start time', { exact: true })).toHaveValue('09:00');
    await expect(form.getByLabel('Start time', { exact: true })).not.toBeFocused();
    await expect.poll(async () => (await saved()).due_time).toBe('10:00');
    await page.screenshot({ path: `/tmp/all-day-${device}.png` });
    await form.locator('[data-action="dialog-close"]').click();
    await newCard(page);
    await expect(page.locator('#task-form').getByRole('button', { name: 'All day', exact: true })).toHaveAttribute('aria-pressed', 'true');
  });

  test('the date popover leads with All day and previews disabled midnight hours without saving timed values @gate', async ({ page, device }, testInfo) => {
    const { project, card } = await seed();
    await page.goto(`${app.base}/#project/${project.id}/list`);
    const row = page.locator(`[data-task-order-row="${card.id}"]`);
    await row.locator('[data-row-dates]:visible').click();
    const form = page.locator('#task-dates-form'), toggle = form.getByRole('button', { name: 'All day', exact: true });
    await expect(toggle).toHaveAttribute('aria-pressed', 'false');
    await expect(form.locator('header > button').first()).toHaveAttribute('data-task-allday', '');
    const label=form.locator('.task-dates-all-day-label');await expect(label).toHaveText('Timed');
    const geometry=await label.evaluate(el=>{const a=el.getBoundingClientRect(),b=document.getElementById(el.htmlFor).getBoundingClientRect();return{gap:a.left-b.right,centres:Math.abs(a.top+a.height/2-b.top-b.height/2),fits:el.scrollWidth<=el.clientWidth};});expect(geometry.gap).toBeGreaterThanOrEqual(4);expect(geometry.centres).toBeLessThan(1);expect(geometry.fits).toBe(true);
    const start = form.getByLabel('Start time', { exact: true }), end = form.getByLabel('End time', { exact: true });
    await start.fill('13:15'); await end.fill('14:30'); await end.blur();
    await (device==='desktop'?label.click():label.tap());
    await expect(label).toHaveText('All day');
    await expect(label).toHaveCSS('font-weight', '600');
    await expect(toggle).toHaveAttribute('title', 'All day — switch to timed');
    await expect(start).toBeVisible(); await expect(end).toBeVisible();
    await expect(start).toBeDisabled(); await expect(end).toBeDisabled();
    await expect(start).toHaveValue('00:00'); await expect(end).toHaveValue('23:59');
    const saved = async () => (await app.store.snapshot(project.id)).tasks.find(t => t.id === card.id);
    await expect.poll(async () => [(await saved()).start_time, (await saved()).due_time]).toEqual([null, null]);
    const rects = await form.evaluate(el => {
      const allDay = el.querySelector('[data-task-allday]').getBoundingClientRect(), header = el.querySelector('header').getBoundingClientRect();
      return {left:allDay.left, top:allDay.top, headerLeft:header.left, headerTop:header.top, overflow:el.scrollWidth > el.clientWidth};
    });
    expect(Math.abs(rects.left - rects.headerLeft)).toBeLessThanOrEqual(1);
    expect(rects.overflow).toBe(false);
    await page.screenshot({path: testInfo.outputPath('all-day-selected.png')});
    await toggle.click();
    await expect(label).toHaveText('Timed');
    await expect(start).toBeEnabled(); await expect(end).toBeEnabled();
    await expect(start).toHaveValue('13:15'); await expect(end).toHaveValue('14:30');
    await expect.poll(async () => [(await saved()).start_time, (await saved()).due_time]).toEqual(['13:15', '14:30']);
    await form.locator('[data-task-dates-clear]').click();
    await expect(toggle).toHaveAttribute('aria-pressed', 'true');
    await expect(start).toBeVisible(); await expect(end).toBeDisabled();
    await expect(start).toHaveValue('00:00'); await expect(end).toHaveValue('23:59');
    await expect.poll(async () => (await app.store.snapshot(project.id)).tasks.find(t => t.id === card.id).due).toBe(null);
  });
});
