import { test, expect, useApp } from '../fixtures.mjs';
import { editorSource, chooseDocumentView } from '../helpers/documents.mjs';
const app = useApp(async store => ({ project: await store.createProject({ title: 'Document checklists' }) }));

test('typing a Markdown task in Live preview displays its checkbox immediately @gate', async ({ page }) => {
  const doc = await app.store.createDocument(app.project.id, { title: 'Typed checklist', body: '' });
  await page.goto(`${app.base}/#project/${app.project.id}/documents/${doc.id}`);
  await page.locator('.cm-content').click();
  await page.keyboard.type('- [ ] Make bags');
  await expect(page.locator('.document-checkbox')).toBeVisible();
  await expect.poll(() => editorSource(page)).toBe('- [ ] Make bags');
});

test('a saved callout checklist with browser spaces keeps every checkbox through editing @gate', async ({ page }) => {
  const doc = await app.store.createDocument(app.project.id, { title: 'Saved checkboxes', body: '> [!note] Packing\n> - [ ] \u00a0Make bags\n> - [x]\tBring keys\n> - [ ]\n\nKeep this paragraph.' });
  await page.goto(`${app.base}/#project/${app.project.id}/documents/${doc.id}`);
  const field = page.getByRole('textbox', { name: 'Callout content', exact: true });
  await expect(field.getByRole('checkbox')).toHaveCount(3);
  await field.locator('li').last().evaluate(el => {
    el.closest('[contenteditable]').focus(); const range = document.createRange(); range.selectNodeContents(el); range.collapse(false);
    getSelection().removeAllRanges(); getSelection().addRange(range);
  });
  await page.keyboard.type('Ready');
  await expect.poll(() => editorSource(page)).toMatch(/\[ \] Ready/);
  await expect.poll(() => editorSource(page)).not.toMatch(/\u00a0/);
  await expect.poll(() => editorSource(page)).toMatch(/Keep this paragraph\.$/);
});

test('typing a full task marker in an editable callout creates a checkbox before existing text @gate', async ({ page }) => {
  const doc = await app.store.createDocument(app.project.id, { title: 'Typed callout', body: '> [!note] Packing\n> Make bags\n\nKeep this paragraph.' });
  await page.goto(`${app.base}/#project/${app.project.id}/documents/${doc.id}`);
  const field = page.getByRole('textbox', { name: 'Callout content', exact: true });
  await field.waitFor();
  await field.locator('p').evaluate(el => {
    el.closest('[contenteditable]').focus(); const range = document.createRange(); range.selectNodeContents(el); range.collapse(true);
    getSelection().removeAllRanges(); getSelection().addRange(range);
  });
  await page.keyboard.type('- [x] ');
  await expect(field.getByRole('checkbox')).toBeChecked();
  await page.keyboard.type('First: ');
  await expect.poll(() => editorSource(page)).toMatch(/> -\s+\[x\] First: Make bags/);
  await expect.poll(() => editorSource(page)).toMatch(/Keep this paragraph\.$/);
});

for (const mode of ['Live preview', 'Source']) test(`Ctrl+L adds and toggles a document checkbox with Undo in ${mode} @gate`, async ({ page }) => {
  const doc = await app.store.createDocument(app.project.id, { title: 'Packing', body: 'Pack bags\nLeave this' });
  await page.goto(`${app.base}/#project/${app.project.id}/documents/${doc.id}`);
  await page.locator('.cm-content').waitFor();
  await chooseDocumentView(page, mode);
  await page.locator('.cm-content').focus();
  await page.keyboard.press('Control+Home');
  await page.keyboard.press('Control+l');
  await expect.poll(() => editorSource(page)).toBe('- [ ] Pack bags\nLeave this');
  await page.keyboard.press('Control+l');
  await expect.poll(() => editorSource(page)).toBe('- [x] Pack bags\nLeave this');
  await page.keyboard.press('Control+z');
  await expect.poll(() => editorSource(page)).toBe('- [ ] Pack bags\nLeave this');
  await page.keyboard.press('End');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Bring keys');
  await expect.poll(() => editorSource(page)).toBe('- [ ] Pack bags\n- [ ] Bring keys\nLeave this');
});

test('checklists in an editable callout use the same shortcut and Enter behavior @gate', async ({ page }) => {
  const doc = await app.store.createDocument(app.project.id, { title: 'Callout checklist', body: '> [!note] Packing\n> - [ ] Make bags\n\nKeep this paragraph.' });
  await page.goto(`${app.base}/#project/${app.project.id}/documents/${doc.id}`);
  const field = page.getByRole('textbox', { name: 'Callout content', exact: true });
  await field.waitFor();
  await field.locator('li').evaluate(el => {
    el.closest('[contenteditable]').focus(); const range = document.createRange(); range.selectNodeContents(el); range.collapse(false);
    getSelection().removeAllRanges(); getSelection().addRange(range);
  });
  await page.keyboard.press('Control+l');
  await expect(field.locator('input')).toBeChecked();
  await page.keyboard.press('Enter'); await page.keyboard.type('Bring keys');
  await expect(field.locator('input')).toHaveCount(2);
  await expect(field.locator('input').last()).not.toBeChecked();
  await expect.poll(() => editorSource(page)).toMatch(/\[ \] Bring keys/);
  await expect.poll(() => editorSource(page)).toMatch(/Keep this paragraph\.$/);
});
