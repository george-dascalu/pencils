import {test,expect,useApp,onDevices} from '../fixtures.mjs';
const app=useApp(async store=>({project:await store.createProject({title:'Compact editor controls'}),task:null}));
async function seed(){return app.store.createTask(app.project.id,{title:'Compact fields',start:'2026-11-02',due:'2026-11-03',start_time:'09:00',due_time:'10:00',body:'Short description'});}
onDevices(['desktop','ipad','phone'],()=>{
 test('the date popover leads with All day above aligned dates and visible time fields @gate',async({page})=>{
  const task=await seed();await page.goto(`${app.base}/#project/${app.project.id}/list`);await page.locator(`[data-row-dates="${task.id}"]:visible`).first().click();
  const popup=page.locator('#task-dates-popover');await expect(popup).toBeVisible();
  const geometry=await popup.evaluate(el=>{const r=s=>el.querySelector(s).getBoundingClientRect().toJSON();return{start:r('[name=start]'),end:r('[name=due]'),toggle:r('[data-task-allday]'),from:r('[name=start_time]'),to:r('[name=due_time]'),overflow:el.scrollWidth-el.clientWidth};});
  expect(Math.abs(geometry.start.top-geometry.end.top)).toBeLessThan(1);expect(geometry.start.right).toBeLessThan(geometry.end.left);
  expect(Math.abs(geometry.from.top-geometry.to.top)).toBeLessThan(1);expect(geometry.toggle.bottom).toBeLessThan(geometry.start.top);expect(geometry.toggle.left).toBeLessThanOrEqual(geometry.start.left);expect(geometry.overflow).toBeLessThanOrEqual(1);
  await popup.getByRole('button',{name:'All day',exact:true}).click();await expect(popup.locator('.task-time-range')).toBeVisible();await expect(popup.locator('[name=start_time]')).toBeDisabled();await expect(popup.locator('[name=due_time]')).toBeDisabled();
 });
 test('frame updates keep the rearrange checkbox beside Update frame without instructional text @gate',async({page})=>{
  const board=(await app.store.snapshot(app.project.id)).boards[0];
  await app.store.updateBoard(app.project.id,board.id,{revision:board.revision,nodes:[{id:'plan',type:'frame',projectFrame:true,text:'Project plan',x:40,y:80,w:280,h:200}],edges:[]});
  await page.goto(`${app.base}/#project/${app.project.id}/board`);await page.locator('[data-node=plan] .project-frame-update').click();
  const panel=page.getByRole('dialog',{name:'Update project frame'});await expect(panel).toBeVisible();await expect(panel).not.toContainText('Leave unchecked');
  const geometry=await panel.evaluate(el=>{const box=s=>el.querySelector(s).getBoundingClientRect().toJSON();return{check:box('#frame-relayout'),button:box('#frame-apply'),overflow:el.scrollWidth-el.clientWidth};});
  expect(geometry.check.right).toBeLessThan(geometry.button.left);expect(Math.abs((geometry.check.top+geometry.check.bottom)/2-(geometry.button.top+geometry.button.bottom)/2)).toBeLessThan(2);expect(geometry.overflow).toBeLessThanOrEqual(1);
  await panel.getByRole('button',{name:'Close frame update'}).click();await expect(panel).toHaveCount(0);
 });
 test('writing areas hide inactive scrollbars and keep working scrollbars for long content @gate',async({page})=>{
  const task=await seed();await page.goto(`${app.base}/#project/${app.project.id}/list`);await page.locator(`[data-action=task-open][data-id="${task.id}"]:visible`).first().click();
  const editor=page.locator('#task-form .inline-rich');await expect(editor).toHaveAttribute('data-inert-scrollbars','x y');
  await expect(editor).toHaveCSS('scrollbar-width','none');
  await editor.fill(Array.from({length:60},(_,i)=>`Long description line ${i}`).join('\n'));
  await expect.poll(()=>editor.evaluate(el=>el.scrollHeight-el.clientHeight)).toBeGreaterThan(50);
  await expect(editor).not.toHaveAttribute('data-inert-scrollbars',/\by\b/);
  // Headless Firefox forces native bars off, including on a fresh scrollable element.
  const nativeWidth=await page.evaluate(()=>{const probe=document.createElement('div');probe.style.cssText='scrollbar-width:thin;overflow:auto;width:80px;height:40px';probe.textContent='Probe';document.body.append(probe);const width=getComputedStyle(probe).scrollbarWidth;probe.remove();return width;});
  await expect(editor).toHaveCSS('scrollbar-width',nativeWidth);
  expect(await editor.evaluate(el=>{el.scrollTop=80;return el.scrollTop;})).toBeGreaterThan(0);
 });
});
