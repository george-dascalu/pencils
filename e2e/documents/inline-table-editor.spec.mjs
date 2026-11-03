// Owner request: compact inline table controls, complete selections, drag/reorder, rich cells, merges and layout templates.
import { test, expect, useApp, onDevices } from '../fixtures.mjs';
import { chooseDocumentView, editorSource } from '../helpers/documents.mjs';
const app=useApp(async store=>({project:await store.createProject({title:'Inline tables',key:'IT'})}));
const body='| A | B | C |\n| --- | --- | --- |\n| one | two | three |\n| four | five | six |\n';
async function open(page){const doc=await app.store.createDocument(app.project.id,{title:'Inline table',body});await page.goto(`${app.base}/#project/${app.project.id}/documents/${doc.id}`);await page.getByRole('textbox',{name:'Row 1, column 1',exact:true}).waitFor();return doc;}
const table=page=>page.locator('#document-form .document-editable-component[data-component-type=table]');
const cell=(page,r,c)=>page.getByRole('textbox',{name:`${r?'Row '+r:'Header'}, column ${c}`,exact:true});
onDevices(['desktop','ipad','phone'],()=>test('a single layout icon toggles, edge buttons add axes, and selecting a row selects every cell',{tag:'@gate'},async({page,device})=>{
  await open(page);const root=table(page),grid=root.locator('table'),toggle=root.getByRole('button',{name:'Horizontal scroll',exact:true});
  await expect(toggle).toHaveAttribute('aria-pressed','false');await expect(toggle).not.toHaveText(/Fit|Scroll/);
  await toggle.click();await expect(toggle).toHaveAttribute('aria-pressed','true');await expect.poll(()=>editorSource(page)).toContain('<!-- table: scroll -->');
  await toggle.click();await expect(toggle).toHaveAttribute('aria-pressed','false');
  const boxes=await Promise.all([grid.boundingBox(),root.getByRole('button',{name:'Add column',exact:true}).boundingBox(),root.getByRole('button',{name:'Add row',exact:true}).boundingBox()]);
  expect(boxes[1].x).toBeGreaterThanOrEqual(boxes[0].x+boxes[0].width-1);expect(boxes[2].y).toBeGreaterThanOrEqual(boxes[0].y+boxes[0].height-1);expect(boxes[2].width).toBeCloseTo(boxes[0].width,0);expect(boxes[1].height).toBeCloseTo(boxes[0].height,0);
  const head=await root.locator("[data-table-axis=column]").first().boundingBox(),th=await grid.locator("th").first().boundingBox();expect(head.width).toBeCloseTo(th.width,0);
  await root.getByRole('button',{name:'Add row',exact:true}).click();await expect(cell(page,3,1)).toBeVisible();
  if(device!=='desktop')await expect(cell(page,3,1)).not.toBeFocused();
  await root.locator('[data-table-axis=row][data-table-index="1"]').click();
  await expect(root.locator('[data-table-selected=true]')).toHaveCount(3);await expect(root.getByRole('button',{name:'Merge cells',exact:true})).toBeEnabled();
  const paint=await root.locator('[data-table-selected=true]').first().evaluate(el=>{const style=getComputedStyle(el);return {background:style.backgroundColor,shadow:style.boxShadow};});
  expect(paint.background).not.toBe('rgba(0, 0, 0, 0)');expect(paint.shadow).toContain('inset');
  const icon=await toggle.evaluate(el=>{const box=el.getBoundingClientRect(),svg=el.querySelector('svg').getBoundingClientRect();return {width:box.width,height:box.height,fits:svg.width<=box.width&&svg.height<=box.height};});expect(icon.width).toBe(icon.height);expect(icon.fits).toBe(true);
  const heights=await root.locator('button[data-table-axis]:visible').evaluateAll(list=>list.map(el=>el.getBoundingClientRect().height));
  for(const height of heights)expect(height).toBeGreaterThanOrEqual(device==='desktop'?28:44);
  await page.screenshot({path:`/tmp/pencils-inline-table-${device}.png`});
}));
onDevices(['desktop','ipad','phone'],()=>test('merges preserve content, unmerge and undo work, and row deletion applies to the whole selection',{tag:'@gate'},async({page})=>{
  const doc=await open(page),root=table(page);
  await root.locator('[data-table-axis=row][data-table-index="1"]').click();await root.getByRole('button',{name:'Merge cells',exact:true}).click();
  await expect(root.locator('td[colspan="3"]')).toHaveText(/one.*two.*three/s);await expect.poll(()=>editorSource(page)).toContain('<table data-pencils-table="1">');
  await root.getByRole('button',{name:'Unmerge cells',exact:true}).click();await expect(root.locator('td[colspan]')).toHaveCount(0);
  await root.locator('[data-table-axis=row][data-table-index="2"]').click();await page.keyboard.press('Delete');
  await expect(cell(page,2,1)).toHaveCount(0);await expect.poll(async()=> (await app.store.getDocument(app.project.id,doc.id)).body).not.toContain('four');
  await root.getByRole('button',{name:'Table options',exact:true}).focus();await page.keyboard.press('ControlOrMeta+z');await expect(cell(page,2,1)).toHaveText('four');
  await chooseDocumentView(page,'Reading');await expect(page.locator('.document-reading table')).toContainText('one');
}));
test('row and column handles drag to reorder values without changing the text inside cells',{tag:'@gate'},async({page})=>{
  await open(page);const root=table(page);
  const first=root.locator('[data-table-axis=column][data-table-index="0"]'),last=root.locator('[data-table-axis=column][data-table-index="2"]'),bounds=await last.boundingBox();
  await first.dragTo(last,{targetPosition:{x:bounds.width-2,y:bounds.height/2}});
  await expect(cell(page,0,1)).toHaveText('B');await expect(cell(page,0,3)).toHaveText('A');
  const row=root.locator('[data-table-axis=row][data-table-index="1"]'),end=root.locator('[data-table-axis=row][data-table-index="2"]'),endBox=await end.boundingBox();
  await row.dragTo(end,{targetPosition:{x:endBox.width/2,y:endBox.height-2}});
  await expect(cell(page,1,1)).toHaveText('five');await expect(cell(page,2,3)).toHaveText('one');
});
onDevices(['desktop','ipad','phone'],()=>test('cells hold real checklists, quotes and code blocks across saving and Reading mode',{tag:'@gate'},async({page})=>{
  await open(page);await cell(page,1,1).fill('A task');await page.locator('#document-formatting').getByRole('button',{name:'Checklist',exact:true}).click();
  const check=cell(page,1,1).getByRole('checkbox');await expect(check).toBeVisible();await check.check();
  await cell(page,1,2).fill('A quotation');await page.locator('#document-formatting .rich-format-menu > summary').click();await page.locator('#document-formatting').getByRole('button',{name:'Quote',exact:true}).click();
  await expect(cell(page,1,2).locator('blockquote')).toHaveText('A quotation');
  await cell(page,1,3).fill('let x = 1;');await page.locator('#document-formatting').getByRole('button',{name:'Code block',exact:true}).click();
  await expect(cell(page,1,3).locator('pre code')).toHaveText('let x = 1;');
  await cell(page,1,3).locator('code').click();await page.keyboard.press('End');await page.keyboard.press('Enter');await page.keyboard.type('// Next line');
  await expect(cell(page,1,3).locator('pre code')).toHaveCount(1);await expect.poll(()=>cell(page,1,3).locator('pre code').textContent()).toBe('let x = 1;\n// Next line');await expect(page.locator('#document-form')).toHaveAttribute('data-document-mode','live');
  await expect.poll(()=>editorSource(page)).toContain('<blockquote>');await chooseDocumentView(page,'Reading');
  await expect(page.locator('.document-reading table input[type=checkbox]')).toBeChecked();await expect(page.locator('.document-reading table blockquote')).toHaveText('A quotation');
  await expect(page.locator('.document-reading table pre code')).toContainText('// Next line');await page.reload();await expect(page.locator('.document-reading table pre code')).toContainText('// Next line');
}));
test('saved table layouts are ordinary vault templates and can be chosen when inserting another table',async({page})=>{
  const doc=await open(page),root=table(page);
  await root.getByRole('button',{name:'Table options',exact:true}).click();await page.getByRole('button',{name:'Save table layout',exact:true}).click();
  await page.getByRole('textbox',{name:'Template name',exact:true}).fill('Project checklist');await page.getByRole('button',{name:'Save layout',exact:true}).click();
  await expect.poll(async()=>{const {items:docs}=await app.store.children(app.project.id,"documents");return docs.some(d=>d.title==='Project checklist');}).toBe(true);
  await expect(page.locator('#document-form')).toBeVisible();
  await page.locator('#document-form [data-document-action="insert"]').click();await page.getByRole('button',{name:'Table',exact:true}).click();
  await page.getByRole('combobox',{name:'Table layout',exact:true}).selectOption({label:'Project checklist'});await page.getByRole('button',{name:'Insert table',exact:true}).click();
  await expect(table(page)).toHaveCount(2);await expect(table(page).last().getByRole('textbox',{name:'Header, column 1',exact:true})).toHaveText('A');
  await expect(table(page).last().getByRole('textbox',{name:'Row 1, column 1',exact:true})).toBeEmpty();
  await expect.poll(async()=> (await app.store.getDocument(app.project.id,doc.id)).body).toContain('data-pencils-table');
  await page.reload();await expect(table(page)).toHaveCount(2);
});
onDevices(['desktop','ipad','phone'],()=>test('whole-row formatting and multi-row deletion act on every selected cell',async({page})=>{
  await open(page);const root=table(page);
  await root.getByRole('button',{name:'Select row 1',exact:true}).click();await page.locator('#document-formatting').getByRole('button',{name:'Bold',exact:true}).click();
  for(let c=1;c<=3;c++)await expect(cell(page,1,c).locator('strong,b')).toHaveCount(1);
  await root.getByRole('button',{name:'Select row 1',exact:true}).click();await root.getByRole('button',{name:'Select row 2',exact:true}).click({modifiers:['Shift']});
  await expect(root.locator('[data-table-selected=true]')).toHaveCount(6);await root.getByRole('button',{name:'Table options',exact:true}).click();
  await page.getByRole('button',{name:'Delete selected rows',exact:true}).click();await expect(root.locator('tr')).toHaveCount(1);await expect(cell(page,0,1)).toHaveText('A');
}));
onDevices(['ipad','phone'],()=>test('holding a row handle and dragging reorders the entire row without opening the keyboard',async({page,browserName})=>{
  test.skip(browserName!=='chromium','Real touch injection uses Chromium DevTools.');await open(page);const root=table(page),first=root.getByRole('button',{name:'Select row 1',exact:true}),last=root.getByRole('button',{name:'Select row 2',exact:true});
  const a=await first.boundingBox(),b=await last.boundingBox(),cdp=await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:a.x+a.width/2,y:a.y+a.height/2}]});await expect(first).toHaveAttribute('data-table-held','true');
  await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:b.x+b.width/2,y:b.y+b.height-2}]});await expect(last).toHaveAttribute('data-table-drop','after');
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await expect(cell(page,1,1)).toHaveText('four');await expect(cell(page,2,1)).toHaveText('one');await expect(cell(page,2,1)).not.toBeFocused();
}));
