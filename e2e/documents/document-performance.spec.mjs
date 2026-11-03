import { test, expect, onDevices, useApp } from '../fixtures.mjs';
import { openNewDocument, chooseDocumentView, documentTool, editorSource } from '../helpers/documents.mjs';

const app = useApp(async store => ({ project: await store.createProject({ title: 'Document performance' }) }));
const open = (page, body) => openNewDocument(page, app, app.project.id, { body, waitFor: '.cm-content' });
const code = '# Code\n\n```js\n' + 'const answer = 42; // FIND_THIS\n'.repeat(3300) + '```\n';

test('preview block discovery leaves inline parsing to the incremental editor grammar @gate',async({page})=>{
  await page.goto(app.base);
  const result=await page.evaluate(async()=>{const {documentMarkdown}=await import('/document-markdown.js');const renderer=documentMarkdown({documents:()=>[],project:()=> 'p',esc:value=>value,icon:()=>''});const source='# Heading\n\n'+'[Link](https://example.com) with **bold**. '.repeat(1000);const tokens=renderer.tokens(source);renderer.destroy();return {inline:tokens.find(t=>t.type==='paragraph').tokens.length,raw:tokens.map(t=>t.raw).join('')===source};});
  expect(result.inline).toBe(0);expect(result.raw).toBe(true);
});
test('native URL marks keep URL punctuation out of document extensions and preserve formatted labels @gate',async({page})=>{
  const body='# Links\n\n[Dollars](https://example.com/?q=$x$) and [Highlight ==label==](https://example.com/).';await open(page,body);
  await expect(page.getByRole('link',{name:'Dollars',exact:true})).toHaveAttribute('href','https://example.com/?q=$x$');
  await expect(page.locator('.cm-content .katex')).toHaveCount(0);await expect(page.locator('.cm-content .document-inline-preview mark')).toHaveText('label');
  expect(await editorSource(page)).toBe(body);
});
test('Live preview does not parse an editable table twice, while Source retains its table grammar @gate',async({page})=>{
  await open(page,'# Table\n\n| Name | Value |\n| --- | --- |\n| One | 1 |\n');
  const names=()=>page.evaluate(async()=>{const {syntaxTree}=await import('/vendor/editor/deps.js'),view=document.querySelector('.cm-content').cmTile.root.view,out=[];syntaxTree(view.state).iterate({enter:node=>{out.push(node.name);}});return out;});
  expect(await names()).not.toContain('Table');await chooseDocumentView(page,'Source');await expect.poll(names).toContain('Table');
});

onDevices(['desktop', 'ipad', 'phone'], () => {
  test('ordinary web links use native inline marks that stay mounted while editing nearby @gate',async({page,context})=>{
    await context.route('https://example.com/**',route=>route.fulfill({contentType:'text/html',body:'<title>Opened</title>'}));
    await open(page,'# Heading\n\n'+Array.from({length:80},()=> '[Link](https://example.com/page) with **bold** text.').join(' '));
    const link=page.locator('.cm-content a.document-inline-link').first();await expect(link).toBeVisible();
    await page.evaluate(()=>{window.inlineLinkNode=document.querySelector('.document-inline-link');const view=document.querySelector('.cm-content').cmTile.root.view;view.dispatch({selection:{anchor:3}});view.focus();});
    await page.keyboard.type('New ');expect(await page.evaluate(()=>window.inlineLinkNode.isConnected)).toBe(true);
    const popup=context.waitForEvent('page',{timeout:4000});await link.click({force:true});const opened=await popup;await opened.waitForLoadState('domcontentloaded');await expect(opened).toHaveTitle('Opened');await opened.close();
  });
  test('large inline tables page their cells and preserve edits on every page @gate', async ({ page }) => {
    const body='| Item | Value |\n| --- | --- |\n'+Array.from({length:11000},(_,i)=>`| Item ${i+1} | ${i+1} |`).join('\n');
    const doc=await open(page,body);
    const pagination=page.locator('.document-table-pages');await expect(pagination).toBeVisible();
    expect(await page.locator('.cm-content [data-table-cell]').count()).toBeLessThanOrEqual(802);
    const first=page.getByRole('textbox',{name:'Row 1, column 1',exact:true});await first.fill('First page edit');await first.press('Tab');
    const pageNumber=pagination.getByRole('spinbutton',{name:'Table page',exact:true});await pageNumber.fill('110');await pageNumber.press('Enter');
    const last=page.getByRole('textbox',{name:'Row 11000, column 1',exact:true});await expect(last).toHaveText('Item 11000');await last.fill('Last page edit');await last.press('Tab');
    await expect.poll(()=>editorSource(page)).toContain('First page edit');await expect.poll(()=>editorSource(page)).toContain('Last page edit');
    await page.keyboard.press('ControlOrMeta+z');await expect(pageNumber).toHaveValue('110');await expect(last).toHaveText('Item 11000');
    await page.keyboard.press('ControlOrMeta+Shift+z');await expect(pageNumber).toHaveValue('110');await expect(last).toHaveText('Last page edit');
    await pageNumber.fill('1');await pageNumber.press('Enter');
    await documentTool(page,'Find in document');await page.getByRole('searchbox',{name:'Find in document',exact:true}).fill('Last page edit');
    await page.getByRole('button',{name:'Next match',exact:true}).click();
    await expect(pageNumber).toHaveValue('110');await expect(page.locator('.document-table-find-current')).toHaveText('Last page edit');
    await page.getByRole('button',{name:'Close search',exact:true}).click();
    await expect(page.locator('.document-table-find-current')).toHaveCount(0);
    await chooseDocumentView(page,'Reading');
    await expect(page.locator('.document-codemirror [data-table-cell]')).toHaveCount(0);
    await expect(page.locator('.document-reading .document-table-pages')).toBeVisible();
    expect(await page.locator('.document-reading td,.document-reading th').count()).toBeLessThanOrEqual(802);
    await documentTool(page,'Find in document');await page.getByRole('searchbox',{name:'Find in document',exact:true}).fill('Last page edit');
    await expect(page.locator('.document-reading-search [role=status]')).toHaveText('1 of 1');
    await expect(page.locator('.document-reading .document-find-current')).toHaveText('Last page edit');
    await expect(page.locator('.document-reading').getByRole('spinbutton',{name:'Table page',exact:true})).toHaveValue('110');
  });

  test('code colours use bounded immutable ranges and repeated Reading searches keep responding @gate', async ({ page }) => {
    await open(page, code);
    await page.waitForFunction(() => CSS.highlights.get('document-code-keyword')?.size > 0);
    const colours = await page.evaluate(() => [...CSS.highlights].filter(([name]) => name.startsWith('document-code-')).flatMap(([, ranges]) => [...ranges]).map(range => ({ immutable: range instanceof StaticRange })));
    expect(colours.length).toBeLessThanOrEqual(2048);
    expect(colours.every(range => range.immutable)).toBe(true);
    await chooseDocumentView(page, 'Reading');
    await expect(page.locator('.document-codemirror .document-editable-component')).toHaveCount(0);
    await documentTool(page, 'Find in document');
    const find = page.getByRole('searchbox', { name: 'Find in document', exact: true });
    await find.fill('FIND_THIS', { timeout: 4000 });
    await expect(page.locator('.document-reading-search [role=status]')).toHaveText('1 of 3,300', { timeout: 4000 });
    await find.fill('no such phrase', { timeout: 4000 });
    await expect(page.locator('.document-reading-search [role=status]')).toHaveText('No matches', { timeout: 4000 });
  });

  test('typing before regular components preserves their DOM, cells and decoded images @gate', async ({ page }) => {
    await page.route('**/attachments/a-performance.png', route => route.fulfill({ contentType: 'image/png', body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGD4DwABBAEAX+XDSwAAAABJRU5ErkJggg==', 'base64') }));
    const body = '# A short document\n\nWords with `inline code`.\n\n![Preview](attachments/a-performance.png)\n\n| Item | Value |\n| --- | --- |\n| First | 12 |\n\n> [!note] Note\n> Some detail.\n\n```js\nconst small = 1;\n```\n';
    await open(page, body);
    await page.locator('.cm-content img[alt=Preview]').waitFor();
    await expect(page.locator('.cm-content img[alt=Preview]')).toHaveAttribute('loading','lazy');
    await expect(page.locator('.cm-content img[alt=Preview]')).toHaveAttribute('decoding','async');
    await page.evaluate(() => {
      window.documentComponentNodes = [...document.querySelectorAll('.cm-content img[alt=Preview],.cm-content table,.cm-content pre code')];
      const view = document.querySelector('.cm-content').cmTile.root.view;
      view.dispatch({ selection: { anchor: 3 } }); view.focus();
    });
    await page.keyboard.type('Changed ');
    expect(await page.evaluate(() => window.documentComponentNodes.every(node => node.isConnected))).toBe(true);
    expect(await editorSource(page)).toContain('# AChanged  short document');
    await expect(page.locator('.cm-content table')).toHaveCount(1);
  });
});
