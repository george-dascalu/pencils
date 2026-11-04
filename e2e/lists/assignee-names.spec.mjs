import { test, expect, useApp, onDevices } from '../fixtures.mjs';
const app=useApp(async store=>{
 const project=await store.createProject({title:'Names',key:'NAME'});
 const task=await store.createTask(project.id,{title:'Read the full name',assignee:'George',status:'todo',priority:'high'});
 return {project,task};
});
onDevices(['desktop','ipad','phone'],()=>test('names use the available space and fields have subtle separators @gate',async({page,device})=>{
 for(const view of ['list','tree','table','kanban']) {
  await page.goto(`${app.base}/#project/${app.project.id}/${view}`);
  const name=page.locator('.main .task-assignee[data-full-name="George"]:visible').first();
  await expect(name).toBeVisible();
  await expect(name).toHaveAttribute('title','George');
  await expect(name).toHaveAttribute('aria-label','George');
  await expect.poll(async()=>name.evaluate(el=>el.scrollWidth<=el.clientWidth+1)).toBe(true);
  if(device==='desktop') await expect(name).toHaveText('George');
  if(['list','tree'].includes(view)) {
   const field=page.locator(device==='phone'?'.phone-task-fields .phone-field[data-field="status"]':'.row-fields > .row-status').first();
   const divider=await field.evaluate(el=>({shadow:getComputedStyle(el).boxShadow,content:getComputedStyle(el,'::before').content,width:getComputedStyle(el,'::before').width}));
   expect(divider.shadow).toBe('none');
   if(device!=='phone') { expect(divider.content).toBe('""');expect(divider.width).toBe('1px'); }
   else expect(divider.content).toBe('none');
  }
 }
 await page.screenshot({path: test.info().outputPath(`assignee-names-${device}.png`)});
 // A real name slot reacts to space, not to a transformed board camera scale.
 const name=page.locator('.main .task-assignee[data-full-name="George"]:visible').first();
 for(const [width,label] of [[120,'George'],[38,'Geo'],[14,'G']]) {
  await name.evaluate((el,width)=>{el.style.setProperty('width',`${width}px`,'important');el.style.setProperty('min-width','0','important');el.style.padding='0';el.style.flex='none';},width);
  await expect(name).toHaveText(label);
 }
 await name.evaluate(el=>el.style.transform='scale(0.2)');
 await expect(name).toHaveText('G');
}));
