import { test, expect, useApp, onDevices } from '../fixtures.mjs';
const app=useApp(async store=>{
  const organisation=await store.createOrganisation({title:'Source team',people:[{id:'geo',name:'George'}],teams:[{id:'team',name:'Team',members:['geo']}]});
  const project=await store.createProject({title:'Imported planning',organisation:organisation.id,teams:['team']});
  return {project};
});
onDevices(['desktop','ipad','phone'],()=>{
  for(const view of ['list','tree']) test(`${view}: imported fields edit locally and persist after reload`,async({page,device})=>{
    const task=await app.store.createTask(app.project.id,{title:`Imported ${device} ${view}`,status:'todo',priority:'medium'});
    const file=app.store.file(app.project.id,'tasks',task.id), record=await app.store.read(file);
    await app.store.write(file,{...record.data,source:{provider:'jira',external_id:task.id,key:'TEST-1'}},record.body,record);
    const published=[];
    page.on('request',r=>{if(r.url().includes('/sources/')&&r.url().endsWith('/write'))published.push(r.url());});
    await page.goto(`${app.base}/#project/${app.project.id}/${view}`);
    const row=page.locator(`[data-task-order-row="${task.id}"]`);
    const saved=async()=> (await app.store.snapshot(app.project.id)).tasks.find(t=>t.id===task.id);
    for(const [field,choice,value] of [['assignee','George','George'],['status','Done','done'],['priority','High','high']]) {
      const button=row.locator(device==='phone'?`.phone-field[data-field="${field}"]`:`[data-row-field="${field}"]`);
      await button.click();
      await page.locator('#shared-select-menu').getByRole('option',{name:choice,exact:true}).click();
      await expect.poll(async()=> (await saved())[field]).toBe(value);
      await expect(row.locator(`[data-row-field="${field}"]`)).toHaveValue(value);
    }
    await row.locator('[data-row-dates]:visible').click();
    await page.locator('#task-dates-form [name="due"]').fill('2026-12-20');
    await expect.poll(async()=> (await saved()).due).toBe('2026-12-20');
    await page.getByRole('button',{name:'Close date editor',exact:true}).click();
    await page.reload();
    for(const [field,value] of [['assignee','George'],['status','done'],['priority','high']]) await expect(row.locator(`[data-row-field="${field}"]`)).toHaveValue(value);
    await expect(row.locator('[data-row-field="title"]')).toHaveAttribute('readonly','');
    expect((await saved()).source.local_fields.sort()).toEqual(['assignee','due','priority','status']);
    expect(published).toEqual([]);
  });
});
