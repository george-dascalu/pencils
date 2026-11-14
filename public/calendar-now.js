import { localDate } from './task-visibility.js';
import { minuteTime } from './calendar-time.js';

// Only this marker changes as the clock ticks; the grid and any active interaction stay intact.
export function calendarNow() {
  let grid = null, timer = 0, frame = 0, observer = null;
  function stop() {
    clearTimeout(timer); timer = 0;
    observer?.disconnect(); observer = null; grid = null;
  }
  function refresh() {
    clearTimeout(timer);
    if (!grid?.isConnected) return stop();
    const now = new Date(), day = grid.querySelector(`[data-calendar-date="${localDate(now)}"]`);
    let marker = grid.querySelector('[data-calendar-now]');
    if (day) {
      if (!marker) {
        marker = document.createElement('div'); marker.dataset.calendarNow = '';
        marker.className = 'calendar-now'; marker.setAttribute('role', 'img');
        marker.append(document.createElement('span'));
      }
      if (marker.parentElement !== day) day.append(marker);
      const minutes = now.getHours() * 60 + now.getMinutes(), label = minuteTime(minutes);
      marker.style.top = `${minutes / 1440 * 100}%`;
      marker.toggleAttribute('data-near-midnight', minutes >= 23 * 60);
      marker.setAttribute('aria-label', `Current time ${label}`);
      marker.firstElementChild.textContent = label;
    } else marker?.remove();
    timer = window.setTimeout(refresh, 60000 - now.getSeconds() * 1000 - now.getMilliseconds());
  }
  document.addEventListener('visibilitychange', () => { if (!document.hidden && grid) refresh(); });
  return { restore() {
    cancelAnimationFrame(frame); stop();
    frame = requestAnimationFrame(() => {
      grid = document.querySelector('.calendar-hours');
      if (!grid) return;
      observer = new MutationObserver(() => { if (!grid?.isConnected) stop(); });
      observer.observe(document.querySelector('#view-content'), { childList: true, subtree: true });
      refresh();
    });
  } };
}
