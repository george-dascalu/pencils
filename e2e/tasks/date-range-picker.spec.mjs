// One calendar chooses a card's start and due dates, in the card editor and the row date editor.
import { test, expect, useApp, onDevices } from '../fixtures.mjs';

const app = useApp();
async function seed(dates = {}) {
  const project = await app.store.createProject({ title: 'Range picker' });
  const card = await app.store.createTask(project.id, { title: 'Ranged card', ...dates });
  return { project, card };
}
const saved = (project, card) => async () => (await app.store.snapshot(project.id)).tasks.find(t => t.id === card.id);
const day = (page, value) => page.locator(`#shared-date-picker table [data-date-value="${value}"]`);

onDevices(['desktop', 'phone', 'ipad'], (device) => {
  test('one calendar sets start and due in the card editor, saving once @gate', async ({ page }) => {
    const { project, card } = await seed();
    await page.goto(`${app.base}/#project/${project.id}/list`);
    await page.locator(`[data-action="task-open"][data-id="${card.id}"]:visible`).first().click();
    const form = page.locator('#task-form');
    await expect(form.locator('[data-date-picker]:visible'), 'one calendar button for the pair').toHaveCount(1);
    await page.evaluate(() => { window.__changes = []; for (const n of ['start', 'due']) document.querySelector(`#task-form [name=${n}]`).addEventListener('change', () => window.__changes.push(n)); });
    const requests = [];
    page.on('request', r => { if (r.method() !== 'GET' && r.url().includes('/tasks/')) requests.push(r.postData()); });
    await form.getByRole('button', { name: 'Choose start and due dates', exact: true }).click();
    const picker = page.locator('#shared-date-picker');
    await expect(picker).toBeVisible();
    await expect(picker.locator('[data-date-phase="start"]')).toHaveAttribute('aria-pressed', 'true');
    await day(page, '2026-11-03').click();
    await expect(picker, 'stays open for the due date').toBeVisible();
    await expect(picker.locator('[data-date-phase="due"]')).toHaveAttribute('aria-pressed', 'true');
    await day(page, '2026-11-06').click();
    await expect(picker).toHaveCount(0);
    await expect(form.locator('[name=start]')).toHaveValue('2026-11-03');
    await expect(form.locator('[name=due]')).toHaveValue('2026-11-06');
    const get = saved(project, card);
    await expect.poll(async () => (await get()).due).toBe('2026-11-06');
    expect((await get()).start).toBe('2026-11-03');
    expect(requests.filter(Boolean).length, 'one save for the range').toBe(1);
    expect(await page.evaluate(() => window.__changes), 'each changed field reports its change').toEqual(['start', 'due']);
  });

  test('the range is tinted and only the due date can be changed', async ({ page }) => {
    const { project, card } = await seed({ start: '2026-11-03', due: '2026-11-06' });
    await page.goto(`${app.base}/#project/${project.id}/list`);
    await page.locator(`[data-action="task-open"][data-id="${card.id}"]:visible`).first().click();
    const form = page.locator('#task-form');
    await form.locator('[name=due]').evaluate(el => el.scrollIntoView());
    if (device === 'desktop') await form.locator('[name=due]').click(); else await form.locator('[name=due]').tap();
    const picker = page.locator('#shared-date-picker');
    await expect(picker.locator('[data-date-phase="due"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(picker.locator('td.in-range')).toHaveCount(4);
    const bg = await picker.locator('td.in-range').nth(1).evaluate(el => getComputedStyle(el).backgroundColor);
    expect(bg).not.toBe(await picker.locator('td:not(.in-range):not(.weekend)').first().evaluate(el => getComputedStyle(el).backgroundColor));
    const chip = await picker.locator('[data-date-phase="due"]').boundingBox();
    expect(chip.height).toBeGreaterThanOrEqual(device === 'desktop' ? 32 : 44);
    const box = await picker.boundingBox(), view = page.viewportSize();
    expect(box.x).toBeGreaterThanOrEqual(0); expect(box.x + box.width).toBeLessThanOrEqual(view.width);
    await day(page, '2026-11-09').click();
    await expect(picker).toHaveCount(0);
    const get = saved(project, card);
    await expect.poll(async () => (await get()).due).toBe('2026-11-09');
    expect((await get()).start).toBe('2026-11-03');
  });
});

test('a start after the due date clears the due date; a due before start restarts the range', async ({ page }) => {
  const { project, card } = await seed({ start: '2026-11-03', due: '2026-11-04' });
  await page.goto(`${app.base}/#project/${project.id}/list`);
  await page.locator(`[data-action="task-open"][data-id="${card.id}"]:visible`).first().click();
  const form = page.locator('#task-form'), get = saved(project, card);
  await form.getByRole('button', { name: 'Choose start and due dates', exact: true }).click();
  await day(page, '2026-11-10').click();
  await page.locator('[data-date-phase="due"]').click();
  await day(page, '2026-11-02').click(); // before the new start: begins again
  await page.locator('[data-date-phase="due"]').click();
  await day(page, '2026-11-12').click();
  await expect.poll(async () => (await get()).due).toBe('2026-11-12');
  expect((await get()).start).toBe('2026-11-02');
});

test('keys choose the dates; each date clears on its own', async ({ page }) => {
  const { project, card } = await seed({ start: '2026-11-03', due: '2026-11-06' });
  await page.goto(`${app.base}/#project/${project.id}/list`);
  await page.locator(`[data-action="task-open"][data-id="${card.id}"]:visible`).first().click();
  const form = page.locator('#task-form'), button = form.getByRole('button', { name: 'Choose start and due dates', exact: true }), get = saved(project, card);
  await button.focus(); await page.keyboard.press('Enter');
  await expect(day(page, '2026-11-03')).toBeFocused();
  await page.keyboard.press('ArrowRight'); await page.keyboard.press('Enter');
  await expect(page.locator('[data-date-phase="due"]')).toHaveAttribute('aria-pressed', 'true');
  await page.locator('[data-date-phase="due"]').click();
  await page.locator('[data-date-clear]').click();
  await expect(page.locator('[data-date-phase="due"] strong')).toHaveText('No date');
  await page.locator('.task-dialog').first().click({ position: { x: 5, y: 5 } }); // outside keeps the picks
  await expect(page.locator('#shared-date-picker')).toHaveCount(0);
  await expect.poll(async () => (await get()).due ?? null).toBe(null);
  expect((await get()).start).toBe('2026-11-04');
});

test('the row date editor shares the calendar and keeps its validation and source-managed due date', async ({ page }) => {
  const { project, card } = await seed({ start: '2026-11-03', due: '2026-11-04' });
  await page.goto(`${app.base}/#project/${project.id}/list`);
  await page.locator('.row-due').first().click();
  const panel = page.locator('#task-dates-popover');
  await expect(panel.locator('[data-date-picker]:visible')).toHaveCount(1);
  await panel.getByRole('button', { name: 'Choose start and due dates', exact: true }).click();
  await day(page, '2026-11-09').click();
  await expect(page.locator('[data-date-phase="due"] strong')).toHaveText('No date');
  await day(page, '2026-11-11').click();
  await expect(page.locator('#shared-date-picker')).toHaveCount(0);
  await expect(panel).toBeVisible();
  const get = saved(project, card);
  await expect.poll(async () => (await get()).due).toBe('2026-11-11');
  expect((await get()).start).toBe('2026-11-09');
  await expect(panel.locator('.form-error')).toBeHidden();
  await panel.locator('[name=due]').fill('2026-11-01');
  await panel.locator('[name=due]').dispatchEvent('change');
  await expect(panel.locator('.form-error')).toContainText('Due date must be on or after the start date');
});

async function openCard(page, dates) {
  const { project, card } = await seed(dates);
  await page.goto(`${app.base}/#project/${project.id}/list`);
  await page.locator(`[data-action="task-open"][data-id="${card.id}"]:visible`).first().click();
  return { project, card, form: page.locator('#task-form'), get: saved(project, card) };
}

test('with Start turned off the due date keeps its own calendar; with Due off, Start does', async ({ page }) => {
  const { form, get } = await openCard(page, { start: '2026-11-03', due: '2026-11-06' });
  await page.evaluate(() => document.documentElement.setAttribute('data-fields-off', 'start'));
  await expect(form.locator('[data-date-picker]:visible')).toHaveCount(1);
  await form.getByRole('button', { name: 'Choose Due date', exact: true }).click();
  await expect(page.locator('[data-date-phase]'), 'single-field calendar').toHaveCount(0);
  await day(page, '2026-11-12').click();
  await expect.poll(async () => (await get()).due).toBe('2026-11-12');
  expect((await get()).start).toBe('2026-11-03');
  await page.evaluate(() => document.documentElement.setAttribute('data-fields-off', 'due'));
  await expect(form.locator('[data-date-picker]:visible')).toHaveCount(1);
  await form.locator('[data-date-picker]:visible').click();
  await expect(page.locator('[data-date-phase]')).toHaveCount(0);
  await day(page, '2026-11-04').click();
  await expect.poll(async () => (await get()).start).toBe('2026-11-04');
  expect((await get()).due).toBe('2026-11-12');
});

test('clicking either input switches to its date and only closes when it is already the one being set', async ({ page }) => {
  const { form } = await openCard(page, { start: '2026-11-03', due: '2026-11-06' });
  const picker = page.locator('#shared-date-picker'), phase = n => picker.locator(`[data-date-phase="${n}"]`);
  await form.locator('[name=start]').click();
  await expect(phase('start')).toHaveAttribute('aria-pressed', 'true');
  await form.locator('[name=due]').click();
  await expect(phase('due')).toHaveAttribute('aria-pressed', 'true');
  await form.locator('[name=start]').click();
  await expect(picker, 'switches, stays open').toHaveCount(1);
  await expect(phase('start')).toHaveAttribute('aria-pressed', 'true');
  await form.locator('[name=start]').click();
  await expect(picker).toHaveCount(0);
  await form.locator('[name=due]').click();
  await form.locator('[name=start]').click();
  await form.locator('[name=due]').click();
  await expect(picker).toHaveCount(1);
  await expect(phase('due')).toHaveAttribute('aria-pressed', 'true');
  await form.locator('[name=due]').click();
  await expect(picker).toHaveCount(0);
});

test('Escape discards the staged picks; clicking outside keeps them', async ({ page }) => {
  const { form, get } = await openCard(page, { start: '2026-11-03', due: '2026-11-06' });
  const button = form.getByRole('button', { name: 'Choose start and due dates', exact: true });
  await page.evaluate(() => { window.__changes = 0; document.querySelector('#task-form').addEventListener('change', () => window.__changes++); });
  await button.click();
  await day(page, '2026-11-04').click();
  await page.keyboard.press('Escape');
  await expect(page.locator('#shared-date-picker')).toHaveCount(0);
  await expect(button).toBeFocused();
  await expect(form.locator('[name=start]')).toHaveValue('2026-11-03');
  expect(await page.evaluate(() => window.__changes)).toBe(0);
  await button.click();
  await day(page, '2026-11-04').click();
  await page.locator('.task-dialog h2, .task-dialog').first().click({ position: { x: 5, y: 5 } });
  await expect(page.locator('#shared-date-picker')).toHaveCount(0);
  await expect.poll(async () => (await get()).start).toBe('2026-11-04');
});

test('picks are dropped, not written to stale fields, when the editor is re-rendered under an open calendar', async ({ page }) => {
  const { form, get } = await openCard(page, { start: '2026-11-03', due: '2026-11-06' });
  await form.getByRole('button', { name: 'Choose start and due dates', exact: true }).click();
  await day(page, '2026-11-04').click();
  await page.evaluate(() => { window.__changes = 0; document.addEventListener('change', () => window.__changes++, true); document.querySelector('.task-date-range').remove(); });
  await expect(page.locator('#shared-date-picker')).toHaveCount(0);
  expect(await page.evaluate(() => window.__changes)).toBe(0);
  expect((await get()).start).toBe('2026-11-03');
});

test('days outside each field\'s min and max, and starts after a locked due date, are disabled', async ({ page }) => {
  const { form } = await openCard(page, { start: '2026-11-03', due: '2026-11-10' });
  await form.locator('[name=due]').evaluate(el => { el.max = '2026-11-20'; });
  await form.getByRole('button', { name: 'Choose start and due dates', exact: true }).click();
  await page.locator('[data-date-phase=due]').click();
  await expect(day(page, '2026-11-20')).toBeEnabled();
  await expect(day(page, '2026-11-21')).toBeDisabled();
  await page.keyboard.press('Escape');
  await form.locator('[name=due]').evaluate(el => { el.disabled = true; });
  await form.getByRole('button', { name: 'Choose start and due dates', exact: true }).click();
  await expect(page.locator('[data-date-phase=due]')).toBeDisabled();
  await expect(day(page, '2026-11-10')).toBeEnabled();
  await expect(day(page, '2026-11-11')).toBeDisabled();
});

test('the calendar opens, and switches phase, with focus on an enabled day when the current value is outside the limits', async ({ page }) => {
  const { form } = await openCard(page, { start: '2026-11-03', due: '2026-11-25' });
  await form.locator('[name=due]').evaluate(el => { el.max = '2026-11-20'; });
  await form.getByRole('button', { name: 'Choose start and due dates', exact: true }).click();
  await page.locator('[data-date-phase=due]').click();
  await expect(day(page, '2026-11-25')).toBeDisabled();
  await expect(day(page, '2026-11-20')).toBeEnabled();
  await expect(day(page, '2026-11-20'), 'the nearest allowed day takes the tab stop').toHaveAttribute('tabindex', '0');
  await page.keyboard.press('Tab');
  await page.keyboard.press('Escape');
  await form.locator('[name=due]').evaluate(el => { el.disabled = true; });
  await form.locator('[name=start]').evaluate(el => { el.value = '2026-11-28'; });
  await form.getByRole('button', { name: 'Choose start and due dates', exact: true }).click();
  await expect(day(page, '2026-11-28')).toBeDisabled();
  await expect(day(page, '2026-11-25')).toBeFocused();
});
