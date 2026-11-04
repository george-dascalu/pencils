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

test('natural group order: workflow, project types, priorities, then people A to Z with Unassigned last', async () => {
  const { naturalGroups } = await import('../public/task-group-order.js');
  const config = { statuses: ['todo', 'doing', 'done'], types: ['task', 'bug'] };
  const tasks = [{ assignee: 'Zoe', type: 'spike', priority: 'high', status: 'todo' }, { assignee: '', type: 'task', status: 'retired' }, { assignee: 'alice', status: 'done' }];
  // A status no longer in the workflow keeps a group after the workflow's own.
  assert.deepEqual(naturalGroups('status', tasks, config), ['todo', 'doing', 'done', 'retired']);
  assert.deepEqual(naturalGroups('type', tasks, config), ['task', 'bug', 'spike', '']);
  assert.deepEqual(naturalGroups('priority', tasks, config), ['urgent', 'high', 'medium', 'low', 'none', '']);
  assert.deepEqual(naturalGroups('assignee', tasks, config, ['Mia', 'Zoe']), ['alice', 'Mia', 'Zoe', '']);
});

// F0.21-91: tag groups follow the project's tag list, then other tags A to Z, then No tag.
import { naturalGroups, tagGroups } from '../public/task-group-order.js';
test('tag groups list the project tags, then the others, then No tag, and a card sits in each of its tags', () => {
  const config = { statuses: ['todo'], types: ['task'], tags: [{ name: 'design' }, { name: 'build' }] };
  const tasks = [{ tags: ['zebra', 'build'] }, { tags: ['apple'] }, {}];
  assert.deepEqual(naturalGroups('tags', tasks, config), ['design', 'build', 'apple', 'zebra', '']);
  assert.deepEqual(tagGroups({ tags: ['b', 'a', 'b'] }), ['b', 'a']);
  assert.deepEqual(tagGroups({ tags: [] }), ['']);
  assert.deepEqual(tagGroups({}), ['']);
});
