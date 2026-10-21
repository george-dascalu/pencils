import test from 'node:test';
import assert from 'node:assert/strict';
import { SpatialIndex, objectBounds } from '../public/spatial-index.js';
import { boardDifference, applyBoardDelta } from '../public/board-delta.js';
import { boardsMethods } from '../server/services/boards.js';
import { encodeCanvas, decodeCanvas } from '../public/canvas-format.js';
import { boardScene } from '../public/board-scene.js';
import { BOARD_LIMITS } from '../public/board-limits.js';
import { frameOutline } from '../public/frame-outline.js';
const node = (id, x = 0) => ({ id, type: 'sticky', text: id, x, y: 0, w: 100, h: 80 });
test('marquee selects model objects at any detail level and respects visible frame/layer bounds', () => {
  const nodes = [node('inside', 20), node('partial', 250),
    { ...node('hidden', 100), layerHidden: true },
    { ...node('collapsed', 500), type: 'frame', w: 300, h: 500, collapsed: true },
    { ...node('child', 550), y: 60, frame: 'collapsed' },
    { ...node('rotated', 900), rotation: 90 }];
  const scene = boardScene({ nodes, edges: [] });
  assert.deepEqual(scene.nodesWithin({ x: 0, y: 0, w: 300, h: 100 }).map(n => n.id), ['inside']);
  assert.deepEqual(scene.nodesWithin({ x: 490, y: 0, w: 320, h: 50 }).map(n => n.id), ['collapsed']);
  assert.deepEqual(scene.nodesWithin({ x: 490, y: 0, w: 320, h: 600 }).map(n => n.id), ['collapsed']);
  assert.deepEqual(scene.nodesWithin({ x: 900, y: 0, w: 100, h: 80 }), [], 'Rotated bounds must fit completely');
  assert.deepEqual(scene.nodesWithin({ x: 900, y: -10, w: 100, h: 100 }).map(n => n.id), ['rotated']);
});
test('10,000 nested frames validate, round-trip and count descendants without recursion', () => {
  const nodes=Array.from({length:BOARD_LIMITS.frames},(_,i)=>({...node(`f-${i}`,i*2),type:'frame',w:50000-i*2,h:50000-i*2,...(i?{frame:`f-${i-1}`}:{})}));
  const b={title:'Frames',nodes,edges:[]};
  boardsMethods.validateBoard(b);
  assert.equal(decodeCanvas(encodeCanvas(b)).nodes.length,BOARD_LIMITS.frames);
  assert.throws(()=>boardsMethods.validateBoard({...b,nodes:[...nodes,{...node('extra'),type:'frame'}]}),/10,000 frames/);
  const parents=new Map(nodes.slice(1).map(n=>[n.id,n.frame]));
  const outline=frameOutline(b,parents);
  assert.equal(outline.rows.length,BOARD_LIMITS.frames);
  assert.equal(outline.counts.get('f-0'),BOARD_LIMITS.frames-1);
  assert.equal(outline.rows.at(-1).depth,BOARD_LIMITS.frames-1);
  nodes[0].frame=nodes.at(-1).id;
  assert.throws(()=>boardsMethods.validateBoard(b),/Invalid frame hierarchy/);
  const ordinary=node('ordinary');
  assert.throws(()=>boardsMethods.validateBoard({title:'Invalid parent',nodes:[ordinary,{...node('child'),frame:ordinary.id}],edges:[]}),/Invalid frame hierarchy/);
});
test('spatial queries match a scan, including rotated and large overlapping objects', () => {
  const nodes = Array.from({ length: 1000 }, (_, i) => ({ ...node(`n-${i}`, i % 20 * 250 - 2000), y: Math.floor(i / 20) * 170 - 4000, rotation: i % 4 * 45 }));
  nodes.push({ ...node('large', -10000), y: -10000, w: 20000, h: 20000 });
  const index = new SpatialIndex(nodes, objectBounds);
  for (let i = 0; i < 60; i++) {
    const r = { x: i * 107 - 3000, y: i * 63 - 2000, w: 500, h: 350 };
    const expected = nodes.filter(n => { const e = objectBounds(n); return e.x <= r.x + r.w && e.x + e.w >= r.x && e.y <= r.y + r.h && e.y + e.h >= r.y; }).map(n => n.id).sort();
    assert.deepEqual(index.search(r).map(n => n.id).sort(), expected);
  }
});
test('100,000 objects and 200,000 connectors validate and round-trip native Canvas', () => {
  const nodes = Array.from({ length: 100000 }, (_, i) => ({ ...node(`n-${i}`, i % 400 * 320), y: Math.floor(i / 400) * 320 }));
  const edges = Array.from({ length: 200000 }, (_, i) => ({ id: `e-${i}`, from: `n-${i % nodes.length}`, to: `n-${(i + 1) % nodes.length}` }));
  const b = { title: 'Capacity', nodes, edges };
  boardsMethods.validateBoard(b);
  const decoded = decodeCanvas(encodeCanvas(b));
  assert.equal(decoded.nodes.length, 100000); assert.equal(decoded.edges.length, 200000);
  assert.equal(decoded.nodes.at(-1).x, 127680);
  assert.throws(() => boardsMethods.validateBoard({ ...b, nodes: [...nodes, node('excess')] }), /100,000/);
  assert.throws(() => boardsMethods.validateBoard({ ...b, edges: [...edges, { ...edges[0], id: 'excess' }] }), /200,000/);
  const patch = boardDifference(b, { ...b, nodes: nodes.map((n,i) => i === 99999 ? { ...n, x: n.x + 20 } : n) });
  assert.ok(JSON.stringify(patch).length < 200);
  assert.equal(applyBoardDelta(b, patch).nodes.at(-1).x, 127700);
});
test('guarded deltas merge independent writers and reject concurrent edit/delete conflicts', () => {
  const b = { title: 'Board', nodes: [node('a'), node('b', 300)], edges: [] };
  const local = { ...b, nodes: [{ ...b.nodes[0], text: 'mine' }, b.nodes[1]] };
  const delta = boardDifference(b, local);
  const remote = { ...b, nodes: [{ ...b.nodes[0], x: 500 }, { ...b.nodes[1], text: 'theirs' }] };
  const merged = applyBoardDelta(remote, delta);
  assert.equal(merged.nodes[0].x, 500); assert.equal(merged.nodes[0].text, 'mine'); assert.equal(merged.nodes[1].text, 'theirs');
  assert.deepEqual(applyBoardDelta(merged, delta), merged);
  assert.throws(() => applyBoardDelta({ ...b, nodes: [{ ...b.nodes[0], text: 'conflict' }] }, delta), e => e.status === 409);
  assert.throws(() => applyBoardDelta({ ...b, nodes: [b.nodes[1]] }, delta), e => e.status === 409);
  assert.deepEqual(applyBoardDelta(local, delta, { reverse: true }), b);
  assert.throws(() => applyBoardDelta(b, [{ kind: 'nodes', id: 'a', key: '__proto__', before: null, after: {} }]), /Invalid/);
});
test('cached geometry updates after node moves, frame collapse and distant bends', () => {
  const b = { nodes: [node('a'), node('b', 300), { ...node('f'), type: 'frame', x: -50, y: -50, w: 200, h: 200 }], edges: [{ id: 'e', from: 'a', to: 'b', bends: [{ x: 9000, y: 9000 }] }] };
  const first = boardScene(b);
  assert.equal(first.parents.get('a'), 'f');
  assert.equal(first.edges.search({ x: 9000, y: 9000, w: 1, h: 1 }).length, 1);
  b.nodes[2].collapsed = true;
  const next = boardScene(b);
  assert.ok(next.hidden.has('a')); assert.equal(next.effective('a').id, 'f');
  b.nodes[1].x = 5000;
  assert.equal(boardScene(b).spatial.search({ x: 5000, y: 0, w: 10, h: 10 })[0].id, 'b');
});
