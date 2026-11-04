import { test, expect, onDevices, useApp } from '../fixtures.mjs';
import { openList } from '../helpers/menu-controls.mjs';
const app = useApp(async () => ({}));
const centre = async (el, part = .5) => { const b = await el.boundingBox(); return { x: b.x + Math.min(100, b.width / 2), y: b.y + b.height * part }; };
const touch = (page, type, p) => page.evaluate(([type, p]) => {
  (document.elementFromPoint(p.x, p.y) || document.body).dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 17, pointerType: 'touch', isPrimary: true, clientX: p.x, clientY: p.y }));
}, [type, p]);
async function seed(page, kind) {
  let project = await app.store.createProject({ title: 'Arrange ' + kind });
  project = await app.store.updateProject(project.id, { revision: project.revision, [`${kind}_folders`]: [{ id: 'a', title: 'Archive', parent: null }, { id: 'b', title: 'Notes', parent: null }] });
  if (kind === 'board') for (const board of (await app.store.children(project.id, 'boards')).items) await app.store.removeRecord(project.id, 'boards', board.id, board.revision);
  const create = title => kind === 'document' ? app.store.createDocument(project.id, { title, body: '# Keep text' }) : app.store.createBoard(project.id, { title });
  const first = await create('Alpha'), last = await create('Zulu');
  await page.goto(`${app.base}/#project/${project.id}/${kind === 'document' ? 'documents' : 'board'}/${first.id}`);
  await page.locator(kind === 'document' ? '#document-form' : '#canvas').waitFor();
  await expect(page.locator("#list-panel")).toHaveAttribute("data-kind", kind + "s");
  await openList(page);
  const row = key => page.locator(`#${kind}-list [data-tree-row="${key}"]`);
  return { project, first, last, row, root: () => page.locator(`#${kind}-list > li > [data-tree-row]`).evaluateAll(els => els.map(el => el.dataset.treeRow)) };
}
async function drag(page, from, to, device, part = .5) {
  const point = await centre(to, part);
  if (device === 'desktop') {
    const transfer = await page.evaluateHandle(() => new DataTransfer());
    await from.dispatchEvent('dragstart', { dataTransfer: transfer });
    await to.dispatchEvent('dragover', { dataTransfer: transfer, clientX: point.x, clientY: point.y });
    return async () => {
      await to.dispatchEvent('drop', { dataTransfer: transfer, clientX: point.x, clientY: point.y });
      await from.dispatchEvent('dragend', { dataTransfer: transfer });
      await transfer.dispose();
    };
  } else {
    await touch(page, 'pointerdown', await centre(from));
    await expect(from).toHaveClass(/document-held/);
    await touch(page, 'pointermove', point);
  }
  return async () => device === 'desktop' ? page.mouse.up() : touch(page, 'pointerup', point);
}
onDevices(['desktop', 'ipad', 'phone'], () => {
  for (const kind of ['document', 'board']) test(`${kind} rows and folders reorder, nest and return to root without opening an item @gate`, async ({ page, device }) => {
    const s = await seed(page, kind);
    const source = s.row('item:' + s.last.id).locator(`[data-${kind}-open]`);
    let release = await drag(page, source, s.row('folder:a'), device, .08);
    if (device === 'desktop') await page.locator(`#${kind}-search`).dispatchEvent('input');
    await expect(s.row('folder:a')).toHaveAttribute('data-tree-insert', 'before');
    const line = await s.row('folder:a').evaluate(el => { const css = getComputedStyle(el, '::after'); return { height: css.height, color: css.backgroundColor }; });
    expect(line.height).toBe('2px'); expect(line.color).not.toBe('rgba(0, 0, 0, 0)');
    await release();
    await expect.poll(s.root).toEqual(['item:' + s.last.id, 'folder:a', 'folder:b', 'item:' + s.first.id]);
    release = await drag(page, s.row('folder:b').locator(`[data-${kind}-folder]`), s.row('folder:a'), device);
    await expect(s.row('folder:a')).toHaveClass(/document-drop-target/); await release();
    await expect.poll(async () => (await app.store.snapshot(s.project.id)).project[`${kind}_folders`].find(f => f.id === 'b').parent).toBe('a');
    release = await drag(page, source, s.row('folder:b'), device);
    await release();
    await expect.poll(async () => (await app.store.snapshot(s.project.id))[`${kind}s`].find(d => d.id === s.last.id).folder).toBe('b');
    release = await drag(page, source, page.locator(`[data-${kind}-root]`), device);
    await release();
    await expect.poll(async () => (await app.store.snapshot(s.project.id))[`${kind}s`].find(d => d.id === s.last.id).folder).toBeNull();
    await expect(page.locator('#list-panel')).toBeVisible();
    expect(page.url()).toContain(s.first.id);
    await page.reload();
    await expect(page.locator("#list-panel")).toHaveAttribute("data-kind", kind + "s");
    await openList(page);
    await expect.poll(s.root).toEqual(['folder:a', 'item:' + s.first.id, 'item:' + s.last.id]);
    await expect(s.row('folder:b')).toBeVisible();
  });
});
for (const kind of ['document', 'board']) test(`${kind} failed reorder and Escape leave the saved order intact`, async ({ page }) => {
  const s = await seed(page, kind), original = await s.root();
  const endpoint = `**/api/projects/${s.project.id}`;
  await page.route(endpoint, route => route.request().method() === 'PATCH' ? route.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify({ error: 'List changed. Try again.' }) }) : route.continue());
  let release = await drag(page, s.row('item:' + s.last.id).locator(`[data-${kind}-open]`), s.row('folder:a'), 'desktop', .08);
  await release();
  await expect(page.locator('#toasts')).toContainText('List changed. Try again.');
  expect(await s.root()).toEqual(original);
  await page.unroute(endpoint);
  release = await drag(page, s.row('item:' + s.last.id).locator(`[data-${kind}-open]`), s.row('folder:a'), 'desktop', .08);
  await page.keyboard.press('Escape'); await release();
  expect(await s.root()).toEqual(original);
  await expect(page.locator('[data-tree-insert], .document-drag-preview')).toHaveCount(0);
});
onDevices(['ipad', 'phone'], () => test('real touch holds reorder a row without opening its document', async ({ page }) => {
  const s = await seed(page, 'document');
  const cdp = await page.context().newCDPSession(page);
  const source = s.row('item:' + s.last.id).locator('[data-document-open]'), p = await centre(source), to = await centre(s.row('folder:a'), .08);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [p] });
  await expect(source).toHaveClass(/document-held/);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [to] });
  await expect(s.row('folder:a')).toHaveAttribute('data-tree-insert', 'before');
  // The shared ghost look (F0.21-95): the item's name on the raised surface.
  const ghost = page.locator('.document-drag-preview');
  await expect(ghost).toHaveClass(/\bdrag-ghost\b/);
  await expect(ghost).toHaveCSS('opacity', '0.92');
  expect(await ghost.evaluate(el => getComputedStyle(el).boxShadow)).not.toBe('none');
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect.poll(s.root).toEqual(['item:' + s.last.id, 'folder:a', 'folder:b', 'item:' + s.first.id]);
}));

test('native mouse dragging drops a file between folders', async ({ page }) => {
  const s = await seed(page, 'document');
  await s.row('item:' + s.last.id).locator('[data-document-open]').dragTo(s.row('folder:a'), { targetPosition: { x: 100, y: 3 } });
  await expect.poll(s.root).toEqual(['item:' + s.last.id, 'folder:a', 'folder:b', 'item:' + s.first.id]);
});

test('dragging near the bottom scrolls a long tree and leaving clears its insertion line', async ({ page }) => {
  const s = await seed(page, 'document');
  for (let i = 0; i < 45; i++) await app.store.createDocument(s.project.id, {title: 'More ' + i});
  await page.reload(); await openList(page);
  const source = s.row('folder:a').locator('[data-document-folder]'), nav = page.locator('#document-explorer nav');
  const transfer = await page.evaluateHandle(() => new DataTransfer());
  await source.dispatchEvent('dragstart', {dataTransfer: transfer});
  const b = await nav.boundingBox();
  await nav.dispatchEvent('dragover', {dataTransfer: transfer,clientX:b.x+100,clientY:b.y+b.height-4});
  await expect.poll(() => nav.evaluate(el => el.scrollTop)).toBeGreaterThan(100);
  await source.dispatchEvent('dragend', {dataTransfer: transfer});
  await expect(page.locator('[data-tree-insert],.document-drop-target')).toHaveCount(0);
  await transfer.dispose();
});
