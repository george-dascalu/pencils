// Owner request: remove the visible Blocked badge from board cards.
import {test,expect,useApp,onDevices} from '../fixtures.mjs';
const app=useApp(async store=>{
  const project=await store.createProject({title:'Card labels'}),blocker=await store.createTask(project.id,{title:'Prerequisite',status:'todo'}),card=await store.createTask(project.id,{title:'Waiting card',body:'Card description',status:'todo',dependencies:[blocker.id]});
  const board=(await store.snapshot(project.id)).boards[0];await store.updateBoard(project.id,board.id,{revision:board.revision,nodes:[{id:'waiting',type:'task',task:card.id,x:20,y:20,w:500,h:240,taskCollapsed:false}],edges:[]});return{project,board,card,blocker};
});
onDevices(['desktop','ipad','phone'],()=>test('blocked cards keep their dependency state without a visible text badge @gate',async({page})=>{
  await page.addInitScript(id=>localStorage.setItem(`pencils:camera:${id}`,JSON.stringify({x:0,y:0,z:1})),app.board.id);
  await page.goto(`${app.base}/#project/${app.project.id}/board/${app.board.id}`);const card=page.locator('[data-node="waiting"]');await expect(card).toHaveClass(/blocked-task/);
  await expect(card.locator('.canvas-task-flags')).toHaveCount(0);await expect(card.getByText('Blocked',{exact:true})).toHaveCount(0);await expect(card).toContainText('Waiting card');await expect(card).toContainText('Card description');
  expect((await app.store.snapshot(app.project.id)).tasks.find(t=>t.id===app.card.id).dependencies).toEqual([app.blocker.id]);
}));
