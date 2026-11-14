import { test, expect, useApp, onDevices } from '../fixtures.mjs';

const app = useApp(async store => ({ project: await store.createProject({ title: 'Checklists' }) }));
const rich = page => page.getByRole('textbox', { name: 'Card description', exact: true });
const source = page => page.locator('#task-form [name="body"]');
async function open(page, body = '') {
  const card = await app.store.createTask(app.project.id, { title: 'Packing', body });
  await page.goto(`${app.base}/#project/${app.project.id}/list`);
  await page.locator(`[data-action="task-open"][data-id="${card.id}"]:visible`).first().click();
  await rich(page).waitFor();
  return card;
}
async function caret(locator, offset = 'end') {
  await locator.evaluate((el, offset) => {
    el.closest('[contenteditable="true"]').focus();
    const range = document.createRange(); range.selectNodeContents(el); range.collapse(offset !== 'end');
    const selection = getSelection(); selection.removeAllRanges(); selection.addRange(range);
  }, offset);
}

onDevices(['desktop', 'phone'], () => test('checkboxes have no bullet and Enter continues with an unchecked item, then exits an empty item @gate', async ({ page }) => {
  await open(page);
  await rich(page).fill('Make bags');
  await page.locator('.task-description [data-rich-command="checklist"]').click();
  await expect(rich(page).locator('li')).toHaveCSS('list-style-type', 'none');
  await caret(rich(page).locator('li'));
  await page.keyboard.press('Enter');
  await expect(rich(page).locator('input[type="checkbox"]')).toHaveCount(2);
  await page.keyboard.type('Bring keys');
  await expect(rich(page).locator('li').first()).toHaveText('Make bags');
  await expect(rich(page).locator('li').last()).toHaveText('Bring keys');
  // Native editors may serialize a loose Markdown list, with blank separator lines.
  await expect(source(page)).toHaveValue(/\[ \] Make bags\s+-\s+\[ \] Bring keys/);
  await page.keyboard.press('Enter');
  await expect(rich(page).locator('input[type="checkbox"]')).toHaveCount(3);
  await page.keyboard.press('Enter');
  await page.keyboard.type('Ordinary paragraph');
  await expect(rich(page).locator('li')).toHaveCount(2);
  await expect(source(page)).toHaveValue(/Bring keys\s+Ordinary paragraph$/);
}));

test('Ctrl+L adds a checkbox, preserves the caret, toggles completion and supports Undo @gate', async ({ page }) => {
  const card = await open(page);
  await rich(page).fill('Pack');
  await caret(rich(page));
  await page.keyboard.press('Control+l');
  await page.keyboard.type(' bags');
  await expect(source(page)).toHaveValue(/^-\s+\[ \] Pack bags$/);
  await page.keyboard.press('Control+l');
  await expect(rich(page).locator('input')).toBeChecked();
  await expect(source(page)).toHaveValue(/\[x\] Pack bags/);
  await page.keyboard.press('Control+z');
  await expect(rich(page).locator('input')).not.toBeChecked();
  await page.keyboard.press('Control+l');
  await expect(source(page)).toHaveValue(/\[x\] Pack bags/);
  await expect.poll(async () => (await app.store.snapshot(app.project.id)).tasks.find(t => t.id === card.id).body).toMatch(/\[x\] Pack bags/);
  await page.locator('[data-action="dialog-close"]').click();
  await page.locator(`[data-action="task-open"][data-id="${card.id}"]:visible`).first().click();
  await expect(rich(page).locator('input')).toBeChecked();
  await expect(rich(page).locator('input')).toBeEnabled();
  await rich(page).locator('input').uncheck();
  await expect(source(page)).toHaveValue(/\[ \] Pack bags/);
});

test('Enter splits a completed checklist into an unchecked next item while Shift+Enter stays in the same item @gate', async ({ page }) => {
  await open(page, '- [x] Make bags');
  await rich(page).locator('li').evaluate(el => {
    const text = [...el.childNodes].find(node => node.nodeType === Node.TEXT_NODE && node.textContent.includes('Make bags'));
    el.closest('[contenteditable]').focus();
    const range = document.createRange(); range.setStart(text, text.textContent.indexOf('bags')); range.collapse(true);
    getSelection().removeAllRanges(); getSelection().addRange(range);
  });
  await page.keyboard.press('Enter');
  await expect(rich(page).locator('li')).toHaveCount(2);
  await expect(rich(page).locator('input').first()).toBeChecked();
  await expect(rich(page).locator('input').last()).not.toBeChecked();
  await page.keyboard.press('Shift+Enter');
  await expect(rich(page).locator('input')).toHaveCount(2);
  await expect(source(page)).toHaveValue(/\[x\] Make/);
});

test('Ctrl+L operates on selected lines in Markdown mode and leaves unrelated text intact @gate', async ({ page }) => {
  await open(page, 'Pack\nBring keys\nLeave this');
  await page.locator('.task-description [data-rich-mode="source"]').click();
  await source(page).evaluate(el => { el.focus(); el.setSelectionRange(0, 16); });
  await page.keyboard.press('Control+l');
  await expect(source(page)).toHaveValue('- [ ] Pack\n- [ ] Bring keys\nLeave this');
  await page.keyboard.press('Control+l');
  await expect(source(page)).toHaveValue('- [x] Pack\n- [x] Bring keys\nLeave this');
});

test('loose checklist paragraphs retain their boxes and ordinary bullets keep their marker @gate', async ({ page }) => {
  await open(page, '- [x] Make bags\n\n- [ ] Bring keys\n\n- Ordinary bullet');
  await expect(rich(page).locator('li').first()).toHaveCSS('list-style-type', 'none');
  await expect(rich(page).locator('li').last()).not.toHaveCSS('list-style-type', 'none');
  await caret(rich(page).locator('li').first().locator('p'));
  await page.keyboard.press('Control+l');
  await expect(source(page)).toHaveValue(/\[ \] Make bags/);
  await expect(source(page)).toHaveValue(/\[ \] Bring keys/);
  await expect(source(page)).toHaveValue(/Ordinary bullet/);
});

test('Ctrl+L toggles selected rich list items without changing an unselected sibling @gate', async ({ page }) => {
  await open(page, '- First\n- Second\n- Third');
  await rich(page).evaluate(el => {
    el.focus(); const items = el.querySelectorAll('li'), range = document.createRange();
    range.setStart(items[0], 0); range.setEnd(items[1], items[1].childNodes.length);
    getSelection().removeAllRanges(); getSelection().addRange(range);
  });
  await page.keyboard.press('Control+l');
  await expect(rich(page).locator('input')).toHaveCount(2);
  await page.keyboard.press('Control+l');
  await expect(rich(page).locator('input:checked')).toHaveCount(2);
  await expect(rich(page).locator('li').last()).toHaveText('Third');
  await expect(rich(page).locator('li').last().locator('input')).toHaveCount(0);
});

onDevices(['phone'], () => test('tapping a rich checkbox saves completion without focusing the text editor', async ({ page }) => {
  await open(page, '- [ ] Make bags');
  await page.evaluate(() => document.activeElement?.blur());
  await rich(page).locator('input').tap();
  await expect(rich(page).locator('input')).toBeChecked();
  await expect(source(page)).toHaveValue(/\[x\] Make bags/);
  expect(await page.evaluate(() => document.activeElement?.isContentEditable)).toBe(false);
}));

test('comments share the checkbox shortcut and Enter behavior @gate', async ({ page }) => {
  await open(page);
  await page.locator('[data-feature="task-comments"]').click();
  const comment = page.getByRole('textbox', { name: 'Comment', exact: true });
  await comment.fill('Make bags'); await caret(comment);
  await page.keyboard.press('Control+l'); await page.keyboard.press('Enter');
  await page.keyboard.type('Bring keys');
  await expect(comment.locator('input')).toHaveCount(2);
  await expect(comment.locator('li').first()).toHaveCSS('list-style-type', 'none');
  await expect(page.locator('#board-comment-text')).toHaveValue(/\[ \] Bring keys/);
});
