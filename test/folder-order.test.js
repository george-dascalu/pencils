import test from 'node:test';
import assert from 'node:assert/strict';
import { orderedEntries, planTreeMove } from '../public/folder-order.js';
const folders = [{ id: 'a', title: 'Archive', parent: null }, { id: 'b', title: 'Notes', parent: null }, { id: 'c', title: 'Child', parent: 'a' }];
const items = [{ id: 'd', title: 'Document', folder: null }, { id: 'e', title: 'Example', folder: null }, { id: 'f', title: 'Nested', folder: 'a' }];
const keys = (parent = null, order = [], fs = folders, docs = items) => orderedEntries(fs, docs, order, parent).map(e => e.key);
const move = (op, order = []) => planTreeMove(folders, items, order, op);
test('folders and items keep their original alphabetical order until arranged, then may mix', () => {
  assert.deepEqual(keys(), ['folder:a', 'folder:b', 'item:d', 'item:e']);
  assert.deepEqual(keys(null, ['item:e', 'folder:b', 'stale']), ['item:e', 'folder:b', 'folder:a', 'item:d']);
  assert.deepEqual(keys('a'), ['folder:c', 'item:f']);
});
test('reorder before and after siblings, including folders mixed with documents', () => {
  const first = move({ what: 'item', id: 'e', parent: null, before: 'folder:a' });
  assert.equal(first.changed, true);
  assert.deepEqual(keys(null, first.order), ['item:e', 'folder:a', 'folder:b', 'item:d']);
  const last = move({ what: 'folder', id: 'a', parent: null, before: null }, first.order);
  assert.deepEqual(keys(null, last.order), ['item:e', 'folder:b', 'item:d', 'folder:a']);
  assert.equal(move({ what: 'item', id: 'e', parent: null, before: null }).changed, false);
  assert.equal(move({ what: 'item', id: 'd', parent: null, before: 'item:d' }).changed, false);
});
test('moves target only direct siblings and reject missing identities, cycles and foreign parents', () => {
  for (const op of [null, {}, { what: 'bad', id: 'd' }, { what: 'item', id: 'missing', parent: null }, { what: 'folder', id: 'a', parent: 'a' }, { what: 'folder', id: 'a', parent: 'c' }, { what: 'item', id: 'd', parent: 'missing' }, { what: 'item', id: 'd', parent: null, before: 'item:f' }])
    assert.throws(() => move(op));
  const moved = move({ what: 'folder', id: 'b', parent: 'a', before: 'item:f' });
  assert.equal(moved.folders.find(f => f.id === 'b').parent, 'a');
  assert.deepEqual(keys('a', moved.order, moved.folders), ['folder:c', 'folder:b', 'item:f']);
  const docs = items.map(d => d.id === 'd' ? { ...d, folder: 'a' } : d);
  const filed = move({ what: 'item', id: 'd', parent: 'a', before: null });
  assert.deepEqual(keys('a', filed.order, folders, docs), ['folder:c', 'item:f', 'item:d']);
  assert.equal(items[0].folder, null, 'planning never mutates the source');
});

test('ordering uses natural titles and deterministic ids, and ignores malformed saved order', () => {
  const docs = [{id:'z',title:'File 10'}, {id:'b',title:'File 2'}, {id:'a',title:'File 2'}];
  assert.deepEqual(keys(null, {}, [], docs), ['item:a','item:b','item:z']);
});
test('malformed move fields report validation errors rather than incidental TypeErrors', () => {
  for (const op of [{what:'item',id:4,parent:null}, {what:'item',id:'d'}, {what:'item',id:'d',parent:4}, {what:'item',id:'d',parent:null,before:4}, {what:'bad',id:'d',parent:null}])
    assert.throws(() => move(op), /Choose a valid file or folder destination/);
  assert.throws(() => move({what:'item',id:'missing',parent:null}), /no longer exists/);
  assert.equal(move({what:'item',id:'f',parent:'a',before:null}).changed, false);
  assert.equal(move({what:'folder',id:'c',parent:null,before:null}).changed, true);
  assert.throws(() => planTreeMove([{id:'x',title:'X',parent:'y'}, {id:'y',title:'Y',parent:'x'}, {id:'z',title:'Z',parent:null}], [], [], {what:'folder',id:'z',parent:'x'}), /outside this folder/);
});
