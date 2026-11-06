import {test, expect, useApp, onDevices} from '../fixtures.mjs';
import {newCard} from '../helpers/new-card.mjs';
import {chooseCardPane} from '../helpers/card-panes.mjs';
import {axeViolations} from '../helpers/documents.mjs';
const app = useApp(async store => ({project: await store.createProject({title: 'Card note deck'})}));
const section = page => page.getByRole('region', {name: 'Notes', exact: true});
const rich = page => section(page).getByRole('textbox', {name: 'Note text', exact: true});
const saved = async id => (await app.store.snapshot(app.project.id)).tasks.find(t => t.id === id);
async function open(page, card) {
  await page.goto(`${app.base}/#project/${app.project.id}/list`);
  await page.locator(`[data-action="task-open"][data-id="${card.id}"]:visible`).first().click();
  await expect(page.locator('#task-form')).toBeVisible();
}
onDevices(['desktop', 'ipad', 'phone'], () => {
  test('notes add, format, page, save, reopen and delete without changing the description @gate', async ({page, device}) => {
    const card = await app.store.createTask(app.project.id, {title: 'Notes on this device', body: 'Separate description'});
    await open(page, card); const notes = section(page);
    await notes.getByRole('button', {name: 'New note', exact: true}).click();
    if (device !== 'desktop') await expect(rich(page)).not.toBeFocused();
    await rich(page).fill('First note'); await rich(page).selectText();
    await notes.getByRole('button', {name: 'Bold', exact: true}).click();
    await notes.getByRole('button', {name: 'New note', exact: true}).click();
    await rich(page).fill('Second note');
    await expect(notes.locator('output')).toHaveText('2 / 2');
    await notes.getByRole('button', {name: 'Finish editing note', exact: true}).click();
    await notes.getByRole('button', {name: 'Previous note', exact: true}).click();
    await expect(notes.locator('.inline-preview strong,b')).toHaveText('First note');
    await notes.locator('.inline-preview').focus(); await page.keyboard.press('ArrowRight');
    await expect(notes.locator('.inline-preview')).toHaveText('Second note');
    await expect.poll(async () => (await saved(card.id)).notes?.map(n => n.body)).toEqual(['**First note**', 'Second note']);
    expect((await saved(card.id)).body).toBe('Separate description');
    await page.reload(); await page.locator(`[data-action="task-open"][data-id="${card.id}"]:visible`).first().click();
    await expect(section(page).locator('output')).toHaveText('1 / 2');
    await section(page).getByRole('button', {name: 'Edit note', exact: true}).click();
    await expect(section(page).locator('.rich-toolbar')).toHaveCSS('flex-wrap', 'nowrap');
    await expect(section(page).locator('.task-notes-heading')).toHaveCSS('display', 'flex');
    const add = section(page).getByRole('button', {name: 'New note', exact: true});
    expect((await add.boundingBox()).height).toBeGreaterThanOrEqual(device === 'desktop' ? 32 : 44);
    for (let i = 0; i < 2; i++) {
      await section(page).getByRole('button', {name: 'Delete note', exact: true}).click();
      await page.getByRole('alertdialog', {name: 'Delete note?', exact: true}).getByRole('button', {name: 'Delete note', exact: true}).click();
    }
    await expect.poll(async () => (await saved(card.id)).notes).toEqual([]);
    await expect(section(page)).toContainText('No notes yet.');
  });
});
test('paging keeps the note being edited, or read, as it was (F0.22-27)', async ({page}) => {
  const card = await app.store.createTask(app.project.id, {title: 'Paging notes', notes: [{id: 'n-a', body: 'Note A'}, {id: 'n-b', body: 'Note B'}]});
  await open(page, card); const notes = section(page);
  await notes.getByRole('button', {name: 'Edit note', exact: true}).click();
  await notes.getByRole('button', {name: 'Next note', exact: true}).click();
  await expect(notes.locator('output')).toHaveText('2 / 2');
  await expect(rich(page)).toBeVisible();
  await expect(notes.getByRole('button', {name: 'Finish editing note', exact: true})).toBeVisible();
  await notes.getByRole('button', {name: 'Finish editing note', exact: true}).click();
  await notes.getByRole('button', {name: 'Previous note', exact: true}).click();
  await expect(notes.locator('.inline-preview')).toHaveText('Note A');
  await expect(rich(page)).toBeHidden();
});
onDevices(['desktop', 'small'], () => test('the notes bar puts a small New beside its title, and Attach files after Edit adds files to the note (F0.22-28, F0.22-32)', async ({page, device}) => {
  const card = await app.store.createTask(app.project.id, {title: 'Notes bar', notes: [{id: 'n-bar', body: 'Bar note'}]});
  await open(page, card); const notes = section(page), bar = notes.locator('.task-notes-heading');
  const add = notes.getByRole('button', {name: 'New note', exact: true});
  await expect(add).toHaveText('New');
  await expect(add).toHaveClass(/\bprimary\b/);
  const [b, a] = [await bar.boundingBox(), await add.boundingBox()];
  const [title, group] = [await notes.locator('.task-notes-heading h3').boundingBox(), await notes.locator('.task-notes-heading [role=group]').boundingBox()];
  // Right after the title (F0.22-32), with the actions at the bar's end.
  expect(a.x, 'New clears the title').toBeGreaterThanOrEqual(title.x + title.width - 1);
  const text = await notes.locator('.task-notes-heading h3').evaluate((el) => { const r = document.createRange(); r.selectNodeContents(el); return r.getBoundingClientRect().right; });
  expect(a.x, 'New sits beside the title\'s text').toBeLessThanOrEqual(text + 12);
  expect(a.x + a.width, 'New clears the actions').toBeLessThanOrEqual(group.x + 1);
  expect(Math.abs(group.x + group.width - (b.x + b.width)), 'the actions end the bar').toBeLessThan(2);
  // Drawn at the list chip's height inside its full-height target, so touch keeps 44px.
  const size = await add.evaluate((el) => ({ fill: parseFloat(getComputedStyle(el, '::before').height), chip: parseFloat(getComputedStyle(el).getPropertyValue('--list-field-height')),
    target: el.getBoundingClientRect().height, own: getComputedStyle(el).backgroundColor, paint: getComputedStyle(el, '::before').backgroundColor }));
  expect(size.fill, 'a list chip tall').toBe(size.chip);
  expect(size.fill, 'smaller than its target').toBeLessThan(size.target);
  expect(size.target, 'the full control height').toBeGreaterThanOrEqual(device === 'small' ? 44 : 32);
  expect(size.own, 'only the chip is filled').toBe('rgba(0, 0, 0, 0)');
  expect(size.paint, 'in the primary colour').not.toBe('rgba(0, 0, 0, 0)');
  expect(await notes.locator('.task-notes-heading [role=group] button:visible').evaluateAll(els => els.every(el => el.getBoundingClientRect().left >= el.parentElement.getBoundingClientRect().left - 1)), 'no action spills out of its group').toBe(true);
  expect(await notes.locator('.task-notes-heading [role=group] button:visible').evaluateAll(els => els.map(el => el.getAttribute('aria-label'))))
    .toEqual(['Edit note', 'Attach files to note', 'Delete note']);
  // The bar's button is the one way to attach; the empty attachments list stays out of sight.
  await expect(notes.locator('.task-attachment-choose')).toHaveCount(0);
  await expect(notes.locator('.task-attachments')).toBeHidden();
  const chooser = page.waitForEvent('filechooser');
  await notes.getByRole('button', {name: 'Attach files to note', exact: true}).click();
  await (await chooser).setFiles({name: 'bar.txt', mimeType: 'text/plain', buffer: Buffer.from('From the bar')});
  await expect(notes.getByRole('button', {name: 'Preview bar.txt', exact: true})).toBeVisible();
  await expect(notes.locator('.task-attachments')).toBeVisible();
  await expect.poll(async () => (await saved(card.id)).notes?.[0]?.body).toContain('bar.txt');
}));
test('note attachments use the shared uploader and preview, stay with their note and survive edits', async ({page}) => {
  const card = await app.store.createTask(app.project.id, {title: 'Note attachments'}); await open(page, card);
  await section(page).getByRole('button', {name: 'New note', exact: true}).click(); await rich(page).fill('Evidence');
  await section(page).locator('input[type=file]').setInputFiles({name: 'note [evidence].txt', mimeType: 'text/plain', buffer: Buffer.from('Attached to this note')});
  await expect(section(page).getByRole('button', {name: 'Preview note [evidence].txt', exact: true})).toBeVisible();
  await rich(page).fill('Revised evidence');
  await section(page).getByRole('button', {name: 'New note', exact: true}).click(); await rich(page).fill('Without files');
  await expect(section(page).locator('.task-attachment-open')).toHaveCount(0);
  await section(page).getByRole('button', {name: 'Previous note', exact: true}).click();
  await section(page).getByRole('button', {name: 'Preview note [evidence].txt', exact: true}).click();
  await expect(page.locator('#task-note-attachment-preview')).toContainText('Attached to this note');
  await page.keyboard.press('Escape'); await expect(page.locator('#task-form')).toBeVisible();
  await expect.poll(async () => (await saved(card.id)).notes?.[0]?.body).toContain('Revised evidence');
  expect((await saved(card.id)).notes[0].body).toContain('../attachments/a-');
  expect((await saved(card.id)).body).toBe('');
});
test('new card browser drafts retain the whole deck and history records note changes', async ({page}) => {
  await page.goto(`${app.base}/#project/${app.project.id}/list`); await newCard(page);
  for (const text of ['Draft one', 'Draft two']) { await section(page).getByRole('button', {name: 'New note', exact: true}).click(); await rich(page).fill(text); }
  page.once('dialog', d => d.accept()); await page.locator('.task-dialog [data-action="dialog-close"]').click();
  await newCard(page); await page.getByRole('button', {name: 'Restore draft', exact: true}).click();
  await expect(section(page).locator('output')).toHaveText('1 / 2');
  await page.locator('#task-form [name=title]').fill('Created with notes'); await page.getByRole('button', {name: 'Create card', exact: true}).click();
  await expect.poll(async () => (await app.store.snapshot(app.project.id)).tasks.find(t => t.title === 'Created with notes')?.notes?.length).toBe(2);
  const card = (await app.store.snapshot(app.project.id)).tasks.find(t => t.title === 'Created with notes');
  await open(page, card); await section(page).getByRole('button', {name: 'Edit note', exact: true}).click(); await rich(page).fill('Revised draft');
  await expect.poll(async () => (await saved(card.id)).notes[0].body).toBe('Revised draft');
  await chooseCardPane(page, 'history'); await expect(page.locator('.task-history-panel')).toContainText('Note 1');
  await expect(page.locator('.task-history-panel')).toContainText('Draft one');
});
onDevices(['ipad', 'phone'], () => test('a swipe pages a reading note without opening the keyboard, and long notes scroll vertically @gate', async ({page}) => {
  const card = await app.store.createTask(app.project.id, {title: 'Swipe notes', notes: [{id: 'n-first', body: 'First reading note'}, {id: 'n-second', body: Array.from({length: 80}, (_, i) => `Paragraph ${i}`).join('\n\n')}]});
  await open(page, card);
  const preview = section(page).locator('.inline-preview');
  await expect(preview).toHaveCSS('touch-action', 'pan-y');
  await preview.evaluate(el => {
    el.dispatchEvent(new PointerEvent('pointerdown', {bubbles: true, pointerType: 'touch', pointerId: 7, clientX: 210, clientY: 120}));
    el.dispatchEvent(new PointerEvent('pointerup', {bubbles: true, pointerType: 'touch', pointerId: 7, clientX: 100, clientY: 125}));
  });
  await expect(section(page).locator('output')).toHaveText('2 / 2');
  await expect(rich(page)).not.toBeVisible();
  expect(await preview.evaluate(el => el.scrollHeight > el.clientHeight)).toBe(true);
  await preview.evaluate(el => {el.scrollTop = 200;}); expect(await preview.evaluate(el => el.scrollTop)).toBeGreaterThan(0);
  await preview.evaluate(el => {
    el.dispatchEvent(new PointerEvent('pointerdown', {bubbles: true, pointerType: 'touch', pointerId: 8, clientX: 100, clientY: 120}));
    el.dispatchEvent(new PointerEvent('pointerup', {bubbles: true, pointerType: 'touch', pointerId: 8, clientX: 220, clientY: 125}));
  });
  await expect(section(page).locator('output')).toHaveText('1 / 2');
}));
test('an upload stays on its note while typing and blocks paging or closing until it finishes', async ({page}) => {
  const card = await app.store.createTask(app.project.id, {title: 'Pending note files'}); await open(page, card);
  await section(page).getByRole('button', {name: 'New note', exact: true}).click();
  let release, reached; const arrived = new Promise(resolve => {reached = resolve;});
  await page.route(`**/api/projects/${app.project.id}/attachments`, async route => {
    await new Promise(resolve => {release = resolve; reached();}); await route.continue();
  });
  await section(page).locator('input[type=file]').setInputFiles({name: 'pending.txt', mimeType: 'text/plain', buffer: Buffer.from('Pending file')});
  await arrived; await expect(section(page).getByRole('button', {name: 'New note', exact: true})).toBeDisabled();
  await rich(page).fill('Typed while uploading'); await page.locator('.task-dialog [data-action="dialog-close"]').click();
  await expect(page.locator('#task-form')).toBeVisible(); release();
  await expect(section(page).getByRole('button', {name: 'New note', exact: true})).toBeEnabled();
  await expect.poll(async () => (await saved(card.id)).notes?.[0]?.body).toContain('pending.txt');
  expect((await saved(card.id)).notes[0].body).toContain('Typed while uploading');
});
test('dropping a file on a note uploads once and leaves the card description attachments alone', async ({page}) => {
  const card = await app.store.createTask(app.project.id, {title: 'Drop on note', body: 'Card description'}); await open(page, card);
  await section(page).getByRole('button', {name: 'New note', exact: true}).click();
  let uploads = 0; page.on('request', request => {if (request.method() === 'POST' && request.url().endsWith('/attachments')) uploads++;});
  await section(page).locator('.task-note-card').evaluate(el => {
    const dataTransfer = new DataTransfer(); dataTransfer.items.add(new File(['Dropped note file'], 'dropped.txt', {type: 'text/plain'}));
    for (const type of ['dragenter','dragover','drop']) el.dispatchEvent(new DragEvent(type, {bubbles: true, cancelable: true, dataTransfer}));
  });
  await expect(section(page).getByRole('button', {name: 'Preview dropped.txt', exact: true})).toBeVisible();
  expect(uploads).toBe(1); await expect.poll(async () => (await saved(card.id)).notes?.[0]?.body).toContain('dropped.txt');
  expect((await saved(card.id)).body).toBe('Card description');
  await expect(page.locator('.task-description .task-attachment-open')).toHaveCount(0);
});
test('a board draft keeps notes through reload and finalising it into a project card', async ({page}) => {
  await page.goto(`${app.base}/#project/${app.project.id}/board`);
  await page.locator('[data-action="board-task"]').click(); await page.locator('[data-action="board-create-draft"]').click();
  await page.locator('#task-form [name=title]').fill('Draft with notes');
  await section(page).getByRole('button', {name: 'New note', exact: true}).click(); await rich(page).fill('Board draft note');
  await page.locator('.task-dialog [data-action="dialog-close"]').click();
  await expect.poll(async () => (await app.store.snapshot(app.project.id)).boards[0].nodes.find(n => n.draft?.title === 'Draft with notes')?.draft?.notes?.[0]?.body).toBe('Board draft note');
  const draft = (await app.store.snapshot(app.project.id)).boards[0].nodes.find(n => n.draft?.title === 'Draft with notes');
  await page.reload(); const node = page.locator(`[data-node="${draft.id}"]`);
  await node.locator('[data-pro="draft-edit"]').click(); await expect(section(page).locator('.inline-preview')).toHaveText('Board draft note');
  await page.locator('.task-dialog [data-action="dialog-close"]').click();
  await node.getByRole('button', {name: 'Finalise card', exact: true}).click();
  await page.locator('#draft-finalise-confirm').click();
  await expect.poll(async () => (await app.store.snapshot(app.project.id)).tasks.find(t => t.title === 'Draft with notes')?.notes?.[0]?.body).toBe('Board draft note');
});
test('notes survive failed saves and reload, then sync when the server returns', async ({page}) => {
  const card = await app.store.createTask(app.project.id, {title: 'Offline note'}); await open(page, card);
  const url = `**/api/projects/${app.project.id}/tasks/${card.id}`;
  await page.route(url, route => route.request().method() === 'PATCH' ? route.fulfill({status: 503, json: {error: 'Test offline'}}) : route.continue());
  await section(page).getByRole('button', {name: 'New note', exact: true}).click(); await rich(page).fill('Kept offline');
  await expect(page.locator('[data-autosave-status]')).toContainText('Pending');
  await page.reload(); await page.locator(`[data-action="task-open"][data-id="${card.id}"]:visible`).first().click();
  await expect(section(page).locator('.inline-preview')).toContainText('Kept offline'); await page.unroute(url);
  await expect.poll(async () => (await saved(card.id)).notes?.[0]?.body, {timeout: 15000}).toBe('Kept offline');
});
test('turning off Notes hides the component without dropping its saved content', async ({page}) => {
  const project = await app.store.createProject({title: 'Notes disabled', schema: {off: ['notes']}});
  const card = await app.store.createTask(project.id, {title: 'Hidden notes', notes: [{id: 'n-kept', body: 'Keep this note'}]});
  await page.goto(`${app.base}/#project/${project.id}/list`); await page.locator(`[data-action="task-open"][data-id="${card.id}"]:visible`).first().click();
  await expect(section(page)).toHaveCount(0); await page.locator('#task-form [name=title]').fill('Edited without Notes');
  await expect.poll(async () => (await app.store.snapshot(project.id)).tasks.find(t => t.id === card.id)?.title).toBe('Edited without Notes');
  expect((await app.store.snapshot(project.id)).tasks.find(t => t.id === card.id).notes).toEqual([{id: 'n-kept', body: 'Keep this note'}]);
});
onDevices(['desktop', 'phone'], () => test('rich notes render document components and stay accessible and contained in light and dark @gate', async ({page, device}, testInfo) => {
  const body = '# Review notes\n\n**Bold** and *italic*.\n\n> A useful quote\n\n- [ ] A checklist item\n\n```js\nconst ready = true;\n```\n\n| Item | State |\n| --- | --- |\n| Draft | Ready |';
  const card = await app.store.createTask(app.project.id, {title: 'Rich note components', notes: [{id: 'n-rich', body}]});
  await open(page, card); const notes = section(page), preview = notes.locator('.inline-preview');
  await expect(preview.locator('h1')).toHaveText('Review notes'); await expect(preview.locator('table')).toContainText('Ready');
  await expect(preview.locator('blockquote')).toContainText('A useful quote'); await expect(preview.locator('pre code')).toContainText('const ready');
  await expect(preview.locator('input[type=checkbox]')).toHaveCount(1);
  for (const theme of ['light', 'dark']) {
    await page.evaluate(theme => {document.documentElement.dataset.theme = theme;}, theme);
    await notes.getByRole('button', {name: 'Edit note', exact: true}).click();
    if (device !== 'desktop') expect(parseFloat(await rich(page).evaluate(el => getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(16);
    expect(await axeViolations(page, '.task-notes', ['wcag2a','wcag2aa','wcag21aa','wcag22aa'])).toEqual([]);
    await notes.getByRole('button', {name: 'Finish editing note', exact: true}).click();
    await notes.scrollIntoViewIfNeeded();
    const box = await notes.boundingBox(); expect(box.x).toBeGreaterThanOrEqual(0); expect(box.x + box.width).toBeLessThanOrEqual(page.viewportSize().width + 1);
    await page.screenshot({path: testInfo.outputPath(`notes-${theme}.png`)});
  }
}));
// F0.22-35, F0.22-36: "## " in an empty note or description makes the heading where the caret is,
// not on a line under the placeholder, and Bold lights only for bold text, not for a heading's weight.
test('a heading typed into an empty note or description starts on the first line, and Bold stays off in it', async ({page}) => {
  const card = await app.store.createTask(app.project.id, {title: 'Heading shortcut', body: '', notes: [{id: 'n-heading', body: ''}]});
  await open(page, card);
  await section(page).getByRole('button', {name: 'Edit note', exact: true}).click();
  for (const [editor, tools] of [[rich(page), section(page).getByRole('toolbar', {name: 'Format note'})],
    [page.getByRole('textbox', {name: 'Card description', exact: true}), page.getByRole('toolbar', {name: 'Format description'})]]) {
    await editor.click(); await page.keyboard.type('## ');
    await expect(editor.locator('h2')).toHaveCount(1);
    const [line, top, placeholder] = await editor.evaluate(el => { const s = getComputedStyle(el); return [el.getBoundingClientRect().top + parseFloat(s.paddingTop) + parseFloat(s.borderTopWidth), el.querySelector('h2').getBoundingClientRect().top, getComputedStyle(el, '::before').content]; });
    expect(Math.abs(top - line), 'the heading starts on the first line').toBeLessThan(2);
    expect(placeholder, 'the placeholder goes once there is a heading').toBe('none');
    await page.keyboard.type('Plan');
    const bold = tools.getByRole('button', {name: 'Bold', exact: true});
    await expect(bold, 'a heading is not bold text').toHaveAttribute('aria-pressed', 'false');
    await page.keyboard.press('Enter'); await page.keyboard.press('Control+b'); await page.keyboard.type('Strong');
    await expect(bold, 'bold text lights it').toHaveAttribute('aria-pressed', 'true');
  }
});
// F0.22-37: while a note is edited, its edit button is a tick filled with the accent colour.
test('the finish editing button is a filled tick', async ({page}) => {
  const card = await app.store.createTask(app.project.id, {title: 'Tick', notes: [{id: 'n-tick', body: 'Tick note'}]});
  await open(page, card);
  const edit = section(page).getByRole('button', {name: 'Edit note', exact: true});
  const look = (button) => button.evaluate(el => ({path: el.querySelector('svg path')?.getAttribute('d'), fill: getComputedStyle(el).backgroundColor, ink: getComputedStyle(el).color}));
  const before = await look(edit);
  await edit.click();
  const done = section(page).getByRole('button', {name: 'Finish editing note', exact: true});
  const after = await look(done);
  expect(after.path, 'a tick').toBe('m5 12 4 4L19 6');
  expect(before.path, 'a pencil while reading').not.toBe(after.path);
  const green = await page.evaluate(() => { const probe = document.createElement('i'); probe.style.color = 'var(--green)'; document.body.append(probe); const c = getComputedStyle(probe).color; probe.remove(); return c; });
  expect(after.fill, 'filled with the accent').toBe(green);
  expect(after.ink, 'its tick contrasts with the fill').not.toBe(green);
  await done.click();
  expect((await look(edit)).path, 'back to the pencil').toBe(before.path);
});
