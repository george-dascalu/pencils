import AxeBuilder from '@axe-core/playwright';
import { test, expect, useApp, onDevices } from '../fixtures.mjs';
const app=useApp(async store=>({project:await store.createProject({title:'Rich Tables'})}));
async function open(page){const doc=await app.store.mutate(()=>app.store.createDocument(app.project.id,{title:'Rich cells',document_type:'table'}));await page.goto(`${app.base}/#project/${app.project.id}/documents/${doc.id}`);await expect(page.locator('.document-sheet')).toHaveAttribute('data-ready','true');return doc;}
const cell=(page,a)=>page.locator(`[data-sheet-cell="${a}"]`);
onDevices(['desktop','ipad','phone'],()=>test('select rows or columns together, format and merge without opening another editor @gate',async({page,device})=>{
 const doc=await open(page);await page.getByRole('button',{name:'Column A options',exact:true}).click();
 await page.getByRole('button',{name:'Select columns',exact:true}).click();const panel=page.getByRole('dialog',{name:'Select columns',exact:true});await panel.getByLabel('Through column').fill('2');await panel.getByRole('button',{name:'Select',exact:true}).click();
 await expect(page.locator('.sheet-address')).toHaveText('A1:B100');await page.locator('[data-sheet-action=bold]:visible').click();await expect(cell(page,'A1')).toHaveCSS('font-weight','700');await expect(cell(page,'B2')).toHaveCSS('font-weight','700');
 await cell(page,'C2').click();await page.getByLabel('Cell value or formula',{exact:true}).fill('Heading');await page.getByLabel('Cell value or formula',{exact:true}).press('Enter');
 // Shift+arrow extends the cell range on every device without summoning the keyboard.
 await page.locator('.document-sheet-scroll').press('Shift+ArrowRight');await expect(page.locator('.sheet-address')).toHaveText('C2:D2');await page.locator('[data-sheet-action=merge]:visible').click();await expect(cell(page,'C2')).toHaveClass(/sheet-merged/);await expect(cell(page,'C2')).toHaveText('Heading');
 if(device==='desktop'){const audit=await new AxeBuilder({page}).include('#document-form').withTags(['wcag2a','wcag2aa']).analyze();expect(audit.violations.map(v=>v.id)).toEqual([]);}
 const size=await cell(page,'C2').boundingBox();expect(size.width).toBeGreaterThan(230);
 await expect.poll(async()=> (await app.store.getDocument(app.project.id,doc.id)).table.workbook.sheets['sheet-1'].mergeData?.length).toBe(1);
 await page.locator('[data-sheet-action=merge]:visible').click();await expect(cell(page,'C2')).not.toHaveClass(/sheet-merged/);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1);
}));
test('partial rich text survives editing, saving, reloading, copy and undo @gate',async({page})=>{
 const doc=await open(page);await cell(page,'A1').dblclick();const edit=page.locator('[data-sheet-editor]');await edit.fill('Hello world');
 await edit.evaluate(el=>{const range=document.createRange();range.setStart(el.firstChild,6);range.setEnd(el.firstChild,11);const s=getSelection();s.removeAllRanges();s.addRange(range);document.dispatchEvent(new Event('selectionchange'));});
 await page.getByRole('button',{name:'Bold',exact:true}).click();await expect(edit.locator('span')).toHaveText('world');await expect(edit.locator('span')).toHaveCSS('font-weight','700');
 await edit.press('Enter');await expect(cell(page,'A1')).toHaveText('Hello world');await expect(cell(page,'A1').locator('span span')).toHaveCSS('font-weight','700');
 await expect.poll(async()=> (await app.store.getDocument(app.project.id,doc.id)).table.workbook.sheets['sheet-1'].cellData[0]?.[0]?.p?.body.textRuns).toEqual([{st:6,ed:11,ts:{bl:1}}]);
 await page.reload();await expect(cell(page,'A1')).toHaveText('Hello world');await expect(cell(page,'A1').locator('span span')).toHaveCSS('font-weight','700');
});

test('merging populated cells asks first, undo restores values, and row ranges keep selection after saves @gate',async({page})=>{
 const doc=await open(page),formula=page.getByLabel('Cell value or formula',{exact:true});
 for(const [addr,text]of [['A1','Keep'],['B1','Restore']]){await cell(page,addr).click();await formula.fill(text);await formula.press('Enter');}
 await page.locator('.document-sheet-scroll').press('ArrowLeft');await page.locator('.document-sheet-scroll').press('Shift+ArrowRight');
 await page.getByRole('button',{name:'Merge or unmerge cells',exact:true}).click();await expect(page.getByRole('dialog',{name:'Merge cells',exact:true})).toBeVisible();
 await expect.poll(async()=> (await app.store.getDocument(app.project.id,doc.id)).table.workbook.sheets['sheet-1'].cellData[0]?.[1]?.v).toBe('Restore');
 await page.getByRole('button',{name:'Merge cells',exact:true}).click();await expect(cell(page,'A1')).toHaveClass(/sheet-merged/);
 await page.getByRole('button',{name:'Undo',exact:true}).click();await expect(cell(page,'B1')).toHaveText('Restore');
 await page.getByRole('button',{name:'Row 1 options',exact:true}).click();await page.keyboard.press('Escape');await page.getByRole('button',{name:'Row 3 options',exact:true}).click({modifiers:['Shift']});await page.keyboard.press('Escape');
 await expect(page.locator('.sheet-address')).toHaveText('A1:Z3');await page.getByRole('button',{name:'Italic',exact:true}).click();await expect(cell(page,'B3')).toHaveCSS('font-style','italic');await expect(cell(page,'B4')).not.toHaveCSS('font-style','italic');
 await expect.poll(async()=>{const t=(await app.store.getDocument(app.project.id,doc.id)).table,c=t.workbook.sheets['sheet-1'].cellData[2]?.[1];return(typeof c?.s==='string'?t.workbook.styles[c.s]:c?.s)?.it;}).toBe(1);
 await expect(page.locator('.sheet-address')).toHaveText('A1:Z3');
});

test('a tall merged cell remains editable when its anchor scrolls out of the virtual rows @gate',async({page})=>{
 const doc=await app.store.mutate(()=>app.store.createDocument(app.project.id,{title:'Tall merge',document_type:'table'}));const record=await app.store.getDocument(app.project.id,doc.id),table=record.table;
 table.workbook.sheets['sheet-1'].cellData={0:{0:{v:'Tall heading'}}};table.workbook.sheets['sheet-1'].mergeData=[{startRow:0,endRow:80,startColumn:0,endColumn:1}];
 await app.store.mutate(()=>app.store.updateDocument(app.project.id,doc.id,{revision:record.revision,table}));await page.goto(`${app.base}/#project/${app.project.id}/documents/${doc.id}`);await expect(cell(page,'A1')).toHaveText('Tall heading');
 await page.locator('.document-sheet-scroll').evaluate(el=>el.scrollTop=1500);await expect(page.locator('.document-sheet-grid [data-r="0"]')).toHaveCount(0);await expect(cell(page,'A1')).toBeVisible();
 const scroll=page.locator('.document-sheet-scroll');await scroll.press('F2');await expect(page.locator('[data-sheet-editor]')).toBeFocused();await page.locator('[data-sheet-editor]').fill('Edited merge');await page.locator('[data-sheet-editor]').press('Enter');await expect(cell(page,'A1')).toHaveText('Edited merge');
});

// F0.22-12: WebKit can send a scroll event that moves nothing just after a cell's editor opens; the
// editor stays open, where it closed before. Only a scroll that moves the grid ends the edit.
test('a scroll event that moves nothing leaves the cell editor open @gate',async({page})=>{
 const doc=await app.store.mutate(()=>app.store.createDocument(app.project.id,{title:'Still scroll',document_type:'table'}));
 await page.goto(`${app.base}/#project/${app.project.id}/documents/${doc.id}`);await expect(page.locator('.document-sheet')).toHaveAttribute('data-ready','true');
 const scroll=page.locator('.document-sheet-scroll');await scroll.press('F2');await expect(page.locator('[data-sheet-editor]')).toBeFocused();
 await scroll.evaluate(el=>el.dispatchEvent(new Event('scroll')));
 await expect(page.locator('[data-sheet-editor]'),'the editor stays open').toBeFocused();
 await page.locator('[data-sheet-editor]').fill('Kept');await page.locator('[data-sheet-editor]').press('Enter');await expect(cell(page,'A1')).toHaveText('Kept');
});
test('Escape cancels an autosaved rich edit and plain paste retains its line breaks @gate',async({page})=>{
 const doc=await open(page);await cell(page,'A1').dblclick();let editor=page.locator('[data-sheet-editor]');await editor.fill('Original');await editor.press('Enter');await expect(cell(page,'A1')).toHaveText('Original');
 await page.locator('.document-sheet-scroll').press('ArrowUp');await page.locator('.document-sheet-scroll').press('F2');editor=page.locator('[data-sheet-editor]');await editor.fill('Cancelled');await editor.press('Escape');await expect(cell(page,'A1')).toHaveText('Original');
 await expect.poll(async()=> (await app.store.getDocument(app.project.id,doc.id)).table.workbook.sheets['sheet-1'].cellData[0]?.[0]?.v).toBe('Original');
 await page.locator('.document-sheet-scroll').press('F2');await page.locator('[data-sheet-editor]').fill('Line one\nLine two');await page.locator('[data-sheet-editor]').press('Enter');await expect(cell(page,'A1')).toHaveText('Line one\nLine two');
});
