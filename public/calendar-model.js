import { DAY, dateKey, shiftDate, weekStart, isWeekend } from "./timeline-dates.js";

export function calendarRange(task) {
  if (!task.start && !task.due) return null;
  const start = task.start || task.due, end = task.due || task.start;
  return { start: start < end ? start : end, end: end > start ? end : start };
}

// Move the grabbed day, preserving duration and any intentionally unset date.
export function calendarDateChange(task, grabbed, target, handle = null) {
  const range = calendarRange(task);
  if (!range) return { due: target };
  if (handle === "start") return { start: target > range.end ? range.end : target, ...(!task.due ? { due: range.end } : {}) };
  if (handle === "due") return { due: target < range.start ? range.start : target, ...(!task.start ? { start: range.start } : {}) };
  const delta = (Date.parse(target) - Date.parse(grabbed)) / DAY;
  return {
    ...(task.start ? { start: shiftDate(task.start, delta) } : {}),
    ...(task.due ? { due: shiftDate(task.due, delta) } : {}),
  };
}

export function calendarWeeks(tasks, month, weekends = true) {
  const first = dateKey(weekStart(`${month.slice(0, 7)}-01`));
  const weeks = Array.from({ length: 6 }, (_, week) => {
    const days = Array.from({ length: weekends ? 7 : 5 }, (_, day) => shiftDate(first, week * 7 + day));
    const lanes = [], segments = [];
    for (const task of tasks) {
      const range = calendarRange(task);
      if (!range) continue;
      const columns = days.map((day, i) => day >= range.start && day <= range.end ? i : -1).filter(i => i >= 0);
      if (!columns.length) continue;
      const from = columns[0], to = columns.at(-1);
      let lane = lanes.findIndex(occupied => columns.every(i => !occupied.has(i)));
      if (lane < 0) { lane = lanes.length; lanes.push(new Set()); }
      columns.forEach(i => lanes[lane].add(i));
      segments.push({ task, from, to, lane, range });
    }
    return { days, segments, lanes: Math.max(1, lanes.length) };
  });
  const ends = new Map();
  for (const week of weeks) for (const segment of week.segments) {
    if (!ends.has(segment.task.id)) ends.set(segment.task.id, { first: segment, last: segment });
    else ends.get(segment.task.id).last = segment;
  }
  for (const { first, last } of ends.values()) { first.resizeStart = true; last.resizeEnd = true; }
  return weeks;
}

export function agendaGroups(tasks, from, to, weekends = true) {
  const groups = new Map();
  for (const task of tasks) {
    const range = calendarRange(task);
    if (!range || range.start > to || range.end < from) continue;
    let day = range.start < from ? from : range.start;
    while (!weekends && isWeekend(day)) day = shiftDate(day, 1);
    if (day > to || day > range.end) continue;
    if (!groups.has(day)) groups.set(day, []);
    groups.get(day).push(task);
  }
  return [...groups].sort(([a], [b]) => a.localeCompare(b));
}
