import test from 'node:test';
import assert from 'node:assert/strict';
import { AGENDA_RANGES, agendaQuickRange, agendaRange, shiftAgendaRange } from '../public/calendar-model.js';

const today = '2026-11-04'; // a Wednesday
test('quick ranges are worked out from today', () => {
  const expected = {
    today: ['2026-11-04', '2026-11-04'], tomorrow: ['2026-11-05', '2026-11-05'],
    'this-week': ['2026-11-02', '2026-11-08'], 'next-week': ['2026-11-09', '2026-11-15'],
    'this-month': ['2026-11-01', '2026-11-30'], 'next-month': ['2026-12-01', '2026-12-31'],
    'next-7': ['2026-11-04', '2026-11-10'], 'next-14': ['2026-11-04', '2026-11-17'], 'next-30': ['2026-11-04', '2026-12-03'],
  };
  assert.deepEqual(AGENDA_RANGES.map(([key]) => key), Object.keys(expected));
  for (const [key, [from, to]] of Object.entries(expected)) assert.deepEqual(agendaQuickRange(key, today), { from, to }, key);
  assert.deepEqual(agendaQuickRange('next-month', '2026-12-15'), { from: '2027-01-01', to: '2027-01-31' });
});

test('chosen dates win when valid, otherwise the quick range or This week', () => {
  assert.deepEqual(agendaRange({ quick: 'today', from: '2026-10-01', to: '2026-10-09' }, today), { from: '2026-10-01', to: '2026-10-09', quick: '' });
  assert.deepEqual(agendaRange({ quick: 'tomorrow' }, today), { from: '2026-11-05', to: '2026-11-05', quick: 'tomorrow' });
  for (const bad of [{ from: '2026-10-09', to: '2026-10-01' }, { from: '2026-02-30', to: '2026-03-01' }, { from: '2025-01-01', to: '2026-06-01' }, { quick: 'nope' }, undefined])
    assert.deepEqual(agendaRange(bad, today), { from: '2026-11-02', to: '2026-11-08', quick: 'this-week' }, JSON.stringify(bad));
});

test('previous and next keep the length, moving whole months by month', () => {
  assert.deepEqual(shiftAgendaRange({ from: '2026-11-02', to: '2026-11-08' }, 1), { from: '2026-11-09', to: '2026-11-15' });
  assert.deepEqual(shiftAgendaRange({ from: '2026-11-04', to: '2026-11-04' }, -1), { from: '2026-11-03', to: '2026-11-03' });
  assert.deepEqual(shiftAgendaRange({ from: '2026-11-01', to: '2026-11-30' }, 1), { from: '2026-12-01', to: '2026-12-31' });
  assert.deepEqual(shiftAgendaRange({ from: '2026-01-01', to: '2026-01-31' }, -1), { from: '2025-12-01', to: '2025-12-31' });
  assert.deepEqual(shiftAgendaRange({ from: '2026-11-01', to: '2026-12-31' }, 1), { from: '2027-01-01', to: '2027-02-28' });
  assert.deepEqual(shiftAgendaRange({ from: '2026-11-04', to: '2026-12-03' }, 1), { from: '2026-12-04', to: '2027-01-02' });
});
