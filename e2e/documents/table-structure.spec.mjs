import {test,expect,useApp,onDevices} from '../fixtures.mjs';
const app=useApp(async store=>({project:await store.createProject({title:'Table structure'})}));
async function open(page){const doc=await app.store.mutate(()=>app.store.createDocument(app.project.id,{title:'Plan',document_type:'table'}));await page.goto(`${app.base}/#project/${app.project.id}/documents/${doc.id}`);await expect(page.locator('.document-sheet')).toHaveAttribute('data-ready','true');return doc;}
const cell=(page,addr)=>page.locator(`[data-sheet-cell="${addr}"]`);
// Grid redraws can replace a header after a formula acknowledgement. Resolve
// the locator and measure its connected element together, then use that box.
async function headerBox(locator){let box;await expect.poll(async()=>{box=await locator.evaluate(el=>{const r=el.getBoundingClientRect();return el.isConnected&&r.width&&r.height?{x:r.x,y:r.y,width:r.width,height:r.height}:null;});return!!box;}).toBe(true);return box;}
async function edit(page,addr,value){await cell(page,addr).click();const input=page.getByLabel('Cell value or formula',{exact:true});await input.fill(value);await input.press('Enter');}
onDevices(['desktop','ipad','phone'],()=>test('row/column names, hide/show, deletion and worksheet size use header controls and persist @gate',async({page})=>{
 const doc=await open(page);expect((await app.store.getDocument(app.project.id,doc.id)).table.workbook.sheets['sheet-1'].rowCount).toBe(100);
 await edit(page,'A1','Keep');await page.getByRole('button',{name:'Column A options',exact:true}).click();await page.getByRole('button',{name:'Rename column',exact:true}).click();await page.getByLabel('Column name',{exact:true}).fill('Budget');await page.getByRole('button',{name:'Rename',exact:true}).click();
 await expect(page.getByRole('button',{name:'Column A options',exact:true})).toContainText('Budget');
 await page.getByRole('button',{name:'Column A options',exact:true}).click();await page.getByRole('button',{name:'Hide column',exact:true}).click();await expect(cell(page,'A1')).toHaveCount(0);await expect(cell(page,'B1')).toBeVisible();
 await page.getByRole('button',{name:'Column B options',exact:true}).click();await page.getByRole('button',{name:'Show hidden columns',exact:true}).click();await expect(cell(page,'A1')).toHaveText('Keep');
 await page.getByRole('button',{name:'Row 2 options',exact:true}).click();await page.getByRole('button',{name:'Rename row',exact:true}).click();await page.getByLabel('Row name',{exact:true}).fill('Revenue');await page.getByRole('button',{name:'Rename',exact:true}).click();await expect(page.getByRole('button',{name:'Row 2 options',exact:true})).toContainText('Revenue');
 await page.getByRole('button',{name:'Row 2 options',exact:true}).click();await page.getByRole('button',{name:'Delete row',exact:true}).click();await expect.poll(async()=>(await app.store.getDocument(app.project.id,doc.id)).table.workbook.sheets['sheet-1'].rowCount).toBe(99);
 await page.reload();await expect(cell(page,'A1')).toHaveText('Keep');await expect(page.getByRole('button',{name:'Column A options',exact:true})).toContainText('Budget');
}));
test('dragging a row and a column carries their data and keeps formulas correct',async({page})=>{
 await open(page);await edit(page,'A1','10');await edit(page,'B1','20');await edit(page,'C1','=A1+B1');await expect(cell(page,'C1')).toHaveText('30');
 const from=page.getByRole('button',{name:'Column A options',exact:true}),to=page.getByRole('button',{name:'Column C options',exact:true});let f=await headerBox(from),t=await headerBox(to);await page.mouse.move(f.x+f.width/2,f.y+f.height/2);await page.mouse.down();await page.mouse.move(t.x+t.width-4,t.y+t.height/2,{steps:6});await expect(page.locator('.sheet-axis-drop-line')).toBeVisible();await page.mouse.up();await expect(cell(page,'B1')).toHaveText('30');await expect(cell(page,'C1')).toHaveText('10');
 const row=page.getByRole('button',{name:'Row 1 options',exact:true}),row3=page.getByRole('button',{name:'Row 3 options',exact:true});f=await headerBox(row);t=await headerBox(row3);await page.mouse.move(f.x+f.width/2,f.y+f.height/2);await page.mouse.down();await page.mouse.move(t.x+t.width/2,t.y+t.height-4,{steps:6});await expect(page.locator('.sheet-axis-drop-line')).toHaveAttribute('data-before','3');await page.mouse.up();await expect(cell(page,'C3')).toHaveText('10');await expect(cell(page,'B3')).toHaveText('30');
});

onDevices(['ipad','phone'],()=>test('a held touch drags a header and Escape cancels a second move @gate',async({page})=>{
 await open(page);await edit(page,'A1','Keep');
 // Enter queues a virtual-grid redraw. Measure headers only after that edited
 // value is painted, so a replaced header cannot yield a null bounding box.
 await expect(cell(page,'A1')).toHaveText('Keep');
 const touch=(type,p)=>page.evaluate(([type,p])=>{document.elementFromPoint(p.x,p.y).dispatchEvent(new PointerEvent(type,{bubbles:true,cancelable:true,pointerType:'touch',pointerId:12,clientX:p.x,clientY:p.y}));},[type,p]);
 const source=page.getByRole('button',{name:'Row 1 options',exact:true}),to=page.getByRole('button',{name:'Row 3 options',exact:true});const a=await headerBox(source),b=await headerBox(to),from={x:a.x+a.width/2,y:a.y+a.height/2},target={x:b.x+b.width/2,y:b.y+b.height-3};
 await touch('pointerdown',from);await expect(source).toHaveClass(/sheet-axis-held/);await touch('pointermove',target);await expect(page.locator('.sheet-axis-drop-line')).toHaveAttribute('data-before','3');await touch('pointerup',target);await expect(cell(page,'A3')).toHaveText('Keep');
 const current=page.getByRole('button',{name:'Row 3 options',exact:true}),r=await headerBox(current),p={x:r.x+r.width/2,y:r.y+r.height/2};await touch('pointerdown',p);await expect(current).toHaveClass(/sheet-axis-held/);await touch('pointermove',from);await page.keyboard.press('Escape');await touch('pointerup',from);await expect(page.locator('.sheet-axis-drop-line')).toHaveCount(0);await expect(cell(page,'A3')).toHaveText('Keep');
}));
onDevices(['ipad'],()=>test('native touch can hold and move a table row',async({page})=>{
 await open(page);await edit(page,'A1','Touch');await expect(cell(page,'A1')).toHaveText('Touch');const cdp=await page.context().newCDPSession(page);const a=await page.getByRole('button',{name:'Row 1 options',exact:true}).boundingBox(),b=await page.getByRole('button',{name:'Row 3 options',exact:true}).boundingBox();await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:a.x+a.width/2,y:a.y+a.height/2}]});await expect(page.getByRole('button',{name:'Row 1 options',exact:true})).toHaveClass(/sheet-axis-held/);await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:b.x+b.width/2,y:b.y+b.height-3}]});await expect(page.locator('.sheet-axis-drop-line')).toHaveAttribute('data-before','3');await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await expect(cell(page,'A3')).toHaveText('Touch');
}));
onDevices(['desktop','ipad','phone'],()=>test('table properties open from their dedicated button without using grid space @gate',async({page})=>{
 await open(page);await expect(page.locator('#document-form .document-properties')).toHaveCount(0);const top=await page.locator('.sheet-formula-bar').boundingBox(),button=page.getByRole('button',{name:'Properties',exact:true});await button.click();const props=page.getByRole('dialog',{name:'Properties',exact:true});await expect(props).toBeVisible();await props.getByLabel('Tags',{exact:true}).fill('budget');await props.getByLabel('Tags',{exact:true}).press('Tab');await button.click();await expect(props).toHaveCount(0);const after=await page.locator('.sheet-formula-bar').boundingBox();expect(after.y).toBe(top.y);await expect(cell(page,'A1')).toBeVisible();
}));
