import test from 'node:test';
import assert from 'node:assert/strict';
import { SaveQueue,merge } from '../public/sync.js';
import { boardDifference,applyBoardDelta } from '../public/board-delta.js';
function setup(t){
  const previous={window:globalThis.window,localStorage:globalThis.localStorage,sessionStorage:globalThis.sessionStorage},events=new Map(),intervals=[];
  const storage=()=>Object.defineProperties({}, {getItem:{value(k){return this[k]??null;}},setItem:{configurable:true,value(k,v){this[k]=String(v);}},removeItem:{value(k){delete this[k];}}});
  globalThis.localStorage=storage();globalThis.sessionStorage=storage();globalThis.window={addEventListener:(name,callback)=>events.set(name,callback)};
  t.mock.method(globalThis,'setInterval',(fn,delay)=>{intervals.push({fn,delay});return intervals.length;});
  t.mock.method(globalThis,'clearInterval',()=>{});
  const requests=[],saved=[],notifications=[];
  const queue=new SaveQueue({changed:()=>notifications.push(JSON.parse(localStorage.getItem(queue.key())||'[]')),saved:(url,record)=>saved.push({url,record}),api:async(url,request)=>{requests.push({url,request});return {...request.body,revision:'saved'};}});
  t.after(()=>{for(const pending of queue.deferred.values())clearTimeout(pending.timer);for(const [name,value] of Object.entries(previous))value===undefined?delete globalThis[name]:globalThis[name]=value;});
  return {queue,requests,saved,notifications,storage:localStorage,events,intervals};
}
const url='/api/projects/p/documents/d',base={id:'d',body:'Original',title:'Document',revision:'base'};
test('recovery adopts only abandoned drafts, preserves current drafts and refreshes its lease',t=>{
  const {queue,storage,intervals,events,notifications}=setup(t);let now=100000;t.mock.method(Date,'now',()=>now);queue.namespace='me';
  const draft=(id,value)=>({url:`/api/projects/p/documents/${id}`,base:{...base,id},local:{...base,id,body:value},generation:1,blocked:true,running:true});
  const own=draft('own','this tab'),abandoned=draft('abandoned','old tab'),legacy=draft('legacy','old format');
  storage.setItem(queue.key(),JSON.stringify([own]));
  const other='pencils:pending:me:other',live='pencils:pending:me:live';
  storage.setItem(other,JSON.stringify([draft('own','other draft'),abandoned]));storage.setItem(other+':lease',String(now-12000));
  storage.setItem(live,JSON.stringify([draft('live','active tab')]));storage.setItem(live+':lease',String(now-11999));
  storage.setItem('pencils:pending:me',JSON.stringify([legacy]));storage.setItem('pencils:pending:another:tab',JSON.stringify([draft('foreign','other person')]));
  queue.load('me');
  assert.deepEqual([...queue.entries.keys()].sort(),[own.url,abandoned.url,legacy.url].sort());assert.equal(queue.entries.get(own.url).local.body,'this tab');
  assert.equal(queue.entries.get(abandoned.url).running,false);assert.equal(queue.entries.get(own.url).running,false);
  assert.equal(JSON.parse(storage.getItem(other)).length,1);assert.equal(JSON.parse(storage.getItem(other))[0].local.body,'other draft');assert.equal(storage.getItem('pencils:pending:me'),null);
  assert.equal(storage.getItem(queue.key()+':lease'),String(now));now+=4000;intervals.at(-1).fn();assert.equal(storage.getItem(queue.key()+':lease'),String(now));
  assert.ok(events.has('online'));assert.equal(intervals[0].delay,4000);let retried=0;queue.retry=()=>retried++;events.get('online')();intervals[0].fn();assert.equal(retried,2);assert.ok(notifications.length>0);
});
test('validation failures stay recoverable and corrected edits retry; server/rate limits remain retryable',async t=>{
  const {queue,storage,saved}=setup(t);
  for(const status of [400,413,422,403,429,500]){
    queue.api=async()=>{const error=Error('Rejected');error.status=status;throw error;};
    await queue.enqueue(url,base,{body:'Draft'});const entry=queue.entries.get(url);
    assert.equal(entry.blocked,![429,500].includes(status));assert.equal(entry.error,'Rejected');assert.equal(entry.running,false);assert.equal(JSON.parse(storage.getItem(queue.key()))[0].error,'Rejected');
    queue.api=async(_url,request)=>({...request.body,revision:'fixed'});await queue.enqueue(url,base,{body:'Corrected'});
    assert.equal(queue.entries.size,0);assert.equal(saved.at(-1).record.body,'Corrected');assert.deepEqual(JSON.parse(storage.getItem(queue.key())),[]);
  }
});
test('a validation rejection of an older in-flight edit does not block its corrected generation',async t=>{
  const {queue,saved}=setup(t);let reject,calls=0;
  queue.api=async(_url,request)=>{calls++;if(calls===1)return new Promise((_resolve,no)=>reject=no);return {...request.body,revision:'fixed'};};
  const first=queue.enqueue(url,base,{body:'Invalid'}),last=queue.enqueue(url,base,{body:'Corrected'});const error=Error('Old edit rejected');error.status=400;reject(error);
  await Promise.all([first,last]);assert.equal(calls,2);assert.equal(queue.entries.size,0);assert.equal(saved.at(-1).record.body,'Corrected');
});
test('conflict resolution persists the selected body and independent remote title before sending',async t=>{
  const {queue,storage}=setup(t);
  for(const choice of ['local','remote']){
    const remote={...base,body:'Other writer',title:'Remote title',revision:'remote'},entry={url,base,local:{...base,body:'My draft'},generation:2,error:'Conflict',blocked:true,conflict:{remote,conflicts:[{path:'body'}]}};queue.entries.set(url,entry);
    queue.api=async(_url,request)=>{const persisted=JSON.parse(storage.getItem(queue.key()))[0];assert.equal(persisted.conflict,null);assert.equal(persisted.blocked,false);assert.equal(persisted.error,null);return {...request.body,revision:'resolved'};};
    await queue.resolve(url,choice);assert.equal(entry.local.body,choice==='local'?'My draft':'Other writer');assert.equal(entry.local.title,'Remote title');assert.equal(entry.base.revision,'remote');assert.equal(entry.generation,3);assert.equal(queue.entries.size,0);
  }
});
test('storage errors bypass delay and report recovery failure without losing the in-memory draft',async t=>{
  const {queue,storage,notifications}=setup(t);storage.setItem(queue.key(),'[]');const original=storage.setItem;
  Object.defineProperty(storage,'setItem',{value(){throw Error('Full');},configurable:true});
  let called=false;queue.api=async()=>{called=true;throw Error('Offline');};await queue.enqueue(url,base,{body:'Important draft'},{delay:10000});
  assert.equal(called,true);assert.equal(queue.storageError,true);assert.equal(queue.entries.get(url).local.body,'Important draft');assert.equal(queue.deferred.size,0);assert.ok(notifications.length);
  Object.defineProperty(storage,'setItem',{value:original,configurable:true});queue.persist();assert.equal(queue.storageError,false);assert.equal(JSON.parse(storage.getItem(queue.key()))[0].local.body,'Important draft');
});
test('array merges preserve concurrent comments, deletion and distinct reorder conflicts',()=>{
  const comments=['a','b','c'].map(id=>({id,text:id}));
  const local=[comments[1],comments[0],comments[2]],remote=[comments[0],comments[2],comments[1]],both=merge(comments,local,remote);
  assert.equal(both.conflicts[0].path,'.$order');assert.deepEqual(both.conflicts[0].base,['a','b','c']);assert.deepEqual(both.value,local);
  assert.deepEqual(merge(comments,comments,remote).value,remote);
  const a=[comments[0],{...comments[1],text:'edited'}],b=[...comments,{id:'d',text:'new'}],merged=merge(comments,a,b);
  assert.deepEqual(merged.value,[comments[0],{...comments[1],text:'edited'},{id:'d',text:'new'}]);assert.deepEqual(merged.conflicts,[]);
  for(const [a,b,c] of [[[],['x'],['y']],[['a'],null,['b']],[[],[{id:2}],[{id:3}]],[{},[],['a']]])assert.equal(merge(a,b,c).conflicts.length,1);
  assert.deepEqual(merge(comments,[comments[1],comments[0]],[comments[2],comments[0]]).conflicts,[]);
});
// F0.22-11: the server lists a note's fields in its own order; the same note is not a change, so
// deleting a note whose creation is still being acknowledged is not a conflict.
test('values that differ only in key order are the same, so a delete during a save merges cleanly',()=>{
  const note={id:'n',type:'sticky',x:1,y:2,text:'',color:'#f5e7a2'},other={id:'o',type:'text',x:5,y:5,text:'Keep'};
  const sent={nodes:[other,note]},local={nodes:[other]},remote={nodes:[{type:'text',text:'Keep',id:'o',x:5,y:5},{type:'sticky',id:'n',color:'#f5e7a2',text:'',x:1,y:2}]};
  const result=merge(sent,local,remote);
  assert.deepEqual(result.conflicts,[]);
  assert.deepEqual(result.value.nodes.map(n=>n.id),['o']);
});
test('packed board recovery retains original changed nodes, unrelated remote nodes and delivery data',async t=>{
  const {queue,storage}=setup(t),boardURL='/api/projects/p/boards/b';
  const node={id:'a',type:'note',x:0,y:0,w:100,h:100,text:'Original'},other={...node,id:'remote',text:'Remote'},old={id:'b',revision:'base',nodes:[node],edges:[]},local={...old,nodes:[{...node,text:'Edited'}]};
  const entry={url:boardURL,base:old,local,generation:1,delivery:{generation:1,base:old,sent:local,operationId:'delivery'}};queue.entries.set(boardURL,entry);queue.persist();
  const packed=JSON.parse(storage.getItem(queue.key()))[0];assert.equal(packed.packedBoard,true);assert.deepEqual(packed.originals.nodes,[node]);assert.deepEqual(packed.delivery.changes,boardDifference(old,local));
  queue.entries.set(boardURL,packed);queue.hydrate(packed,{...old,revision:'remote',nodes:[{...node,text:'Other edit'},other]});assert.equal(packed.packedBoard,undefined);assert.equal(packed.base.revision,'base');assert.equal(packed.base.nodes.find(n=>n.id==='a').text,'Original');assert.ok(packed.local.nodes.some(n=>n.id==='a'&&n.text==='Edited'));assert.ok(packed.local.nodes.some(n=>n.id==='remote'));assert.ok(packed.delivery.sent.nodes.some(n=>n.id==='a'&&n.text==='Edited'));
  let applied;queue.api=async(_url,request)=>{applied=applyBoardDelta(packed.base,request.body.changes,{guard:false});return {...applied,revision:'saved'};};await queue.run(packed);assert.equal(queue.entries.size,0);assert.equal(applied.nodes.find(n=>n.id==='a').text,'Edited');
});
test('queued changes are isolated from later mutations and unresolved/discarded entries never send',async t=>{
  const {queue,requests}=setup(t),comments=[{id:'one',text:'Saved'}];const pending=queue.enqueue(url,base,{comments},{delay:5});comments[0].text='Not submitted';await pending;
  assert.equal(requests[0].request.body.comments[0].text,'Saved');const entry={url,base,local:{...base,body:'Conflict'},generation:1,conflict:{remote:base,conflicts:[]}};queue.entries.set(url,entry);await queue.run(entry);assert.equal(requests.length,1);
  queue.discard(url);assert.deepEqual(JSON.parse(localStorage.getItem(queue.key())),[]);entry.conflict=null;await queue.run(entry);assert.equal(requests.length,1);
});
test('a saved generation publishes newer local text even if its next save goes offline',async t=>{
  const {queue,saved}=setup(t);let release,calls=0;
  queue.api=async(_url,request)=>{if(++calls===1)return new Promise(resolve=>release=()=>resolve({...request.body,revision:'one'}));throw Error('Offline');};
  const first=queue.enqueue(url,base,{body:'First'}),last=queue.enqueue(url,base,{body:'Latest'});release();await Promise.all([first,last]);assert.equal(saved.at(-1).record.body,'Latest');assert.equal(queue.entries.get(url).error,'Offline');
});
test('a board request is durable before sending, including legacy in-flight operations without cached deltas',async t=>{
  const {queue,storage}=setup(t),u='/api/projects/p/boards/b',old={id:'b',nodes:[],edges:[],revision:'base'},local={...old,title:'Updated'};
  queue.api=async(_url,request)=>{const packed=JSON.parse(storage.getItem(queue.key()))[0];assert.equal(packed.delivery.operationId,request.body.operationId);assert.ok(Array.isArray(request.body.changes));return {...local,revision:'saved'};};
  await queue.enqueue(u,old,{title:'Updated'});assert.equal(queue.entries.size,0);
  const entry={url:u,base:old,local,generation:1,delivery:{base:old,sent:local,generation:1,operationId:'legacy'}};queue.entries.set(u,entry);queue.persist();await queue.run(entry);assert.equal(queue.entries.size,0);
});
test('packed draft read errors persist for recovery and become retryable after reconnecting',async t=>{
  const {queue,storage}=setup(t),u='/api/projects/p/boards/b',old={id:'b',revision:'base',nodes:[],edges:[]},local={...old,title:'Draft'};
  queue.entries.set(u,{url:u,base:old,local,generation:1});queue.persist();const packed=JSON.parse(storage.getItem(queue.key()))[0];queue.entries.set(u,packed);
  queue.api=async()=>{throw Error('Disconnected');};await queue.run(packed);assert.equal(packed.running,false);assert.equal(JSON.parse(storage.getItem(queue.key()))[0].error,'Disconnected');
  queue.api=async(_url,request)=>request?{...local,revision:'saved'}:old;await queue.run(packed);assert.equal(queue.entries.size,0);
});
test('an edit hydrates a recovered board before applying new changes, and packed conflicts can be resolved',async t=>{
  const {queue,storage}=setup(t),u='/api/projects/p/boards/b',node={id:'a',type:'note',x:0,y:0,w:100,h:100,text:'Original'},old={id:'b',revision:'base',nodes:[node],edges:[]},local={...old,nodes:[{...node,text:'Draft'}]};
  queue.entries.set(u,{url:u,base:old,local,generation:1});queue.persist();const raw=storage.getItem(queue.key());
  queue.entries.set(u,JSON.parse(raw)[0]);let server=old;
  queue.api=async(_url,request)=>request?(server={...applyBoardDelta(server,request.body.changes,{guard:false}),revision:'saved'}):server;
  await queue.enqueue(u,old,{title:'Recovered title'});assert.equal(queue.entries.size,0);assert.equal(server.title,'Recovered title');assert.equal(server.nodes[0].text,'Draft');
  const packed=JSON.parse(raw)[0];packed.conflict={conflicts:[{path:'nodes[a].text'}]};queue.entries.set(u,packed);server={...old,revision:'remote',nodes:[{...node,text:'Remote writer'}]};
  await queue.resolve(u,'local');assert.equal(queue.entries.size,0);assert.equal(server.nodes[0].text,'Draft');
});
