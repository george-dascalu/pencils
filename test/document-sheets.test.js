import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Store } from '../server/store.js';
import { Auth } from '../server/auth.js';
import { createServer } from '../server/index.js';

test('Table documents keep versioned JSON beside Markdown and restore through history and Trash',async t=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'pencils-sheets-')),store=new Store(root);
  t.after(async()=>{await store.close();await fs.rm(root,{recursive:true,force:true});});
  await store.init();const project=await store.createProject({title:'Sheets'});
  const created=await store.mutate(()=>store.createDocument(project.id,{title:'Budget',document_type:'table'}));
  assert.equal(created.document_type,'table');
  const first=await store.getDocument(project.id,created.id);
  assert.equal(first.table.workbook.sheetOrder.length,1);
  const before=await fs.readFile(path.join(root,created.file),'utf8');
  assert.match(before,/kind: document/);assert.match(before,/document_type: table/);
  const originalPath=path.join(path.dirname(created.file),first.table_file);
  const originalBytes=await fs.readFile(path.join(root,originalPath),'utf8');
  assert.equal(JSON.parse(originalBytes).format,1);
  const table=structuredClone(first.table);table.workbook.sheets['sheet-1'].cellData={0:{0:{v:'Cost'},1:{v:150}}};
  const saved=await store.mutate(()=>store.updateDocument(project.id,first.id,{revision:first.revision,table}));
  assert.notEqual(saved.table_file,first.table_file);assert.equal(saved.version,2);
  assert.equal(await fs.readFile(path.join(root,originalPath),'utf8'),originalBytes);
  assert.match(saved.body,/Cost/);assert.match(saved.body,/150/);
  assert.equal((await store.snapshot(project.id)).documents[0].table,undefined,'project summaries do not preload table data');
  await assert.rejects(()=>store.mutate(()=>store.updateDocument(project.id,first.id,{revision:first.revision,table})),e=>e.status===409);
  const renamed=await store.mutate(()=>store.updateDocument(project.id,first.id,{revision:saved.revision,title:'New budget'}));
  assert.deepEqual((await store.getDocument(project.id,first.id)).table,table,'renaming preserves the workbook');
  const restored=await store.mutate(()=>store.restoreVersion(created.file,first.revision,renamed.revision));
  assert.equal((await store.getDocument(project.id,first.id)).table.workbook.sheets['sheet-1'].cellData[0],undefined);
  assert.equal(restored.version,4);
  await store.mutate(()=>store.removeRecord(project.id,'documents',first.id,restored.revision));
  const item=(await store.projectTrash(project.id)).find(v=>v.id===first.id);
  assert.ok(item);await store.mutate(()=>store.restoreProjectTrash(project.id,item.key));
  assert.equal((await store.getDocument(project.id,first.id)).document_type,'table');
  const latest=await store.getDocument(project.id,first.id);
  await assert.rejects(()=>store.mutate(()=>store.updateDocument(project.id,first.id,{revision:latest.revision,document_properties:{set:{table_file:'../secret.json'}}})),e=>e.status===400);
});
test('Table data obeys project access and edit permissions and does not convert plain documents',async t=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'pencils-sheet-access-')),store=new Store(root);
  await store.init();const auth=new Auth(store,true),project=await store.createProject({title:'Shared'});
  const otherOrg=await store.createOrganisation({title:'Other'}),other=await store.createProject({title:'Private',organisation:otherOrg.id});
  const doc=await store.createDocument(project.id,{title:'Budget',document_type:'table'}),plain=await store.createDocument(project.id,{title:'Note'});
  const secret=await store.createDocument(other.id,{title:'Private budget',document_type:'table'});
  await auth.save({username:'viewer',password:'table-test-password',admin:false,organisations:{'o-default':'viewer'}});
  const server=createServer(store,{auth});await new Promise(r=>server.listen(0,'127.0.0.1',r));
  t.after(async()=>{server.closeAllConnections();await new Promise(r=>server.close(r));await store.close();await fs.rm(root,{recursive:true,force:true});});
  const base=`http://127.0.0.1:${server.address().port}/api`;
  const login=await fetch(base+'/session',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:'viewer',password:'table-test-password'})});
  const cookie=login.headers.get('set-cookie')?.split(';')[0];assert.ok(cookie);
  const readable=await fetch(`${base}/projects/${project.id}/documents/${doc.id}`,{headers:{cookie}});assert.equal(readable.status,200);assert.ok((await readable.json()).table);
  assert.equal((await fetch(`${base}/projects/${other.id}/documents/${secret.id}`,{headers:{cookie}})).status,403);
  assert.equal((await fetch(`${base}/projects/${project.id}/documents/${doc.id}`,{method:'PATCH',headers:{cookie,'Content-Type':'application/json'},body:JSON.stringify({revision:doc.revision,table:{}})})).status,403);
  await assert.rejects(()=>store.updateDocument(project.id,plain.id,{revision:plain.revision,table:{}}),e=>e.status===400);
});

test('failed Markdown writes roll back staged spreadsheet snapshots and missing current data can restore history', async t => {
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'pencils-sheet-recovery-')),store=new Store(root);
  t.after(async()=>{await store.close();await fs.rm(root,{recursive:true,force:true});});
  await store.init();const project=await store.createProject({title:'Recovery'});
  const first=await store.mutate(()=>store.createDocument(project.id,{title:'Budget',document_type:'table'}));
  const directory=path.join(root,path.dirname(first.file),'tables',first.id);
  const before=await fs.readdir(directory),table=structuredClone(first.table);table.workbook.sheets['sheet-1'].cellData={0:{0:{v:200}}};
  const write=store.write.bind(store);store.write=async(file,...args)=>{if(path.resolve(file)===path.resolve(root,first.file))throw Error('Simulated Markdown write failure');return write(file,...args);};
  await assert.rejects(()=>store.mutate(()=>store.updateDocument(project.id,first.id,{revision:first.revision,table})),/Simulated Markdown write failure/);
  store.write=write;assert.deepEqual(await fs.readdir(directory),before);assert.equal((await store.getDocument(project.id,first.id)).revision,first.revision);
  const second=await store.mutate(()=>store.updateDocument(project.id,first.id,{revision:first.revision,table}));
  await fs.unlink(path.join(root,path.dirname(first.file),second.table_file));
  await assert.rejects(()=>store.getDocument(project.id,first.id),e=>e.status===422&&/missing/.test(e.message));
  const restored=await store.mutate(()=>store.restoreVersion(first.file,first.revision,second.revision));
  assert.equal(restored.version,3);assert.deepEqual((await store.getDocument(project.id,first.id)).table,first.table);
});

test('spreadsheet snapshot routes validate references, retain historical data and allow metadata recovery', async t => {
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'pencils-sheet-routes-')),store=new Store(root);await store.init();
  const project=await store.createProject({title:'Snapshots'}),first=await store.createDocument(project.id,{title:'Budget',document_type:'table'});
  const table=structuredClone(first.table);table.workbook.sheets['sheet-1'].cellData={0:{0:{v:20}}};
  const second=await store.mutate(()=>store.updateDocument(project.id,first.id,{revision:first.revision,table}));
  const server=createServer(store);await new Promise(r=>server.listen(0,'127.0.0.1',r));
  t.after(async()=>{server.closeAllConnections();await new Promise(r=>server.close(r));await store.close();await fs.rm(root,{recursive:true,force:true});});
  const base=`http://127.0.0.1:${server.address().port}/api/projects/${project.id}/documents/${first.id}`;
  const original=path.basename(first.table_file,'.json');
  const historic=await fetch(base+'/table?version='+original);assert.equal(historic.status,200);assert.deepEqual(await historic.json(),first.table);
  assert.equal((await fetch(base+'/table?version=..%2Fsecret')).status,422);
  await fs.writeFile(path.join(root,path.dirname(first.file),second.table_file),'{}');
  assert.equal((await fetch(base+'/table')).status,422);
  const metadata=await fetch(base+'?table=0');assert.equal(metadata.status,200);assert.equal((await metadata.json()).table,undefined);
});

test('sidecar integrity guards reject valid but tampered data, unsafe symlinks and invalid input', async t => {
  const { readDocumentTable, writeDocumentTable, tableDocumentBody } = await import('../server/document-sheets.js');
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'pencils-sheet-integrity-')),outside=await fs.mkdtemp(path.join(os.tmpdir(),'pencils-sheet-outside-')),store=new Store(root);
  await store.init();t.after(async()=>{await store.close();await fs.rm(root,{recursive:true,force:true});await fs.rm(outside,{recursive:true,force:true});});
  const project=await store.createProject({title:'Integrity'}),doc=await store.createDocument(project.id,{title:'Budget',document_type:'table'});
  for(const data of [{...doc,document_type:'markdown'},{...doc,table_file:4},{...doc,table_file:'../secret.json'}]) await assert.rejects(()=>readDocumentTable(store,data),/Invalid spreadsheet data reference/);
  await assert.rejects(()=>writeDocumentTable(store,project.id,doc.id,{}),e=>e.status===400);
  const file=path.join(root,path.dirname(doc.file),doc.table_file),original=await fs.readFile(file,'utf8'),changed=structuredClone(doc.table);changed.workbook.name='Externally changed';
  await fs.writeFile(file,JSON.stringify(changed));
  await assert.rejects(()=>readDocumentTable(store,doc),/changed outside/);
  await assert.rejects(()=>writeDocumentTable(store,project.id,doc.id,doc.table),e=>e.status===409);
  await fs.writeFile(file,original);
  const external=path.join(outside,'snapshot.json');await fs.writeFile(external,original);await fs.unlink(file);await fs.symlink(external,file);
  await assert.rejects(()=>readDocumentTable(store,doc),/symbolic|outside|Symlink|symlink/);
  await fs.unlink(file);await fs.writeFile(file,original);
  const dir=path.dirname(file),moved=path.join(outside,'snapshots');await fs.rename(dir,moved);await fs.symlink(moved,dir);
  await assert.rejects(()=>writeDocumentTable(store,project.id,doc.id,changed),/symbolic|outside|Symlink|symlink/);
  const body='Before\n\n<!-- pencils:table-preview -->\nold data\n<!-- /pencils:table-preview -->\n\nAfter';
  const preview=tableDocumentBody(doc.table,doc.table_file,body);assert.ok(preview.startsWith('Before\n\n'));assert.ok(preview.endsWith('\n\nAfter'));assert.doesNotMatch(preview,/old data/);
  const atStart=tableDocumentBody(doc.table,doc.table_file,'<!-- pencils:table-preview -->old<!-- /pencils:table-preview -->\nAfter');assert.ok(atStart.endsWith('\nAfter'));assert.doesNotMatch(atStart,/-->old/);
  assert.match(tableDocumentBody(doc.table,doc.table_file,'Some notes'),/^Some notes\n\n<!-- pencils:table-preview -->/);
});

test('new spreadsheet snapshots flush file and directory contents and close their handles', async t => {
  const { writeDocumentTable } = await import('../server/document-sheets.js');
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'pencils-sheet-durable-')),store=new Store(root);await store.init();
  t.after(async()=>{await store.close();await fs.rm(root,{recursive:true,force:true});});
  const project=await store.createProject({title:'Durable'}),doc=await store.createDocument(project.id,{title:'Budget',document_type:'table'}),table=structuredClone(doc.table);table.workbook.name='Changed';
  const opened=[],open=fs.open;
  t.mock.method(fs,'open',async(...args)=>{const handle=await open(...args);if(String(args[0]).includes(`/tables/${doc.id}`)){const item={file:String(args[0]),synced:false,closed:false,handle,close:handle.close.bind(handle)};opened.push(item);const sync=handle.sync.bind(handle);handle.sync=async()=>{item.synced=true;return sync();};handle.close=async()=>{item.closed=true;return item.close();};}return handle;});
  try { await store.mutate(()=>writeDocumentTable(store,project.id,doc.id,table));assert.equal(opened.length,2);assert.ok(opened.every(h=>h.synced),'data file and parent directory are durable');assert.ok(opened.every(h=>h.closed),'both handles close'); }
  finally { for(const item of opened) if(!item.closed) await item.close();t.mock.restoreAll(); }
});

test('temporary-file cleanup does not replace the original failure when another process removes the temporary file', async t => {
  const { writeDocumentTable }=await import('../server/document-sheets.js');
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'pencils-sheet-cleanup-')),store=new Store(root);await store.init();t.after(async()=>{await store.close();await fs.rm(root,{recursive:true,force:true});});
  const project=await store.createProject({title:'Cleanup'}),doc=await store.createDocument(project.id,{title:'Budget',document_type:'table'}),table=structuredClone(doc.table);table.workbook.name='New snapshot';
  const link=fs.link;t.mock.method(fs,'link',async(from,to)=>{if(String(from).includes(`/tables/${doc.id}/`)){await fs.unlink(from);throw Error('Simulated snapshot link failure');}return link(from,to);});
  await assert.rejects(()=>store.mutate(()=>writeDocumentTable(store,project.id,doc.id,table)),/Simulated snapshot link failure/);t.mock.restoreAll();
});

test('the watcher recognises confirmed spreadsheet snapshots and still notices external changes',async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'pencils-sheet-watch-')),store=new Store(root);await store.init();t.after(async()=>{await store.close();await fs.rm(root,{recursive:true,force:true});});const project=await store.createProject({title:'Watched tables'}),first=await store.mutate(()=>store.createDocument(project.id,{title:'Watched',document_type:'table'}));store.watch();await new Promise(resolve=>setTimeout(resolve,250));const before=store.version;
 const table=structuredClone(first.table);table.workbook.sheets['sheet-1'].cellData={0:{0:{v:'Own edit'}}};const saved=await store.mutate(()=>store.updateDocument(project.id,first.id,{revision:first.revision,table}));await new Promise(resolve=>setTimeout(resolve,300));const delta=await store.delta(project.id,before);assert.equal(delta.full,false,'our JSON write must not force a full project refresh');assert.ok(delta.records.some(record=>record.kind==='documents'&&record.value.revision===saved.revision));
 const file=path.join(path.dirname(store.file(project.id,'documents',first.id)),saved.table_file);await fs.appendFile(file,' ');await new Promise(resolve=>setTimeout(resolve,300));assert.equal((await store.delta(project.id,delta.version)).full,true,'an external snapshot edit is still noticed');await assert.rejects(()=>store.getDocument(project.id,first.id),/changed outside/);
});

test('spreadsheet watcher acknowledgements retain their hash and bound the recent-write cache',async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'pencils-sheet-recent-')),store=new Store(root);await store.init();t.after(async()=>{await store.close();await fs.rm(root,{recursive:true,force:true});});const project=await store.createProject({title:'Recent writes'}),doc=await store.createDocument(project.id,{title:'Budget',document_type:'table'});const {writeDocumentTable}=await import('../server/document-sheets.js'),{hash}=await import('../server/values.js');
 for(const count of [1999,2000]){
  store.recentWrites=new Map(Array.from({length:count},(_,i)=>[`sentinel-${i}`,{hash:'old'}]));const table=structuredClone(doc.table);table.workbook.sheets['sheet-1'].cellData={0:{0:{v:count}}};const saved=await writeDocumentTable(store,project.id,doc.id,table),file=path.join(path.dirname(store.file(project.id,'documents',doc.id)),saved.relative);assert.equal(store.recentWrites.size,2000);assert.equal(store.recentWrites.has('sentinel-0'),count===1999);assert.equal(store.recentWrites.get(file).hash,hash(await fs.readFile(file,'utf8')));
 }
});
