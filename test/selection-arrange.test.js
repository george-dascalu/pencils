import { test } from "node:test";
import assert from "node:assert/strict";
import { arrangeSelection } from "../public/selection-arrange.js";
const fixture = () => ({
  nodes: [
    { id: "a", x: 0, y: 10, w: 100, h: 50 },
    { id: "b", x: 200, y: 100, w: 60, h: 100 },
    { id: "c", x: 500, y: 500, w: 100, h: 50 },
  ],
});
test("alignment respects unequal dimensions and locked anchors", () => {
  for (const [action, value] of [
    ["align-left", (n) => n.x],
    ["align-center", (n) => n.x + n.w / 2],
    ["align-right", (n) => n.x + n.w],
    ["align-top", (n) => n.y],
    ["align-middle", (n) => n.y + n.h / 2],
    ["align-bottom", (n) => n.y + n.h],
  ]) {
    const b = fixture();
    arrangeSelection(b, b.nodes, action);
    assert.ok(
      b.nodes.every((n) => Number.isFinite(n.x) && Number.isFinite(n.y)),
    );
    assert.equal(new Set(b.nodes.map(value)).size, 1, action);
  }
  const b = fixture();
  b.nodes[0].locked = true;
  arrangeSelection(b, b.nodes, "align-bottom");
  assert.equal(b.nodes[0].y, 10);
  assert.equal(b.nodes[1].y + b.nodes[1].h, 550);
});
test("distribution uses equal gaps and preserves outer bounds on both axes", () => {
  for (const [action, axis, size] of [
    ["distribute", "x", "w"],
    ["distribute-vertical", "y", "h"],
  ]) {
    const b = fixture();
    const start = b.nodes[0][axis],
      end = b.nodes[2][axis] + b.nodes[2][size];
    arrangeSelection(b, b.nodes, action);
    assert.equal(b.nodes[0][axis], start);
    assert.equal(b.nodes[2][axis] + b.nodes[2][size], end);
    assert.equal(
      b.nodes[1][axis] - b.nodes[0][axis] - b.nodes[0][size],
      b.nodes[2][axis] - b.nodes[1][axis] - b.nodes[1][size],
    );
  }
});
test("arranged frames carry nested and locked contents while layer ordering remains intact", () => {
  const b = {
    nodes: [
      { id: "f", type: "frame", x: 0, y: 0, w: 100, h: 100 },
      { id: "nested", type: "frame", frame: "f", x: 10, y: 10, w: 60, h: 60 },
      { id: "child", frame: "nested", x: 20, y: 20, w: 20, h: 20 },
      { id: "locked", frame: "f", locked: true, x: 40, y: 40, w: 10, h: 10 },
      { id: "other", x: 500, y: 200, w: 100, h: 100 },
    ],
  };
  arrangeSelection(b, [b.nodes[0], b.nodes[4]], "align-right");
  assert.equal(b.nodes[1].x, 510);
  assert.equal(b.nodes[2].x, 520);
  assert.equal(b.nodes[3].x, 540);
  arrangeSelection(b, [b.nodes[0], b.nodes[1]], "bring-front");
  assert.deepEqual(
    b.nodes.map((n) => n.id),
    ["child", "locked", "other", "f", "nested"],
  );
  arrangeSelection(b, [b.nodes[3], b.nodes[4]], "send-back");
  assert.deepEqual(
    b.nodes.map((n) => n.id),
    ["f", "nested", "child", "locked", "other"],
  );
});

test("filtered frame alignment leaves excluded contents untouched", () => {
  const board = {
    nodes: [
      { id: "f", type: "frame", x: 0, y: 0, w: 200, h: 200 },
      { id: "child", type: "text", frame: "f", x: 20, y: 20, w: 50, h: 50 },
      { id: "other", type: "frame", x: 500, y: 200, w: 200, h: 200 },
    ],
  };
  const child = structuredClone(board.nodes[1]);
  arrangeSelection(board, [board.nodes[0], board.nodes[2]], "align-right", {
    carryContents: false,
  });
  assert.equal(board.nodes[0].x, 500);
  assert.deepEqual(board.nodes[1], child);
});

test('one-step layer changes preserve selection order, respect locked selections and stop at the ends', () => {
  const make=()=>({nodes:['a','b','c','d','e'].map(id=>({id,x:0,y:0,w:10,h:10}))});
  const b=make();arrangeSelection(b,[b.nodes[0],b.nodes[2]],'bring-forward');assert.deepEqual(b.nodes.map(n=>n.id),['b','a','d','c','e']);
  arrangeSelection(b,b.nodes.filter(n=>['a','c'].includes(n.id)),'send-backward');assert.deepEqual(b.nodes.map(n=>n.id),['a','b','c','d','e']);
  const group=make();arrangeSelection(group,[group.nodes[1],group.nodes[2]],'bring-forward');assert.deepEqual(group.nodes.map(n=>n.id),['a','d','b','c','e']);
  arrangeSelection(group,[group.nodes.at(-1)],'bring-forward');assert.equal(group.nodes.at(-1).id,'e');
  arrangeSelection(group,[group.nodes[0]],'send-backward');assert.equal(group.nodes[0].id,'a');
  const locked=make();locked.nodes[1].locked=true;arrangeSelection(locked,[locked.nodes[1]],'bring-forward');assert.deepEqual(locked.nodes.map(n=>n.id),['a','b','c','d','e']);
  const all=make();arrangeSelection(all,all.nodes,'send-backward');assert.deepEqual(all.nodes.map(n=>n.id),['a','b','c','d','e']);
});

test('malformed cyclic frame ancestry cannot stall alignment', async () => {
  const { Worker } = await import('node:worker_threads');
  const worker=new Worker(`const{parentPort,workerData}=require('node:worker_threads');import(workerData).then(({arrangeSelection})=>{const b={nodes:[{id:'a',type:'frame',frame:'b',x:0,y:0,w:20,h:20},{id:'b',type:'frame',frame:'a',x:0,y:0,w:20,h:20},{id:'one',x:100,y:100,w:10,h:10},{id:'two',x:200,y:100,w:10,h:10}]};arrangeSelection(b,[b.nodes[2],b.nodes[3]],'align-left');parentPort.postMessage(b.nodes.map(n=>n.x));});`,{eval:true,workerData:new URL('../public/selection-arrange.js',import.meta.url).href});
  let timer;try{const result=await Promise.race([new Promise((resolve,reject)=>{worker.once('message',resolve);worker.once('error',reject);}),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Alignment stalled on cyclic frames')),1500);})]);assert.deepEqual(result,[0,0,100,100]);}finally{clearTimeout(timer);await worker.terminate();}
});
