import test from 'node:test';
import assert from 'node:assert/strict';
import { matchesProjectFilters, assigneeFilterValue } from '../public/project-filters.js';

const config={done:['done'],fields:[{id:'text',type:'text'},{id:'amount',type:'number'},{id:'when',type:'date'},{id:'choice',type:'select',options:['A','B']},{id:'checked',type:'checkbox'}]};
const task={status:'todo',assignee:'George',priority:'high',tags:['Design','Release'],due:'2026-11-01',fields:{text:'Project budget',amount:0,when:'2026-11-02',choice:'A',checked:false}};
const match=(filters,card=task,cfg=config)=>matchesProjectFilters(card,filters,{config:cfg,today:'2026-11-02',taskById:()=>null});
test('assignee dropdown matches exact names and unassigned, including reserved-looking names',()=>{
  assert.equal(match({assignee:assigneeFilterValue('George')}),true);
  assert.equal(match({assignee:assigneeFilterValue('Geo')}),false);
  assert.equal(match({assignee:assigneeFilterValue(null)}),false);
  assert.equal(match({assignee:assigneeFilterValue(null)},{...task,assignee:null}),true);
  assert.equal(match({assignee:assigneeFilterValue('@unassigned')},{...task,assignee:'@unassigned'}),true);
  assert.equal(match({assignee:'geo'}),true,'legacy text filters keep their substring match');
});
test('tags match any selected tag and combine with priority and other filters',()=>{
  assert.equal(match({tags:['missing','Design'],priority:'high'}),true);
  assert.equal(match({tags:['missing','Design'],priority:'low'}),false);
  assert.equal(match({tags:['design']}),true);
  assert.equal(match({tags:['missing']}),false);
  assert.equal(match({tags:[]}),true);
  assert.equal(match({tags:'missing'}),true,'malformed old values are not treated as tag lists');
  assert.equal(match({tag:'des'}),true,'legacy text tag filters still work');
  assert.equal(match({tag:'missing'}),false);
  assert.equal(match({tags:['Design'],tag:'missing'}),true,'new tag choices replace the old text match');
});
test('custom fields respect types, false, zero, empty values and the current schema',()=>{
  for(const fields of [{text:'BUDG'},{amount:'0'},{when:'2026-11-02'},{choice:'A'},{checked:'false'}])assert.equal(match({fields}),true,JSON.stringify(fields));
  for(const fields of [{text:'absent'},{amount:'1'},{when:'2026-11-03'},{choice:'B'},{checked:'true'}])assert.equal(match({fields}),false,JSON.stringify(fields));
  assert.equal(match({fields:{checked:'false'}},{...task,fields:{}}),false,'unset is distinct from false');
  assert.equal(match({fields:{amount:'0'}},{...task,fields:{amount:null}}),false,'unset is distinct from zero');
  assert.equal(match({fields:{amount:'0'}},{...task,fields:{amount:''}}),false,'empty is distinct from zero');
  assert.equal(match({fields:{amount:'invalid'}}),false);
  assert.equal(match({fields:{deleted:'anything'}}),true,'deleted definitions no longer filter');
  assert.equal(match({fields:{amount:''}}),true,'blank means any value');
});
test('disabled built-ins are ignored, while deadlines, completion, archive and blockers keep their rules',()=>{
  assert.equal(match({priority:'low',tags:['missing'],assignee:assigneeFilterValue('Someone')},task,{...config,off:['priority','tags','assignee']}),true);
  assert.equal(match({due:'overdue',completion:'open'}),true);
  assert.equal(match({completion:'done'}),false);
  assert.equal(match({completion:'done'},{...task,status:'done'}),true);
  assert.equal(match({completion:'open'},{...task,status:'done'}),false);
  assert.equal(match({completion:'done'},{...task,status:'finished'},{...config,done:['finished']}),true);
  assert.equal(match({due:'overdue'},{...task,status:'done'}),false);
  assert.equal(match({due:'overdue'},{...task,due:'2026-11-02'}),false);
  assert.equal(match({due:'none'},{...task,due:null}),true);
  assert.equal(match({due:'week'},{...task,due:'2026-11-08'}),true);
  assert.equal(match({due:'week'},{...task,due:'2026-11-02'}),true);
  assert.equal(match({due:'week'},{...task,due:'2026-11-09'}),true);
  assert.equal(match({due:'week'},{...task,due:null}),false);
  assert.equal(match({due:'week'},{...task,due:'2026-11-08',status:'done'}),false);
  assert.equal(match({due:'week'},{...task,due:'2026-11-01'}),false);
  assert.equal(match({due:'week'},{...task,due:'2026-11-10'}),false);
  assert.equal(match({}, {...task,archived:true}),false);
  assert.equal(match({archived:true},{...task,archived:true}),true);
  assert.equal(match({blocked:true}),false);
  assert.equal(matchesProjectFilters({...task,dependencies:['one']},{blocked:true},{config,today:'2026-11-02',taskById:()=>({status:'todo'})}),true);
  assert.equal(matchesProjectFilters({...task,dependencies:['one']},{blocked:true},{config:{...config,done:['finished']},today:'2026-11-02',taskById:()=>({status:'finished'})}),false);
});
