import { localDate } from './task-visibility.js';
import { minuteTime, timeMinutes } from './calendar-time.js';

// One date range for the card editor and the List row's date popover (F0.23-11): each time beside its
// date, start → due on one line where there is room, the fields as wide as their values and their names
// for screen readers. A due date a source manages has no times.
export function taskDateRangeHTML(task, esc, icon, { showAllDayTimes = false, sourceDue = false } = {}) {
  const timed = !!(task.start_time || task.due_time);
  const field = (type, name, label, extra = '') => `<input type="${type}" name="${name}" aria-label="${label}" title="${label}" value="${esc(task[name] || '')}" ${extra}>`;
  const time = (name, label) => sourceDue ? '' : field('time', name, label, timed || showAllDayTimes ? '' : 'hidden');
  const toggle = sourceDue ? '' : `<button type="button" class="icon-button task-allday-toggle" data-task-allday aria-label="All day" title="${timed ? 'Timed — switch to all day' : 'All day — switch to timed'}" aria-pressed="${!timed}"><span data-task-time-icon="all-day" aria-hidden="true">${icon('sun')}</span><span data-task-time-icon="timed" aria-hidden="true">${icon('clock')}</span></button>`;
  return `<div class="task-date-range" data-date-range role="group" aria-label="Start and due dates" ${showAllDayTimes ? 'data-all-day-hours' : ''}><span class="task-date-time">${field('date', 'start', 'Start date')}${time('start_time', 'Start time')}</span><span aria-hidden="true">→</span><span class="task-date-time">${field('date', 'due', 'Due date', sourceDue ? 'disabled aria-describedby="task-dates-source"' : '')}${time('due_time', 'End time')}</span></div>${toggle}`;
}

export function installTaskTimes(form) {
  const { start, due, start_time: from, due_time: to } = form.elements;
  const allDay = form.querySelector('[data-task-allday]');
  if (!allDay) return;
  const preview = !!form.querySelector('[data-all-day-hours]');
  let remembered = allDay.getAttribute('aria-pressed') !== 'true' ? { from: from.value, to: to.value } : {};
  const sync = () => {
    const timed = allDay.getAttribute('aria-pressed') !== 'true';
    allDay.title = timed ? 'Timed — switch to all day' : 'All day — switch to timed';
    const mode = form.querySelector('[data-task-time-mode]');
    if (mode) mode.textContent = timed ? 'Timed' : 'All day';
    from.hidden = to.hidden = !timed && !preview;
    if (preview) {
      from.disabled = to.disabled = !timed;
      if (timed) remembered = { from: from.value, to: to.value };
      else { from.value = '00:00'; to.value = '23:59'; }
    }
    from.required = to.required = timed;
    const invalid = timed && (!start.value || !due.value || `${start.value}T${from.value}` >= `${due.value}T${to.value}`);
    to.setCustomValidity(invalid ? 'Set dates and an end time after the start time.' : '');
  };
  allDay.addEventListener('click', () => {
    allDay.setAttribute('aria-pressed', String(allDay.getAttribute('aria-pressed') !== 'true'));
    allDay.dispatchEvent(new Event('change', { bubbles: true }));
  });
  form.addEventListener('change', event => {
    if (event.target === allDay) {
      if (allDay.getAttribute('aria-pressed') === 'true') {
        if (preview) remembered = { from: from.value, to: to.value };
        from.value = to.value = '';
      }
      else {
        start.value ||= due.value || localDate(); due.value ||= start.value;
        if (preview) { from.value = remembered.from || ''; to.value = remembered.to || ''; }
        from.value ||= '09:00'; to.value ||= minuteTime(Math.min(1439, timeMinutes(from.value) + 60));
      }
    } else if ([start, due].includes(event.target) && (!start.value || !due.value)) {
      from.value = to.value = ''; allDay.setAttribute('aria-pressed', 'true');
    }
    sync();
  }, true);
  form.addEventListener('input', sync);
  sync();
}
