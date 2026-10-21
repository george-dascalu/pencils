import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { chromium, firefox } from 'playwright';
import AxeBuilder from '@axe-core/playwright';
import { Store } from '../server/store.js';
import { createServer } from '../server/index.js';
import { BOARD_LIMITS } from '../public/board-limits.js';
import { APP_VERSION } from '../public/app-version.js';

const root = await fs.mkdtemp(path.join(os.tmpdir(), 'pencils-save-warning-'));
const store = new Store(root); await store.init();
const project = await store.createProject({ title: 'Save warning' });
const board = (await store.snapshot(project.id)).boards[0];
const frames = Array.from({ length: BOARD_LIMITS.frames + 1 }, (_, i) => ({ id: `frame-${i}`, type: 'frame', text: `Frame ${i}`, x: i ? 10000 + (i % 100) * 200 : 100, y: 100 + Math.floor(i / 100) * 200, w: 160, h: 100 }));
const pending = { url: `/projects/${project.id}/boards/${board.id}`, base: board, local: { ...board, nodes: frames, edges: [] }, generation: 1 };
const server = createServer(store, { productionAssets: process.env.PRODUCTION_ASSETS === '1' });
await new Promise(r => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;
const namespace = (await (await fetch(`${base}/api/session`)).json()).user?.username || 'shared';
const browser = await (process.env.BROWSER === 'firefox' ? firefox : chromium).launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await context.newPage();
const errors = []; page.on('pageerror', e => errors.push(e.message));
await page.addInitScript(({ pending, namespace, id }) => {
  sessionStorage.setItem('pencils:client', 'tab-warning');
  localStorage.setItem(`pencils:pending:${namespace}:tab-warning`, JSON.stringify([pending]));
  localStorage.setItem(`pencils:camera:${id}`, JSON.stringify({ x: 300, y: 180, z: 1 }));
}, { pending, namespace, id: board.id });
const trigger = page.locator('#save-warning-toggle'), details = page.locator('#save-warning-details');
try {
  await page.goto(`${base}/#project/${project.id}/board/${board.id}`);
  await trigger.waitFor();
  await page.waitForFunction(() => document.querySelector('#save-warning-toggle')?.getAttribute('aria-label').includes('Frame limit'));
  assert.match(await page.locator('#save-state .app-version').textContent(), new RegExp(APP_VERSION));
  assert.ok((await page.locator('#save-state').boundingBox()).width < 110, 'Header status stays compact');
  assert.equal(await details.isVisible(), false);
  await trigger.hover(); await details.waitFor({ state: 'visible' });
  assert.match(await details.innerText(), /10,001 frames.*10,000 frames/);
  assert.match(await details.innerText(), /remove extra frames/);
  await details.hover(); await page.waitForTimeout(250);
  assert.equal(await details.isVisible(), true, 'Popover remains readable while hovered');
  await page.keyboard.press('Escape'); await details.waitFor({ state: 'hidden' });
  await page.mouse.move(10, 500); await trigger.focus();
  await details.waitFor({ state: 'visible' });
  assert.equal(await trigger.getAttribute('aria-expanded'), 'true');
  await page.keyboard.press('Escape'); await details.waitFor({ state: 'hidden' });
  await trigger.hover(); await details.waitFor({ state: 'visible' });
  const axe = await new AxeBuilder({ page }).include('#save-state').analyze();
  assert.deepEqual(axe.violations.map(v => v.id), []);
  await page.screenshot({ path: '/tmp/pencils-save-warning-desktop.png' });
  await page.evaluate(() => window.PencilsAppearance.write({ theme: 'dark' }));
  await page.screenshot({ path: '/tmp/pencils-save-warning-dark.png' });
  await page.evaluate(() => window.PencilsAppearance.write({ theme: 'light' }));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: '/tmp/pencils-save-warning-mobile.png' });
  const box = await details.boundingBox();
  assert.ok(box.x >= 0 && box.x + box.width <= 390 && box.y + box.height <= 844);
  assert.ok(await trigger.isVisible(), 'Save warning remains accessible on mobile');
  await page.keyboard.press('Escape'); await details.waitFor({ state: 'hidden' });
  if (process.env.BROWSER !== 'firefox') {
    const cdp = await context.newCDPSession(page), hit = await trigger.boundingBox();
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: hit.x + hit.width/2, y: hit.y + hit.height/2 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await details.waitFor({ state: 'visible' });
    await page.keyboard.press('Escape'); await details.waitFor({ state: 'hidden' });
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.mouse.move(10, 500);
  await trigger.click(); await details.waitFor({ state: 'visible' });
  // Browser drafts remain exportable even if server-only recovery data is unavailable.
  await page.route('**/api/trash', route => route.abort());
  await page.route('**/api/backups', route => route.abort());
  await details.getByRole('button', { name: 'Recovery & backups' }).click();
  await page.getByRole('heading', { name: 'Recovery & backups' }).waitFor();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export draft', exact: true }).click();
  const draft = JSON.parse(await fs.readFile(await (await download).path(), 'utf8'));
  assert.equal(draft.local.nodes.length, BOARD_LIMITS.frames + 1);
  await page.locator('dialog [data-action="dialog-close"]').last().click();
  await page.unroute('**/api/trash'); await page.unroute('**/api/backups');
  // Correct the real server validation failure; the old rejected operation must not recur.
  const frame = page.locator('[data-node="frame-0"]');
  await frame.click({ position: { x: 5, y: 50 } });
  await page.keyboard.press('Delete');
  for (let i = 0; i < 400 && (await store.snapshot(project.id)).boards[0].nodes.length !== BOARD_LIMITS.frames; i++) await page.waitForTimeout(50);
  assert.equal((await store.snapshot(project.id)).boards[0].nodes.length, BOARD_LIMITS.frames);
  await trigger.waitFor({ state: 'hidden' });
  await page.route('**/api/health', route => route.fulfill({ json: { ok: true, version: '99.0.0' } }));
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await page.getByText('Update available', { exact: true }).waitFor();
  assert.match(await page.locator('#save-state .app-version').innerText(), new RegExp(APP_VERSION));
  assert.deepEqual(errors, []);
  console.log('PASS: actionable frame warning, compact header, hover/focus/click/Escape, mobile containment, accessible details, offline draft export and corrected save');
} finally {
  await browser.close(); server.closeAllConnections(); await new Promise(r => server.close(r)); await store.close(); await fs.rm(root, { recursive: true, force: true });
}
