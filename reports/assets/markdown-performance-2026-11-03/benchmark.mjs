// Isolated production-build audit; never opens or writes the user's vault.
// node reports/assets/markdown-performance-2026-11-03/benchmark.mjs [profile] [mode] [case,...]
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';
import { chromium, webkit } from 'playwright';
import { Store } from '../../../server/store.js';
import { createServer } from '../../../server/index.js';

const output = fileURLToPath(new URL('.', import.meta.url));
const profile = process.argv[2] || 'desktop';
const mode = process.argv[3] || 'live';
const variant = process.env.CLEAR_HIGHLIGHTS ? 'clear-highlights-before-search' : process.env.SKIP_CODE_HIGHLIGHTS ? 'no-highlight-api' : 'normal';
const selected = process.argv[4]?.split(',');
const runs = Number(process.env.RUNS || 1);
const prose = '# Performance audit\n\n' + ('BENCH words for an ordinary paragraph. Clear prose makes this a realistic writing workload. This sentence describes a project, its plans and the next decision.\n\n');
const mixed = '## BENCH section\n\nA paragraph with **bold**, *italic*, ==highlight==, `code` and a [website](https://example.com).\n\n- [ ] First checklist item\n- [x] Second checklist item\n\n> [!NOTE] A callout\n> Some information about the project.\n\n| Name | Value |\n| --- | --- |\n| Alpha | 123 |\n| Beta | 456 |\n\n```js\nconst value = 42;\nconsole.log(value);\n```\n\n';
function repeated(unit, size) {
  return unit.repeat(Math.ceil(size / unit.length)).slice(0, size - 25) + '\n\nBENCH_TARGET_END\n';
}
function table(rows, cols = 6) {
  return `# BENCH table\n\n|${Array.from({ length: cols }, (_, i) => `H${i}`).join('|')}|\n|${Array(cols).fill('---').join('|')}|\n` + Array.from({ length: rows - 1 }, (_, i) => `|${Array.from({ length: cols }, (_, j) => `${i % 10}${j}`).join('|')}|`).join('\n') + '\n\nBENCH_TARGET_END\n';
}
const cases = Object.fromEntries([
  ...[10000, 50000, 100000, 180000, 199000].map(n => [`prose-${n}`, repeated(prose, n)]),
  ...[10000, 50000, 100000, 180000, 199000].map(n => [`mixed-${n}`, repeated(mixed, n)]),
  ...[100, 500, 1000, 2000, 3333, 3334].map(n => [`table-${n}x6`, table(n)]),
  ...[10000, 100000, 180000].map(n => [`code-${n}`, '# BENCH code\n\n```js\n' + repeated('const result = 123; // BENCH code\n', n - 50) + '\n```\n']),
  ...[10000, 100000, 180000].map(n => [`checklist-${n}`, repeated('- [ ] BENCH item **bold** and *italic*\n', n)]),
  ...[10000, 50000, 100000, 180000].map(n => [`links-${n}`, repeated('[BENCH](https://example.com) with **bold** text. ', n)]),
  ...[10000, 100000, 180000].map(n => [`longline-${n}`, repeated('BENCH ordinary unbroken paragraph text. ', n)]),
]);
const percentile = (values, p) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted.length ? Math.round(sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * p) - 1)] * 10) / 10 : null;
};
process.env.AUTH_MODE = 'single-user';
process.env.LOCAL_USER_NAME = 'George';
const root = await fs.mkdtemp(path.join(os.tmpdir(), 'pencils-markdown-audit-'));
const store = new Store(root);
await store.init();
const server = createServer(store, { productionAssets: true });
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}`;
const env = { ...process.env, DBUS_SESSION_BUS_ADDRESS: 'unix:path=/nonexistent' };
if (env.GIO_MODULE_DIR?.includes('/snap/')) delete env.GIO_MODULE_DIR;
let browser;
const log = async value => {
  await fs.appendFile(path.join(output, 'results.jsonl'), JSON.stringify(value) + '\n');
  console.log(JSON.stringify(value));
};
try {
  browser = await (profile === 'webkit-ipad' ? webkit : chromium).launch({ headless: true, args: profile === 'webkit-ipad' ? [] : ['--no-sandbox'], env });
  await log({ metadata: true, at: new Date().toISOString(), version: JSON.parse(await fs.readFile('package.json')).version, profile, mode, variant, browser: browser.version(), cpu: os.cpus()[0]?.model, hostMemoryGB: Math.round(os.totalmem() / 2 ** 30), runs });
  for (const [name, body] of Object.entries(cases).filter(([name]) => !selected || selected.includes(name))) {
    const project = await store.createProject({ title: `Audit ${name}` });
    const doc = await store.mutate(() => store.createDocument(project.id, { title: name, body }));
    for (let run = 0; run < runs; run++) {
      if (run) {
        const current = await store.getDocument(project.id, doc.id);
        await store.mutate(() => store.updateDocument(project.id, doc.id, { revision: current.revision, body }));
      }
      const context = await browser.newContext({ viewport: profile === 'webkit-ipad' ? { width: 1024, height: 768 } : { width: 1440, height: 900 }, hasTouch: profile === 'webkit-ipad', deviceScaleFactor: profile === 'webkit-ipad' ? 2 : 1, reducedMotion: 'reduce' });
      const page = await context.newPage();
      page.setDefaultTimeout(12000);
      const errors = [], saves = [], requestStarts = new Map();
      page.on('pageerror', e => errors.push(e.message));
      page.on('crash', () => errors.push('Browser renderer crashed'));
      page.on('request', request => { if (request.method() === 'PATCH' && request.url().includes(`/documents/${doc.id}`)) requestStarts.set(request, performance.now()); });
      page.on('requestfinished', async request => {
        if (requestStarts.has(request)) saves.push({ status: (await request.response()).status(), bytes: Buffer.byteLength(request.postData() || ''), roundTripMs: Math.round(performance.now() - requestStarts.get(request)) });
      });
      const cdp = profile === 'webkit-ipad' ? null : await context.newCDPSession(page);
      if (cdp) {
        await cdp.send('Performance.enable');
        if (profile === 'cpu4x') await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
      }
      await page.addInitScript(({ mode, variant }) => {
        localStorage.setItem('pencils:document-mode', JSON.stringify(mode));
        if (variant === 'no-highlight-api') Object.defineProperty(window, 'Highlight', { value: undefined, configurable: true });
        window.audit = { tasks: [], input: [], frames: [], keys: [] };
        if (PerformanceObserver.supportedEntryTypes?.includes('longtask')) new PerformanceObserver(list => window.audit.tasks.push(...list.getEntries().map(x => x.duration))).observe({ type: 'longtask', buffered: true });
        document.addEventListener('keydown', e => {
          if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && e.target.closest('.cm-content')) {
            const start = performance.now();
            requestAnimationFrame(() => requestAnimationFrame(() => window.audit.keys.push(performance.now() - start)));
          }
        }, true);
        document.addEventListener('input', e => {
          if (!e.target.closest('.cm-content')) return;
          const start = performance.now();
          queueMicrotask(() => window.audit.input.push(performance.now() - start));
        }, true);
      }, { mode, variant });
      const start = performance.now();
      let timer, stage = 'open', partial = {};
      try {
        const result = await Promise.race([
          (async () => {
            await page.goto(`${base}/#project/${project.id}/documents/${doc.id}`, { waitUntil: 'domcontentloaded' });
            await page.locator(`#document-form[data-document-mode="${mode}"]`).waitFor();
            await page.locator(mode === 'reading' ? '.document-reading .document-page' : '.cm-content').waitFor({ state: 'visible' });
            const ready = await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve(performance.now())))));
            partial.openMs = ready;
            await page.evaluate(() => new Promise(resolve => { const start = performance.now(); function step() { if (performance.now() - start < 500) requestAnimationFrame(step); else resolve(); } requestAnimationFrame(step); }));
            const initial = await page.evaluate(() => ({ elements: document.querySelectorAll('*').length, cells: document.querySelectorAll('.document-writing td,.document-writing th').length, inlineEditors: document.querySelectorAll('[contenteditable=true]').length, tableWarnings: [...document.querySelectorAll('.field-hint')].map(n => n.textContent).filter(t => t.includes('20,000')), content: document.querySelector('.cm-content')?.textContent?.slice(0, 45), mode: document.querySelector('#document-form')?.dataset.documentMode }));
            if (cdp) await cdp.send('HeapProfiler.collectGarbage');
            const beforeMetrics = cdp ? Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(x => [x.name, x.value])) : {};
            let typing = null;
            if (mode !== 'reading') {
              stage = 'typing';
              await page.evaluate(() => {
                const view = document.querySelector('.cm-content').cmTile.root.view;
                view.dispatch({ selection: { anchor: Math.min(5, view.state.doc.length) }, scrollIntoView: true }); view.focus(); window.audit.keys = []; window.audit.input = [];
              });
              const start = performance.now();
              for (const char of 'abcdefghij') {
                await page.keyboard.press(char);
                await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
              }
              typing = { wallMs: performance.now() - start, ...await page.evaluate(() => ({ keyToPaint: window.audit.keys, inputHandler: window.audit.input, bodyLength: document.querySelector('.cm-content').cmTile.root.view.state.doc.length })) };
            }
            const afterMetrics = cdp ? Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(x => [x.name, x.value])) : {};
            let tableTyping = null;
            if (mode === 'live' && name.startsWith('table-') && await page.locator('[data-table-cell][contenteditable=true]').count()) {
              stage = 'table cell typing';
              await page.locator('[data-table-cell][contenteditable=true]').first().click();
              await page.evaluate(() => { window.audit.keys = []; window.audit.input = []; });
              for (const char of 'xyz') {
                await page.keyboard.press(char);
                await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
              }
              const data = await page.evaluate(() => ({ keys: window.audit.keys, input: window.audit.input }));
              tableTyping = { keyP50: percentile(data.keys, .5), keyP95: percentile(data.keys, .95), inputP50: percentile(data.input, .5), inputP95: percentile(data.input, .95) };
            }
            let codeTyping = null;
            if (mode === 'live' && name.startsWith('code-')) {
              stage = 'code block typing';
              await page.locator('pre code[contenteditable]').first().evaluate(node => {
                node.focus(); const range = document.createRange(); range.selectNodeContents(node); range.collapse(true); const selection = getSelection(); selection.removeAllRanges(); selection.addRange(range); window.audit.keys = []; window.audit.input = [];
              });
              for (const char of 'xyz') { await page.keyboard.press(char); await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))); }
              const data = await page.evaluate(() => ({ keys: window.audit.keys, input: window.audit.input }));
              codeTyping = { keyP50: percentile(data.keys, .5), keyP95: percentile(data.keys, .95), inputP50: percentile(data.input, .5), inputP95: percentile(data.input, .95) };
            }
            stage = 'search';
            const searches = [];
            partial.search = searches;
            partial.highlights = await page.evaluate(() => ({ sets: CSS.highlights?.size || 0, ranges: CSS.highlights ? [...CSS.highlights.values()].reduce((sum, h) => sum + h.size, 0) : 0 }));
            if (variant === 'clear-highlights-before-search') await page.evaluate(() => CSS.highlights?.clear());
            await page.getByRole('button', { name: 'Document tools', exact: true }).click();
            await page.locator('[data-document-action="find"]').click();
            const search = page.getByRole('searchbox', { name: 'Find in document', exact: true });
            for (const query of ['BENCH', 'BENCH_TARGET_END']) {
              const t = performance.now();
              await search.fill(query);
              const count = await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve([...document.querySelectorAll('.document-find-count')].map(n => n.textContent).join(' '))))));
              searches.push({ query, ms: performance.now() - t, count });
            }
            await page.getByRole('button', { name: mode === 'reading' ? 'Close search' : 'Close search', exact: true }).click();
            stage = 'scroll';
            const scroll = await page.evaluate(async mode => {
              const scroller = document.querySelector(mode === 'reading' ? '.document-reading' : '.cm-scroller');
              const samples = [], max = scroller.scrollHeight - scroller.clientHeight;
              for (let i = 0; i < 20; i++) {
                const start = performance.now(); scroller.scrollTop = max * i / 19;
                await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
                samples.push(performance.now() - start);
              }
              return { max, samples };
            }, mode);
            if (cdp) await cdp.send('HeapProfiler.collectGarbage');
            const memory = cdp ? Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(x => [x.name, x.value])) : {};
            const tasks = await page.evaluate(() => window.audit.tasks);
            return { openMs: ready, ...initial, typing: typing && { chars: typing.bodyLength - body.length, keyP50: percentile(typing.keyToPaint, .5), keyP95: percentile(typing.keyToPaint, .95), inputP50: percentile(typing.inputHandler, .5), inputP95: percentile(typing.inputHandler, .95), wallMs: Math.round(typing.wallMs) }, tableTyping, codeTyping, typingScriptMs: Math.round(((afterMetrics.ScriptDuration || 0) - (beforeMetrics.ScriptDuration || 0)) * 1000), typingLayoutMs: Math.round(((afterMetrics.LayoutDuration || 0) - (beforeMetrics.LayoutDuration || 0)) * 1000), search: searches.map(x => ({ ...x, ms: Math.round(x.ms) })), scroll: { p50: percentile(scroll.samples, .5), p95: percentile(scroll.samples, .95), max: percentile(scroll.samples, 1), height: scroll.max }, longTasks: { count: tasks.length, max: percentile(tasks, 1), totalMs: Math.round(tasks.reduce((a, b) => a + b, 0)) }, heapMB: memory.JSHeapUsedSize ? Math.round(memory.JSHeapUsedSize / 2 ** 20) : null, saves, errors };
          })(),
          new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Case exceeded 45 seconds')), 45000); }),
        ]);
        await log({ name, chars: body.length, words: body.split(/\s+/).length, profile, mode, variant, run, ...partial, ...result });
      } catch (error) {
        await log({ name, chars: body.length, profile, mode, variant, run, stage, error: error.message, elapsedMs: Math.round(performance.now() - start), ...partial, errors });
      } finally {
        clearTimeout(timer);
        await context.close();
      }
    }
  }
} finally {
  await browser?.close(); server.closeAllConnections?.();
  await new Promise(resolve => server.close(resolve));
  await store.queue; await store.close(); await fs.rm(root, { recursive: true, force: true });
}
