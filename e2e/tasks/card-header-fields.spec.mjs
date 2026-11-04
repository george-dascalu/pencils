import {test,expect,useApp,onDevices} from '../fixtures.mjs';
const app=useApp(async store=>{
 const project=await store.createProject({title:'Card layout',key:'CARD'});
 const card=await store.createTask(project.id,{title:'A long card title that should stay readable beside its identity',assignee:'George',status:'todo',priority:'high'});
 return {project,card};
});
onDevices(['desktop','ipad','phone'],()=>{
 test('field focus fits the visible chip while targets keep their full height @gate',async({page,device})=>{
  for(const view of ['list','tree']){
   await page.goto(`${app.base}/#project/${app.project.id}/${view}`);
   const row=page.locator(`[data-task-order-row="${app.card.id}"]`);
   for(const field of ['assignee','status','priority']){
    const target=row.locator(device==='phone'?`.phone-field[data-field="${field}"]`:`[data-row-field="${field}"]`);
    await target.focus();
    const control=device==='phone'?target:target.locator('..');
    await expect(control).toHaveCSS('outline-style','none');
    const style=await control.evaluate(el=>{const s=getComputedStyle(el,'::after');return {height:parseFloat(s.height),outline:s.outlineStyle,offset:s.outlineOffset};});
    expect(style).toEqual({height:device==='desktop'?24:32,outline:'solid',offset:'-1px'});
    expect((await target.boundingBox()).height).toBeGreaterThanOrEqual(device==='desktop'?32:44);
    await target.click();await page.keyboard.press('Escape');
   }
  }
 });
 test('the editor puts type, ID, bookmark and title on one line @gate',async({page,device})=>{
  await page.goto(`${app.base}/#project/${app.project.id}/list`);
  await page.locator(`[data-action="task-open"][data-id="${app.card.id}"]:visible`).first().click();
  const form=page.locator('#task-form');
  await expect(form).toBeVisible();
  for(const width of device==='phone'?[390,320]:[page.viewportSize().width]){
   await page.setViewportSize({width,height:844});
   await expect.poll(async()=> (await form.boundingBox()).x + (await form.boundingBox()).width).toBeLessThanOrEqual(width);
   const parts=await form.locator('.task-title-row').evaluate(el=>['[data-task-picker="type"]','.task-key','[data-bookmark]','[name="title"]'].map(s=>{const r=el.querySelector(s)?.getBoundingClientRect();return r?{left:r.left,right:r.right,middle:r.top+r.height/2,width:r.width}:null;}));
   expect(parts.every(Boolean)).toBe(true);
   for(let i=1;i<parts.length;i++) expect(parts[i].left).toBeGreaterThanOrEqual(parts[i-1].right);
   expect(Math.max(...parts.map(p=>p.middle))-Math.min(...parts.map(p=>p.middle))).toBeLessThanOrEqual(2);
   expect(parts[3].width).toBeGreaterThanOrEqual(75);
   expect(parts[3].right).toBeLessThanOrEqual(width);
  }
  const before=await form.locator('[data-bookmark]').getAttribute('aria-pressed');
  await form.locator('[data-bookmark]').click();
  await expect(form.locator('[data-bookmark]')).toHaveAttribute('aria-pressed',before==='true'?'false':'true');
  await page.screenshot({path: test.info().outputPath(`card-header-${device}.png`)});
 });
});
