import {performance} from "node:perf_hooks";
import assert from "node:assert/strict";
import {tableResult} from "../public/table-model.js";
import {DEFAULT_SCHEMA} from "../server/model.js";
for(const size of [1000,10000,50000]) {
  const tasks=Array.from({length:size},(_,i)=>({id:`t-${i}`,key:`BENCH-${i}`,title:`Task ${i}`,status:i%3?"todo":"done",type:"task",assignee:`Person ${i%20}`,estimate:i%8,due:"2026-10-20",parent:i%5?`t-${i-i%5}`:null}));
  const prefs={groups:["assignee","status"],sorts:[{field:"title",dir:1}],filters:[],outline:true,query:{match:"all",rules:[{field:"due",op:"not-empty"},{field:"title",op:"contains",value:"Task"}]}};
  const start=performance.now();const result=tableResult(tasks,prefs,DEFAULT_SCHEMA);
  assert.equal(result.tasks.length,size);assert.equal(new Set(result.tasks.map(t=>t.id)).size,size);
  console.log(JSON.stringify({tasks:size,milliseconds:Math.round(performance.now()-start),groups:result.counts.size,scope:"in-memory query, grouping, sort and hierarchy; excludes HTTP/rendering"}));
}
