import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright';
import { Store } from '../server/store.js';
import { createServer } from '../server/index.js';
import { encodeCanvas, decodeCanvas } from '../public/canvas-format.js';
const root = await fs.mkdtemp(path.join(os.tmpdir(), 'pencils-large-board-'));
const store = new Store(root); await store.init();
const project = await store.createProject({ title: '100k integration' });
const server = createServer(store, { productionAssets: true });
await new Promise(r => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 1050 } });
page.setDefaultTimeout(60000);
const errors = [], deliveries = [];
page.on('pageerror', e => errors.push(e.message));
let block = false, hold;
await page.route('**/api/projects/*/boards/*', async route => {
  if (route.request().method() === 'PATCH') {
    const data = route.request().postData(); deliveries.push(JSON.parse(data));
    if (block) { await route.abort(); return; }
  }
  await route.continue();
});
try {
  const nodes = Array.from({ length: 100000 }, (_, i) => ({ id: `n-${i}`, type: 'sticky', text: `Idea ${i}`, x: 80 + i % 400 * 320, y: 150 + Math.floor(i / 400) * 320, w: 240, h: 200 }));
  const edges = Array.from({ length: 200000 }, (_, i) => ({ id: `e-${i}`, from: `n-${i % 100000}`, to: `n-${(i + 1 + Math.floor(i / 100000)) % 100000}`, routing: 'curve' }));
  const body = JSON.stringify({ title: '100k native import', canvas: encodeCanvas({ title: '100k native import', nodes, edges }) });
  assert.ok(Buffer.byteLength(body) > 16_000_000, 'Import must exercise the old request-size ceiling');
  const response = await fetch(`${base}/api/projects/${project.id}/boards`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
  assert.equal(response.status, 201, await response.clone().text().then(s => s.slice(0, 200)));
  const board = await response.json(), file = store.file(project.id, 'boards', board.id);
  const current = async () => store.public(await store.read(file), file);
  const url = `${base}/#project/${project.id}/board/${board.id}`;
  await page.goto(url);
  await page.waitForFunction(() => document.querySelector('#canvas')?.dataset.objectCount === '100000');
  assert.ok(await page.locator('.board-node').count() <= 240);
  const edit = async text => {
    await page.locator('[data-node="n-0"]').dblclick();
    await page.locator('[data-rich-mode=source]').click();
    await page.locator('#canvas-inline-form textarea').fill(text);
    await page.locator('#canvas-inline-form textarea').press('Control+Enter');
  };
  const saved = () => page.waitForFunction(() => document.querySelector('#board-save')?.textContent === 'Saved automatically', null, { timeout: 60000 });
  const start = performance.now();
  await edit('Edited on a 100,000-object board'); await saved();
  assert.equal((await current()).nodes[0].text, 'Edited on a 100,000-object board');
  assert.ok(deliveries.every(d => d.changes && !d.nodes && !d.base));
  assert.ok(Buffer.byteLength(JSON.stringify(deliveries[0])) < 1000);
  console.log(`PASS: native import ${Math.round(body.length / 1048576)} MiB; 100k UI edit saved in ${Math.round(performance.now() - start)} ms; delta ${JSON.stringify(deliveries[0]).length} bytes`);
  await page.locator('[data-action=board-undo]').click(); await saved();
  await page.waitForFunction(() => document.querySelector('[data-node="n-0"]')?.textContent.includes('Idea 0'));
  assert.equal((await current()).nodes[0].text, 'Idea 0');
  console.log('PASS: server undo at full capacity');
  block = true; await edit('Recovered after reload');
  await page.waitForFunction(() => Object.keys(localStorage).some(k => k.startsWith('pencils:pending:') && !k.endsWith(':lease') && localStorage.getItem(k).includes('Recovered after reload')));
  const bytes = await page.evaluate(() => Object.keys(localStorage).filter(k => k.startsWith('pencils:pending:') && !k.endsWith(':lease')).reduce((sum,k) => sum + localStorage.getItem(k).length, 0));
  assert.ok(bytes < 5000, `Single-card draft should stay compact, got ${bytes}`);
  await page.reload();
  block = false;
  await saved();
  assert.equal((await current()).nodes[0].text, 'Recovered after reload');
  const native = JSON.parse(await fs.readFile(file, 'utf8'));
  assert.equal(decodeCanvas(native).nodes.length, 100000);
  assert.equal(decodeCanvas(native).edges.length, 200000);
  console.log(`PASS: offline draft survives reload (${bytes} bytes), complete native file retained`);
  await fs.mkdir('artifacts', { recursive: true });
  await page.screenshot({ path: 'artifacts/board-100k-detail.png' });
  await page.locator('[data-action=board-fit]').click();
  await page.waitForTimeout(500);
  const view = await page.evaluate(() => ({ zoom: document.querySelector('#zoom-label').textContent, cards: document.querySelectorAll('.board-node').length, edges: document.querySelectorAll('#canvas-lines > g[data-edge]').length }));
  assert.ok(view.cards <= 24); assert.ok(view.edges <= 240);
  await page.screenshot({ path: 'artifacts/board-100k-overview.png' });
  // An overview card remains selectable: use its transformed location.
  const target = await page.evaluate(() => {
    const world = document.querySelector('#canvas-world'), c = document.querySelector('#canvas').getBoundingClientRect();
    const m = new DOMMatrix(getComputedStyle(world).transform);
    return { x: c.x + m.e + (80 + 200 * 320 + 120) * m.a, y: c.y + m.f + (150 + 100 * 320 + 100) * m.d };
  });
  await page.mouse.click(target.x, target.y);
  await page.locator('[data-node="n-40200"]').waitFor();
  assert.deepEqual(errors, []);
  console.log('PASS: fit overview, bitmap selection, no browser errors', JSON.stringify(view));
} finally {
  await browser.close(); server.closeAllConnections(); await new Promise(r => server.close(r));
  await fs.rm(root, { recursive: true, force: true });
}
