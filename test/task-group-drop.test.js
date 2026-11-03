import test from 'node:test';
import assert from 'node:assert/strict';
import { groupedTaskPatch } from '../public/task-order-model.js';

const config = {statuses:['backlog','todo','done'],done:['done'],types:['epic','task'],off:[]};
const card = {id:'a',title:'A card',type:'task',status:'todo',assignee:'Alice',priority:'medium'};
const patch = (field,value,task=card,cfg=config,tasks=[task]) => groupedTaskPatch(cfg,tasks,task.id,field,value);

test('dropping into a group changes only its field and supports an unassigned group', () => {
  for (const [field,value] of [['status','done'],['assignee','Bob'],['assignee',''],['priority','high'],['priority','none'],['type','epic']])
    assert.deepEqual(patch(field,value),{[field]:value});
  assert.equal(card.status,'todo');
  assert.deepEqual(patch('status','todo'),{});
});

test('group drops respect workflow transitions, disabled fields and project types', () => {
  assert.throws(()=>patch('status','done',card,{...config,transitions:{todo:['backlog']}}),/Workflow does not allow/);
  assert.deepEqual(patch('status','backlog',card,{...config,transitions:{todo:['backlog']}}),{status:'backlog'});
  for (const field of ['status','assignee','priority','type']) assert.throws(()=>patch(field,'done',card,{...config,off:[field]}),/disabled|off/i);
  for (const [field,value] of [['status','missing'],['priority','missing'],['type','missing'],['tags','done'],['parent','done']]) assert.throws(()=>patch(field,value),/group|priority|type|status/i);
  assert.throws(()=>patch('assignee',{}),/group|value/i);
  assert.throws(()=>groupedTaskPatch(config,[],'missing','status','done'),/no longer exists/i);
});

test('imported cards allow local planning overrides but keep their source-owned type', () => {
  const imported={...card,source:{provider:'jira',external_id:'1'}};
  for (const [field,value] of [['status','done'],['assignee','Bob'],['priority','high']]) assert.deepEqual(patch(field,value,imported),{[field]:value});
  assert.throws(()=>patch('type','epic',imported),/connected source/i);
});

test('type-group drops preserve hierarchy rules for parents and children', () => {
  const cfg={...config,hierarchy:{mode:'enforced',roots:['epic'],children:{epic:['task'],task:[]}}};
  const parent={...card,id:'parent',type:'epic'}, child={...card,parent:'parent'};
  assert.throws(()=>patch('type','epic',child,cfg,[parent,child]),/Hierarch/);
  assert.throws(()=>patch('type','task',parent,cfg,[parent,child]),/Hierarch/);
  assert.throws(()=>patch('type','task',parent,{...cfg,hierarchy:{...cfg.hierarchy,roots:['epic','task']}},[parent,child]),/Hierarch/,'existing children must also fit the changed parent type');
  assert.deepEqual(patch('type','epic',child,{...cfg,off:['parent']},[parent,child]),{type:'epic'});
});

test('allowed type changes use the real parent and only the actual children', () => {
  const cfg={...config,types:['epic','task','activity'],hierarchy:{mode:'enforced',roots:['epic','activity'],children:{epic:['task','activity'],activity:['task'],task:[]}}};
  const parent={...card,id:'parent',type:'epic'},child={...card,parent:'parent'},unrelated={...card,id:'unrelated',type:'task'};
  assert.deepEqual(patch('type','activity',child,cfg,[unrelated,parent,child]),{type:'activity'});
  const decoy={...parent,id:'decoy'};
  assert.deepEqual(patch('type','activity',parent,cfg,[decoy,parent,child]),{type:'activity'});
});
