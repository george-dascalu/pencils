// Owner request: each Week board cell creates a card inline, inheriting its day and group.
import { test, expect, useApp, onDevices } from '../fixtures.mjs';
import { reveal } from '../helpers/menu-controls.mjs';

test.use({ allowErrors: [/503/] });
const day = '2026-11-05';
const app = useApp(async store => {
  const project = await store.createProject({ title: 'Inline week', key: 'IW', schema: { tags: [{ name: 'Home' }] } });
  await store.createTask(project.id, { title: 'Assigned card', assignee: 'Ann', due: day });
  return { project };
});
async function open(page, group = 'daypart') {
  await page.clock.setFixedTime(new Date('2026-11-04T12:00:00'));
  await page.goto(`${app.base}/#project/${app.project.id}/calendar`);
  await (await reveal(page.locator('#calendar-mode'))).selectOption('board');
  await (await reveal(page.locator('#week-board-rows'))).selectOption(group);
  if (await page.locator('.mobile-view-options[open]').count()) await page.getByRole('button', { name: 'Close view options', exact: true }).click();
  await page.getByRole('button', { name: 'Hide Unscheduled', exact: true }).click();
}
const cell = (page, value) => page.locator(`.week-board-cell[data-calendar-date="${day}"][data-week-board-value="${value}"]`);
const saved = async title => (await app.store.snapshot(app.project.id)).tasks.filter(t => t.title === title);

onDevices(['desktop', 'ipad', 'phone'], () => {
  test('each cell has a plus that creates inline with its date and time of day', { tag: '@gate' }, async ({ page, device }) => {
    await open(page);
    expect(await page.locator('[data-week-board-add]').count()).toBe(await page.locator('.week-board-cell').count());
    const target = cell(page, 'afternoon'), plus = target.getByRole('button', { name: /Add card/ });
    await plus.click();
    const form = target.locator('form'), input = form.getByRole('textbox', { name: 'Card title', exact: true });
    await expect(form).toBeVisible();
    await expect(form).toHaveCSS('display', 'flex');
    await expect(form).toHaveCSS('border-top-style', 'solid');
    await expect(page.locator('.task-dialog')).toHaveCount(0);
    if (device === 'desktop') await expect(input).toBeFocused();
    else await expect(input).not.toBeFocused();
    const title = `Inline ${device}`;
    await input.fill(title);
    // The title and buttons fit even in a narrow day column, at shared control height.
    expect(await form.evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
    for (const button of await form.locator('button').all()) {
      expect(await button.evaluate(el => el.getBoundingClientRect().height >= parseFloat(getComputedStyle(el).getPropertyValue('--control-height')))).toBe(true);
    }
    if (device === 'desktop') await input.press('Enter');
    else await form.getByRole('button', { name: 'Create card', exact: true }).click();
    await expect(target.locator('.week-board-title', { hasText: title })).toBeVisible();
    await expect(form).toHaveCount(0);
    const [record] = await saved(title);
    expect(record).toMatchObject({ start: day, due: day, start_time: '13:00', due_time: '14:00' });
    await page.reload();
    await expect(target.locator('.week-board-title', { hasText: title })).toBeVisible();
  });
});

for (const [group, value, fields] of [
  ['status', 'done', { status: 'done' }], ['priority', 'high', { priority: 'high' }],
  ['tags', 'Home', { tags: ['Home'] }], ['type', 'task', { type: 'task' }],
  ['assignee', 'Ann', { assignee: 'Ann' }], ['none', '', {}],
]) test(`inline creation inherits the ${group} row`, async ({ page }) => {
  await open(page, group);
  const target = cell(page, value), title = `Row ${group}`;
  await target.getByRole('button', { name: /Add card/ }).click();
  await target.getByRole('textbox', { name: 'Card title' }).fill(title);
  await target.getByRole('button', { name: 'Create card', exact: true }).click();
  await expect(target.locator('.week-board-title', { hasText: title })).toBeVisible();
  expect(await saved(title)).toHaveLength(1);
  expect((await saved(title))[0]).toMatchObject({ due: day, ...fields });
});

test('Escape cancels an inline draft without creating a card', async ({ page }) => {
  await open(page);
  const target = cell(page, 'morning');
  await target.getByRole('button', { name: /Add card/ }).click();
  const input = target.getByRole('textbox', { name: 'Card title' });
  await input.fill('Cancelled draft');
  await input.press('Escape');
  await expect(input).toHaveCount(0);
  await expect(target.getByRole('button', { name: /Add card/ })).toBeFocused();
  expect(await saved('Cancelled draft')).toHaveLength(0);
});

test('a failed inline save keeps its title and retries without duplicating a created card', async ({ page }) => {
  await open(page);
  let calls = 0;
  await page.route('**/tasks', async route => {
    if (route.request().method() !== 'POST' || calls++) return route.continue();
    // The server accepted the card, but the response was lost. Retrying must be idempotent.
    await route.fetch();
    await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'Try again' }) });
  });
  const target = cell(page, 'morning');
  await target.getByRole('button', { name: /Add card/ }).click();
  await target.getByRole('textbox', { name: 'Card title' }).fill('Retry inline');
  await target.getByRole('button', { name: 'Create card', exact: true }).click();
  await expect(target.getByRole('alert')).toContainText('Try again');
  await expect(target.getByRole('textbox', { name: 'Card title' })).toHaveValue('Retry inline');
  await target.getByRole('button', { name: 'Create card', exact: true }).click();
  await expect(target.locator('form')).toHaveCount(0);
  expect(await saved('Retry inline')).toHaveLength(1);
});
