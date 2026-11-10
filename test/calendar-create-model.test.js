import test from 'node:test';
import assert from 'node:assert/strict';
import { calendarFilterDefaults, weekBoardCellDefaults } from '../public/calendar-create-model.js';
import { matchesProjectFilters } from '../public/project-filters.js';

const config = {
  statuses: ['todo', 'review', 'done'], initial_status: 'todo', done: ['done'], types: ['task', 'bug'],
  fields: [{ id: 'points', type: 'number' }, { id: 'approved', type: 'checkbox' }, { id: 'note', type: 'text' }, { id: 'date', type: 'date' }, { id: 'choice', type: 'select', options: ['A', 'B'] }],
};
const state = (extraFilters = {}, more = {}) => ({ config, status: 'all', type: 'all', extraFilters, ...more });

test('new Week board cards inherit the selected fields and satisfy the combined filters', () => {
  const s = state({ assignee: '@person:Ann', priority: 'high', tags: ['Home', 'Work'], fields: { points: '0', approved: 'false', note: 'Budget', date: '2026-11-05', choice: 'B' } }, { status: 'review', type: 'bug' });
  const before = structuredClone(s), defaults = calendarFilterDefaults(s);
  assert.deepEqual(defaults, { status: 'review', type: 'bug', assignee: 'Ann', priority: 'high', tags: ['Home', 'Work'], fields: { points: 0, approved: false, note: 'Budget', date: '2026-11-05', choice: 'B' } });
  assert.equal(matchesProjectFilters(defaults, s.extraFilters, { config }), true);
  defaults.tags.push('Extra'); defaults.fields.points = 7;
  assert.deepEqual(s, before, 'defaults are detached from the filters');
});

test('unassigned, the lowest priority, and boolean and number values retain their meaning', () => {
  assert.deepEqual(calendarFilterDefaults(state({ assignee: '@unassigned', priority: 'none', fields: { points: 0, approved: true } })), { assignee: '', priority: 'none', fields: { points: 0, approved: true } });
  assert.deepEqual(calendarFilterDefaults(state({ assignee: '@person:@unassigned' })), { assignee: '@unassigned' });
  assert.deepEqual(calendarFilterDefaults(state({ fields: { approved: 'true' } })), { fields: { approved: true } });
});

test('cleared, invalid, removed and disabled choices never become new-card values', () => {
  assert.deepEqual(calendarFilterDefaults(state()), {});
  assert.deepEqual(calendarFilterDefaults(state({ priority: 'invalid', assignee: '@person:', tags: ['', 7, 'x'.repeat(81)], fields: { points: 'NaN', approved: 'maybe', choice: 'gone', date: '2026-02-30', missing: 'stale', note: '' } }, { status: 'removed', type: 'removed' })), {});
  assert.deepEqual(calendarFilterDefaults(state({ priority: 'high', assignee: '@person:Ann', tags: ['Home'], due: 'none', completion: 'done' }, { status: 'review', type: 'bug', config: { ...config, off: ['status', 'type', 'assignee', 'priority', 'tags', 'due'] } })), {});
});

test('completion uses a matching workflow status; an explicit status wins', () => {
  assert.deepEqual(calendarFilterDefaults(state({ completion: 'done' })), { status: 'done' });
  assert.deepEqual(calendarFilterDefaults(state({ completion: 'open' })), { status: 'todo' });
  assert.deepEqual(calendarFilterDefaults(state({ completion: 'open' }, { config: { ...config, initial_status: 'done' } })), { status: 'todo' });
  assert.deepEqual(calendarFilterDefaults(state({ completion: 'done' }, { status: 'review' })), { status: 'review' });
  assert.deepEqual(calendarFilterDefaults(state({ completion: 'done' }, { config: { ...config, done: [] } })), {});
});

test('searches, legacy partial matches, date ranges, blocked and include-archived do not invent values', () => {
  for (const due of ['overdue', 'week', '']) assert.deepEqual(calendarFilterDefaults(state({ assignee: 'ann', tag: 'hom', due, blocked: true, archived: true }, { search: 'urgent' })), {});
  assert.deepEqual(calendarFilterDefaults(state({ due: 'none' })), { due: null });
});

test('selected tags are deduplicated, copied and bounded by the card limit', () => {
  assert.deepEqual(calendarFilterDefaults(state({ tags: ['Home', 'Home', 'Work'] })), { tags: ['Home', 'Work'] });
  const longest = 'x'.repeat(80);
  assert.deepEqual(calendarFilterDefaults(state({ tags: [' Home ', longest] })), { tags: ['Home', longest] });
  assert.equal(calendarFilterDefaults(state({ tags: Array.from({ length: 35 }, (_, i) => `Tag ${i}`) })).tags.length, 30);
  assert.deepEqual(calendarFilterDefaults(state({ tags: 'Home' })), {});
});

test('the clicked cell supplies its dates and row while preserving other filters', () => {
  const s = state({ assignee: '@person:Ann', priority: 'high', tags: ['Home'] }, { status: 'review' });
  assert.deepEqual(weekBoardCellDefaults(s, '2026-11-05', 'daypart', 'afternoon'), { status: 'review', assignee: 'Ann', priority: 'high', tags: ['Home'], start: '2026-11-05', due: '2026-11-05', start_time: '13:00', due_time: '14:00' });
  assert.equal(weekBoardCellDefaults(s, '2026-11-05', 'status', 'todo').status, 'todo');
  assert.deepEqual(weekBoardCellDefaults(s, '2026-11-05', 'tags', 'Work').tags, ['Home', 'Work']);
  assert.deepEqual(weekBoardCellDefaults(s, '2026-11-05', 'tags', 'Home').tags, ['Home']);
  assert.deepEqual(weekBoardCellDefaults(s, '2026-11-05', 'tags', '').tags, []);
  const full = Array.from({ length: 30 }, (_, i) => `Tag ${i}`);
  assert.deepEqual(weekBoardCellDefaults(state({ tags: full }), '2026-11-05', 'tags', 'Row').tags, [...full.slice(1), 'Row']);
  assert.deepEqual(weekBoardCellDefaults(state({}, { config: { ...config, off: ['status'] } }), '2026-11-05', 'status', 'review'), { start: '2026-11-05', due: '2026-11-05' });
  assert.deepEqual(weekBoardCellDefaults(state({}, { config: { ...config, off: ['due'] } }), '2026-11-05', 'none', ''), { start: '2026-11-05' });
});

test('text filters longer than a card field allows do not prevent creation', () => {
  const longest = 'x'.repeat(10000);
  assert.deepEqual(calendarFilterDefaults(state({ fields: { note: longest } })), { fields: { note: longest } });
  assert.deepEqual(calendarFilterDefaults(state({ fields: { note: longest + 'x' } })), {});
});
