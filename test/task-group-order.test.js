import test from 'node:test';
import assert from 'node:assert/strict';
import { orderGroups, moveGroup, groupPreference } from '../public/task-group-order.js';

test('groups keep their natural order, a saved order first, and reverse with the direction', () => {
  const natural = ['backlog', 'todo', 'doing', 'done'];
  assert.deepEqual(orderGroups(natural), natural);
  assert.deepEqual(orderGroups(natural, [], -1), ['done', 'doing', 'todo', 'backlog']);
  // A saved order leads; values added since (a new status) follow in their natural place.
  assert.deepEqual(orderGroups(natural, ['done', 'todo']), ['done', 'todo', 'backlog', 'doing']);
  assert.deepEqual(orderGroups(natural, ['done', 'todo'], -1), ['doing', 'backlog', 'todo', 'done']);
  // Saved values no longer in the project are dropped.
  assert.deepEqual(orderGroups(['a', 'b'], ['gone', 'b', 'a']), ['b', 'a']);
  assert.deepEqual(natural, ['backlog', 'todo', 'doing', 'done']);
});

test('moving a group places it before another, or last', () => {
  const order = ['a', 'b', 'c', 'd'];
  assert.deepEqual(moveGroup(order, 'd', 'b'), ['a', 'd', 'b', 'c']);
  assert.deepEqual(moveGroup(order, 'a', null), ['b', 'c', 'd', 'a']);
  assert.deepEqual(moveGroup(order, 'b', 'c'), order);
  assert.deepEqual(order, ['a', 'b', 'c', 'd']);
});

test('a saved preference is read per grouping field and tolerates bad storage', () => {
  const storage = value => ({ get: () => value });
  assert.deepEqual(groupPreference(storage({ status: { order: ['done'], dir: -1 } }), 'p', 'status'), { order: ['done'], dir: -1 });
  assert.deepEqual(groupPreference(storage({ status: { order: ['done'], dir: -1 } }), 'p', 'type'), { order: [], dir: 1 });
  for (const bad of [null, 'x', { status: null }, { status: { order: 'x', dir: 2 } }])
    assert.deepEqual(groupPreference(storage(bad), 'p', 'status'), { order: [], dir: 1 });
});
