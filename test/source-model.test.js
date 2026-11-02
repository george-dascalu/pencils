import {test} from 'node:test';
import assert from 'node:assert/strict';
import {sourceCapabilities,sourceReadOnly,mapSource,sourceLabel,mergeSource} from '../public/source-model.js';

test('source ownership allows local planning fields but protects source identity',()=>{
  for(const provider of ['jira','excel','obsidian']) {
    const task={source:{provider}};
    for(const field of ['assignee','status','priority','due','start','body']) assert.equal(sourceReadOnly(task,field),false);
    for(const field of ['title','type']) assert.equal(sourceReadOnly(task,field),true);
  }
  assert.equal(sourceReadOnly({},'title'),false);
  assert.equal(sourceReadOnly(null,'title'),false);
  assert.deepEqual(Object.keys(sourceCapabilities.excel).filter(k=>sourceCapabilities.excel[k]),['read']);
  assert.deepEqual(Object.keys(sourceCapabilities.jira).filter(k=>sourceCapabilities.jira[k]),['read','edit','create','assign','transition','comment']);
  assert.deepEqual(Object.keys(sourceCapabilities.obsidian).filter(k=>sourceCapabilities.obsidian[k]),['read','edit','assign','transition']);
});
test('source mapping validates required names, real dates and every mapped choice',()=>{
  const config={types:['task'],statuses:['todo']};
  const map=(fields,mapping={})=>mapSource({id:'1',fields:{title:'A title',...fields}},mapping,config);
  for(const title of ['', ' '.repeat(5),'a'.repeat(301)]) assert.throws(()=>map({title}),/title/);
  assert.equal(map({title:'a'.repeat(300)}).title.length,300);
  for(const due of ['2026-02-31','2026-2-02']) assert.throws(()=>map({due}),/ISO/);
  assert.equal(map({due:'2026-02-02'}).due,'2026-02-02');
  for(const key of ['type','status','priority']) assert.throws(()=>map({[key]:'mapped'},{values:{[key]:{mapped:'invalid'}}}),/mapping/);
  for(const [provider,label] of [['jira','Jira'],['excel','Excel'],['obsidian','Obsidian']]) {
    assert.equal(sourceLabel({source:{provider,key:'KEY',external_id:'id'}}),`${label} · KEY`);
    assert.equal(sourceLabel({source:{provider,external_id:'id'}}),`${label} · id`);
  }
  assert.equal(sourceLabel({}),'Local');
});
test('local overrides do not pin source title or other fields that were never edited',()=>{
  const base={title:'Before',status:'todo',priority:'medium'};
  const remote={...base,title:'After',status:'done',priority:'low'};
  const merged=mergeSource(base,{...base,source:{local_fields:['status','title']}},remote);
  assert.equal(merged.values.status,'todo');
  assert.equal(merged.values.title,'After');
  assert.equal(merged.values.priority,'low');
  assert.deepEqual(merged.conflicts,[]);
});
