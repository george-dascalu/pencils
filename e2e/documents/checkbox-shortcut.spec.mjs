import { test, expect, useApp } from '../fixtures.mjs';
import { editorSource, chooseDocumentView } from '../helpers/documents.mjs';
const app = useApp(async store => ({ project: await store.createProject({ title: 'Document checklists' }) }));

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
