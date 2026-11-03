// Owner request: double-click a document or Table title to rename it in place in the top bar.
import { test, expect, onDevices, useApp } from '../fixtures.mjs';

const app = useApp(async store => ({ project: await store.createProject({ title: 'Tab names', key: 'TN' }) }));
const tab = (page, id) => page.locator(`[data-document-tab="${id}"]`);
const nameField = page => page.getByRole('textbox', { name: 'File name', exact: true });
const saved = id => app.store.getDocument(app.project.id, id);
async function open(page, doc) {
  await page.goto(`${app.base}/#project/${app.project.id}/documents/${doc.id}`);
  await expect(tab(page, doc.id)).toHaveAttribute('aria-current', 'page');
  await page.locator(doc.document_type === 'table' ? '#document-form .document-sheet[data-ready=true]' : '#document-form .cm-content').waitFor();
}

onDevices(['desktop', 'ipad'], () => {
  test('double-click renames Markdown and Table tabs inline without rebuilding their content', { tag: '@gate' }, async ({ page, device }) => {
    for (const type of ['markdown', 'table']) {
      const doc = await app.store.createDocument(app.project.id, { title: `${type} ${device}`, body: 'Keep this content\n', document_type: type });
      await open(page, doc);
      const editor = await page.locator('#document-form').elementHandle();
      await tab(page, doc.id).dblclick();
      const input = nameField(page);
      await expect(input).toBeVisible();
      await expect(input).toBeFocused();
      await expect(input).toHaveValue(doc.title);
      const dimensions = await input.evaluate(el => {
        const box = el.getBoundingClientRect(), parent = el.closest('.document-tab').getBoundingClientRect(), style = getComputedStyle(el);
        return { height: box.height, controlHeight: parseFloat(style.getPropertyValue('--control-height')), right: box.right, parentRight: parent.right, minWidth: style.minWidth };
      });
      expect(dimensions.height).toBeGreaterThanOrEqual(device === 'ipad' ? 44 : dimensions.controlHeight);
      expect(dimensions.right).toBeLessThanOrEqual(dimensions.parentRight + 1);
      expect(dimensions.minWidth).toBe('0px');
      const title = `Renamed ${type} ${device}`;
      await input.fill(` ${title} `);
      await input.press('Enter');
      await expect(input).toHaveCount(0);
      await expect(tab(page, doc.id)).toHaveText(title);
      await expect(tab(page, doc.id)).toBeFocused();
      expect(await editor.evaluate(el => el === document.querySelector('#document-form'))).toBe(true);
      await expect.poll(async () => (await saved(doc.id)).title).toBe(title);
      expect((await saved(doc.id)).body).toBe(doc.body);
      await page.reload();
      await expect(tab(page, doc.id)).toHaveText(title);
    }
  });

  test('an inactive file tab can be double-clicked to rename and Escape keeps its original name', { tag: '@gate' }, async ({ page, device }) => {
    const a = await app.store.createDocument(app.project.id, { title: `First ${device}`, body: 'First content\n' });
    const b = await app.store.createDocument(app.project.id, { title: `Second ${device}`, body: 'Second content\n', document_type: 'table' });
    await open(page, a); await open(page, b);
    await tab(page, a.id).dblclick();
    await expect(nameField(page)).toHaveValue(a.title);
    await nameField(page).fill('Cancelled name');
    await nameField(page).press('Escape');
    await expect(nameField(page)).toHaveCount(0);
    await expect(tab(page, a.id)).toHaveText(a.title);
    expect((await saved(a.id)).title).toBe(a.title);
    await tab(page, a.id).press('F2');
    await nameField(page).fill('   ');
    await nameField(page).press('Enter');
    await expect(tab(page, a.id)).toHaveText(a.title);
    // Clicking elsewhere commits; an ordinary tab click opens the file without an input.
    await tab(page, a.id).dblclick();
    await nameField(page).fill(`Blur saved ${device}`);
    await tab(page, b.id).click();
    await expect.poll(async () => (await saved(a.id)).title).toBe(`Blur saved ${device}`);
    await expect(tab(page, b.id)).toHaveAttribute('aria-current', 'page');
    await expect(nameField(page)).toHaveCount(0);
    expect((await saved(b.id)).title).toBe(b.title);
  });
});
