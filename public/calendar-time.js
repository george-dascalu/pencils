import { shiftDate, stamp, DAY } from './timeline-dates.js';

export const timeMinutes = time => Number(time.slice(0, 2)) * 60 + Number(time.slice(3));
export const minuteTime = minutes => `${String(Math.floor(minutes / 60) % 24).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
export const timedCard = task => !!(task.start && task.due && task.start_time && task.due_time);

// Keep each snap at least eight screen pixels apart when the day is zoomed out.
export const calendarTimeStep = hourHeight => [15, 30, 60].find(step => step / 60 * hourHeight >= 8) || 60;

export function calendarTimeResize(task, day, minutes, end, step) {
  const origin = stamp(day) / DAY * 1440;
  const start = stamp(task.start) / DAY * 1440 + timeMinutes(task.start_time);
  const finish = stamp(task.due) / DAY * 1440 + timeMinutes(task.due_time);
  const snapped = origin + Math.max(0, Math.min(1440, Math.round(minutes / step) * step));
  // Clamp against the other endpoint's full date and time, even on another day.
  const value = end === 'start' ? Math.min(snapped, finish - 15) : Math.max(snapped, start + 15);
  const offset = value - origin;
  return { [end]: shiftDate(day, Math.floor(offset / 1440)), [`${end}_time`]: minuteTime((value % 1440 + 1440) % 1440) };
}

// The grab offset includes earlier segments of an overnight card.
export function calendarTimeMove(task, day, minutes, offset, step) {
  const start = Math.round((minutes - offset) / step) * step;
  const duration = (stamp(task.due) - stamp(task.start)) / DAY * 1440 + timeMinutes(task.due_time) - timeMinutes(task.start_time);
  const end = start + duration;
  return { start: shiftDate(day, Math.floor(start / 1440)), due: shiftDate(day, Math.floor(end / 1440)),
    start_time: minuteTime((start % 1440 + 1440) % 1440), due_time: minuteTime((end % 1440 + 1440) % 1440) };
}

export function calendarTimeSelection(day, from, to) {
  const snap = value => Math.max(0, Math.min(1440, Math.round(value / 15) * 15));
  let start = Math.min(snap(from), snap(to)), end = Math.max(snap(from), snap(to));
  start = Math.min(start, 1425);
  if (start === end) end = Math.min(1440, start + 60);
  return { start: day, due: end === 1440 ? shiftDate(day, 1) : day, start_time: minuteTime(start), due_time: minuteTime(end) };
}

// Wall-clock minutes keep a day's slots stable across daylight-saving changes.
export function hourlySegments(tasks, days) {
  return days.flatMap(day => {
    const segments = tasks.filter(t => timedCard(t) && t.start <= day && t.due >= day).map(task => ({
      task, day, start: task.start === day ? timeMinutes(task.start_time) : 0,
      end: task.due === day ? timeMinutes(task.due_time) : 1440,
    })).filter(s => s.end > s.start).sort((a,b) => a.start - b.start || b.end - a.end || a.task.id.localeCompare(b.task.id));
    let group = [], ends = [], until = 0;
    const finish = () => { for (const s of group) s.columns = ends.length; group = []; ends = []; };
    for (const s of segments) {
      if (s.start >= until) finish();
      let lane = ends.findIndex(end => end <= s.start);
      if (lane < 0) lane = ends.length;
      ends[lane] = s.end; s.lane = lane; group.push(s);
      until = Math.max(until, s.end);
    }
    finish();
    return segments;
  });
}

// The Week board can group cards by the part of the day they start in (F0.22-48): Morning before
// 12:00, Afternoon until 17:00, then Evening; a card without times is Any time (""). Each part's
// hour is where a card moved into it starts.
export const DAYPARTS = [['morning', 'Morning', 540], ['afternoon', 'Afternoon', 780], ['evening', 'Evening', 1080]];
export function daypart(task) {
  if (!timedCard(task)) return '';
  const start = timeMinutes(task.start_time);
  return start < 720 ? 'morning' : start < 1020 ? 'afternoon' : 'evening';
}
// A card moved into a part of the day starts at its hour and keeps its length (a card without times
// gets an hour on its last day); Any time takes the times away.
export function daypartChange(task, part) {
  if (!part) return task.start_time || task.due_time ? { start_time: null, due_time: null } : {};
  const at = DAYPARTS.find(([key]) => key === part)?.[2];
  if (at === undefined) throw new Error('Choose a part of the day.');
  const start = task.start || task.due, days = (stamp(task.due || start) - stamp(start)) / DAY * 1440;
  const end = at + days + (timedCard(task) ? timeMinutes(task.due_time) - timeMinutes(task.start_time) : 60);
  return { start, due: shiftDate(start, Math.floor(end / 1440)), start_time: minuteTime(at), due_time: minuteTime(end % 1440) };
}
