import { _electron as electron } from 'playwright';
import { createRequire } from 'node:module';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect, useApp } from '../fixtures.mjs';

const require = createRequire(import.meta.url), root = fileURLToPath(new URL('../../', import.meta.url));
const app = useApp(async store => {
  const project = await store.createProject({ title: 'Desktop workspace' });
  const card = await store.createTask(project.id, { title: 'Desktop card' });
  return { project, card };
});
let native, profile;
test.beforeEach(async ({ browserName }) => {
  test.skip(browserName !== 'chromium', 'Electron includes its own Chromium runtime.');
  profile = await fs.mkdtemp(path.join(os.tmpdir(), 'pencils-electron-'));
});
test.afterEach(async () => {
  await native?.close(); native = null;
  if (profile) await fs.rm(profile, { recursive: true, force: true, maxRetries: 3 });
});
async function launch(server = app.base) {
  const { ELECTRON_RUN_AS_NODE, ...env } = process.env;
  native = await electron.launch({ executablePath: process.env.PENCILS_DESKTOP_EXECUTABLE || require('electron'), args: process.env.PENCILS_DESKTOP_EXECUTABLE ? [] : [root], env: { ...env, PENCILS_SERVER_URL: server, PENCILS_DESKTOP_USER_DATA: profile } });
  return native;
}
async function workspace() {
  await expect.poll(() => native.windows().some(page => page.url().startsWith(app.base))).toBe(true);
  const page = native.windows().find(page => page.url().startsWith(app.base));
  await expect(page.locator('.topbar')).toBeAttached();
  await expect.poll(() => native.evaluate(({ BrowserWindow }, base) => {
    const windows = BrowserWindow.getAllWindows();
    return windows.length === 1 && windows[0].webContents.getURL().startsWith(base) && windows[0].isVisible();
  }, app.base)).toBe(true);
  return page;
}

test('the native app loads the shared workspace, saves a card and keeps renderer privileges isolated', async () => {
  await launch(); const page = await workspace();
  await page.goto(`${app.base}/#project/${app.project.id}/list`);
  await page.locator(`[data-action="task-open"][data-id="${app.card.id}"]:visible`).first().click();
  await expect(page.locator('#task-form')).toBeVisible();
  await page.locator('#task-form [name="title"]').fill('Edited in Electron');
  await page.locator('#task-form [name="title"]').press('Tab');
  await expect.poll(async () => (await app.store.snapshot(app.project.id)).tasks.find(t => t.id === app.card.id)?.title).toBe('Edited in Electron');
  expect(await page.evaluate(() => [typeof window.require, typeof window.process, typeof window.pencilsConnection])).toEqual(['undefined', 'undefined', 'undefined']);
  const prefs = await native.evaluate(({ BrowserWindow }, base) => BrowserWindow.getAllWindows().find(win => win.webContents.getURL().startsWith(base)).webContents.getLastWebPreferences(), app.base);
  expect(prefs).toMatchObject({ nodeIntegration: false, contextIsolation: true, sandbox: true, webSecurity: true, webviewTag: false });
  await page.screenshot({ path: test.info().outputPath('pencils-desktop-workspace.png') });
});

test('an unreachable server has an accessible retry screen and accepts a working address', async () => {
  await launch('http://127.0.0.1:1');
  const page = await native.firstWindow();
  await expect(page.locator('#connection-status')).toHaveAttribute('data-error', '');
  await expect(page.getByLabel('Server address')).toBeEditable();
  await page.getByLabel('Server address').fill('file:///etc/passwd');
  await page.getByRole('button', { name: 'Connect', exact: true }).click();
  await expect(page.locator('#connection-status')).toContainText('server address');
  await page.screenshot({ path: test.info().outputPath('pencils-desktop-connection.png') });
  await page.getByLabel('Server address').fill(app.base);
  await page.getByRole('button', { name: 'Connect', exact: true }).click();
  await workspace();
  const saved = JSON.parse(await fs.readFile(path.join(profile, 'desktop.json'), 'utf8'));
  expect(saved.server).toBe(app.base);
});

test('server, window size and browser preferences survive closing and reopening the app', async () => {
  await launch(); const page = await workspace();
  await page.evaluate(() => localStorage.setItem('desktop-persistence-check', 'kept'));
  await native.evaluate(({ BrowserWindow }, base) => BrowserWindow.getAllWindows().find(win => win.webContents.getURL().startsWith(base)).setBounds({ width: 1000, height: 700 }), app.base);
  // Wayland applies the compositor's size asynchronously; close only after the resize lands.
  await expect.poll(() => native.evaluate(({ BrowserWindow }, base) => BrowserWindow.getAllWindows().find(win => win.webContents.getURL().startsWith(base)).getNormalBounds().width, app.base)).toBe(1000);
  await native.close(); native = null;
  expect(JSON.parse(await fs.readFile(path.join(profile, 'desktop.json'), 'utf8')).bounds).toMatchObject({ width: 1000, height: 700 });
  await launch(''); const restored = await workspace();
  expect(await restored.evaluate(() => localStorage.getItem('desktop-persistence-check'))).toBe('kept');
  await expect.poll(() => native.evaluate(({ BrowserWindow }, base) => {
    const { width, height } = BrowserWindow.getAllWindows().find(win => win.webContents.getURL().startsWith(base)).getNormalBounds();
    return { width, height };
  }, app.base)).toEqual({ width: 1000, height: 700 });
});

test('unsafe links and untrusted navigation cannot replace the app or create privileged windows', async () => {
  await launch(); const page = await workspace();
  const before = page.url();
  await native.evaluate(({ shell }) => { globalThis.openedLinks = []; shell.openExternal = async url => { globalThis.openedLinks.push(url); }; });
  await page.evaluate(() => { window.open('file:///etc/passwd'); window.open('javascript:alert(1)'); });
  await expect.poll(() => native.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length)).toBe(1);
  expect(await native.evaluate(() => globalThis.openedLinks)).toEqual([]);
  await page.evaluate(() => { const link = document.createElement('a'); link.href = 'data:text/html,<h1>Untrusted</h1>'; document.body.append(link); link.click(); link.remove(); });
  expect(page.url()).toBe(before);
  await page.evaluate(() => window.open('https://example.com/notes'));
  await expect.poll(() => native.evaluate(() => globalThis.openedLinks)).toEqual(['https://example.com/notes']);
});

test('workspace exports download through Electron without navigating away', async () => {
  await launch(); const page = await workspace(), before = page.url(), destination = path.join(profile, 'export.md');
  await native.evaluate(({ session }, destination) => {
    session.defaultSession.once('will-download', (_event, item) => item.setSavePath(destination));
  }, destination);
  await page.evaluate(() => {
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob(['# Desktop export\n'], { type: 'text/markdown' }));
    link.download = 'export.md'; document.body.append(link); link.click(); link.remove();
  });
  await expect.poll(() => fs.readFile(destination, 'utf8').catch(() => '')).toBe('# Desktop export\n');
  expect(page.url()).toBe(before);
});
