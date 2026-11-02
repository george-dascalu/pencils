// Owner request, 2 November 2026: Reading keeps its edit control on the right and its
// page full height, and Document tools visibly identifies the current editing mode.
import { test, expect, onDevices, useApp } from '../fixtures.mjs';
import { chooseDocumentView } from '../helpers/documents.mjs';

const app = useApp(async (store) => {
  const project = await store.createProject({ title: 'Reading layout', key: 'RD' });
  return { project, doc: await store.createDocument(project.id, { title: 'Empty page', body: '' }) };
});

onDevices(['desktop', 'ipad', 'phone'], () => test('Reading keeps a full page, right-aligned editing and a visible current mode @gate', async ({ page, device }) => {
  await page.goto(`${app.base}/#project/${app.project.id}/documents/${app.doc.id}`);
  await page.locator('#document-form .cm-content').waitFor();
  const form = page.locator('#document-form');
  const tools = form.locator('[data-document-action="tools"]');
  const edit = form.getByRole('button', { name: 'Edit document', exact: true });
  await expect(edit).toBeHidden();
  for (const [label, mode] of [['Source', 'source'], ['Reading', 'reading']]) {
    await chooseDocumentView(page, label);
    await expect(tools).toHaveAttribute('data-document-current-mode', mode);
    await expect(tools).toHaveAttribute('title', `Document tools — ${label}`);
    await expect(tools.locator('.document-mode-indicator .icon')).toBeVisible();
  }
  await expect(edit).toBeVisible();
  for (const [look, theme] of [['pencils', 'light'], ['paper', 'light'], ['paper', 'dark']]) {
    await page.evaluate(({ look, theme }) => window.PencilsAppearance.write({ look, theme }), { look, theme });
    await expect.poll(() => form.locator('.document-reading').evaluate((reading) => {
      const page = reading.querySelector('.document-page');
      const rect = page.getBoundingClientRect();
      const style = getComputedStyle(page);
      return Math.abs(reading.clientHeight - rect.height - parseFloat(style.marginTop) - parseFloat(style.marginBottom));
    }), `${look}/${theme}: short content fills its reading area`).toBeLessThan(2);
    const layout = await form.evaluate((form) => {
      const bar = form.querySelector('.document-heading').getBoundingClientRect();
      const tools = form.querySelector('[data-document-action="tools"]').getBoundingClientRect();
      const edit = form.querySelector('[data-document-action="edit"]').getBoundingClientRect();
      const reading = form.querySelector('.document-reading');
      const sheet = reading.querySelector('.document-page').getBoundingClientRect();
      return { right: bar.right - tools.right, order: tools.left - edit.right,
        height: sheet.height, width: sheet.width, overflow: reading.scrollHeight - reading.clientHeight,
        icon: getComputedStyle(form.querySelector('.document-mode-indicator .icon')).width,
        badge: getComputedStyle(form.querySelector('.document-tools-more .icon')).width,
        button: { width: tools.width, height: tools.height } };
    });
    expect(layout.right).toBeLessThanOrEqual(13);
    expect(layout.order).toBeGreaterThanOrEqual(0);
    expect(layout.height).toBeGreaterThan(200);
    expect(layout.width).toBeGreaterThan(device === 'phone' ? 240 : 500);
    expect(layout.overflow).toBeLessThanOrEqual(1);
    expect(layout.icon).toBe('16px');
    expect(layout.badge).toBe('10px');
    expect(layout.button.width).toBe(layout.button.height);
  }
  await edit.click();
  await expect(form).toHaveAttribute('data-document-mode', 'source');
  await expect(edit).toBeHidden();
  await expect(tools).toHaveAttribute('data-document-current-mode', 'source');
  if (device !== 'desktop') await expect(form.locator('.cm-content')).not.toBeFocused();
  await chooseDocumentView(page, 'Live preview');
  await expect(tools).toHaveAttribute('data-document-current-mode', 'live');
}));
