import {test,expect,useApp,onDevices} from '../fixtures.mjs';
import {chooseCardSection} from '../helpers/card-panes.mjs';
const app=useApp(async store=>{
 const project=await store.createProject({title:'Edit relationship fields'});const org=await store.getOrganisation(project.organisation);await store.updateOrganisation(org.id,{revision:org.revision,people:[{id:'alice',name:'Alice'},{id:'bob',name:'Bob'}],teams:[{id:'all',name:'All',members:['alice','bob']}]});
 await store.updateProject(project.id,{revision:project.revision,teams:['all']});
 const parent=await store.createTask(project.id,{title:'Parent'});const child=await store.createTask(project.id,{title:'Related card',parent:parent.id,assignee:'Alice',status:'todo',priority:'medium'});
 return {project,parent,child};
});
const saved=async()=> (await app.store.snapshot(app.project.id)).tasks.find(t=>t.id===app.child.id);
onDevices(['desktop','ipad','phone'],()=>test('relationship fields edit directly and only the identity opens the linked card @gate',async({page})=>{
 await page.goto(`${app.base}/#project/${app.project.id}/list`);await page.locator(`[data-action=task-open][data-id="${app.parent.id}"]:visible`).first().click();
 const form=page.locator('#task-form'),list=form.locator('[data-relationship-list]');await expect(form).toHaveAttribute('data-id',app.parent.id);await chooseCardSection(page,'Relationships');
 for(const [field,value] of [['assignee','Bob'],['status','done'],['priority','high']]){
  const select=list.locator(`[data-relationship-field="${field}"][data-relationship-target="${app.child.id}"]`);
  await select.selectOption(value);await expect.poll(async()=> (await saved())[field]).toBe(value);await expect(form).toHaveAttribute('data-id',app.parent.id);
 }
 await expect(list.locator('.task-relationship-metadata')).toHaveCount(1);
 const click=list.locator(`[data-relationship-open="${app.child.id}"]`);await click.click();await expect(form).toHaveAttribute('data-id',app.child.id);
 await page.reload();await page.locator(`[data-action=task-open][data-id="${app.parent.id}"]:visible`).first().click();await expect(list.locator('.task-assignee')).toHaveAttribute('title','Bob');
}));
