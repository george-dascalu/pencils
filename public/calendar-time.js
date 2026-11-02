import { shiftDate } from './timeline-dates.js';

export const timeMinutes = time => Number(time.slice(0, 2)) * 60 + Number(time.slice(3));
export const minuteTime = minutes => `${String(Math.floor(minutes / 60) % 24).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
export const timedCard = task => !!(task.start && task.due && task.start_time && task.due_time);

// Keep each snap at least eight screen pixels apart when the day is zoomed out.
export const calendarTimeStep = hourHeight => [15, 30, 60].find(step => step / 60 * hourHeight >= 8) || 60;

export function calendarTimeResize(task, day, minutes, end, step) {
  const start = end === 'start';
  const min = !start && task.start === day ? timeMinutes(task.start_time) + 15 : 0;
  const max = start ? task.due === day ? timeMinutes(task.due_time) - 15 : 1425 : 1440;
  const value = Math.max(min, Math.min(max, Math.round(minutes / step) * step));
  return { [end]: value === 1440 ? shiftDate(day, 1) : day, [`${end}_time`]: minuteTime(value) };
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
