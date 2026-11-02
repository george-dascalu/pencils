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
    await expect(toggle).toHaveAttribute('title', 'All day');
    await expect(toggle.locator('svg')).toBeVisible();
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

  test('the date popover uses the same All day icon and clearing dates resets it @gate', async ({ page, device }) => {
    const { project, card } = await seed();
    await page.goto(`${app.base}/#project/${project.id}/list`);
    const row = page.locator(`[data-task-order-row="${card.id}"]`);
    await row.locator('[data-row-dates]:visible').click();
    const form = page.locator('#task-dates-form'), toggle = form.getByRole('button', { name: 'All day', exact: true });
    await expect(toggle).toHaveAttribute('aria-pressed', 'false');
    await toggle.click();
    await expect(form.getByLabel('End time', { exact: true })).toBeHidden();
    await toggle.click();
    await expect(form.getByLabel('End time', { exact: true })).toBeVisible();
    await form.locator('[data-task-dates-clear]').click();
    await expect(toggle).toHaveAttribute('aria-pressed', 'true');
    await expect(form.getByLabel('End time', { exact: true })).toBeHidden();
    await expect.poll(async () => (await app.store.snapshot(project.id)).tasks.find(t => t.id === card.id).due).toBe(null);
  });
});
