// At a shared time boundary, choose the visible grip, not whichever neighboring card was
// painted last. Keep the whole shared control-sized hit area once an event is selected.
export function calendarEventControls(state) {
  let active = null;
  function select(card) {
    if (active === card) return;
    active?.removeAttribute('data-calendar-active');
    active = card;
    active?.setAttribute('data-calendar-active', '');
  }
  function hit(event) {
    if (state.view !== 'calendar') return null;
    const target = event.target.closest?.('[data-calendar-time-end]');
    const touch = event.pointerType === 'touch';
    const day = event.target.closest?.('.calendar-hours-day');
    let nearest = null, distance = Infinity;
    for (const grip of day?.querySelectorAll('[data-calendar-time-end]') || []) {
      if (touch && !grip.closest('[data-calendar-active]')) continue;
      const r = grip.getBoundingClientRect(), dx = Math.abs(event.clientX - r.left - r.width / 2), dy = Math.abs(event.clientY - r.top - r.height / 2);
      if (dx <= (touch ? r.width / 2 : 14) && dy <= (touch ? r.height / 2 : 6) && dx * dx + dy * dy < distance) {
        nearest = grip; distance = dx * dx + dy * dy;
      }
    }
    return nearest || (target?.closest('[data-calendar-active]') ? target : null);
  }
  document.addEventListener('pointermove', event => {
    if (state.toolDragging || event.buttons || event.pointerType === 'touch') return;
    select((hit(event) || event.target).closest?.('.calendar-timed-card') || null);
  }, true);
  document.addEventListener('focusin', event => {
    if (!state.toolDragging) select(event.target.closest?.('.calendar-timed-card') || null);
  });
  document.addEventListener('pointerdown', event => {
    if (!event.target.closest?.('.calendar-timed-card') && !hit(event)) select(null);
  }, true);
  return { hit, select, reset: () => select(null) };
}
