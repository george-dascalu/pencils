// Owner request: select rendered letters cleanly, format the selection, and set portable text colours.
import { test, expect, useApp, onDevices } from '../fixtures.mjs';
import { chooseDocumentView, documentBarAction, editorSource } from '../helpers/documents.mjs';
const app = useApp(async store => ({ project: await store.createProject({ title: 'Text selections', key: 'TS' }) }));
const tools = page => page.getByRole('toolbar', { name: 'Format selection', exact: true });
async function open(page, body = 'Before selected words after.\n') {
  const doc = await app.store.createDocument(app.project.id, { title: 'Selected text', body });
  await page.goto(`${app.base}/#project/${app.project.id}/documents/${doc.id}`);
  await page.locator('#document-form .cm-content').waitFor(); return doc;
}
async function select(page, text) {
  await page.evaluate(async text => {
    const { EditorView } = await import('/vendor/editor/deps.js');
    const view = EditorView.findFromDOM(document.querySelector('#document-form .cm-editor'));
    const from = view.state.doc.toString().indexOf(text); view.focus();
    view.dispatch({ selection: { anchor: from, head: from + text.length }, scrollIntoView: true });
  }, text);
  await expect(tools(page)).toBeVisible();
}
async function colour(page, value) {
  await tools(page).locator('summary[aria-label="Text colour"]').click();
  const picker = tools(page).locator('.color-picker');
  await picker.getByRole('button', { name: 'Custom colour picker', exact: true }).click();
  await picker.getByRole('textbox', { name: 'Custom colour hex', exact: true }).fill(value);
  await picker.getByRole('button', { name: 'Apply colour', exact: true }).click();
}
onDevices(['desktop', 'ipad', 'phone'], () => test('selection formatting preserves the selected letters, colours and undo in Focus mode', { tag: '@gate' }, async ({ page, device }) => {
  const doc = await open(page);
  await documentBarAction(page, 'Focus mode');
  await select(page, 'selected words');
  await tools(page).getByRole('button', { name: 'Bold', exact: true }).click();
  await expect.poll(() => editorSource(page)).toContain('**selected words**');
  await expect(page.locator('#document-form .cm-content')).not.toContainText('**');
  await expect.poll(() => page.evaluate(() => getSelection().toString())).toBe('selected words');
  await colour(page, '#c43218');
  await expect.poll(async () => (await app.store.getDocument(app.project.id, doc.id)).body).toContain('<span style="color: #c43218">selected words</span>');
  const coloured = page.locator('#document-form .document-text-color').filter({ hasText: 'selected words' }).first();
  await expect(coloured).toHaveCSS('color', 'rgb(196, 50, 24)');
  const bounds = await tools(page).boundingBox();
  expect(bounds.x).toBeGreaterThanOrEqual(0); expect(bounds.x + bounds.width).toBeLessThanOrEqual(page.viewportSize().width);
  const heights = await tools(page).locator('button:visible, summary:visible').evaluateAll(list => list.map(el => el.getBoundingClientRect().height));
  for (const height of heights) expect(height).toBeGreaterThanOrEqual(device === 'desktop' ? 32 : 44);
  await colour(page, '#175cd3');
  await expect(coloured).toHaveCSS('color', 'rgb(23, 92, 211)');
  const source = await editorSource(page); expect((source.match(/<span style=/g) || []).length).toBe(1);
  await page.locator('#document-form .cm-content').press('ControlOrMeta+z');
  await expect.poll(() => editorSource(page)).toContain('#c43218');
  await expect.poll(async () => (await app.store.getDocument(app.project.id, doc.id)).body).toContain('#c43218');
  await page.getByRole('button', { name: 'Focus mode', exact: true }).click();
  await chooseDocumentView(page, 'Reading');
  await expect(page.locator('.document-reading strong .document-text-color')).toHaveCSS('color', 'rgb(196, 50, 24)');
  await page.reload(); await expect(page.locator('.document-reading .document-text-color')).toHaveCSS('color', 'rgb(196, 50, 24)');
}));

test('dragging across formatted text highlights only the letters without revealing Markdown', { tag: '@gate' }, async ({ page }) => {
  await open(page, 'Before **bold words** after.\n');
  const points = await page.evaluate(async () => {
    const { EditorView } = await import('/vendor/editor/deps.js');
    const view = EditorView.findFromDOM(document.querySelector('.cm-editor')), from = view.state.doc.toString().indexOf('bold words');
    return [view.coordsAtPos(from), view.coordsAtPos(from + 'bold words'.length)];
  });
  await page.mouse.move(points[0].left + 1, (points[0].top + points[0].bottom) / 2);
  await page.mouse.down();
  await page.mouse.move(points[1].left, (points[1].top + points[1].bottom) / 2, { steps: 12 });
  await page.mouse.up();
  await expect(tools(page)).toBeVisible();
  await expect.poll(() => page.evaluate(() => getSelection().toString())).toBe('bold words');
  await expect(page.locator('.cm-content')).not.toContainText('**');
  await expect(page.locator('.cm-selectionBackground')).toHaveCount(0);
  expect(await page.locator('.cm-line').first().evaluate(el => getComputedStyle(el, '::selection').backgroundColor)).not.toBe('rgba(0, 0, 0, 0)');
  await tools(page).getByRole('button', { name: 'Italic', exact: true }).click();
  await expect.poll(() => editorSource(page)).toContain('***bold words***');
});

test('table and callout selections retain colours through inline edits and reading', { tag: '@gate' }, async ({ page }) => {
  const doc = await open(page, '> [!note] Note\n> Callout words here.\n\n| Name | Value |\n| --- | --- |\n| Cell words | One |\n');
  for (const [selector, text] of [['.document-callout p', 'Callout words'], ['td', 'Cell words']]) {
    const field = page.locator('#document-form .document-editable-component').locator(selector).filter({ hasText: text }).first();
    await field.evaluate((el, text) => {
      el.focus(); const node = [...el.childNodes].find(node => node.nodeType === Node.TEXT_NODE && node.textContent.includes(text));
      const range = document.createRange(); const from = node.textContent.indexOf(text); range.setStart(node, from); range.setEnd(node, from + text.length);
      const selection = getSelection(); selection.removeAllRanges(); selection.addRange(range);
    }, text);
    await expect(tools(page)).toBeVisible(); await colour(page, '#6941c6');
    await expect(field.locator('[style*="color"]')).toHaveCSS('color', 'rgb(105, 65, 198)');
    await tools(page).getByRole('button', { name: 'Bold', exact: true }).click();
    await tools(page).getByRole('button', { name: 'Highlight', exact: true }).click();
  }
  await expect.poll(async () => (await app.store.getDocument(app.project.id, doc.id)).body).toContain('#6941c6');
  await chooseDocumentView(page, 'Reading');
  await expect(page.locator('.document-reading .document-callout .document-text-color')).toHaveCSS('color', 'rgb(105, 65, 198)');
  await expect(page.locator('.document-reading td .document-text-color')).toHaveCSS('color', 'rgb(105, 65, 198)');
  for (const [selector, text] of [['.document-callout', 'Callout words'], ['td', 'Cell words']]) {
    const mark = page.locator(`.document-reading ${selector} mark`);
    await expect(mark).toHaveText(text); await expect(mark).toHaveCSS('color', 'rgb(105, 65, 198)');
    expect(await mark.evaluate(el => parseInt(getComputedStyle(el).fontWeight))).toBeGreaterThanOrEqual(700);
  }
});

test('colouring a selection across blocks preserves code and table structure', { tag: '@gate' }, async ({ page }) => {
  const code = '```js\nlet x = 1;\n```', table = '| A | B |\n| --- | --- |\n| C | D |';
  await open(page, `First paragraph.\n\n${code}\n\n${table}\n\nLast paragraph.\n`);
  await select(page, await editorSource(page)); await colour(page, '#175cd3');
  const source = await editorSource(page);
  expect(source).toContain(code); expect(source).toContain(table);
  await chooseDocumentView(page, 'Reading');
  await expect(page.locator('.document-reading pre code')).toHaveText('let x = 1;\n');
  await expect(page.locator('.document-reading table td')).toHaveCount(2);
  await expect(page.locator('.document-reading .document-text-color')).toHaveCount(2);
});

test('unsafe CSS stays forbidden when rendering text colours', { tag: '@gate' }, async ({ page }) => {
  await open(page, '<span style="color:#123456;position:fixed;inset:0">Unsafe styling</span> and <span style="color:#123456">Safe colour</span>\n');
  await chooseDocumentView(page, 'Reading');
  const content = page.locator('.document-reading');
  await expect(content.locator('[style*="position"], [style*="inset"]')).toHaveCount(0);
  await expect(content.locator('.document-text-color')).toHaveCSS('color', 'rgb(18, 52, 86)');
});

test('colours crossing bold, highlight and link boundaries preserve the rendered formatting', { tag: '@gate' }, async ({ page }) => {
  for (const [body, selected, selector, content] of [
    ['Before **bold words** after.', 'words** after', 'strong', 'bold words'],
    ['Before *italic words* after.', 'words* after', 'em', 'italic words'],
    ['Before ~~deleted words~~ after.', 'words~~ after', 'del', 'deleted words'],
    ['Before ==highlight words== after.', 'words== after', 'mark', 'highlight words'],
    ['Before [linked words](https://example.com) after.', 'words](https://example.com) after', 'a', 'linked words'],
  ]) {
    await open(page, body); await select(page, selected); await colour(page, '#175cd3');
    await chooseDocumentView(page, 'Reading');
    await expect(page.locator(`.document-reading ${selector}`)).toHaveText(content);
    await expect(page.locator('.document-reading .document-text-color')).toHaveText(['words', ' after']);
    for (const span of await page.locator('.document-reading .document-text-color').all()) await expect(span).toHaveCSS('color', 'rgb(23, 92, 211)');
    await chooseDocumentView(page, 'Live preview');
  }
});

test('selection tools edit the second document and Source without leaking into Reading', { tag: '@gate' }, async ({ page }) => {
  const reference = await open(page, 'Reference words.\n');
  const main = await open(page, 'Main document stays unchanged.\n');
  await page.locator('#document-form [data-document-action=tools]').click();
  await page.getByRole('button', { name: 'Split side by side', exact: true }).click();
  await page.locator('.document-pane .cm-content').evaluate(async el => {
    const { EditorView } = await import('/vendor/editor/deps.js');
    const view = EditorView.findFromDOM(el); view.focus(); view.dispatch({ selection: { anchor: 0, head: 9 } });
  });
  await expect(tools(page)).toBeVisible(); await colour(page, '#b42318');
  await expect.poll(async () => (await app.store.getDocument(app.project.id, reference.id)).body).toContain('#b42318');
  expect((await app.store.getDocument(app.project.id, main.id)).body).toBe('Main document stays unchanged.\n');
  await page.locator('[data-document-action=split-close]').click();
  await chooseDocumentView(page, 'Source'); await select(page, 'document');
  await colour(page, '#175cd3');
  await expect.poll(() => editorSource(page)).toContain('<span style="color: #175cd3">document</span>');
  await chooseDocumentView(page, 'Reading'); await expect(tools(page)).toHaveCount(0);
  await expect(page.locator('.document-reading .document-text-color')).toHaveCSS('color', 'rgb(23, 92, 211)');
});

test('selection highlights, picker and dismissal work in both themes without scrolling the document', { tag: '@gate' }, async ({ page }) => {
  await open(page);
  for (const theme of ['light', 'dark']) {
    await page.evaluate(theme => { document.documentElement.dataset.theme = theme; document.documentElement.dataset.look = 'paper'; }, theme);
    await select(page, 'selected words');
    const before = await page.locator('.cm-scroller').evaluate(el => el.scrollTop);
    await tools(page).locator('summary[aria-label="Text colour"]').click();
    await expect(tools(page).getByRole('button', { name: 'Red', exact: true })).toBeVisible();
    expect(await page.locator('.cm-scroller').evaluate(el => el.scrollTop)).toBe(before);
    expect(await page.evaluate(() => !!CSS.highlights?.get('document-selected-text'))).toBe(true);
    await page.keyboard.press('Escape');
    await expect(tools(page)).toBeVisible();
    await page.keyboard.press('Escape'); await expect(tools(page)).toHaveCount(0);
    await expect(page.locator('.cm-content')).toBeFocused();
  }
});
