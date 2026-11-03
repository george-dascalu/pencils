import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {Store} from '../server/store.js';
import {createServer} from '../server/index.js';
import {Auth} from '../server/auth.js';
import {taskChanges,taskHistoryHTML} from '../public/task-history.js';
import {validTaskBoards} from '../server/task-board-links.js';

async function fixture(t){
  const root=await fs.mkdtemp('/tmp/pencils-task-boards-'),store=new Store(root);await store.init();
  const project=await store.createProject({title:'Board links'}),other=await store.createProject({title:'Other'});
  const board=(await store.snapshot(project.id)).boards[0],foreign=(await store.snapshot(other.id)).boards[0];
  t.after(async()=>{await store.close();await fs.rm(root,{recursive:true,force:true});});
  return{root,store,project,board,foreign};
}
test('board link shape validation accepts optional values and the exact 200-link limit',()=>{
  for(const value of [undefined,null,[],['b-a'],Array.from({length:200},(_,i)=>`b-${i}`)])assert.equal(validTaskBoards(value),true);
  for(const value of [false,'b-a',{},[null],['b-a','b-a'],['x-b'],['b-'],['b-a/b'],[3],Array.from({length:201},(_,i)=>`b-${i}`)])assert.equal(validTaskBoards(value),false);
});
test('card board links persist in Markdown, survive unrelated updates and restart, duplicate, and unlink without changing the board',async t=>{
  const {root,store,project,board}=await fixture(t);
  const before=await store.read(store.file(project.id,'boards',board.id));
  const card=await store.createTask(project.id,{title:'Plan',boards:[board.id]});
  assert.deepEqual(card.boards,[board.id]);
  assert.match(await fs.readFile(path.join(root,card.file),'utf8'),new RegExp(`boards:\\n\\s+- ${board.id}`));
  const updated=await store.updateTask(project.id,card.id,{revision:card.revision,title:'Revised plan'});
  assert.deepEqual(updated.boards,[board.id]);
  const duplicate=await store.createTask(project.id,{...updated,title:'Copy'});assert.deepEqual(duplicate.boards,[board.id]);
  const restarted=new Store(root);await restarted.init();t.after(()=>restarted.close());
  assert.deepEqual((await restarted.snapshot(project.id)).tasks.find(v=>v.id===card.id).boards,[board.id]);
  const removed=await store.updateTask(project.id,card.id,{revision:updated.revision,boards:[]});assert.deepEqual(removed.boards,[]);
  const restored=await store.restoreVersion(card.file,card.revision,removed.revision);assert.deepEqual(restored.boards,[board.id]);
  assert.equal((await store.read(store.file(project.id,'boards',board.id))).revision,before.revision);
});
test('board links reject invalid, duplicate, too many and foreign IDs; deleted links remain editable and can be removed',async t=>{
  const {store,project,board,foreign}=await fixture(t),base={title:'Links'};
  for(const boards of ['bad',{},[null],[3],['../escape'],['d-doc'],[board.id,board.id],Array.from({length:201},(_,i)=>`b-${i}`),[foreign.id],['b-missing']]){
    await assert.rejects(store.createTask(project.id,{...base,boards}),e=>e.status===400);
  }
  let card=await store.createTask(project.id,{...base,boards:[board.id]});
  await store.removeRecord(project.id,'boards',board.id,board.revision);
  card=await store.updateTask(project.id,card.id,{revision:card.revision,body:'The board was removed.'});assert.deepEqual(card.boards,[board.id]);
  card=await store.updateTask(project.id,card.id,{revision:card.revision,boards:[]});assert.deepEqual(card.boards,[]);
});
test('the task API saves board links with revision protection and rejects malformed updates without changing a card',async t=>{
  const {store,project,board}=await fixture(t),server=createServer(store,{auth:new Auth(store,false)});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(async()=>{server.closeAllConnections();await new Promise(r=>server.close(r));});
  const url=`http://127.0.0.1:${server.address().port}/api/projects/${project.id}/tasks`;
  const request=(endpoint,method,body)=>fetch(endpoint,{method,headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  let response=await request(url,'POST',{title:'API links',boards:[board.id]});assert.equal(response.status,201);const card=await response.json();assert.deepEqual(card.boards,[board.id]);
  response=await request(url+'/'+card.id,'PATCH',{revision:card.revision,boards:['wrong']});assert.equal(response.status,400);
  response=await request(url+'/'+card.id,'PATCH',{revision:card.revision,boards:[]});assert.equal(response.status,200);assert.deepEqual((await response.json()).boards,[]);
  response=await request(url+'/'+card.id,'PATCH',{revision:card.revision,boards:[board.id]});assert.equal(response.status,409);
});
test('card history describes board link additions and removals by board title',()=>{
  assert.deepEqual(taskChanges({boards:[]},{boards:['b-plan']}).map(v=>[v.key,v.label]),[['boards','Boards']]);
  const html=taskHistoryHTML([{revision:'old',data:{boards:[]}}],{revision:'new',boards:['b-plan']},{esc:v=>String(v),icon:()=>'',state:{boards:[{id:'b-plan',title:'Project canvas'}]},label:v=>v,task:()=>null});
  assert.match(html,/Boards/);assert.match(html,/Project canvas/);
});
