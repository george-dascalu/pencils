import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { chromium, firefox } from 'playwright';
import { Store } from '../server/store.js';
import { createServer } from '../server/index.js';
import { newGrid } from '../public/grid-model.js';

const root = await fs.mkdtemp(path.join(os.tmpdir(), 'pencils-large-paste-'));
const store = new Store(root); await store.init();
const project = await store.createProject({ title: 'Large mixed paste' });
const task = await store.createTask(project.id, { title: 'Rich task card', body: '# Plan\n\n**Bold** and *italic*.\n\n| Stage | State |\n| --- | --- |\n| Design | Ready |\n\n- [ ] Follow up' });
const nodes = [], edges = [];
for (let i = 0; i < 144; i++) {
  const x = i % 12 * 6200, y = Math.floor(i / 12) * 2500;
  for (let f = 0; f < 2; f++) nodes.push({ id: `frame-${i}-${f}`, type: 'frame', text: `Frame ${i}-${f}`, x: x + f * 2400, y, w: 2000, h: 1800 });
  for (let j = 0; j < 20; j++) nodes.push({ id: `task-${i}-${j}`, type: 'task', task: task.id, taskCollapsed: false, frame: `frame-${i}-${Math.floor(j / 10)}`, x: x + Math.floor(j / 10) * 2400 + 80 + j % 2 * 800, y: y + 100 + Math.floor(j % 10 / 2) * 300, w: 600, h: 200 });
  nodes.push({ id: `note-${i}`, type: 'sticky', text: 'A note', x: x + 4500, y: y + 1600, w: 400, h: 200 });
  nodes.push({ id: `grid-${i}`, type: 'grid', grid: newGrid(), x: x + 4500, y: y + 100, w: 1200, h: 1000 });
  for (let j = 0; j < 11; j++) edges.push({ id: `edge-${i}-${j}`, from: `task-${i}-${j}`, to: `task-${i}-${j + 1}`, routing: j % 2 ? 'curve' : 'elbow', label: 'Related', ...(j === 10 ? { bends: [{ x: x + 2200, y: y + 1900 }] } : {}) });
}
let board = (await store.snapshot(project.id)).boards[0];
board = await store.updateBoard(project.id, board.id, { revision: board.revision, nodes, edges, settings: { snap: false, alignObjects: false } });
const server = createServer(store, { productionAssets: process.env.PRODUCTION_ASSETS === '1' });
await new Promise(r => server.listen(0, '127.0.0.1', r));
const browserName = process.env.BROWSER || 'chromium';
const browser = await ({ chromium, firefox }[browserName]).launch();
const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } });
const errors = []; page.on('pageerror', e => errors.push(e.message));
await page.addInitScript(id => localStorage.setItem(`pencils:camera:${id}`, JSON.stringify({ x: 160, y: 100, z: .03 })), board.id);
const current = async () => (await store.snapshot(project.id)).boards[0];
async function savedCount(count) {
  for (let i = 0; i < 150; i++) {
    const b = await current();
    if (b.nodes.length === count && await page.locator('#board-save').textContent() === 'Saved automatically') return b;
    await page.waitForTimeout(60);
  }
  assert.fail(`Expected ${count} saved objects`);
}
async function overviewOnly() {
  assert.equal(await page.locator('.board-node').count(), 0, 'Bulk selection must not promote arbitrary cards/grids at 3% zoom');
  assert.equal(await page.locator('path.canvas-edge').count(), 0, 'Selected connectors must not bypass the detail budget');
  assert.ok(await page.locator('#canvas *').count() < 500, 'DOM stays bounded with thousands of selected objects');
}
try {
  await page.goto(`http://127.0.0.1:${server.address().port}/#project/${project.id}/board/${board.id}`);
  await page.waitForFunction(() => document.querySelector('#canvas')?.dataset.objectCount === '3456');
  await page.waitForTimeout(1500);
  const camera = await page.locator('#canvas-world').getAttribute('style');
  await page.locator('#canvas').focus(); await page.keyboard.press('Control+a'); await page.keyboard.press('Control+c');
  assert.equal(await page.locator('.selection-filter-total').textContent(), '5040');
  const start = performance.now(); await page.keyboard.press('Control+v');
  let pasted = await savedCount(6912);
  console.log(`Pasted and saved 5,040 mixed objects in ${Math.round(performance.now() - start)} ms`);
  assert.equal(pasted.edges.length, 3168);
  assert.equal(new Set(pasted.nodes.map(n => n.id)).size, 6912);
  assert.equal(new Set(pasted.edges.map(e => e.id)).size, 3168);
  assert.equal(await page.locator('.selection-filter-total').textContent(), '5040');
  assert.equal(await page.locator('#canvas-world').getAttribute('style'), camera);
  await overviewOnly();
  // Preserve the original layout and remap all copied containers/connectors.
  const original = new Map(board.nodes.map(n => [n.id, n])), copied = pasted.nodes.filter(n => !original.has(n.id));
  const remapped = new Map(board.nodes.map((n, i) => [n.id, copied[i].id]));
  const dx = copied[0].x - board.nodes[0].x, dy = copied[0].y - board.nodes[0].y;
  for (let i = 0; i < board.nodes.length; i++) {
    const before = board.nodes[i], copy = copied[i], source = pasted.nodes.find(n => n.id === before.id);
    assert.deepEqual(source, before, 'Pasting must not alter originals');
    assert.deepEqual([copy.x, copy.y, copy.w, copy.h], [before.x + dx, before.y + dy, before.w, before.h]);
    if (before.frame) assert.equal(copy.frame, remapped.get(before.frame));
  }
  const originalEdges = new Set(board.edges.map(e => e.id)), newEdges = pasted.edges.filter(e => !originalEdges.has(e.id));
  for (let i = 0; i < board.edges.length; i++) {
    const before = board.edges[i], copy = newEdges[i];
    assert.equal(copy.from, remapped.get(before.from)); assert.equal(copy.to, remapped.get(before.to));
    if (before.bends) for (let j = 0; j < before.bends.length; j++) {
      // Node positions are rounded on save; connector bends retain subpixels.
      assert.ok(Math.abs(copy.bends[j].x - before.bends[j].x - dx) < 1);
      assert.ok(Math.abs(copy.bends[j].y - before.bends[j].y - dy) < 1);
    }
  }
  // Drag a selected bitmap, including every frame and connector in its group.
  const hit = copied.find(n => n.type === 'task');
  const point = await page.locator('#canvas').evaluate((el, n) => {
    const r = el.getBoundingClientRect(), m = new DOMMatrix(document.querySelector('#canvas-world').style.transform);
    return { x: r.x + m.e + (n.x + n.w / 2) * m.a, y: r.y + m.f + (n.y + n.h / 2) * m.a };
  }, hit);
  await page.mouse.move(point.x, point.y); await page.mouse.down();
  await page.mouse.move(point.x + 30, point.y + 18, { steps: 5 }); await page.mouse.up();
  for (let i = 0; i < 100; i++) { pasted = await current(); if (Math.abs(pasted.nodes.find(n => n.id === hit.id).x - hit.x - 1000) < .1) break; await page.waitForTimeout(60); }
  const byId = new Map(pasted.nodes.map(n => [n.id, n]));
  for (const n of copied) {
    assert.ok(Math.abs(byId.get(n.id).x - n.x - 1000) < .1); assert.ok(Math.abs(byId.get(n.id).y - n.y - 600) < .1);
  }
  await overviewOnly();
  await page.keyboard.press('Control+z');
  for (let i = 0; i < 100; i++) { pasted = await current(); if (Math.abs(pasted.nodes.find(n => n.id === hit.id).x - hit.x) < .1) break; await page.waitForTimeout(60); }
  assert.ok(Math.abs(pasted.nodes.find(n => n.id === hit.id).x - hit.x) < .1, 'Undo group movement');
  await page.waitForFunction(() => !document.querySelector('[data-action="board-undo"]')?.disabled);
  await page.keyboard.press('Control+z'); await savedCount(3456);
  await page.waitForFunction(() => !document.querySelector('[data-action="board-redo"]')?.disabled);
  await page.keyboard.press('Control+Shift+z'); await savedCount(6912);
  await page.reload(); await page.waitForFunction(() => document.querySelector('#canvas')?.dataset.objectCount === '6912');
  await page.waitForTimeout(1500); await overviewOnly();
  await page.locator('#canvas').focus(); await page.keyboard.press('Control+a');
  // Moving through the detail boundary must not create handles for each
  // selected card or separate overlays for hundreds of selected connectors.
  const overlayCounts = await page.evaluate(async () => {
    const canvas = document.querySelector('#canvas'), world = document.querySelector('#canvas-world');
    const outline = world.querySelector('.multi-resize-box'), box = canvas.getBoundingClientRect();
    const peak = { ports: 0, handles: 0, halos: 0, detailed: 0 };
    const sample = () => {
      for (const [key, selector] of Object.entries({ ports: '.connection-port', handles: '.resize-handle', halos: '.connector-selection', detailed: '.board-node' }))
        peak[key] = Math.max(peak[key], world.querySelectorAll(selector).length);
    };
    const observer = new MutationObserver(sample); observer.observe(world, { childList: true, subtree: true });
    for (const target of [.24, .10, .24, .03]) {
      const zoom = new DOMMatrix(world.style.transform).a;
      const delta = -Math.log(target / zoom) / .002, steps = Math.ceil(Math.abs(delta) / 250);
      for (let i = 0; i < steps; i++) {
        canvas.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true,
          deltaY: delta / steps, clientX: box.x + 180, clientY: box.y + 120 }));
        await new Promise(resolve => setTimeout(resolve, 70));
      }
      await new Promise(resolve => setTimeout(resolve, 1800));
      sample();
    }
    observer.disconnect();
    return { ...peak, sameOutline: outline === world.querySelector('.multi-resize-box') };
  });
  assert.ok(overlayCounts.detailed > 0, 'Exercise selected cards in detailed mode');
  assert.equal(overlayCounts.ports, 0, 'Group selections do not get individual connection handles');
  assert.equal(overlayCounts.handles, 4, 'Only the group resize handles are mounted');
  assert.equal(overlayCounts.halos, 1, 'Selected detailed connectors share one highlight');
  assert.equal(overlayCounts.sameOutline, true, 'Keep the shared outline mounted through zoom');
  await overviewOnly();
  console.log('Selected-group overlay counts:', JSON.stringify(overlayCounts));
  await page.screenshot({ path: `/tmp/pencils-large-paste-${browserName}-desktop.png` });
  await page.getByRole('button', { name: 'Collapse sidebar', exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForFunction(() => document.querySelector('.sidebar').getBoundingClientRect().right <= 1);
  await page.screenshot({ path: `/tmp/pencils-large-paste-${browserName}-mobile.png` });
  const toolbar = await page.locator('#selection-tools').boundingBox();
  assert.ok(toolbar.x >= 0 && toolbar.x + toolbar.width <= 391);
  assert.deepEqual(errors, []);
  console.log('PASS: 5,040-item paste, bounded overview rendering, remapped frames/edges/bends, group movement, undo/redo, reload and mobile controls');
} finally { await browser.close(); server.closeAllConnections(); await new Promise(r => server.close(r)); await store.close(); await fs.rm(root, { recursive: true, force: true }); }
