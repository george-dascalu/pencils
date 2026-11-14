import { test, expect, useApp, onDevices } from '../fixtures.mjs';

const app = useApp(async store => ({ project: await store.createProject({ title: 'Typed checklists' }) }));
const rich = page => page.getByRole('textbox', { name: 'Card description', exact: true });
const source = page => page.locator('#task-form [name="body"]');
async function open(page, body = '') {
  const card = await app.store.createTask(app.project.id, { title: 'Packing', body });
  await page.goto(`${app.base}/#project/${app.project.id}/list`);
  await page.locator(`[data-action="task-open"][data-id="${card.id}"]:visible`).first().click();
  await rich(page).click();
  return card;
}
async function edge(locator, start = false) {
  await locator.evaluate((el, start) => {
    el.closest('[contenteditable="true"]').focus();
    const range = document.createRange(); range.selectNodeContents(el); range.collapse(start);
    getSelection().removeAllRanges(); getSelection().addRange(range);
  }, start);
}

onDevices(['desktop', 'phone'], () => test('typing a task marker makes a checkbox and keeps typing and Enter in its list @gate', async ({ page }) => {
  const card = await open(page);
  await page.keyboard.type('- [ ] ');
  await expect(rich(page).getByRole('checkbox')).toHaveCount(1);
  await expect(rich(page).locator('li')).toHaveCSS('list-style-type', 'none');
  await page.keyboard.type('Make bags');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Bring keys');
  await expect(rich(page).getByRole('checkbox')).toHaveCount(2);
  await expect(source(page)).toHaveValue(/^-\s+\[ \] Make bags\s+-\s+\[ \] Bring keys$/);
  await expect.poll(async () => (await app.store.snapshot(app.project.id)).tasks.find(t => t.id === card.id).body).toMatch(/\[ \] Bring keys$/);
  await page.reload();
  await page.locator(`[data-action="task-open"][data-id="${card.id}"]:visible`).first().click();
  await expect(rich(page).getByRole('checkbox')).toHaveCount(2);
}));

for (const marker of ['- [x]', '* [X]', '+ [x]', '1. [x]']) test(`typing ${marker} creates a checked item @gate`, async ({ page }) => {
  await open(page);
  await page.keyboard.type(`${marker} Packed`);
  await expect(rich(page).getByRole('checkbox'), marker).toBeChecked();
  await expect(rich(page).locator('li')).toHaveText('Packed');
  await expect(source(page)).toHaveValue(/\[x\] Packed$/);
});

test('a task marker at the start of an existing bullet preserves its text and nested list @gate', async ({ page }) => {
  await open(page, '- Pack bags\n  - Keep this\n- Leave this');
  await edge(rich(page).locator('li').first(), true);
  await page.keyboard.type('[ ] ');
  await expect(rich(page).getByRole('checkbox')).toHaveCount(1);
  await page.keyboard.type('First: ');
  await expect(source(page)).toHaveValue(/\[ \] First: Pack bags\s+-\s+Keep this\s+-\s+Leave this$/);
  await expect(rich(page).locator('li li')).not.toHaveCSS('list-style-type', 'none');
});

test('typed task conversion supports Undo without destroying the list text @gate', async ({ page }) => {
  await open(page, '- ');
  await edge(rich(page).locator('li'));
  await page.keyboard.type('[ ]');
  await page.keyboard.press('Space');
  await expect(rich(page).getByRole('checkbox')).toHaveCount(1);
  await page.keyboard.press('Control+z');
  await expect(rich(page).getByRole('checkbox')).toHaveCount(0);
  await expect(rich(page)).toContainText('[ ]');
});

test('task-like text stays literal inside prose, code and an existing checklist @gate', async ({ page }) => {
  await open(page, 'Prose\n\n`Code`\n\n- [ ] Existing');
  for (const target of [rich(page).locator('p').first(), rich(page).locator('code'), rich(page).locator('li')]) {
    await edge(target);
    await page.keyboard.type(' - [ ] literal');
    await expect(target).toContainText('- [ ] literal');
  }
  await expect(rich(page).getByRole('checkbox')).toHaveCount(1);
});

test('composition, pasted text and source mode do not run the typing conversion @gate', async ({ page }) => {
  await open(page, '- Before');
  await rich(page).locator('li').evaluate(el => { el.textContent = '[ ]'; });
  await edge(rich(page).locator('li'));
  for (const input of [{ inputType: 'insertText', data: ' ', isComposing: true }, { inputType: 'insertFromPaste', data: ' ' }]) {
    const accepted = await rich(page).evaluate((el, init) => el.dispatchEvent(new InputEvent('beforeinput', { bubbles: true, cancelable: true, ...init })), input);
    expect(accepted).toBe(true);
    await expect(rich(page).getByRole('checkbox')).toHaveCount(0);
  }
  await page.keyboard.press('Space');
  await expect(rich(page).getByRole('checkbox')).toHaveCount(1);
  await page.locator('.task-description [data-rich-mode="source"]').click();
  await source(page).fill(''); await source(page).focus();
  await page.keyboard.type('- [ ] Literal source');
  await expect(source(page)).toHaveValue('- [ ] Literal source');
});

onDevices(['desktop', 'phone'], () => test('saved tasks with browser spaces and empty tasks render as checkboxes @gate', async ({ page }) => {
  await open(page, '- [ ] Make bags\n- [ ] \u00a0Push changes\n- [\u00a0]\u00a0Pack laptop\n- [x]\tDone\n- [ ]');
  await expect(rich(page).getByRole('checkbox')).toHaveCount(5);
  for (const item of await rich(page).locator('li').all()) await expect(item).toHaveCSS('list-style-type', 'none');
  await edge(rich(page).locator('li').last()); await page.keyboard.type('Last task');
  await expect(source(page)).not.toHaveValue(/\u00a0|\\\[/);
  await page.locator('.task-description [data-rich-mode="source"]').click();
  await page.locator('.task-description [data-rich-mode="rich"]').click();
  await expect(rich(page).getByRole('checkbox')).toHaveCount(5);
}));

test('escaped checkbox examples remain literal until explicitly made a checklist @gate', async ({ page }) => {
  await open(page, '- [ ] Real\n- \\[ \\] Example\n- `[ ]` Code');
  await expect(rich(page).getByRole('checkbox')).toHaveCount(1);
  await edge(rich(page).locator('li').nth(1));
  await page.keyboard.press('Control+l');
  await expect(rich(page).locator('li').nth(1)).toHaveText('Example');
  await expect(source(page)).toHaveValue(/\[ \] Example/);
  await expect(rich(page).getByRole('checkbox')).toHaveCount(2);
});
