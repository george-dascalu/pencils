// LAN HTTP has no native randomUUID: inline creation and an uncertain save retry must persist once.
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

onDevices(['desktop', 'phone'], () => test('without native randomUUID, an inline save retries without duplicating a created card', { tag: '@gate' }, async ({ page, device }) => {
  // Match the API surface of a plain-HTTP LAN origin on every test host.
  await page.addInitScript(() => Object.defineProperty(crypto, 'randomUUID', { value: undefined }));
  await open(page);
  expect(await page.evaluate(() => typeof crypto.randomUUID)).toBe('undefined');
  const requests = [];
  let calls = 0;
  await page.route('**/tasks', async route => {
    if (route.request().method() !== 'POST') return route.continue();
    requests.push(route.request().postDataJSON().creation_request);
    if (calls++) return route.continue();
    // The server accepted the card, but the response was lost. Retrying must be idempotent.
    await route.fetch();
    await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'Try again' }) });
  });
  const target = cell(page, 'morning');
  await target.getByRole('button', { name: /Add card/ }).click();
  const title = `Retry inline ${device}`;
  await target.getByRole('textbox', { name: 'Card title' }).fill(title);
  await target.getByRole('button', { name: 'Create card', exact: true }).click();
  await expect(target.getByRole('alert')).toContainText('Try again');
  await expect(target.getByRole('textbox', { name: 'Card title' })).toHaveValue(title);
  await target.getByRole('button', { name: 'Create card', exact: true }).click();
  await expect(target.locator('form')).toHaveCount(0);
  expect(await saved(title)).toHaveLength(1);
  expect(requests).toHaveLength(2);
  expect(requests[0]).toMatch(/^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/);
  expect(requests[1]).toBe(requests[0]);
  await page.reload();
  await expect(target.locator('.week-board-title', { hasText: title })).toBeVisible();
}));

