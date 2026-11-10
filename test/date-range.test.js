import test from 'node:test';
import assert from 'node:assert/strict';
import { pickRange, inRange } from '../public/date-range.js';

test('the first pick sets start and moves on to due', () => {
  assert.deepEqual(pickRange({ start: '', due: '' }, 'start', '2026-11-03'), { start: '2026-11-03', due: '', phase: 'due', done: false });
});
test('a start after the due date clears the due date', () => {
  assert.deepEqual(pickRange({ start: '2026-11-01', due: '2026-11-02' }, 'start', '2026-11-05').due, '');
  assert.equal(pickRange({ start: '2026-11-01', due: '2026-11-09' }, 'start', '2026-11-05').due, '2026-11-09');
});
test('a due on or after start completes the range', () => {
  assert.deepEqual(pickRange({ start: '2026-11-03', due: '' }, 'due', '2026-11-03'), { start: '2026-11-03', due: '2026-11-03', phase: 'due', done: true });
  assert.equal(pickRange({ start: '', due: '' }, 'due', '2026-11-03').done, true);
});
test('a due before start begins a new range', () => {
  assert.deepEqual(pickRange({ start: '2026-11-03', due: '' }, 'due', '2026-11-01'), { start: '2026-11-01', due: '', phase: 'due', done: false });
});
test('a locked due date makes the start pick final', () => {
  const r = pickRange({ start: '', due: '2026-11-09' }, 'start', '2026-11-05', true);
  assert.equal(r.done, true); assert.equal(r.due, '2026-11-09');
});
test('inRange needs both ends', () => {
  assert.equal(inRange('2026-11-04', '2026-11-03', '2026-11-05'), true);
  assert.equal(inRange('2026-11-04', '2026-11-03', ''), false);
});
