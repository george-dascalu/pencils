import { test, expect, onDevices, useApp } from '../fixtures.mjs';
import { browserTabShortcuts } from '../helpers/browser-tab-shortcuts.mjs';
const app = useApp(async store => {
  const project = await store.createProject({ title: 'Shortcut lab', key: 'HK' });
  return { project, doc: await store.createDocument(project.id, { title: 'Planning notes', body: '# Plan' }) };
});
const record = (page, name) => page.getByRole('button', { name: `Shortcut for ${name}`, exact: true });
const list = async page => (await (await page.request.get(`${app.base}/api/hotkeys`)).json()).items;
async function open(page) {
  await page.request.patch(`${app.base}/api/hotkeys`, { data: { items: [] } });
  await page.request.post(`${app.base}/api/bookmarks`, { data: { kind: 'doc', project: app.project.id, id: app.doc.id } });
  await page.goto(`${app.base}/#project/${app.project.id}/settings/hotkeys`);
  await record(page, 'New card').waitFor();
}
onDevices(['desktop', 'ipad', 'phone'], () => test('personal hotkeys record commands and bookmarks, show conflicts and persist', async ({ page }) => {
  await open(page);
  const create = record(page, 'New card');
  await create.click(); await page.keyboard.press('Control+Alt+n');
  await expect(create).toContainText(/(?:Ctrl|⌘) \+ Alt \+ N/);
  await expect.poll(() => list(page)).toHaveLength(1);
  const bookmarked = record(page, 'Planning notes · Shortcut lab');
  await bookmarked.click(); await page.keyboard.press('Control+Alt+n');
  await expect(page.locator('[data-hotkey-message]')).toContainText('Already used by New card');
  await page.keyboard.press('Control+w');
  await expect(page.locator('[data-hotkey-message]')).toContainText('reserved');
  await page.keyboard.press('Control+Alt+d');
  await expect(bookmarked).toContainText('Alt + D');
  await page.reload(); await expect(create).toContainText('Alt + N');
  await page.keyboard.press('Control+Alt+n');
  await expect(page.locator('#task-form')).toBeVisible();
  await page.keyboard.press('Escape');
  await page.keyboard.press('Control+Alt+d');
  await expect(page).toHaveURL(new RegExp(`/documents/${app.doc.id}$`));
  await expect(page.locator('.cm-editor')).toBeVisible();
  await page.goto(`${app.base}/#project/${app.project.id}/settings/hotkeys`);
  await expect(create).toContainText('Alt + N');
  const search = page.locator('[data-hotkey-search]');
  await search.fill('New card'); await page.keyboard.press('Control+Alt+n');
  await expect(page.locator('#task-form')).toHaveCount(0);
  await search.fill('');
  await create.click(); await browserTabShortcuts(create);
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Clear shortcut for New card', exact: true }).click();
  await expect(create).toHaveText('Set hotkey');
  await page.getByRole('button', { name: 'Reset hotkeys', exact: true }).click();
  await expect.poll(() => list(page)).toEqual([]);
  // The server has the reset before the page does: wait for the page's own repaint, which
  // replaces the rows measured below.
  await expect(page.locator('[data-hotkey-message]')).toHaveText('');
  const box = await page.locator('.hotkeys-settings').boundingBox();
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(page.viewportSize().width);
  for (const theme of ['light', 'dark']) {
    await page.evaluate(theme => window.PencilsAppearance.write({ theme }), theme);
    await expect(create.locator('..')).toHaveCSS('display', 'grid');
    const sizing = await create.evaluate(el => ({ height: el.getBoundingClientRect().height, target: parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--control-height')) }));
    expect(sizing.height).toBeGreaterThanOrEqual(sizing.target);
  }
}));
test('failed saves keep the working shortcut and a command unavailable at Home does not navigate', async ({ page }) => {
  await open(page);
  const create = record(page, 'New card');
  await create.click(); await page.keyboard.press('Control+Alt+n');
  await expect(create).toContainText('Alt + N');
  await page.route('**/api/hotkeys', route => route.request().method() === 'PATCH' ? route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({error: 'Try again later'}) }) : route.continue());
  await create.click(); await page.keyboard.press('Control+Alt+m');
  await expect(page.locator('[data-hotkey-message]')).toHaveText('Try again later');
  await expect(create).toContainText('Alt + N');
  await page.goto(`${app.base}/#home`); await page.locator('.home-grid').waitFor();
  await page.keyboard.press('Control+Alt+n');
  await expect(page.locator('#task-form')).toHaveCount(0);
  await expect(page.locator('#toasts')).toContainText('Open a project');
  await browserTabShortcuts(page.locator('#home-edit'));
});

test('an assigned shortcut stays editable when its project view is disabled', async ({ page }) => {
  await open(page);
  const capacity = record(page, 'Open Capacity view');
  await capacity.click(); await page.keyboard.press('Control+Alt+c');
  await expect(capacity).toContainText('Alt + C');
  const { project } = await app.store.snapshot(app.project.id);
  await app.store.updateProject(project.id, { revision: project.revision, schema: { ...project.schema, views_off: ['capacity'] } });
  await page.reload(); await expect(capacity).toContainText('Alt + C');
  await page.keyboard.press('Control+Alt+c');
  await expect(page).toHaveURL(/settings\/hotkeys$/);
  await expect(page.locator('#toasts')).toContainText('Open a project');
  await page.getByRole('button', { name: 'Clear shortcut for Open Capacity view', exact: true }).click();
  await expect(capacity).toHaveCount(0);
});
