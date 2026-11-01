import { test, expect, onDevices, useApp } from '../fixtures.mjs';
import { cancelConfirm } from '../helpers/menu-controls.mjs';

const app = useApp(async (store, app) => ({
  namespace: (await (await fetch(`${app.base}/api/session`)).json()).user.username,
}));

async function openConflict(page) {
  const project = await app.store.createProject({ title: 'Recovery wording' });
  const base = await app.store.createTask(project.id, { title: 'Original title', body: 'Original description' });
  const remote = await app.store.updateTask(project.id, base.id, { revision: base.revision, title: 'Server title', body: 'Description changed on the server' });
  const entry = { url: `/projects/${project.id}/tasks/${base.id}`, base, local: { ...base, title: 'My title', priority: 'high' }, generation: 1,
    error: 'This card changed elsewhere.', conflict: { remote, conflicts: [{ path: 'title', local: 'My title', remote: 'Server title' }] } };
  await page.addInitScript(({ entry, namespace }) => {
    sessionStorage.setItem('pencils:client', 'copy-test');
    localStorage.setItem(`pencils:pending:${namespace}:copy-test`, JSON.stringify([entry]));
  }, { entry, namespace: app.namespace });
  await page.goto(`${app.base}/#project/${project.id}/list`);
  await page.locator('#save-warning-toggle').click();
  await page.locator('#save-warning-details').getByRole('button', { name: 'Recovery & backups' }).click();
  return { project, base };
}

onDevices(['desktop', 'ipad', 'phone'], () => {
  for (const choice of ['my', 'server']) test(`recovery names the ${choice} edits and preserves changes outside the conflict`, async ({ page }) => {
    const { project, base } = await openConflict(page);
    const dialog = page.locator('dialog[open]');
    await expect(dialog).toContainText('This choice applies to the conflicting fields below. Other edits are combined.');
    await expect(dialog).toContainText('Your edit: "My title"');
    await expect(dialog).toContainText('Server version: "Server title"');
    const button = dialog.getByRole('button', { name: `Use ${choice} edits`, exact: true });
    await expect(button).toBeVisible();
    expect(await button.evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
    await button.click();
    await expect(dialog).toContainText('No pending saves in this browser.');
    const saved = (await app.store.snapshot(project.id)).tasks.find(t => t.id === base.id);
    expect(saved.title).toBe(choice === 'my' ? 'My title' : 'Server title');
    expect(saved.body).toBe('Description changed on the server');
    expect(saved.priority).toBe('high');
  });

  test('backup actions name the backup and its confirmation stays usable over Recovery', { tag: '@gate' }, async ({ page }) => {
    await app.store.createBackup('copy check');
    await openConflict(page);
    const restore = page.locator('dialog[open] [data-feature="backup-restore"]').first();
    await expect(restore).toHaveAccessibleName('Restore backup');
    await restore.click();
    const confirm = page.locator('.confirm-popover');
    await expect(confirm).toContainText('All projects and organisations will be replaced by this backup.');
    await expect(confirm).toContainText('A backup of their current contents is created first.');
    await expect(confirm.getByRole('button', { name: 'Restore backup', exact: true })).toBeVisible();
    expect(await confirm.evaluate(el => getComputedStyle(el).position)).toBe('fixed');
    await cancelConfirm(page);
    await expect(page.locator('dialog[open]')).toBeVisible();
    await restore.click();
    await page.keyboard.press('Escape');
    await expect(confirm).toHaveCount(0);
    await expect(page.locator('dialog[open]')).toBeVisible();
    // Follow the confirmation through without replacing the shared fixture's projects.
    let restored = false;
    await page.route('**/api/backups/*', route => {
      if (route.request().method() === 'POST') { restored = true; return route.fulfill({ json: { ok: true } }); }
      return route.continue();
    });
    await restore.click();
    await confirm.getByRole('button', { name: 'Restore backup', exact: true }).click();
    await expect.poll(() => restored).toBe(true);
    await expect(page.getByText('Projects and organisations restored.', { exact: true })).toBeVisible();
  });
});
