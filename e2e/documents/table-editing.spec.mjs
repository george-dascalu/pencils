import { test, expect, useApp, onDevices } from '../fixtures.mjs';
import { blankTable } from '../../public/document-sheet-model.js';
import AxeBuilder from '@axe-core/playwright';
const app = useApp(async store => ({ project: await store.createProject({ title: 'Worksheet editing' }) }));
async function open(page) {
  const record = await app.store.mutate(() => app.store.createDocument(app.project.id, { title: 'Budget', document_type: 'table' }));
  const table = blankTable(record.id, record.title);
  table.workbook.sheets['sheet-1'].cellData = { 0: { 0: { v: 'Item' }, 1: { v: 'Cost' }, 2: { v: 'Total' } }, 1: { 0: { v: 'Design' }, 1: { v: 80 }, 2: { f: '=B2*2' } }, 2: { 0: { v: 'Build' }, 1: { v: 120 }, 2: { f: '=SUM(B2:B3)' } } };
  await app.store.mutate(() => app.store.updateDocument(app.project.id, record.id, { revision: record.revision, table }));
  await page.goto(`${app.base}/#project/${app.project.id}/documents/${record.id}`);
  await expect(page.locator('[data-sheet-cell="C2"]')).toHaveText('160');return record;
}
const cell = (page, addr) => page.locator(`[data-sheet-cell="${addr}"]`);
const edit = async (page, address, value) => { await cell(page, address).click();const formula = page.getByRole('textbox', { name: 'Cell value or formula', exact: true });await formula.fill(value);await formula.press('Enter'); };
onDevices(['desktop', 'ipad', 'phone'], () => test('cell formatting uses shared controls and persists with the worksheet @gate', async ({ page }) => {
  const record = await open(page);await cell(page, 'B2').click();
  await page.getByRole('button', { name: 'Cell formatting', exact: true }).click();
  const panel = page.getByRole('dialog', { name: 'Cell formatting', exact: true });
  await panel.getByLabel('Number format', { exact: true }).selectOption('£#,##0.00');
  await panel.getByLabel('Alignment', { exact: true }).selectOption('center');
  await panel.getByLabel('Wrap text', { exact: true }).check();
  await panel.getByRole('button', { name: 'Cell borders', exact: true }).click();
  await expect(cell(page, 'B2')).toHaveText('£80.00');
  await expect(cell(page, 'B2')).toHaveCSS('text-align', 'center');
  await expect(cell(page, 'B2')).toHaveCSS('white-space', 'pre-wrap');
  await expect.poll(async () => { const data = (await app.store.getDocument(app.project.id, record.id)).table;const c = data.workbook.sheets['sheet-1'].cellData[1][1];return (typeof c.s === 'string' ? data.workbook.styles[c.s] : c.s)?.n?.pattern; }).toBe('£#,##0.00');
  await page.reload();await expect(cell(page, 'B2')).toHaveText('£80.00');await expect(cell(page, 'B2')).toHaveCSS('text-align', 'center');
}));

test('sorting and filtering keep rows together, export CSV values, and row insertion adjusts formulas', async ({ page }) => {
  await open(page);await cell(page, 'B2').click();await page.getByRole('button', { name: 'Sort worksheet', exact: true }).click();
  let panel = page.getByRole('dialog', { name: 'Sort worksheet', exact: true });
  await panel.getByRole('button', { name: 'Descending', exact: true }).click();
  await expect(cell(page, 'A2')).toHaveText('Build');await expect(cell(page, 'B2')).toHaveText('120');
  await page.getByRole('button', { name: 'Filter worksheet', exact: true }).click();panel = page.getByRole('dialog', { name: 'Filter worksheet', exact: true });
  await panel.getByLabel('Column', { exact: true }).selectOption('0');await panel.getByLabel('Contains', { exact: true }).fill('Design');await panel.getByRole('button', { name: 'Apply filter', exact: true }).click();
  await expect(cell(page, 'A2')).toHaveCount(0);await expect(cell(page, 'A3')).toHaveText('Design');
  await page.getByRole('button', { name: 'Filter worksheet', exact: true }).click();await page.getByRole('button', { name: 'Clear filters', exact: true }).click();
  await expect(cell(page, 'A2')).toBeVisible();
  await page.getByRole('button', { name: 'Document tools', exact: true }).click();
  const download = page.waitForEvent('download');await page.getByRole('button', { name: 'Export CSV', exact: true }).click();expect((await download).suggestedFilename()).toBe('Budget.csv');
  await cell(page, 'B2').click();await page.getByRole('button', { name: 'Rows and columns', exact: true }).click();await page.getByRole('button', { name: 'Insert row above', exact: true }).click();
  await expect(cell(page, 'A3')).toHaveText('Build');
  await cell(page, 'C3').click();await expect(page.getByRole('textbox', { name: 'Cell value or formula', exact: true })).toHaveValue(/^=/);
});

test('range copy shifts relative references, preserves absolute references and supports external TSV', async ({ page }) => {
  await open(page);await edit(page, 'D2', '=B2+$B$2');await expect(cell(page, 'D2')).toHaveText('160');
  await cell(page, 'D2').click();
  const clipboard = await page.locator('.document-sheet-scroll').evaluate(el => { const data = new DataTransfer();el.dispatchEvent(new ClipboardEvent('copy', { bubbles: true, clipboardData: data }));return Object.fromEntries([...data.types].map(type => [type, data.getData(type)])); });
  await cell(page, 'D3').click();await page.locator('.document-sheet-scroll').evaluate((el, values) => { const data = new DataTransfer();for (const [type, value] of Object.entries(values)) data.setData(type, value);el.dispatchEvent(new ClipboardEvent('paste', { bubbles: true, clipboardData: data })); }, clipboard);
  await expect(cell(page, 'D3')).toHaveText('200');await cell(page, 'D3').click();await expect(page.getByRole('textbox', { name: 'Cell value or formula', exact: true })).toHaveValue('=B3+$B$2');
  await cell(page, 'A5').click();await page.locator('.document-sheet-scroll').evaluate(el => { const data = new DataTransfer();data.setData('text/plain', 'One\t2\nTwo\t=SUM(B5,3)');el.dispatchEvent(new ClipboardEvent('paste', { bubbles: true, clipboardData: data })); });
  await expect(cell(page, 'A5')).toHaveText('One');await expect(cell(page, 'B6')).toHaveText('5');
});

test('a table has no WCAG A/AA violations and an empty corner has a readable header', async ({ page }) => {
  await open(page);const results = await new AxeBuilder({ page }).include('#document-form').withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  expect(results.violations.map(v => ({ id: v.id, targets: v.nodes.map(n => n.target) }))).toEqual([]);
});

test('worksheet names, cross-sheet references, deleting and undo retain values',async({page})=>{
 await open(page);await page.getByRole('button',{name:'Add worksheet',exact:true}).click();await page.getByLabel('Worksheet name',{exact:true}).fill('Rates');await page.getByRole('button',{name:'Add worksheet',exact:true}).last().click();
 await edit(page,'A1',"='Sheet 1'!B2*3");await expect(cell(page,'A1')).toHaveText('240');
 await page.getByRole('button',{name:'Worksheet options',exact:true}).click();await page.getByRole('button',{name:'Rename worksheet',exact:true}).click();await page.getByLabel('Worksheet name',{exact:true}).fill('Assumptions');await page.getByRole('button',{name:'Rename worksheet',exact:true}).last().click();await expect(page.getByRole('tab',{name:'Assumptions',exact:true})).toHaveAttribute('aria-selected','true');
 await page.getByRole('button',{name:'Worksheet options',exact:true}).click();await page.getByRole('button',{name:'Delete worksheet',exact:true}).click();await page.getByRole('button',{name:'Delete worksheet',exact:true}).last().click();await expect(page.getByRole('tab',{name:'Assumptions',exact:true})).toHaveCount(0);
 await page.getByRole('button',{name:'Undo',exact:true}).click();await expect(page.getByRole('tab',{name:'Assumptions',exact:true})).toBeVisible();await page.getByRole('tab',{name:'Assumptions',exact:true}).click();await expect(cell(page,'A1')).toHaveText('240');
});

test('frozen rows and columns stay aligned after scroll and track resizing persists @gate',async({page})=>{
 const record=await open(page);const handle=page.getByRole('separator',{name:'Resize column B',exact:true});const box=await handle.boundingBox();await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await page.mouse.move(box.x+box.width/2+70,box.y+box.height/2,{steps:4});await page.mouse.up();
 await expect.poll(async()=> (await app.store.getDocument(app.project.id,record.id)).table.workbook.sheets['sheet-1'].columnData?.[1]?.w).toBe(190);
 await page.getByRole('button',{name:'Freeze rows and columns',exact:true}).click();const panel=page.getByRole('dialog',{name:'Freeze rows and columns',exact:true});await panel.getByLabel('Rows',{exact:true}).fill('1');await panel.getByLabel('Columns',{exact:true}).fill('1');await panel.getByRole('button',{name:'Apply',exact:true}).click();
 await page.locator('.document-sheet-scroll').evaluate(el=>{el.scrollTop=8000;el.scrollLeft=500;});await expect(cell(page,'A1')).toBeVisible();
 await expect.poll(()=>page.locator('.document-sheet-scroll').evaluate(scroll=>{const el=scroll.querySelector('[data-sheet-cell=\"A1\"]');return el?getComputedStyle(el).position:null;})).toBe('sticky');
 const position=await page.locator('.document-sheet-scroll').evaluate(scroll=>{const el=scroll.querySelector('[data-sheet-cell=\"A1\"]'),a=el.getBoundingClientRect(),s=scroll.getBoundingClientRect();return{x:a.x-s.x,y:a.y-s.y,css:getComputedStyle(el).position};});expect(position.css).toBe('sticky');expect(position.x).toBeGreaterThanOrEqual(47);expect(position.x).toBeLessThan(50);expect(position.y).toBeGreaterThanOrEqual(27);expect(position.y).toBeLessThan(30);
});

test('Tables guide is bundled and plain documents never load the spreadsheet engine',async({page})=>{
 const requests=[];page.on('request',request=>{if(/vendor\/sheets|document-sheet-deps/.test(request.url()))requests.push(request.url());});
 const plain=await app.store.mutate(()=>app.store.createDocument(app.project.id,{title:'Plain note',body:'# Note'}));await page.goto(`${app.base}/#project/${app.project.id}/documents/${plain.id}`);await expect(page.locator('.cm-editor')).toBeVisible();expect(requests).toEqual([]);
 await page.goto(`${app.base}/#help/tables`);await expect(page.getByRole('heading',{name:'Tables documents',exact:true})).toBeVisible();await expect(page.locator('.help-article')).toContainText('1,000 rows');
});

test('missing spreadsheet data leaves Document tools available to restore a saved version',async({page})=>{
 const record=await open(page);const saved=await app.store.getDocument(app.project.id,record.id);const {default:fs}=await import('node:fs/promises'),{default:path}=await import('node:path');await fs.rm(path.join(path.dirname(app.store.file(app.project.id,'documents',record.id)),saved.table_file));
 await page.reload();await expect(page.locator('.sheet-error')).toContainText('Spreadsheet data is missing');await expect(page.getByLabel('Cell value or formula',{exact:true})).toBeDisabled();await page.getByRole('button',{name:'Document tools',exact:true}).click();await page.getByRole('button',{name:'Page versions',exact:true}).click();
 const versions=page.getByRole('dialog',{name:'Page versions',exact:true});await versions.getByRole('button',{name:/Version 1(?:\s|$)/}).click();await versions.getByRole('button',{name:'Restore this version',exact:true}).click();await expect(page.locator('.document-sheet')).toHaveAttribute('data-ready','true');await expect(cell(page,'A1')).toHaveText('');
});

test('leaving a focused formula bar commits its latest edit before the worksheet is removed',async({page})=>{
 const record=await open(page);await cell(page,'B2').click();const formula=page.getByLabel('Cell value or formula',{exact:true});await formula.fill('125');await page.evaluate(id=>{location.hash=`project/${id}/list`;},app.project.id);
 await expect(page.locator('.document-sheet')).toHaveCount(0);await expect.poll(async()=>(await app.store.getDocument(app.project.id,record.id)).table.workbook.sheets['sheet-1'].cellData[1][1].v).toBe(125);
 await page.goto(`${app.base}/#project/${app.project.id}/documents/${record.id}`);await expect(cell(page,'C2')).toHaveText('250');
});

test('a failed worksheet save survives reload and resumes without losing cell edits',async({page})=>{
 const record=await open(page),url=`**/api/projects/${app.project.id}/documents/${record.id}`;
 await page.route(url,route=>route.request().method()==='PATCH'?route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'Temporary save failure'})}):route.continue());
 await edit(page,'B2','125');await expect(cell(page,'C2')).toHaveText('250');await expect(page.locator('[data-document-save-problem]')).toBeVisible();await page.reload();await expect(cell(page,'C2')).toHaveText('250');
 await page.unroute(url);await page.reload();await expect.poll(async()=>(await app.store.getDocument(app.project.id,record.id)).table.workbook.sheets['sheet-1'].cellData[1][1].v).toBe(125);await expect(cell(page,'C2')).toHaveText('250');
});

test('own save notifications keep the mounted worksheet, selection and scroll position',async({page})=>{
 const record=await open(page);await page.locator('#document-form').evaluate(form=>form.dataset.mountToken='keep');await cell(page,'B2').click();
 const checked=page.waitForResponse(response=>new URL(response.url()).pathname===`/api/projects/${app.project.id}/delta`&&response.ok());await edit(page,'B2','125');await checked;await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
 await expect(page.locator('#document-form')).toHaveAttribute('data-mount-token','keep');await expect(cell(page,'B2')).toHaveAttribute('aria-selected','true');await expect.poll(async()=>(await app.store.getDocument(app.project.id,record.id)).table.workbook.sheets['sheet-1'].cellData[1][1].v).toBe(125);
});
