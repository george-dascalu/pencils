import fs from 'node:fs/promises';
import{test,expect,onDevices}from'../fixtures.mjs';
import{useCustomApp}from'../helpers/custom-server.mjs';
import{blankTable}from'../../public/document-sheet-model.js';
const app=useCustomApp({server:()=>({productionAssets:true}),seed:async store=>{const project=await store.createProject({title:'Production Tables'}),plain=await store.mutate(()=>store.createDocument(project.id,{title:'Plain note',body:'# Plain document'}));return{project,plain};}});
onDevices(['desktop','ipad','phone'],()=>test('the production build loads the spreadsheet engine only when a Table opens and persists calculations @gate',async({page})=>{
 const record=await app.store.mutate(()=>app.store.createDocument(app.project.id,{title:'Built table',document_type:'table'})),table=blankTable(record.id,record.title);table.workbook.sheets['sheet-1'].cellData={0:{1:{v:12},2:{f:'=B1*3'}}};await app.store.mutate(()=>app.store.updateDocument(app.project.id,record.id,{revision:record.revision,table}));
 const meta=JSON.parse(await fs.readFile('dist/assets-meta.json','utf8')),chunk=Object.entries(meta.outputs).find(([,v])=>v.entryPoint==='public/document-sheet-deps.js')[0].replace('dist/public',''),requests=[];page.on('request',request=>requests.push(new URL(request.url()).pathname));
 await page.goto(`${app.base}/#project/${app.project.id}/documents/${app.plain.id}`);await expect(page.locator('.cm-editor')).toBeVisible();expect(requests).not.toContain(chunk);
 await page.goto(`${app.base}/#project/${app.project.id}/documents/${record.id}`);await expect(page.locator('[data-sheet-cell=C1]')).toHaveText('36');expect(requests).toContain(chunk);await page.locator('[data-sheet-cell=B1]').click();const formula=page.getByLabel('Cell value or formula',{exact:true});await formula.fill('13');await formula.press('Enter');await expect(page.locator('[data-sheet-cell=C1]')).toHaveText('39');await expect.poll(async()=>(await app.store.getDocument(app.project.id,record.id)).table.workbook.sheets['sheet-1'].cellData[0][1].v).toBe(13);
 const licence=await page.request.get(`${app.base}/vendor/sheets/THIRD_PARTY_LICENSES.txt`);expect(licence.status()).toBe(200);expect(await licence.text()).toContain('@univerjs/core 1.3.1');
}));
