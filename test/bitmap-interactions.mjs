import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { chromium, firefox } from 'playwright';
import { Store } from '../server/store.js';
import { createServer } from '../server/index.js';
import { newGrid } from '../public/grid-model.js';
import { browserTabShortcuts } from './browser-tab-shortcuts.mjs';

const root = await fs.mkdtemp(path.join(os.tmpdir(), 'pencils-bitmap-interactions-'));
const store = new Store(root); await store.init();
const project = await store.createProject({ title: 'Bitmap interactions' });
let board = (await store.snapshot(project.id)).boards[0];
const note = (id, x, y, extra = {}) => ({ id, type: 'sticky', text: id, x, y, w: 400, h: 300, ...extra });
const group = Array.from({ length: 64 }, (_, i) => note(`group-${i}`, 5000 + (i % 8) * 600, 1000 + Math.floor(i / 8) * 450));
board = await store.updateBoard(project.id, board.id, { revision: board.revision,
  nodes: [
    { id: 'frame', type: 'frame', x: 200, y: 1500, w: 1000, h: 700, text: 'Container' },
    note('one', 200, 200), note('two', 1000, 900), note('child', 400, 1750, { frame: 'frame' }),
    { id: 'grid', type: 'grid', x: 2200, y: 1500, w: 600, h: 400, grid: newGrid() },
    note('locked', 3200, 200, { locked: true }),
    ...group,
  ], edges: [], settings: { snap: false, alignObjects: false },
});
const server = createServer(store, { productionAssets: process.env.PRODUCTION_ASSETS === '1' });
await new Promise(r => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await (process.env.BROWSER === 'firefox' ? firefox : chromium).launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = []; page.on('pageerror', e => errors.push(e.message));
await page.addInitScript(id => localStorage.setItem(`pencils:camera:${id}`, JSON.stringify({ x: 150, y: 130, z: .08 })), board.id);
const snapshot = async () => (await store.snapshot(project.id)).boards[0];
async function point(x, y) {
  return page.locator('#canvas').evaluate((el, p) => { const b = el.getBoundingClientRect(), m = new DOMMatrix(document.querySelector('#canvas-world').style.transform); return { x: b.x + m.e + p.x*m.a, y: b.y + m.f + p.y*m.a }; }, { x, y });
}
async function move(x, y, dx, dy) {
  const p = await point(x, y); await page.mouse.move(p.x, p.y); await page.mouse.down();
  await page.mouse.move(p.x+dx, p.y+dy, { steps: 8 }); await page.mouse.up();
}
async function saved(id, x, y) {
  for (let i = 0; i < 100; i++) {
    const n = (await snapshot()).nodes.find(n => n.id === id);
    if (Math.abs(n.x-x)<1 && Math.abs(n.y-y)<1) return;
    await page.waitForTimeout(50);
  }
  assert.fail(`${id} did not save at ${x}, ${y}: ${JSON.stringify((await snapshot()).nodes.find(n => n.id === id))}`);
}
try {
  await page.goto(`${base}/#project/${project.id}/board/${board.id}`);
  await page.waitForFunction(() => document.querySelector('#canvas')?.dataset.objectCount === '70');
  await page.waitForTimeout(1600);
  assert.equal(await page.locator('.board-node').count(), 0);
  const camera = await page.locator('#canvas-world').getAttribute('style');
  await move(400, 350, 40, 24); await saved('one', 700, 500);
  assert.equal(await page.locator('#canvas-world').getAttribute('style'), camera, 'Dragging a bitmap does not pan or zoom');
  const two = await point(1200, 1050);
  await page.keyboard.down('Shift'); await page.mouse.click(two.x, two.y); await page.keyboard.up('Shift');
  assert.deepEqual((await page.locator('.board-node.selected').evaluateAll(els => els.map(el => el.dataset.node))).sort(), ['one', 'two']);
  await move(900, 650, 40, 24);
  await saved('one', 1200, 800); await saved('two', 1500, 1200);
  // Frames are directly draggable from bitmap form, carrying their hidden DOM children.
  await move(250, 1550, 40, 24);
  await saved('frame', 700, 1800); await saved('child', 900, 2050);
  // A materialised frame must not steal a hit on a bitmap child inside it.
  await move(1100, 2200, 24, 16); await saved('child', 1200, 2250);
  const empty = await point(6000, 5000); await page.mouse.click(empty.x, empty.y);
  await move(2500, 1700, 40, 24); await saved('grid', 2700, 1800);
  await page.mouse.click(empty.x, empty.y);
  await move(3400, 350, 40, 24); await saved('locked', 3200, 200);
  assert.equal(await page.locator('[data-node=locked].selected').count(), 1, 'Locked bitmaps can be selected but not moved');
  if (process.env.BROWSER !== 'firefox') {
    // Reload removes unselected detail; actual touch input must hit the bitmap before pan takes over.
    await page.reload(); await page.waitForFunction(() => document.querySelector('#canvas')?.dataset.objectCount === '70');
    await page.waitForTimeout(1600);
    assert.equal(await page.locator('.board-node').count(), 0);
    const cdp = await page.context().newCDPSession(page);
    const p = await point(1400, 950);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: p.x, y: p.y }] });
    for (let i=1;i<=8;i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: p.x+i*5, y: p.y+i*3 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await saved('one', 1700, 1100);
    assert.equal(await page.locator('#canvas-world').getAttribute('style'), camera);
  }
  const blank = await point(4000, 5000); await page.mouse.click(blank.x, blank.y);
  // Marquee a group larger than the detail budget. The hit objects remain bitmap.
  const start = await point(4800, 800), end = await point(9800, 4550);
  await page.mouse.move(start.x, start.y); await page.mouse.down();
  await page.mouse.move(end.x, end.y, { steps: 12 }); await page.mouse.up();
  assert.equal(await page.locator('.selection-filter-total').textContent(), '64');
  assert.equal(await page.locator('[data-node^="group-"]').count(), 0, 'Marquee does not hydrate the selected bitmaps');
  const hull = await page.locator('.multi-resize-box').boundingBox();
  await move(5200, 1150, 40, 24);
  await saved('group-63', group[63].x + 500, group[63].y + 300);
  const moved = (await snapshot()).nodes;
  for (const n of group) {
    const actual = moved.find(x => x.id === n.id);
    assert.equal(actual.x, n.x + 500); assert.equal(actual.y, n.y + 300);
  }
  assert.equal(await page.locator('.selection-filter-total').textContent(), '64');
  assert.equal(await page.locator('.board-node').count(), 0, 'Bulk selections stay in bitmap form after movement');
  const movedHull = await page.locator('.multi-resize-box').boundingBox();
  assert.ok(Math.abs(movedHull.x - hull.x - 40) < 1 && Math.abs(movedHull.y - hull.y - 24) < 1);
  assert.equal(await page.locator('#canvas-world').getAttribute('style'), camera);
  await browserTabShortcuts(page.locator('#canvas'));
  assert.equal(await page.locator('.selection-filter-total').textContent(), '64', 'Browser tab switching leaves the group selected');
  // Shift-marquee adds a bitmap object; locked objects still remain fixed on drag.
  const lockedStart = await point(3100, 100), lockedEnd = await point(3700, 600);
  await page.keyboard.down('Shift');
  await page.mouse.move(lockedStart.x, lockedStart.y); await page.mouse.down();
  await page.mouse.move(lockedEnd.x, lockedEnd.y, { steps: 6 }); await page.mouse.up();
  await page.keyboard.up('Shift');
  assert.equal(await page.locator('.selection-filter-total').textContent(), '65');
  await move(5700, 1450, 24, 16);
  await saved('group-63', group[63].x + 800, group[63].y + 500);
  await saved('locked', 3200, 200);
  await page.keyboard.press('Control+z'); await saved('group-63', group[63].x + 500, group[63].y + 300);
  await page.reload(); await page.waitForFunction(() => document.querySelector('#canvas')?.dataset.objectCount === '70');
  await saved('group-0', group[0].x + 500, group[0].y + 300);
  // Ordinary Tab still performs board navigation.
  await page.locator('#canvas').focus(); await page.keyboard.press('Tab');
  assert.ok(await page.locator('#selection-tools').count());
  assert.deepEqual(errors, []);
  console.log('PASS: bitmap dragging, 64-object marquee/group movement, additive marquee, detail budget, locked objects, undo/persistence, browser Tab shortcuts, frames, grids and touch');
} catch (error) {
  console.error({ errors, selected: await page.locator('.board-node.selected').evaluateAll(els => els.map(el => ({ id: el.dataset.node, style: el.getAttribute('style') }))), tool: await page.locator('.board-tools .active').getAttribute('data-tool') });
  await page.screenshot({ path: '/tmp/pencils-bitmap-failure.png' });
  throw error;
} finally {
  await browser.close(); server.closeAllConnections(); await new Promise(r => server.close(r)); await store.close(); await fs.rm(root, { recursive: true, force: true });
}
