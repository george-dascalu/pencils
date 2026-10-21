import test from 'node:test';
import assert from 'node:assert/strict';
import { SaveQueue } from '../public/sync.js';
import { BOARD_LIMITS } from '../public/board-limits.js';
import { applyBoardDelta } from '../public/board-delta.js';
import { boardsMethods } from '../server/services/boards.js';

test('a draft rejected by the older frame cap retries on reload; current-limit failures stay blocked', async () => {
  const previous={window:globalThis.window,localStorage:globalThis.localStorage,sessionStorage:globalThis.sessionStorage};
  const storage=()=>{const values=new Map();return {getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,String(v)),removeItem:k=>values.delete(k)};};
  globalThis.window={addEventListener(){}};
  globalThis.localStorage=storage();globalThis.sessionStorage=storage();
  const base={id:'board',title:'Recovered',revision:'base',nodes:[],edges:[]};
  const local={...base,nodes:Array.from({length:501},(_,i)=>({id:`f-${i}`,type:'frame',x:i*200,y:0,w:160,h:100}))};
  let writes=0;
  const queue=new SaveQueue({changed(){},saved(){},api:async(url,options)=>{
    if(!options)return base;
    writes++;
    assert.notEqual(options.body.operationId,'rejected-operation');
    const value=applyBoardDelta(base,options.body.changes);boardsMethods.validateBoard(value);
    return {...value,revision:'saved'};
  }});
  try {
    const entry={url:'/projects/p/boards/board',base,local,generation:1,blocked:true,error:'A board supports up to 500 frames.',delivery:{operationId:'rejected-operation',generation:1,base,sent:local}};
    localStorage.setItem(queue.key(),JSON.stringify([entry,{...entry,url:'/projects/p/boards/current',error:`A board supports up to ${BOARD_LIMITS.frames.toLocaleString('en-GB')} frames.`}]));
    queue.load('shared');
    await queue.entries.get(entry.url)?.promise;
    assert.equal(writes,1);
    assert.equal(queue.entries.has(entry.url),false);
    assert.equal(queue.entries.get('/projects/p/boards/current').blocked,true);
  } finally {clearInterval(queue.timer);clearInterval(queue.leaseTimer);Object.assign(globalThis,previous);}
});
