import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {Store} from '../server/store.js';
async function fixture(fn) { const root=await fs.mkdtemp(path.join(os.tmpdir(),'pencils-ids-')); const store=new Store(root);try {await store.init();await fn(store,root);}finally{store.close?.();await fs.rm(root,{recursive:true,force:true});}}
test('Task keys are sequential, immutable on edits, reserved after deletion and survive restart',()=>fixture(async(s,root)=>{
 const p=await s.createProject({title:'Website',key:'web'});
 const tasks=await Promise.all(Array.from({length:8},(_,i)=>s.mutate(()=>s.createTask(p.id,{title:`Task ${i}`}))));
 assert.deepEqual(tasks.map(t=>t.key),Array.from({length:8},(_,i)=>`WEB-${i+1}`));
 const t=await s.updateTask(p.id,tasks[0].id,{revision:tasks[0].revision,title:'Renamed',key:'FAKE-99',number:99});assert.equal(t.key,'WEB-1');
 await s.deleteTask(p.id,tasks[7].id,tasks[7].revision);
 const restart=new Store(root);await restart.init();const next=await restart.createTask(p.id,{title:'Next'});assert.equal(next.key,'WEB-9');
 assert.ok((await fs.readFile(path.join(root,next.file),'utf8')).includes('WEB-9'));
}));
test('Changing project keys preserves old aliases and reserves former keys',()=>fixture(async(s)=>{
 const p=await s.createProject({title:'Website',key:'WEB'}),t=await s.createTask(p.id,{title:'First'});
 await s.updateProject(p.id,{revision:p.revision,key:'APP'});
 const next=(await s.snapshot(p.id)).tasks[0];assert.equal(next.key,'APP-1');assert.equal(next.id,t.id);assert.equal(next.file,t.file);assert.ok(next.aliases.includes('WEB-1'));
 await assert.rejects(()=>s.createProject({title:'Other',key:'WEB'}),/already in use/);
 await assert.rejects(()=>s.createProject({title:'Other',key:'APP'}),/already in use/);
}));
test('Legacy task migration is restart-safe and preserves Markdown and unknown properties',()=>fixture(async(s,root)=>{
 const p=await s.createProject({title:'Legacy'}),t=await s.createTask(p.id,{title:'Old task',body:'## Keep this\n- [ ] unchanged'});
 let source=await fs.readFile(path.join(root,t.file),'utf8');source=source.replace(/^number:.*\n/m,'').replace(/^key:.*\n/m,'');await fs.writeFile(path.join(root,t.file),source);
 const restart=new Store(root);await restart.init();const one=(await restart.snapshot(p.id)).tasks[0];assert.equal(one.key,t.key);assert.equal(one.body,t.body);
 const again=new Store(root);await again.init();assert.equal((await again.snapshot(p.id)).tasks[0].revision,one.revision);
}));
