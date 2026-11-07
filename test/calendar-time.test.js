import test from 'node:test';
import assert from 'node:assert/strict';
import { calendarTimeMove, calendarTimeSelection, calendarTimeStep, calendarTimeResize, hourlySegments, timedCard } from '../public/calendar-time.js';
import { schema, validateExtras } from '../server/model.js';

test('hour selections snap to quarters, work backwards, and end at next midnight', () => {
  assert.deepEqual(calendarTimeSelection('2026-11-02', 541, 631), { start: '2026-11-02', due: '2026-11-02', start_time: '09:00', due_time: '10:30' });
  assert.deepEqual(calendarTimeSelection('2026-11-02', 630, 540), calendarTimeSelection('2026-11-02', 540, 630));
  assert.deepEqual(calendarTimeSelection('2026-12-31', 1425, 1440), { start: '2026-12-31', due: '2027-01-01', start_time: '23:45', due_time: '00:00' });
  assert.equal(calendarTimeSelection('2026-11-02', 540, 540).due_time, '10:00');
  assert.deepEqual(calendarTimeSelection('2026-11-02', 1440, 1440), {start:'2026-11-02',due:'2026-11-03',start_time:'23:45',due_time:'00:00'});
});
test('time resizing prefers quarters, uses larger steps when zoomed out and keeps the other endpoint', () => {
  assert.deepEqual([8, 16, 32, 64, 256].map(calendarTimeStep), [60, 30, 15, 15, 15]);
  const t = {start:'2026-11-02',due:'2026-11-02',start_time:'09:00',due_time:'10:00'};
  assert.deepEqual(calendarTimeResize(t,t.start,672,'due',15), {due:t.due,due_time:'11:15'});
  assert.deepEqual(calendarTimeResize(t,t.start,509,'start',15), {start:t.start,start_time:'08:30'});
  assert.deepEqual(calendarTimeResize(t,t.start,672,'due',30), {due:t.due,due_time:'11:00'});
  assert.deepEqual(calendarTimeResize(t,t.start,672,'due',60), {due:t.due,due_time:'11:00'});
  assert.equal(calendarTimeResize(t,t.start,0,'due',60).due_time,'09:15');
  assert.equal(calendarTimeResize(t,t.start,1440,'start',60).start_time,'09:45');
  assert.equal(calendarTimeResize(t,t.start,-100,'start',15).start_time,'00:00');
  assert.deepEqual(calendarTimeResize(t,t.start,1600,'due',15),{due:'2026-11-03',due_time:'00:00'});
});
test('time resizing handles overnight and year-end boundaries without changing the other day', () => {
  const t = {start:'2026-12-31',due:'2027-01-01',start_time:'23:00',due_time:'01:00'};
  assert.deepEqual(calendarTimeResize(t,t.start,1412,'start',15),{start:t.start,start_time:'23:30'});
  assert.deepEqual(calendarTimeResize(t,t.due,0,'due',15),{due:t.due,due_time:'00:00'});
  assert.deepEqual(calendarTimeResize({...t,due_time:'00:00'},t.start,1395,'due',15),{due:t.start,due_time:'23:15'});
  assert.equal(calendarTimeResize({...t,due_time:'00:00'},t.start,1440,'start',15).start_time,'23:45');
});
test('timed cards clip at midnight and overlapping cards receive separate lanes', () => {
  const date = '2026-11-02';
  const task = (id, start_time, due_time, due = date) => ({ id, start: date, due, start_time, due_time });
  const days = [date, '2026-11-03'];
  const segments = hourlySegments([task('a','09:00','11:00'), task('b','10:00','12:00'), task('c','11:00','11:30'), task('d','13:00','14:00'), task('night','23:00','01:00',days[1]), {id:'all', due:date}], days);
  assert.deepEqual(segments.filter(s=>s.task.id==='night').map(s=>[s.day,s.start,s.end]), [[date,1380,1440],[days[1],0,60]]);
  assert.equal(segments.some(s=>s.task.id==='all'), false);
  assert.equal(segments.find(s=>s.task.id==='d').columns, 1);
  assert.equal(segments.find(s=>s.task.id==='a').columns, 2);
  for(const a of segments) for(const b of segments) if(a!==b && a.day===b.day && a.lane===b.lane) assert.ok(a.end<=b.start || b.end<=a.start);
});
test('hour segments require complete times, omit other days and midnight-only tails, and release lanes when an overlap ends', () => {
  const day='2026-11-02', base={id:'a',start:day,due:day,start_time:'09:00',due_time:'11:00'};
  assert.equal(timedCard(base),true);
  for(const key of ['start','due','start_time','due_time']) assert.equal(timedCard({...base,[key]:null}),false);
  assert.deepEqual(hourlySegments([{...base,start:'2026-11-03',due:'2026-11-03'}],[day]),[]);
  assert.deepEqual(hourlySegments([{...base,start:'2026-11-01',start_time:'23:00',due_time:'00:00'}],[day]),[]);
  const segments=hourlySegments([{...base,id:'short',due_time:'10:00'}, {...base,id:'long'}, {...base,id:'last',start_time:'11:00',due_time:'12:00'}],[day]);
  assert.deepEqual(segments.map(s=>[s.task.id,s.lane,s.columns]),[['long',0,2],['short',1,2],['last',0,1]]);
  assert.deepEqual(hourlySegments([{...base,id:'z'},{...base,id:'a'}],[day]).map(s=>s.task.id),['a','z']);
});
test('task times require real dates, a pair of valid times and a positive duration', () => {
  const good = { start:'2026-11-02', due:'2026-11-02', start_time:'09:00', due_time:'10:00' };
  const check = data => validateExtras(data, schema());
  assert.doesNotThrow(()=>check(good));
  assert.doesNotThrow(()=>check({start:good.start, due:good.due}));
  assert.doesNotThrow(()=>check({...good, due:'2026-11-03', due_time:'00:00'}));
  for(const change of [{start:null}, {due:null}, {due:'2026-02-30'}, {start_time:null}, {due_time:''}, {start_time:0}, {start_time:'24:00'}, {due_time:'09:60'}, {start_time:'9:00'}, {due_time:'09:00'}, {due_time:'08:59'}]) assert.throws(()=>check({...good,...change}), { status:400 });
});


test('moving timed cards snaps their start, preserves duration and the grabbed offset across dates', () => {
  const t={start:'2026-11-02',due:'2026-11-02',start_time:'09:00',due_time:'10:30'};
  assert.deepEqual(calendarTimeMove(t,t.start,640,20,15),{start:t.start,due:t.due,start_time:'10:15',due_time:'11:45'});
  assert.deepEqual(calendarTimeMove(t,'2026-11-03',520,20,15),{start:'2026-11-03',due:'2026-11-03',start_time:'08:15',due_time:'09:45'});
  assert.deepEqual(calendarTimeMove(t,'2026-12-31',1430,20,30),{start:'2026-12-31',due:'2027-01-01',start_time:'23:30',due_time:'01:00'});
  assert.deepEqual(calendarTimeMove({...t,start:'2026-10-24',due:'2026-10-25'},'2026-10-26',80,1460,15),{start:'2026-10-25',due:'2026-10-26',start_time:'01:00',due_time:'02:30'});
});

test('time handles extend and shorten across days without crossing the fixed endpoint', () => {
  const t = { start: '2026-11-04', due: '2026-11-04', start_time: '09:00', due_time: '10:00' };
  assert.deepEqual(calendarTimeResize(t, '2026-11-05', 675, 'due', 15), { due: '2026-11-05', due_time: '11:15' });
  assert.deepEqual(calendarTimeResize(t, '2026-11-03', 510, 'start', 15), { start: '2026-11-03', start_time: '08:30' });
  assert.deepEqual(calendarTimeResize(t, '2026-11-03', 510, 'due', 15), { due: t.start, due_time: '09:15' });
  assert.deepEqual(calendarTimeResize(t, '2026-11-05', 675, 'start', 15), { start: t.due, start_time: '09:45' });
  const multiple = { ...t, start: '2026-11-03', due: '2026-11-05' };
  assert.deepEqual(calendarTimeResize(multiple, '2026-11-04', 660, 'start', 15), { start: '2026-11-04', start_time: '11:00' });
  assert.deepEqual(calendarTimeResize(multiple, '2026-11-04', 720, 'due', 15), { due: '2026-11-04', due_time: '12:00' });
  assert.deepEqual(calendarTimeResize(t, '2026-12-31', 1440, 'due', 15), { due: '2027-01-01', due_time: '00:00' });
});

// Owner request (F0.22-48): the Week board groups cards by the part of the day they start in, and a
// card dropped in another part starts at that part's hour, keeping its length.
test('a card is in the part of the day it starts in, and moving it there keeps its length', async () => {
  const { daypart, daypartChange } = await import('../public/calendar-time.js');
  const at = (start_time, due_time = '23:59') => ({ start: '2026-11-02', due: '2026-11-02', start_time, due_time });
  assert.deepEqual(['00:00', '11:59', '12:00', '16:59', '17:00', '23:30'].map(time => daypart(at(time))), ['morning', 'morning', 'afternoon', 'afternoon', 'evening', 'evening']);
  assert.equal(daypart({ start: '2026-11-02', due: '2026-11-02' }), '', 'no times: any time');
  assert.equal(daypart({ due: '2026-11-02', start_time: '09:00' }), '', 'times need both dates');
  // Timed: the start moves to the part's hour and the length stays, across midnight too.
  assert.deepEqual(daypartChange(at('09:30', '11:00'), 'afternoon'), { start: '2026-11-02', due: '2026-11-02', start_time: '13:00', due_time: '14:30' });
  assert.deepEqual(daypartChange({ start: '2026-11-02', due: '2026-11-03', start_time: '20:00', due_time: '02:00' }, 'evening'), { start: '2026-11-02', due: '2026-11-03', start_time: '18:00', due_time: '00:00' });
  assert.deepEqual(daypartChange(at('13:00', '23:30'), 'evening'), { start: '2026-11-02', due: '2026-11-03', start_time: '18:00', due_time: '04:30' });
  // Without times: an hour from the part's start, on a card's own days; a due date alone becomes its start.
  assert.deepEqual(daypartChange({ start: '2026-11-02', due: '2026-11-02' }, 'morning'), { start: '2026-11-02', due: '2026-11-02', start_time: '09:00', due_time: '10:00' });
  assert.deepEqual(daypartChange({ start: '2026-11-02', due: '2026-11-04' }, 'morning'), { start: '2026-11-02', due: '2026-11-04', start_time: '09:00', due_time: '10:00' });
  assert.deepEqual(daypartChange({ due: '2026-11-04' }, 'evening'), { start: '2026-11-04', due: '2026-11-04', start_time: '18:00', due_time: '19:00' });
  assert.deepEqual(daypartChange({ start: '2026-11-04' }, 'morning'), { start: '2026-11-04', due: '2026-11-04', start_time: '09:00', due_time: '10:00' }, 'a start date alone');
  // Any time takes the times away; a card without them has nothing to change.
  assert.deepEqual(daypartChange(at('09:00', '10:00'), ''), { start_time: null, due_time: null });
  assert.deepEqual(daypartChange({ start: '2026-11-02', due: '2026-11-02' }, ''), {});
  assert.deepEqual(daypartChange({ start: '2026-11-02', due: '2026-11-02', start_time: '09:00' }, ''), { start_time: null, due_time: null }, 'a stray time goes too');
  assert.throws(() => daypartChange(at('09:00', '10:00'), 'night'), /part of the day/);
  // What a move writes is a valid card.
  for (const part of ['morning', 'afternoon', 'evening']) {
    const card = { start: '2026-11-02', due: '2026-11-04', ...daypartChange({ start: '2026-11-02', due: '2026-11-04' }, part) };
    assert.doesNotThrow(() => validateExtras(card, schema({})), part);
  }
});
