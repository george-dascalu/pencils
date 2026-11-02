import test from 'node:test';
import assert from 'node:assert/strict';
import { calendarTimeSelection, calendarTimeStep, calendarTimeResize, hourlySegments, timedCard } from '../public/calendar-time.js';
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
