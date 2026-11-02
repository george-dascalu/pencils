import {test,expect,useApp,onDevices} from '../fixtures.mjs';
import {blankTable} from '../../public/document-sheet-model.js';
const app=useApp(async store=>({project:await store.createProject({title:'Tables capacity'})}));
async function seed(){const store=app.store,project=app.project;const record=await store.mutate(()=>store.createDocument(project.id,{title:'1,000-row budget',document_type:'table'}));const table=blankTable(record.id,record.title),sheet=table.workbook.sheets['sheet-1'];
 sheet.rowCount=1000;sheet.cellData=Object.fromEntries(Array.from({length:1000},(_,r)=>[r,Object.fromEntries(Array.from({length:26},(_,c)=>[c,c===0?{v:`Row ${r+1}`} : c===25?{f:`=SUM(B${r+1}:Y${r+1})`}:{v:r+c}]))]));
 await store.mutate(()=>store.updateDocument(project.id,record.id,{revision:record.revision,table}));return record;
}
onDevices(['desktop','ipad','phone'],()=>test('a 1,000-row worksheet calculates, scrolls with bounded DOM and saves an edit @gate',async({page,device},testInfo)=>{
 const record=await seed();const started=Date.now();await page.goto(`${app.base}/#project/${app.project.id}/documents/${record.id}`);await expect(page.locator('[data-sheet-cell="Z2"]')).toHaveText('324',{timeout:20000});const loadMs=Date.now()-started;
 const scroll=page.locator('.document-sheet-scroll');
 const metrics=await scroll.evaluate(async el=>{const frames=[];for(let i=1;i<=24;i++){const start=performance.now();el.scrollTop=(el.scrollHeight-el.clientHeight)*i/24;await new Promise(requestAnimationFrame);await new Promise(requestAnimationFrame);frames.push(performance.now()-start);}frames.sort((a,b)=>a-b);return{scrollMedianMs:frames[Math.floor(frames.length/2)],scrollP95Ms:frames[Math.floor(frames.length*.95)],mountedCells:el.querySelectorAll('[data-sheet-cell]').length,mountedRows:el.querySelectorAll('tbody tr').length,totalHeight:el.scrollHeight};});
 await expect(page.locator('[data-sheet-cell="A1000"]')).toHaveText('Row 1000');await expect(page.locator('[data-sheet-cell="Z1000"]')).toHaveText('24276');expect(metrics.mountedRows).toBeLessThan(90);expect(metrics.mountedCells).toBeLessThan(2400);expect(await page.evaluate(()=>scrollY)).toBe(0);
 await scroll.evaluate(el=>el.scrollTop=0);await page.locator('[data-sheet-cell="B2"]').click();const formula=page.getByLabel('Cell value or formula',{exact:true});await formula.fill('100');const editStarted=Date.now();await formula.press('Enter');await expect(page.locator('[data-sheet-cell="Z2"]')).toHaveText('422');
 await expect.poll(async()=>(await app.store.getDocument(app.project.id,record.id)).table.workbook.sheets['sheet-1'].cellData[1][1].v).toBe(100);
 const result={device,engine:page.context().browser().browserType().name(),rows:1000,columns:26,populatedCells:26000,formulas:1000,loadMs,editAndSaveMs:Date.now()-editStarted,...metrics};console.log(JSON.stringify(result));await testInfo.attach('table-performance',{body:JSON.stringify(result,null,2),contentType:'application/json'});
 expect(loadMs).toBeLessThan(20000);
}));
