import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { chromium, firefox } from 'playwright';
import { Store } from '../server/store.js';
import { createServer } from '../server/index.js';
import { newGrid } from '../public/grid-model.js';
const root = await fs.mkdtemp(path.join(os.tmpdir(), 'pencils-zoom-transition-'));
const store = new Store(root); await store.init();
const project = await store.createProject({ title: 'Zoom transitions' });
const task = await store.createTask(project.id, { title: 'Original task', body: '# Heading\n\n**Bold** and *italic* notes.\n\n- [ ] Follow up\n\n| A | B |\n| --- | --- |\n| One | Two |' });
let board = (await store.snapshot(project.id)).boards[0];
const nodes = Array.from({ length: 160 }, (_, i) => ({ id: `card-${i}`, type: 'task', task: task.id, taskCollapsed: false, x: (i % 16) * 380, y: Math.floor(i / 16) * 300, w: 320, h: 260 }));
nodes.push({ id: 'grid', type: 'grid', x: 2700, y: 1400, w: 540, h: 312, grid: newGrid() });
board = await store.updateBoard(project.id, board.id, { revision: board.revision, nodes, edges: Array.from({ length: 100 }, (_, i) => ({ id: `edge-${i}`, from: `card-${i}`, to: `card-${i+1}`, routing: 'elbow' })) });
const server = createServer(store, { productionAssets: process.env.PRODUCTION_ASSETS === '1' });
await new Promise(r => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await (process.env.BROWSER === 'firefox' ? firefox : chromium).launch();
const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } });
const errors = []; page.on('pageerror', e => errors.push(e.message));
await page.addInitScript(id => localStorage.setItem(`pencils:camera:${id}`, JSON.stringify({ x: 310, y: 291, z: .1 })), board.id);
async function zoomTo(target) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const current = await page.locator('#canvas-world').evaluate(el => new DOMMatrix(el.style.transform).a);
    if (Math.abs(current - target) < 0.0001) return;
    await page.locator('#canvas').evaluate((canvas, delta) => {
      const b = canvas.getBoundingClientRect();
      canvas.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: delta, clientX: b.x + b.width/2, clientY: b.y + b.height/2 }));
    }, -Math.log(target / current) / .002);
    await page.waitForFunction(() => !document.querySelector('#canvas').classList.contains('zooming'));
  }
  throw new Error(`Zoom did not reach ${target}`);
}
const count = n => page.waitForFunction(n => document.querySelectorAll('.board-node').length === n, n);
try {
  await page.goto(`${base}/#project/${project.id}/board/${board.id}`);
  await page.waitForFunction(() => document.querySelector('#canvas')?.dataset.objectCount === '161');
  await page.waitForTimeout(1600);
  await count(0);
  await page.evaluate(() => {
    window.detailFrames = []; window.edgeFrames = []; window.detailRecording = true; window.motionStates = new Set();
    window.motionObserver = new MutationObserver(records => {
      for (const r of records) if (r.target.dataset?.detailTransition) window.motionStates.add(r.target.dataset.detailTransition);
    });
    window.motionObserver.observe(document.querySelector('#canvas-world'), {subtree:true,attributes:true,attributeFilter:['data-detail-transition']});
    let changed = new Set(), changedEdges = new Set();
    const world = document.querySelector('#canvas-world');
    window.detailObserver = new MutationObserver(records => {
      for (const r of records) for (const el of r.addedNodes) {
        if (el.classList?.contains('board-node')) changed.add(el.dataset.node);
        if (r.target.id === 'canvas-lines' && el.dataset?.edge) changedEdges.add(el.dataset.edge);
      }
    });
    window.detailObserver.observe(world, { childList: true, subtree: true });
    function frame() { window.detailFrames.push(changed.size); window.edgeFrames.push(changedEdges.size); changed = new Set(); changedEdges = new Set(); if (window.detailRecording) requestAnimationFrame(frame); }
    requestAnimationFrame(frame);
  });
  await zoomTo(.24); await count(80);
  const frames = await page.evaluate(() => { window.detailRecording = false; window.detailObserver.disconnect(); return window.detailFrames; });
  assert.ok(Math.max(...frames) <= 4, `No full-board hydration burst: ${Math.max(...frames)} new cards in one frame`);
  assert.ok(frames.filter(n => n > 0).length >= 20, 'Cards are built over successive frames');
  assert.ok(await page.evaluate(() => Math.max(...window.edgeFrames) <= 8), 'Connector detail is also built over successive frames');
  const order = await page.locator('.board-node').evaluateAll(els => els.map(el => el.dataset.node));
  assert.deepEqual(order, nodes.filter(n => order.includes(n.id)).map(n => n.id), 'Incremental rendering preserves stacking order');
  await page.evaluate(() => { window.retainedCard = document.querySelector('.board-node.task'); window.retainedBody = window.retainedCard.querySelector('.board-node-content'); });
  await zoomTo(.1); await count(0);
  assert.deepEqual(await page.evaluate(()=>[...window.motionStates].sort()),['in','out'],'Detail crossfades in both directions');
  assert.equal(await page.evaluate(() => window.retainedCard.isConnected), false);
  await zoomTo(.24); await count(80);
  assert.equal(await page.evaluate(() => window.retainedCard.isConnected && window.retainedBody === window.retainedCard.querySelector('.board-node-content')), true, 'Zoom reversal reuses rendered cards');
  for (const z of [.125, .115, .13]) { await zoomTo(z); await count(80); }
  assert.equal(await page.evaluate(() => window.retainedCard.isConnected), true, 'Small reversals around 12% do not tear down cards');
  console.log('PASS: progressive hydration, stacking order, cached cards and stable zoom thresholds');
  await zoomTo(.1); await count(0);
  // A remote task edit must invalidate detached cards before they return.
  const refreshed = page.waitForResponse(async response => response.url() === `${base}/api/projects/${project.id}` && response.status() === 200 && (await response.json()).tasks.some(t => t.title === 'Updated while zoomed out'));
  const response = await page.request.patch(`${base}/api/projects/${project.id}/tasks/${task.id}`, { data: { revision: task.revision, title: 'Updated while zoomed out', body: '## Fresh description' } });
  assert.ok(response.ok()); await refreshed; await page.waitForTimeout(100);
  await zoomTo(.24); await count(80);
  assert.equal(await page.locator('.board-node.task .task-title').first().textContent(), 'Updated while zoomed out');
  assert.equal(await page.locator('.board-node.task .task-card-description h2').first().textContent(), 'Fresh description');
  // The sizing variable belongs only to grids, not the whole board.
  assert.equal(await page.locator('#canvas').evaluate(el => el.style.getPropertyValue('--grid-hit-size')), '');
  assert.equal(await page.locator('#canvas-world').evaluate(el => el.style.getPropertyValue('--canvas-touch-target')), '');
  const font = await page.locator('.grid-title').evaluate(el => parseFloat(getComputedStyle(el).fontSize) * new DOMMatrix(document.querySelector('#canvas-world').style.transform).a);
  assert.ok(Math.abs(font - 14) < .1, 'Grid title stays screen-sized');
  await zoomTo(.06); await count(0);
  const point = await page.locator('#canvas').evaluate(canvas => { const b = canvas.getBoundingClientRect(), m = new DOMMatrix(document.querySelector('#canvas-world').style.transform); return { x: b.x + m.e + 160*m.a, y: b.y + m.f + 130*m.a }; });
  await page.mouse.click(point.x, point.y);
  await page.locator('[data-node="card-0"].selected').waitFor();
  assert.equal(await page.locator('[data-node="card-0"] .task-title').textContent(), 'Updated while zoomed out');
  console.log('PASS: remote edits invalidate cached cards, grid sizing is retained and bitmap objects remain selectable');
  await page.keyboard.press('Escape');
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.evaluate(()=>window.motionStates.clear());
  await zoomTo(.24);await count(80);await zoomTo(.1);await count(0);
  assert.deepEqual(await page.evaluate(()=>[...window.motionStates]),[],'Reduced motion changes detail without animation');
  console.log('PASS: detail transitions honour reduced motion');
  assert.deepEqual(errors, []);
} finally {
  await browser.close(); server.closeAllConnections(); await new Promise(r => server.close(r)); store.close(); await fs.rm(root, { recursive: true, force: true });
}
