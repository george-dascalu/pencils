import test from 'node:test';
import assert from 'node:assert/strict';
import { taskAutosave } from '../public/task-autosave.js';

test('an untouched empty draft does not require validation, while changed invalid fields remain unsaved', async t => {
  const previous = globalThis.window;globalThis.window={addEventListener(){},removeEventListener(){}};let autosave;t.after(()=>{autosave?.destroy();if(previous===undefined)delete globalThis.window;else globalThis.window=previous;});
  let current={title:'',body:''},writes=0,validation=0;
  const status={textContent:'',classList:{toggle(){}}};
  const form={dataset:{},elements:{title:{value:''}},querySelector:()=>status,checkValidity(){validation++;return false;},addEventListener(){},removeEventListener(){}};
  autosave=taskAutosave(form,{read:()=>structuredClone(current),flushEditor(){},task:()=>({}),sync:{entries:new Map()},url:'/draft',save(){writes++;}});
  assert.equal(await autosave.flush(),true);assert.equal(validation,0);assert.equal(writes,0);assert.equal(status.textContent,'');
  assert.equal(autosave.hasChanges(),false);current={...current,body:'New unsaved text'};assert.equal(autosave.hasChanges(),true);
  assert.equal(await autosave.flush(),false);assert.equal(writes,0);assert.match(status.textContent,/required/);
});

function harness(t,options={}) {
  const oldWindow=globalThis.window,oldNavigator=Object.getOwnPropertyDescriptor(globalThis,'navigator');
  const windowEvents=new Map(),events=new Map(),timeouts=new Map();let serial=0;
  const oldSet=globalThis.setTimeout,oldClear=globalThis.clearTimeout;
  globalThis.window={addEventListener:(name,fn)=>windowEvents.set(name,fn),removeEventListener:(name,fn)=>{if(windowEvents.get(name)===fn)windowEvents.delete(name);}};
  Object.defineProperty(globalThis,'navigator',{value:{onLine:true},configurable:true});
  globalThis.setTimeout=(fn,ms)=>{const id=++serial;timeouts.set(id,{fn,ms});return id;};globalThis.clearTimeout=id=>timeouts.delete(id);
  const h={current:{title:'A card',body:'Before'},valid:true,writes:[],saved:[],errors:[],revision:'r2',editorCalls:0,entries:new Map(),events,windowEvents,timeouts};
  const status={textContent:'Before',classList:{toggle:(name,on)=>{h.errors.push(on);}}};
  const form={dataset:{revision:'r1'},elements:{title:{get value(){return h.current.title;}}},querySelector:()=>options.noStatus?null:status,checkValidity:()=>h.valid,addEventListener:(name,fn)=>events.set(name,fn),removeEventListener:(name,fn)=>{if(events.get(name)===fn)events.delete(name);}};
  const sync={entries:h.entries,enqueue:(...args)=>{h.writes.push(args);return h.write?.(...args);},run:entry=>{h.ran=entry;return h.run?.(entry);}};
  const autosave=taskAutosave(form,{read:()=>h.current,flushEditor:()=>{h.editorCalls++;h.editor?.();},task:()=>({revision:h.revision}),sync,url:'/card',onSaved:value=>h.saved.push(value),...options});
  Object.assign(h,{autosave,status,form,sync,event:(type,closest='',name='')=>events.get(type)?.({type,target:{name,closest:s=>s===closest}}),tick:()=>{const callbacks=[...timeouts.values()];timeouts.clear();callbacks.forEach(({fn})=>fn());}});
  t.after(()=>{autosave.destroy();globalThis.setTimeout=oldSet;globalThis.clearTimeout=oldClear;if(oldWindow===undefined)delete globalThis.window;else globalThis.window=oldWindow;if(oldNavigator)Object.defineProperty(globalThis,'navigator',oldNavigator);else delete globalThis.navigator;});
  return h;
}

test('unchanged fields clear save state and retain a revision when no replacement exists',async t=>{
 const h=harness(t);assert.equal(await h.autosave.flush(),true);assert.equal(h.editorCalls,1);assert.equal(h.form.dataset.revision,'r2');assert.equal(h.status.textContent,'');assert.deepEqual(h.saved,[{disposed:false}]);assert.equal(h.errors.at(-1),false);
 h.revision=undefined;assert.equal(await h.autosave.flush(),true);assert.equal(h.form.dataset.revision,'r2');
 h.autosave.syncChanged();assert.equal(h.saved.length,2);
});
test('valid edits write only changed fields, clone the saved baseline, and report success',async t=>{
 const h=harness(t);h.current={...h.current,body:'After'};assert.equal(await h.autosave.flush(),true);
 assert.deepEqual(h.writes[0],[ '/card',{revision:'r2'},{body:'After'} ]);assert.equal(h.form.dataset.revision,'r2');assert.equal(h.status.textContent,'');assert.deepEqual(h.saved,[{disposed:false}]);assert.equal(h.autosave.hasChanges(),false);
 h.current.body='Another edit';assert.equal(h.autosave.hasChanges(),true);assert.equal(await h.autosave.flush(),true);assert.equal(h.writes.length,2);
});
test('title and other field validity each prevent a changed card from saving',async t=>{
 const h=harness(t);h.current={...h.current,title:'   '};assert.equal(await h.autosave.flush(),false);assert.equal(h.errors.at(-1),true);
 h.current={title:'Valid title',body:'Changed'};h.valid=false;assert.equal(await h.autosave.flush(),false);assert.equal(h.writes.length,0);
});
test('pending queue entries show errors and retry, and newer edits are not marked as saved',async t=>{
 const h=harness(t);let finish;h.write=()=>new Promise(resolve=>{finish=resolve;});h.current={...h.current,body:'After'};const pending=h.autosave.flush();assert.equal(h.status.textContent,'Saving…');
 const entry={error:'Cannot save',changes:{body:'After'}};h.entries.set('/card',entry);h.autosave.syncChanged();assert.equal(h.errors.at(-1),true);assert.match(h.status.textContent,/Cannot save/);finish();assert.equal(await pending,false);assert.equal(h.saved.length,0);
 entry.error=null;entry.conflict={};h.autosave.syncChanged();assert.equal(h.errors.at(-1),true);entry.conflict=null;h.autosave.syncChanged();assert.equal(h.errors.at(-1),false);
 h.current={...h.current,body:'New text while queued'};h.entries.delete('/card');h.autosave.syncChanged();assert.equal(h.saved.length,0);
 h.entries.set('/card',entry);h.current={title:'A card',body:'After'};h.run=()=>h.entries.delete('/card');assert.equal(await h.autosave.flush(),true);assert.equal(h.ran,entry);assert.deepEqual(h.saved,[{disposed:false}]);
 h.revision=undefined;h.current={...h.current,body:'Newest'};h.write=undefined;await h.autosave.flush();assert.equal(h.form.dataset.revision,'r2');
});
test('synchronous and asynchronous save failures keep errors visible and may be retried',async t=>{
 const h=harness(t);h.current={...h.current,body:'After'};h.write=()=>{throw Error('Storage full');};assert.equal(await h.autosave.flush(),false);assert.equal(h.autosave.hasChanges(),true);assert.equal(h.status.textContent,'Storage full');assert.equal(h.errors.at(-1),true);
 h.write=()=>Promise.reject(Error('Offline'));assert.equal(await h.autosave.flush(),false);assert.equal(h.status.textContent,'Offline');assert.equal(h.errors.at(-1),true);
 h.autosave.syncChanged();assert.equal(h.status.textContent,'');h.write=undefined;h.current={...h.current,body:'Retry'};assert.equal(await h.autosave.flush(),true);
});
test('input and change schedule at their own delays, ignore other editors and clean up listeners',async t=>{
 const h=harness(t);assert.deepEqual([...h.events.keys()],['input','change','submit']);assert.deepEqual([...h.windowEvents.keys()],['pagehide']);
 h.current={...h.current,body:'After'};for(const [closest,name]of [['.task-history-panel',''],['.task-subtasks',''],['','new-comment']]){h.event('input',closest,name);assert.equal(h.timeouts.size,0);}
 h.event('input');assert.equal(h.status.textContent,'Unsaved changes…');assert.equal([...h.timeouts.values()][0].ms,450);h.event('change');assert.equal(h.timeouts.size,1);assert.equal([...h.timeouts.values()][0].ms,0);h.tick();await Promise.resolve();assert.equal(h.writes.length,1);
 h.current={...h.current,body:'Page hide'};await h.windowEvents.get('pagehide')();assert.equal(h.writes.length,2);
 h.current={...h.current,body:'Final edit'};h.event('input');h.autosave.destroy();assert.equal(h.writes.length,3);assert.equal(h.timeouts.size,0);assert.equal(h.events.size,0);assert.equal(h.windowEvents.size,0);
 h.autosave.schedule();assert.equal(h.timeouts.size,0);await h.autosave.flush();assert.equal(h.writes.length,3);
});
test('submit suppresses native form handling, includes subtasks on request, and editor flush cannot recurse',async t=>{
 const h=harness(t,{includeSubtasks:true});h.current={...h.current,body:'After'};h.event('input','.task-subtasks');assert.equal(h.timeouts.size,1);
 let prevented=0,stopped=0;h.editor=()=>{if(h.editorCalls<3)h.autosave.flush();h.autosave.schedule();};h.events.get('submit')({preventDefault(){prevented++;},stopImmediatePropagation(){stopped++;}});await Promise.resolve();assert.equal(prevented,1);assert.equal(stopped,1);assert.equal(h.editorCalls,1);assert.equal(h.writes.length,1);assert.equal(h.timeouts.size,0);
});
test('custom draft saving receives both changes and complete values without requiring a status element',async t=>{
 let args;const h=harness(t,{noStatus:true,save:(...a)=>{args=a;}});h.current={...h.current,body:'After'};assert.equal(await h.autosave.flush(),true);assert.deepEqual(args,[{body:'After'},h.current]);assert.equal(h.writes.length,0);
});
test('reentrant flush returns the current result and a completed queue notification runs once',async t=>{
 const h=harness(t);let nested;h.editor=()=>{if(h.editorCalls===1)nested=h.autosave.flush();};h.current={...h.current,body:'After'};
 assert.equal(await h.autosave.flush(),true);assert.equal(await nested,true);assert.equal(h.saved.length,1);h.autosave.syncChanged();assert.equal(h.saved.length,1);
 h.write=()=>Promise.reject(Error('Temporary'));h.current={...h.current,body:'Retry'};assert.equal(await h.autosave.flush(),false);h.autosave.syncChanged();h.autosave.destroy();assert.equal(await h.autosave.flush(),true);
});
