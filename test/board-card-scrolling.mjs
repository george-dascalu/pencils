import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { chromium, firefox } from 'playwright';
import { Store } from '../server/store.js';
import { createServer } from '../server/index.js';

const root = await fs.mkdtemp(path.join(os.tmpdir(), 'pencils-card-scrolling-'));
const store = new Store(root); await store.init();
const project = await store.createProject({ title: 'Card scrolling' });
const task = await store.createTask(project.id, {
  title: 'Collect inspiration and early ideas',
  body: '# Project notes\n\n' + Array.from({ length: 30 }, (_, i) => `## Section ${i + 1}\n\nA paragraph with **formatted text**.\n\n- First idea\n- Another idea`).join('\n\n'),
});
let board = (await store.snapshot(project.id)).boards[0];
board = await store.updateBoard(project.id, board.id, {
  revision: board.revision,
  nodes: [{ id: 'card', type: 'task', task: task.id, x: 150, y: 130, w: 420, h: 360, taskCollapsed: false }], edges: [],
});
const server = createServer(store, { productionAssets: process.env.PRODUCTION_ASSETS === '1' });
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
// Headless Chromium normally hides scrollbars, including their hit targets.
const browser = await (process.env.BROWSER === 'firefox' ? firefox : chromium).launch({ headless: process.env.HEADED !== '1', ignoreDefaultArgs: ['--hide-scrollbars'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } }), errors = [];
page.on('pageerror', error => errors.push(error.message));
const url = `http://127.0.0.1:${server.address().port}/#project/${project.id}/board/${board.id}`;
try {
  await page.addInitScript(id => localStorage.setItem(`pencils:camera:${id}`, JSON.stringify({ x: 0, y: 0, z: 1 })), board.id);
  await page.goto(url);
  const card = page.locator('[data-node=card]'), description = card.locator('.task-card-description');
  await description.waitFor();
  assert.equal(await card.evaluate(el => getComputedStyle(el, '::after').content), 'none');
  const identity = await card.locator('.canvas-task-identity').boundingBox(), title = await card.locator('.task-title').boundingBox();
  assert.ok(title.x - identity.x - identity.width >= 11, 'Identity and title have a visible gap');
  const camera = await page.locator('#canvas-world').getAttribute('style');
  await description.hover(); await page.mouse.wheel(0, 180);
  await page.waitForFunction(() => document.querySelector('.task-card-description').scrollTop > 0);
  assert.equal(await page.locator('#canvas-world').getAttribute('style'), camera);
  await description.evaluate(el => el.scrollTop = el.scrollHeight);
  await page.mouse.wheel(0, 180); await page.waitForTimeout(150);
  assert.equal(await page.locator('#canvas-world').getAttribute('style'), camera, 'At the end of a card, scrolling still does not zoom');
  await description.evaluate(el => el.scrollTop = 0); await page.waitForTimeout(100);
  const hiddenNativeScrollbars = process.env.BROWSER === 'firefox' && process.env.HEADED !== '1' && await description.evaluate(el => getComputedStyle(el).scrollbarWidth === 'none');
  if (hiddenNativeScrollbars) {
    console.log('NOTE: this headless Firefox hides native scrollbars, including in plain scroll areas. Native thumb dragging is covered by Chromium; wheel and zoom checks still run here.');
  } else {
    const bounds = await description.boundingBox();
    await page.mouse.move(bounds.x + bounds.width - 4, bounds.y + 15);
    await page.mouse.down(); await page.mouse.move(bounds.x + bounds.width - 4, bounds.y + 95, { steps: 10 }); await page.mouse.up();
    await page.waitForFunction(() => document.querySelector('.task-card-description').scrollTop > 0);
    assert.ok(await description.evaluate(el => el.scrollTop > 0), 'Native scrollbar can be dragged');
  }
  assert.deepEqual((await store.snapshot(project.id)).boards[0].nodes, board.nodes, 'Scrollbar drag does not move the card');
  if (process.env.CAPTURE_VISUALS === '1') {
    await fs.mkdir('artifacts', { recursive: true });
    for (const theme of ['light', 'dark']) {
      await page.evaluate(theme => window.PencilsAppearance.write({ theme }), theme);
      await description.evaluate(el => el.scrollTop = 0);
      await card.screenshot({ path: `artifacts/card-scrollbars-${theme}.png` });
    }
    const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
    const phone = await mobile.newPage();
    await phone.addInitScript(id => localStorage.setItem(`pencils:camera:${id}`, JSON.stringify({ x: -75, y: 25, z: .7 })), board.id);
    await phone.goto(url); await phone.locator('[data-node=card] .task-card-description').waitFor();
    await phone.screenshot({ path: 'artifacts/card-scrollbars-mobile.png' });
    await mobile.close();
  }
  await description.hover(); await page.keyboard.down('Control'); await page.mouse.wheel(0, 100); await page.keyboard.up('Control');
  await page.waitForFunction(previous => document.querySelector('#canvas-world').getAttribute('style') !== previous, camera);
  assert.deepEqual(errors, []);
  console.log(`PASS: card title gap, no overflow dots, wheel scrolling and boundaries, ${hiddenNativeScrollbars ? '' : 'native scrollbar drag, '}unchanged card position, explicit Ctrl-wheel zoom`);
} finally {
  await browser.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); await store.close(); await fs.rm(root, { recursive: true, force: true });
}
