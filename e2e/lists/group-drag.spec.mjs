import {test,expect,useApp,onDevices} from '../fixtures.mjs';
const app=useApp();
const row=(page,id)=>page.locator(`#view-content [data-task-order-row="${id}"]`);
const group=(page,field,value)=>page.locator(`#view-content [data-task-drop-field="${field}"][data-task-drop-value="${value}"]`);
async function seed({empty=false,restricted=false,source=false,leadingEmpty=false}={}) {
  const project=await app.store.createProject({title:'Group drag',schema:{statuses:leadingEmpty?['backlog','todo','done']:['todo','done'],done:['done'],types:['task','activity'],...(restricted?{transitions:{todo:[],done:[]}}:{})}});
  const a=await app.store.createTask(project.id,{title:'Move this card',status:'todo',type:'task',assignee:'Alice',priority:'medium',order:0});
  const b=await app.store.createTask(project.id,{title:'Destination card',status:empty?'todo':'done',type:'activity',assignee:'Bob',priority:'high',order:1024});
  await app.store.createTask(project.id,{title:'Keep this card',status:'todo',assignee:'Alice',order:2048});
  if(source){const file=app.store.file(project.id,'tasks',a.id),record=await app.store.read(file);await app.store.write(file,{...record.data,source:{provider:'jira',external_id:'123',key:'JIRA-123'}},record.body,record);}
  return {project,a,b};
}
const saved=async(project,id)=>(await app.store.snapshot(project.id)).tasks.find(t=>t.id===id);
async function begin(page,id){
  const handle=row(page,id).locator('[data-task-reorder]');await handle.scrollIntoViewIfNeeded();
  const r=await handle.boundingBox();await page.mouse.move(r.x+r.width/2,r.y+r.height/2);await page.mouse.down();await page.mouse.move(r.x+r.width/2,r.y+r.height/2+10,{steps:3});
  await expect(page.locator('.task-reorder-ghost')).toBeVisible();
}
async function over(page,target){
  await target.scrollIntoViewIfNeeded();const r=await target.boundingBox();await page.mouse.move(r.x+25,r.y+r.height*.25,{steps:8});
}
async function drop(page,id,target){await begin(page,id);await over(page,target);await page.mouse.up();}
async function grouping(page,device,value){
  const phone=device==='phone';const trigger=page.locator(phone?'.mobile-view-options > summary':'[data-board-menu="filters"] > summary');
  await trigger.click();await page.locator('#group-by').selectOption(value);
  if(phone)await page.getByRole('button',{name:'Close view options',exact:true}).click();else await trigger.click();
}

onDevices(['desktop','ipad','phone'],()=>{
  test('dropping between List groups updates only the grouping field, keeps grouping and persists @gate',async({page,device})=>{
    const {project,a,b}=await seed();await page.goto(`${app.base}/#project/${project.id}/list`);await row(page,a.id).waitFor();
    for(const [field,value] of [['status','done'],['assignee','Bob'],['priority','high'],['type','activity']]){
      if(field!=='status')await grouping(page,device,field);
      const before=await saved(project,a.id);await drop(page,a.id,row(page,b.id));
      await expect.poll(async()=>(await saved(project,a.id))[field]).toBe(value);
      await expect(group(page,field,value).locator(`[data-task-order-row="${a.id}"]`)).toBeVisible();
      for(const other of ['status','assignee','priority','type'].filter(key=>key!==field))expect((await saved(project,a.id))[other]).toBe(before[other]);
      await expect(page.locator('#task-form')).toHaveCount(0);
    }
    await page.reload();await expect(group(page,'type','activity').locator(`[data-task-order-row="${a.id}"]`)).toBeVisible();
  });

  test('empty groups appear during a drag, accept a drop, and cancel without changing fields @gate',async({page,device})=>{
    const {project,a}=await seed({empty:true});await page.goto(`${app.base}/#project/${project.id}/list`);await row(page,a.id).waitFor();
    const done=group(page,'status','done');await expect(done).toBeHidden();
    await begin(page,a.id);await expect(done).toBeVisible();await over(page,done.locator('.section-title'));
    await expect(done).toHaveClass(/task-group-drop-target/);await expect(page.locator('.task-reorder-marker')).toBeVisible();
    const style=await done.locator('.section-title').evaluate(el=>{const probe=document.createElement('span');probe.style.color='var(--green)';el.append(probe);const accent=getComputedStyle(probe).color;probe.remove();return {color:getComputedStyle(el).color,accent,height:el.getBoundingClientRect().height,min:parseFloat(getComputedStyle(el).getPropertyValue('--control-height'))};});
    expect(style.color).toBe(style.accent);expect(style.height).toBeGreaterThanOrEqual(style.min);
    await page.keyboard.press('Escape');await page.mouse.up();await expect(done).toBeHidden();expect((await saved(project,a.id)).status).toBe('todo');
    await drop(page,a.id,done.locator('.section-title'));await expect.poll(async()=>(await saved(project,a.id)).status).toBe('done');
    await grouping(page,device,'assignee');const unassigned=group(page,'assignee','');await expect(unassigned).toBeHidden();
    await drop(page,a.id,unassigned.locator('.section-title'));await expect.poll(async()=>(await saved(project,a.id)).assignee).toBe('');
    await expect(unassigned.locator(`[data-task-order-row="${a.id}"]`)).toBeVisible();
  });
});

test('revealing an empty group above the card keeps the lifted copy under the pointer @gate',async({page})=>{
  const {project,a}=await seed({leadingEmpty:true});await page.goto(`${app.base}/#project/${project.id}/list`);await row(page,a.id).waitFor();
  const source=await row(page,a.id).boundingBox();await begin(page,a.id);
  await expect(group(page,'status','backlog')).toBeVisible();
  const copy=await page.locator('.task-reorder-ghost').boundingBox();expect(Math.abs(copy.y-source.y-10)).toBeLessThanOrEqual(2);
  await page.keyboard.press('Escape');await page.mouse.up();expect((await saved(project,a.id)).status).toBe('todo');
});

test('workflow refusals leave fields, order and grouping unchanged @gate',async({page})=>{
  const {project,a,b}=await seed({restricted:true});await page.goto(`${app.base}/#project/${project.id}/list`);await row(page,a.id).waitFor();
  const before=(await app.store.snapshot(project.id)).tasks.map(({id,status,order})=>({id,status,order}));
  await begin(page,a.id);await over(page,row(page,b.id));await expect(page.locator('.task-reorder-ghost')).toHaveClass(/invalid/);await page.mouse.up();
  await expect(page.locator('#toasts .toast.error')).toContainText('Workflow does not allow');
  expect((await app.store.snapshot(project.id)).tasks.map(({id,status,order})=>({id,status,order}))).toEqual(before);
  await expect(group(page,'status','todo').locator(`[data-task-order-row="${a.id}"]`)).toBeVisible();
});

test('imported cards get local group overrides without publishing or changing source-owned types @gate',async({page})=>{
  const {project,a,b}=await seed({source:true});await page.goto(`${app.base}/#project/${project.id}/list`);await row(page,a.id).waitFor();
  await drop(page,a.id,row(page,b.id));await expect.poll(async()=>(await saved(project,a.id)).status).toBe('done');
  expect((await saved(project,a.id)).source.provider).toBe('jira');
  await grouping(page,'desktop','type');await begin(page,a.id);await over(page,row(page,b.id));await expect(page.locator('.task-reorder-ghost')).toHaveClass(/invalid/);await page.mouse.up();
  await expect(page.locator('#toasts .toast.error')).toContainText('connected source');expect((await saved(project,a.id)).type).toBe('task');
});
