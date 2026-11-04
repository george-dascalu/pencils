// Owner request: a document-toolbar Focus mode clears the surrounding UI for writing.
import { test, expect, useApp, onDevices } from '../fixtures.mjs';
import { chooseDocumentView, documentBarAction, editorSource, scrollEditorTo } from '../helpers/documents.mjs';

const app = useApp(async store => ({ project: await store.createProject({ title: 'Focused writing', key: 'FW' }) }));
// The bar's button, also while phones keep it hidden outside Focus mode (F0.21-87).
const focus = page => page.locator('#document-form .document-heading [data-document-action="focus"]');
const make = (title, body = 'Write without distractions.\n', type = 'markdown') => app.store.createDocument(app.project.id, { title, body, document_type: type });
async function open(page, doc) {
  await page.goto(`${app.base}/#project/${app.project.id}/documents/${doc.id}`);
  await page.locator(doc.document_type === 'table' ? '#document-form .document-sheet[data-ready=true]' : '#document-form .cm-content').waitFor();
}
const caret = page => page.evaluate(async () => {
  const { EditorView } = await import('/vendor/editor/deps.js');
  return EditorView.findFromDOM(document.querySelector('#document-form .cm-editor')).state.selection.main.anchor;
});

onDevices(['desktop', 'ipad', 'phone'], () => {
  test('Focus mode clears the chrome, preserves writing and exits without rebuilding the editor', { tag: '@gate' }, async ({ page, device }) => {
    const doc = await make(`Focus ${device}`, Array.from({ length: 100 }, (_, i) => `Writing line ${i + 1}`).join('\n\n'));
    await open(page, doc);
    const original = await page.locator('#document-form .cm-editor').elementHandle();
    await scrollEditorTo(page, 'Writing line 65');
    await page.evaluate(async () => {
      const { EditorView } = await import('/vendor/editor/deps.js');
      const view = EditorView.findFromDOM(document.querySelector('#document-form .cm-editor'));
      view.dispatch({ selection: { anchor: view.state.doc.toString().indexOf('Writing line 65') } });
      window.__focusTextEvents = 0;
      document.addEventListener('focusin', event => { if (event.target.matches('input, textarea, [contenteditable=true]')) window.__focusTextEvents++; });
    });
    const before = await caret(page), top = (await page.locator('.document-writing').boundingBox()).y;
    await documentBarAction(page, 'Focus mode', { tap: device !== 'desktop' });
    await expect(focus(page)).toHaveAttribute('aria-pressed', 'true');
    await expect(focus(page)).toHaveAccessibleName('Focus mode');
    await expect(page.locator('.topbar')).toBeHidden();
    await expect(page.locator('.topbar .tabs')).toBeHidden();
    await expect(page.locator('#document-formatting')).toBeHidden();
    await expect(page.locator('#document-form [data-document-action=tools]')).toBeHidden();
    await expect(page.locator('#document-form [data-document-action=properties]')).toBeHidden();
    expect(await original.evaluate(el => el === document.querySelector('#document-form .cm-editor'))).toBe(true);
    expect(await caret(page)).toBe(before);
    if (device !== 'desktop') expect(await page.evaluate(() => window.__focusTextEvents)).toBe(0);
    const writing = await page.locator('.document-writing').boundingBox();
    expect(writing.y).toBeLessThan(top);
    expect(writing.height).toBeGreaterThan(page.viewportSize().height * 0.8);
    expect(await page.locator('.documents-workspace').evaluate(el => getComputedStyle(el).borderTopWidth)).toBe('0px');
    expect(await focus(page).evaluate(el => el.getBoundingClientRect().height)).toBeGreaterThanOrEqual(device === 'desktop' ? 32 : 44);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
    await page.locator('#document-form .cm-content').click();
    await page.keyboard.press('ControlOrMeta+End');
    await page.keyboard.type('\nWritten in focus mode.');
    await expect.poll(async () => (await app.store.getDocument(app.project.id, doc.id)).body).toContain('Written in focus mode.');
    await page.keyboard.press('ControlOrMeta+z');
    await expect.poll(() => editorSource(page)).not.toContain('Written in focus mode.');
    await focus(page).click();
    await expect(focus(page)).toHaveAttribute('aria-pressed', 'false');
    await expect(page.locator('.topbar')).toBeVisible();
    await expect(page.locator('#document-formatting')).toBeVisible();
    expect(await original.evaluate(el => el.isConnected)).toBe(true);
    // Compact mode uses the same shared button height, and Escape is an alternative exit.
    if (device === 'desktop') await page.evaluate(() => document.documentElement.dataset.density = 'compact');
    await documentBarAction(page, 'Focus mode');
    await expect(focus(page)).toHaveCSS('height', device === 'desktop' ? '28px' : '44px');
    await page.keyboard.press('Escape');
    await expect(focus(page)).toHaveAttribute('aria-pressed', 'false');
  });
});

test('Focus preserves Source mode and Escape closes its search before leaving focus', { tag: '@gate' }, async ({ page }) => {
  const doc = await make('Source focus'); await open(page, doc);
  await chooseDocumentView(page, 'Source'); await focus(page).click();
  await expect(page.locator('#document-form')).toHaveAttribute('data-document-mode', 'source');
  await page.keyboard.press('ControlOrMeta+f');
  await expect(page.locator('.cm-search')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('.cm-search')).toHaveCount(0);
  await expect(focus(page)).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('Escape');
  await expect(focus(page)).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('#document-form')).toHaveAttribute('data-document-mode', 'source');
});

test('Focus temporarily hides a second pane and restores its content and split size', { tag: '@gate' }, async ({ page }) => {
  const a = await make('Second pane', 'Reference text\n'), b = await make('Main pane');
  await open(page, a); await open(page, b);
  await page.locator('#document-form [data-document-action=tools]').click();
  await page.getByRole('button', { name: 'Split side by side', exact: true }).click();
  const divider = page.getByRole('separator', { name: 'Resize document panes' });
  await divider.focus(); await divider.press('ArrowLeft');
  const size = await divider.getAttribute('aria-valuenow');
  const paneEditor = await page.locator('.document-pane .cm-editor').elementHandle();
  await focus(page).click();
  await expect(page.locator('.document-pane')).toBeHidden(); await expect(divider).toBeHidden();
  expect((await page.locator('.document-editor').boundingBox()).width).toBeGreaterThan(page.viewportSize().width - 4);
  await focus(page).click();
  await expect(page.locator('.document-pane')).toBeVisible();
  await expect(page.locator('.document-pane .cm-content')).toContainText('Reference text');
  await expect(divider).toHaveAttribute('aria-valuenow', size);
  expect(await paneEditor.evaluate(el => el.isConnected)).toBe(true);
});

test('Reading and Table documents support focus, and leaving Documents restores navigation', { tag: '@gate' }, async ({ page }) => {
  const doc = await make('Reading focus', '# Focused reading\n\nReadable page.\n'); await open(page, doc);
  await chooseDocumentView(page, 'Reading'); await focus(page).click();
  await expect(page.locator('.document-reading')).toBeVisible();
  await expect(page.locator('#document-form')).toHaveAttribute('data-document-mode', 'reading');
  expect((await page.locator('.document-reading').boundingBox()).height).toBeGreaterThan(page.viewportSize().height * 0.8);
  await page.keyboard.press('Escape');
  // Spreadsheets share the documents' view (F0.21-88), so edit in Live preview.
  const table = await make('Table focus', '', 'table'); await open(page, table); await chooseDocumentView(page, 'Live preview'); await focus(page).click();
  const cell = page.locator('#document-form [data-sheet-cell=A1]');
  await cell.dblclick(); await page.locator('[data-sheet-editor]').fill('Focused cell');
  await page.locator('[data-sheet-editor]').press('Enter');
  await expect(cell).toHaveText('Focused cell');
  await expect.poll(async () => JSON.stringify((await app.store.getDocument(app.project.id, table.id)).table)).toContain('Focused cell');
  await page.evaluate(hash => location.hash = hash, `#project/${app.project.id}/list`);
  await expect(page.locator('.topbar')).toBeVisible();
  await expect(page.locator('.main.document-focus')).toHaveCount(0);
  await open(page, table);
  await expect(focus(page)).toHaveAttribute('aria-pressed', 'false');
  await expect(cell).toHaveText('Focused cell');
});

test('Focus keeps failed-save recovery visible while edits remain in the browser', { tag: '@gate' }, async ({ page }) => {
  const doc = await make('Recover focused writing'); await open(page, doc);
  await page.route(`**/api/projects/${app.project.id}/documents/${doc.id}`, route => route.request().method() === 'PATCH'
    ? route.fulfill({ status: 503, json: { error: 'Save temporarily unavailable' } }) : route.continue());
  await focus(page).click();
  await page.keyboard.press('ControlOrMeta+End'); await page.keyboard.type(' Keep this draft.');
  await expect(page.locator('[data-document-save-problem]')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Review pending save', exact: true })).toBeVisible();
  await expect(focus(page)).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(() => editorSource(page)).toContain('Keep this draft.');
  await focus(page).click();
  await expect(page.locator('[data-document-save-problem]')).toBeVisible();
});
