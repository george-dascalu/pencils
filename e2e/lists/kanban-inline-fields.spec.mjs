// Owner request: edit the four Kanban fields directly, using shared pickers rather than opening the card.
import {test,expect,useApp,onDevices} from '../fixtures.mjs';
const app=useApp(async store=>{
  const organisation=await store.createOrganisation({title:'Inline team',people:[{id:'george',name:'George'},{id:'alex',name:'Alex'}],teams:[{id:'team',name:'Team',members:['george','alex']}]});
  const project=await store.createProject({title:'Inline Kanban',organisation:organisation.id,teams:['team']});
  const card=await store.createTask(project.id,{title:'Edit these fields',assignee:'George',status:'todo',priority:'medium',start:'2026-11-02',due:'2026-11-03'});
  return{project,card};
});
const current=async()=> (await app.store.snapshot(app.project.id)).tasks.find(t=>t.id===app.card.id);
test.beforeEach(async()=>{const card=await current();await app.store.updateTask(app.project.id,card.id,{revision:card.revision,assignee:'George',status:'todo',priority:'medium',due:'2026-11-03'});});
onDevices(['desktop','ipad','phone'],()=>test('Kanban field pickers save inline and the title still opens the card @gate',async({page,device})=>{
 await page.goto(`${app.base}/#project/${app.project.id}/kanban`);
 const card=page.locator(`[data-drag-task="${app.card.id}"]`), fields=card.locator('.kanban-fields');
 await expect(fields).toBeVisible();
 for(const [field,name,value] of [['assignee','Alex','Alex'],['priority','High','high'],['status','In progress','in-progress']]){
   await fields.locator(`select[data-row-field="${field}"]`).click();
   await page.locator('#shared-select-menu').getByRole('option',{name,exact:true}).click();
   await expect.poll(async()=> (await current())[field]).toBe(value);
   await expect(page.locator('#task-form')).toHaveCount(0);
 }
 await fields.locator('[data-row-dates]').click();
 const dates=page.locator('#task-dates-form');await expect(dates).toBeVisible();
 await dates.getByLabel('Due date',{exact:true}).fill('2026-11-09');await dates.getByLabel('Due date',{exact:true}).blur();
 await expect.poll(async()=> (await current()).due).toBe('2026-11-09');
 await dates.getByRole('button',{name:'Close date editor',exact:true}).click();
 await expect(fields.locator('[data-row-dates]')).toContainText('9 Nov');
 await expect(page.locator('#task-form')).toHaveCount(0);
 const sizes=await fields.evaluate(el=>[...el.querySelectorAll('select, [data-row-dates]')].map(control=>({h:control.getBoundingClientRect().height,w:control.getBoundingClientRect().width})));
 for(const size of sizes){expect(size.h).toBeGreaterThanOrEqual(device==='desktop'?32:44);expect(size.w).toBeGreaterThanOrEqual(device==='desktop'?28:44);}
 await card.locator('[data-action="task-open"]').click();await expect(page.locator('#task-form')).toBeVisible();
}));

test('Kanban keeps its editable status and enabled start date when the other fields are disabled @gate',async({page})=>{
 const project=await app.store.createProject({title:'Status-only Kanban'});const card=await app.store.createTask(project.id,{title:'Keep enabled fields',status:'todo',start:'2026-11-02',due:'2026-11-03'});
 await app.store.updateProject(project.id,{revision:project.revision,schema:{...project.schema,off:['assignee','priority','due']}});
 await page.goto(`${app.base}/#project/${project.id}/kanban`);const box=page.locator(`[data-drag-task="${card.id}"] .kanban-fields`);await expect(box.locator('[data-row-field=status]')).toBeVisible();await expect(box.locator('[data-row-dates]')).toHaveAccessibleName(/Start 2 Nov/);await expect(box.locator('.row-assignee')).toBeHidden();await expect(box.locator('.row-priority')).toBeHidden();
});
