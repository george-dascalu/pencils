import test from 'node:test';
import assert from 'node:assert/strict';
import {validTaskBoards,validateTaskBoards} from '../server/task-board-links.js';

test('board link identifiers form an optional, unique list limited to 200',()=>{
 for(const value of [undefined,null,[],['b-a'],['b-A_1-2'],Array.from({length:200},(_,i)=>`b-${i}`)])assert.equal(validTaskBoards(value),true,JSON.stringify(value));
 for(const value of [false,0,'b-a',{},[null],[3],['d-a'],['x-b'],['b-'],['b-a/b'],['b-a','b-a'],Array.from({length:201},(_,i)=>`b-${i}`)])assert.equal(validTaskBoards(value),false,JSON.stringify(value));
});
test('new links must resolve to this project and existing deleted links are preserved',async()=>{
 const allowed=new Set(['p-a/boards/b-one','p-a/boards/b-two']);
 const store={file:(project,kind,id)=>[project,kind,id].join('/'),read:async file=>{if(!allowed.has(file))throw Object.assign(new Error('Missing'),{status:404});return{};}};
 await validateTaskBoards(store,'p-a',['b-one','b-two']);
 await validateTaskBoards(store,'p-a',['b-removed','b-one'],['b-removed']);
 await validateTaskBoards(store,'p-a',undefined);await validateTaskBoards(store,'p-a',null);
 await validateTaskBoards(store,'p-a',['b-one'],null);
 for(const [project,ids] of [['p-b',['b-one']],['p-a',['b-missing']]])await assert.rejects(validateTaskBoards(store,project,ids),e=>e.status===400&&e.message==='Choose a board from this project.');
 const error=Object.assign(new Error('Cannot read vault'),{status:500});
 await assert.rejects(validateTaskBoards({...store,read:async()=>{throw error;}},'p-a',['b-one']),e=>e===error);
});
