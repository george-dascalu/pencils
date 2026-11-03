import test from 'node:test';
import assert from 'node:assert/strict';
import { SaveQueue } from '../public/sync.js';
function setup(t){
  const previous={window:globalThis.window,localStorage:globalThis.localStorage,sessionStorage:globalThis.sessionStorage},values=new Map();
  const storage={getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,String(v)),removeItem:k=>values.delete(k)};
  globalThis.window={addEventListener(){}};globalThis.localStorage=storage;globalThis.sessionStorage=storage;
  const requests=[],queue=new SaveQueue({changed(){},saved(){},api:async(url,request)=>{requests.push(request.body);return {...request.body,revision:'saved'};}});
  t.after(()=>{clearInterval(queue.timer);clearInterval(queue.leaseTimer);for(const pending of queue.deferred?.values()||[])clearTimeout(pending.timer);for(const [name,value] of Object.entries(previous))value===undefined?delete globalThis[name]:globalThis[name]=value;});
  return {queue,requests,storage};
}
test('document typing persists every edit immediately and coalesces network writes',async t=>{
  const {queue,requests,storage}=setup(t),url='/api/projects/p/documents/d',base={id:'d',title:'Doc',body:'Original',revision:'base'};
  const first=queue.enqueue(url,base,{body:'First'},{delay:30}),last=queue.enqueue(url,base,{body:'Latest'},{delay:30});
  assert.equal(JSON.parse(storage.getItem(queue.key()))[0].local.body,'Latest');assert.equal(requests.length,0);
  await Promise.all([first,last]);assert.equal(requests.length,1);assert.equal(requests[0].body,'Latest');assert.equal(queue.entries.size,0);
});
test('discarding a deferred document resolves its waiters without sending stale edits',async t=>{
  const {queue,requests}=setup(t),url='/api/projects/p/documents/d';const pending=queue.enqueue(url,{id:'d',body:'Old',revision:'base'},{body:'Draft'},{delay:30});
  queue.discard(url);await pending;assert.equal(requests.length,0);assert.equal(queue.entries.size,0);assert.equal(queue.deferred.size,0);
});
test('the debounce deadline follows the last edit rather than the first',async t=>{
  t.mock.timers.enable({apis:['setTimeout']});
  const {queue,requests}=setup(t),url='/api/projects/p/documents/d',base={id:'d',body:'Old',revision:'base'};
  const first=queue.enqueue(url,base,{body:'First'},{delay:30});t.mock.timers.tick(20);
  const last=queue.enqueue(url,base,{body:'Latest'},{delay:30});t.mock.timers.tick(15);assert.equal(requests.length,0);
  t.mock.timers.tick(15);await Promise.all([first,last]);assert.equal(requests.length,1);assert.equal(requests[0].body,'Latest');assert.equal(queue.deferred.size,0);
});
test('an immediate document action flushes pending text and resolves its waiters',async t=>{
  const {queue,requests}=setup(t),url='/api/projects/p/documents/d',base={id:'d',title:'Old',body:'Original',revision:'base'};
  const pending=queue.enqueue(url,base,{body:'Typed'},{delay:30}),urgent=queue.enqueue(url,base,{title:'Renamed'});
  assert.equal(requests.length,1);await Promise.all([pending,urgent]);assert.equal(requests[0].body,'Typed');assert.equal(requests[0].title,'Renamed');
});
test('continuous typing is flushed within a one-second window',async t=>{
  let now=1000;t.mock.method(Date,'now',()=>now);
  const {queue,requests}=setup(t),url='/api/projects/p/documents/d',base={id:'d',body:'Original',revision:'base'};
  const first=queue.enqueue(url,base,{body:'First'},{delay:10000});now+=1001;const last=queue.enqueue(url,base,{body:'Latest'},{delay:10000});
  await Promise.all([first,last]);assert.equal(requests.length,1);assert.equal(requests[0].body,'Latest');
});
test('typing during a running save keeps the latest generation without a promise cycle',{timeout:2000},async t=>{
  const {queue,requests}=setup(t),url='/api/projects/p/documents/d',base={id:'d',body:'Original',revision:'base'};let release;
  queue.api=async(_url,request)=>{requests.push(request.body);if(requests.length===1)return new Promise(resolve=>{release=()=>resolve({...request.body,revision:'first'});});return {...request.body,revision:'second'};};
  const first=queue.enqueue(url,base,{body:'First'}),last=queue.enqueue(url,base,{body:'Latest'},{delay:15});release();
  await Promise.all([first,last]);assert.equal(requests.length,2);assert.equal(requests[1].body,'Latest');assert.equal(queue.entries.size,0);
});
