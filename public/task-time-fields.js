import { localDate } from './task-visibility.js';
import { minuteTime, timeMinutes } from './calendar-time.js';

export function taskTimeFields(task, esc) {
  const timed = !!(task.start_time || task.due_time);
  return `<div class="task-time-controls"><label class="check-control"><input type="checkbox" data-task-allday ${timed ? '' : 'checked'} >All day</label><div class="task-time-range" ${timed ? '' : 'hidden'}><label class="field">Start time<input type="time" name="start_time" value="${esc(task.start_time || '')}" aria-label="Start time" ></label><label class="field">End time<input type="time" name="due_time" value="${esc(task.due_time || '')}" aria-label="End time" ></label></div></div>`;
}

export function installTaskTimes(form) {
  const { start, due, start_time: from, due_time: to } = form.elements;
  const allDay = form.querySelector('[data-task-allday]');
  if (!allDay) return;
  const sync = () => {
    const timed = !allDay.checked;
    form.querySelector('.task-time-range').hidden = !timed;
    from.required = to.required = timed;
    const invalid = timed && (!start.value || !due.value || `${start.value}T${from.value}` >= `${due.value}T${to.value}`);
    to.setCustomValidity(invalid ? 'Set dates and an end time after the start time.' : '');
  };
  form.addEventListener('change', event => {
    if (event.target === allDay) {
      if (allDay.checked) from.value = to.value = '';
      else {
        start.value ||= due.value || localDate(); due.value ||= start.value;
        from.value ||= '09:00'; to.value ||= minuteTime(Math.min(1439, timeMinutes(from.value) + 60));
      }
    } else if ([start, due].includes(event.target) && (!start.value || !due.value)) {
      from.value = to.value = ''; allDay.checked = true;
    }
    sync();
  }, true);
  form.addEventListener('input', sync);
  sync();
}
