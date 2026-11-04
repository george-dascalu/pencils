import { test, expect, useApp, onDevices } from '../fixtures.mjs';
import { blankTable } from '../../public/document-sheet-model.js';

const app=useApp(async store=>({project:await store.createProject({title:'Tables project'})}));
async function seed() {
  const record=await app.store.mutate(()=>app.store.createDocument(app.project.id,{title:'Project budget',document_type:'table'}));
  const table=blankTable(record.id,'Project budget');
  table.workbook.sheets['sheet-1'].cellData={0:{0:{v:'Item'},1:{v:'Cost'},2:{v:'Total'}},1:{0:{v:'Design'},1:{v:80},2:{f:'=B2*2'}},2:{0:{v:'Build'},1:{v:120},2:{f:'=SUM(B2:B3)'}}};
  await app.store.mutate(()=>app.store.updateDocument(app.project.id,record.id,{revision:record.revision,table}));return record;
}
async function open(page,record){await page.goto(`${app.base}/#project/${app.project.id}/documents/${record.id}`);await expect(page.locator('.document-sheet')).toHaveAttribute('data-ready','true');}
onDevices(['desktop','ipad','phone'],()=>{
  test('Tables edit and calculate cells, save across reload and support worksheet tabs @gate',async({page,device})=>{
    const record=await seed();await open(page,record);
    await expect(page.locator('[data-sheet-cell="C2"]')).toHaveText('160');
    const cell=page.locator('[data-sheet-cell="B2"]');
    await cell.click();await expect(page.getByLabel('Cell value or formula',{exact:true})).not.toBeFocused();
    await page.getByLabel('Cell value or formula',{exact:true}).fill('100');await page.getByLabel('Cell value or formula',{exact:true}).press('Enter');
    await expect(page.locator('[data-sheet-cell="C2"]')).toHaveText('200');
    await expect.poll(async()=> (await app.store.getDocument(app.project.id,record.id)).table.workbook.sheets['sheet-1'].cellData[1][1].v).toBe(100);
    await page.getByRole('button',{name:'Add worksheet',exact:true}).click();
    await page.getByLabel('Worksheet name',{exact:true}).fill('Rates');await page.getByRole('button',{name:'Add worksheet',exact:true}).last().click();
    await expect(page.getByRole('tab',{name:'Rates',exact:true})).toHaveAttribute('aria-selected','true');
    await page.getByRole('tab',{name:'Sheet 1',exact:true}).click();
    await expect(page.locator('[data-sheet-cell="C2"]')).toHaveText('200');
    await expect.poll(async()=> (await app.store.getDocument(app.project.id,record.id)).table.workbook.sheetOrder.length).toBe(2);
    await page.reload();await expect(page.locator('[data-sheet-cell="C2"]')).toHaveText('200');
    const sizing=await page.locator('[data-sheet-action="tools"]').evaluate(el=>({width:el.offsetWidth,height:el.offsetHeight,overflow:document.documentElement.scrollWidth-innerWidth}));
    expect(sizing.width).toBe(sizing.height);expect(sizing.height).toBeGreaterThanOrEqual(device==='desktop'?32:44);expect(sizing.overflow).toBeLessThanOrEqual(1);
  });
  test('touch selection, keyboard editing and range paste use the grid without scrolling the page @gate',async({page,device})=>{
    const record=await seed();await open(page,record);const cell=page.locator('[data-sheet-cell="A2"]');
    if(device!=='desktop'){await cell.tap();await expect(page.locator('[data-sheet-editor]')).toHaveCount(0);await cell.tap();}else await cell.dblclick();
    await expect(page.locator('[data-sheet-editor]')).toBeFocused();await page.locator('[data-sheet-editor]').fill('Research');await page.locator('[data-sheet-editor]').press('Enter');
    await expect(page.locator('[data-sheet-cell="A2"]')).toHaveText('Research');
    const scroll=page.locator('.document-sheet-scroll');await scroll.evaluate(el=>el.scrollTop=16000);
    await expect(page.locator('[data-sheet-cell="A900"]')).toHaveCount(0);
    const rows=await page.locator('.document-sheet-grid tbody tr').count();expect(rows).toBeLessThan(90);
    expect(await page.evaluate(()=>scrollY)).toBe(0);
  });
});
test('New offers a Table document and CSV import previews data before adding a worksheet',async({page})=>{
  await page.goto(`${app.base}/#project/${app.project.id}/documents`);
  await page.locator('.new-menu > summary:visible').click();await page.getByRole('button',{name:'Table',exact:true}).click();
  await expect(page.locator('.document-sheet')).toHaveAttribute('data-ready','true');
  const title=page.getByLabel('Document title',{exact:true});if(await title.isVisible())await title.fill('CSV table');
  await page.getByRole('button',{name:'Document tools',exact:true}).click();await page.getByRole('button',{name:'Import CSV',exact:true}).click();
  await page.locator('[data-sheet-import]').setInputFiles({name:'items.csv',mimeType:'text/csv',buffer:Buffer.from('Item,Value\n"A, B",3\nC,4')});
  await expect(page.locator('.sheet-import-preview')).toContainText('A, B');await page.getByRole('button',{name:'Import worksheet',exact:true}).click();
  await expect(page.locator('[data-sheet-cell="A2"]')).toHaveText('A, B');
});
test('the browser formula engine calculates before any vendor UI mounts', async ({page}) => {
  const record = await seed();await open(page, record);
  const result = await page.evaluate(async () => {
    const {createSheetEngine}=await import('/vendor/sheets/deps.js');
    const t={format:1,workbook:{id:'debug-book',name:'Debug',locale:'enUS',appVersion:'1.3.1',styles:{},sheetOrder:['s'],sheets:{s:{id:'s',name:'Sheet 1',rowCount:1000,columnCount:26,cellData:{1:{1:{v:80},2:{f:'=B2*2'}}}}}},filters:{}};
    const engine=createSheetEngine(t);await engine.calculated();const out={value:engine.sheet('s').getRange('C2').getValue(),snapshot:engine.snapshot().workbook.sheets.s.cellData[1][2]};engine.destroy();return out;
  });
  expect(result.value).toBe(160);expect(result.snapshot.v).toBe(160);
});
onDevices(['desktop','ipad','phone'],()=>test('the open Documents tab returns from a Table to the shared document list @gate',async({page})=>{
 const record=await seed();await open(page,record);await page.locator('.tabs [data-view="documents"]:visible').click();// Like a document's (F0.21-88): the tray holds the list and the views.
await expect(page.locator('.layout-tray[data-open]').getByRole('button',{name:'Reading',exact:true})).toBeVisible();await page.locator('.layout-tray[data-open]').getByRole('button',{name:'Documents',exact:true}).click();await expect(page.locator('#list-panel')).toBeVisible();await page.keyboard.press('Escape');await expect(page.locator('#list-panel')).toBeHidden();await expect(page.locator('.document-sheet')).toHaveAttribute('data-ready','true');
}));
