// Functional boundary checks in a disposable vault, independent of timing runs.
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright';
import { Store } from '../../../server/store.js';
import { createServer } from '../../../server/index.js';
process.env.AUTH_MODE = 'single-user'; process.env.LOCAL_USER_NAME = 'George';
const root = await fs.mkdtemp(path.join(os.tmpdir(), 'pencils-markdown-limits-'));
const store = new Store(root); await store.init();
const project = await store.createProject({ title: 'Boundary audit' });
const server = createServer(store, { productionAssets: true });
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}`;
let browser;
const results = [];
try {
  browser = await chromium.launch({ args: ['--no-sandbox'] });
  const context = await browser.newContext({ reducedMotion: 'reduce', viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  await page.addInitScript(() => localStorage.setItem('pencils:document-mode', '"source"'));
  await page.goto(base);
  for (const length of [200000, 200001, 200010]) {
    const response = await context.request.post(`${base}/api/projects/${project.id}/documents`, { data: { title: `Length ${length}`, body: 'x'.repeat(length) } });
    results.push({ action: 'HTTP create', length, status: response.status(), message: response.status() === 400 ? await response.text() : 'accepted' });
  }
  for (const length of [200000, 200001, 200010]) {
    const doc = await store.mutate(() => store.createDocument(project.id, { title: `External ${length}`, body: '# Original' }));
    // Bypass the API, as another Markdown editor can: a real filesystem write.
    const file = store.file(project.id, 'documents', doc.id);
    const text = await fs.readFile(file, 'utf8');
    const end = text.indexOf('\n---\n', 4) + 5;
    if (end < 5) throw Error('Missing frontmatter');
    await fs.writeFile(file, text.slice(0, end) + 'x'.repeat(length));
    await page.goto(`${base}/#project/${project.id}/documents/${doc.id}`);
    await page.locator('.cm-content').waitFor();
    await page.waitForFunction(length => document.querySelector('.cm-content')?.cmTile?.root?.view?.state.doc.length === length, length);
    const result = await page.evaluate(() => {
      const view = document.querySelector('.cm-content').cmTile.root.view;
      const before = view.state.doc.length;
      view.dispatch({ selection: { anchor: 10 } });
      const selected = view.state.selection.main.head;
      view.dispatch({ changes: { from: 0, insert: 'a' } });
      const afterInsert = view.state.doc.length;
      view.dispatch({ changes: { from: 0, to: 1 } });
      return { before, selected, afterInsert, afterDelete: view.state.doc.length, errors: [...document.querySelectorAll('[role=alert]')].map(n => n.textContent) };
    });
    results.push({ action: 'Editor transaction boundary', length, ...result });
  }
  const apiDoc = await store.mutate(() => store.createDocument(project.id, { title: 'API timing', body: 'x'.repeat(200000) }));
  const url = `${base}/api/projects/${project.id}/documents/${apiDoc.id}`;
  const gets = [], patches = [];
  let revision = apiDoc.revision;
  for (let i = 0; i < 5; i++) {
    let start = performance.now();
    const get = await context.request.get(url); const record = await get.json();
    if (get.status() !== 200 || record.body.length !== 200000) throw Error('API read failed');
    gets.push(Math.round(performance.now() - start));
    start = performance.now();
    const patch = await context.request.patch(url, { data: { revision, body: String(i) + 'x'.repeat(199999) } });
    const saved = await patch.json();
    if (patch.status() !== 200 || !saved.revision) throw Error('API save failed');
    revision = saved.revision; patches.push(Math.round(performance.now() - start));
  }
  results.push({ action: 'Loopback API, warm cached document, 200000 characters', getMs: gets, patchMs: patches });
  await context.close();
} finally {
  await browser?.close(); server.closeAllConnections?.(); await new Promise(resolve => server.close(resolve));
  await store.queue; await store.close(); await fs.rm(root, { recursive: true, force: true });
}
await fs.writeFile(new URL('limits.json', import.meta.url), JSON.stringify(results, null, 2) + '\n');
console.log(JSON.stringify(results, null, 2));
