import test from 'node:test';
import assert from 'node:assert/strict';
import { SpatialIndex, objectBounds } from '../public/spatial-index.js';
import { boardDifference, applyBoardDelta } from '../public/board-delta.js';
import { boardsMethods } from '../server/services/boards.js';
import { encodeCanvas, decodeCanvas } from '../public/canvas-format.js';
import { boardScene } from '../public/board-scene.js';
const node = (id, x = 0) => ({ id, type: 'sticky', text: id, x, y: 0, w: 100, h: 80 });
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
