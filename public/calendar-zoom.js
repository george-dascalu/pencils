export function calendarZoom({ state, storage, icon }) {
  const saved = storage.get("calendar-hour-height", 64);
  let scale = saved === "fit" ? saved : Number.isFinite(saved) ? Math.max(8, Math.min(256, saved)) : 64;
  let frame = 0;
  const scroll = () => document.querySelector(".calendar-hours-scroll");
  const height = el => el.querySelector(".calendar-hours-day").getBoundingClientRect().height / 24;
  const fit = el => Math.max(8, Math.min(256, Math.floor(parseFloat(getComputedStyle(el).maxHeight) / 24)));
  function controls() {
    const button = (direction, step, name) => `<button type="button" class="icon-button" data-calendar-zoom="${step}" aria-label="Zoom ${direction} hours" title="Zoom ${direction} hours (Shift + scroll)">${icon(name)}</button>`;
    return `<div class="calendar-zoom" role="group" aria-label="Calendar zoom"><span class="control-label">Zoom</span>${button("out", -1, "minus")}<span data-calendar-zoom-value></span>${button("in", 1, "plus")}</div>`;
  }
  function apply(el, value, offset = el.clientHeight / 2) {
    const hour = (el.scrollTop + offset) / height(el);
    const size = value === "fit" ? fit(el) : Math.max(fit(el), Math.min(256, value));
    const calendar = el.closest(".calendar-hourly");
    calendar.style.setProperty("--hour-height", `${size}px`);
    calendar.toggleAttribute("data-compact-hours", size < 24);
    el.scrollTop = hour * size - offset;
    const label = document.querySelector("[data-calendar-zoom-value]");
    if (label) label.textContent = `${Math.round(size / 64 * 100)}%`;
    for (const button of document.querySelectorAll("[data-calendar-zoom]")) {
      button.disabled = Number(button.dataset.calendarZoom) < 0 ? size <= fit(el) : size >= 256;
    }
  }
  function change(el, size, offset) {
    scale = size <= fit(el) ? "fit" : Math.min(256, size);
    apply(el, scale, offset);
    storage.set("calendar-hour-height", scale);
  }
  document.addEventListener("click", e => {
    const button = e.target.closest("[data-calendar-zoom]"), el = scroll();
    if (!button || !el || state.view !== "calendar" || state.toolDragging) return;
    const steps = [fit(el), ...[16, 24, 32, 48, 64, 96, 128, 192, 256].filter(n => n > fit(el))];
    const current = height(el);
    const next = Number(button.dataset.calendarZoom) > 0 ? steps.find(n => n > current + .1) : steps.reverse().find(n => n < current - .1);
    if (next !== undefined) change(el, next);
  });
  document.addEventListener("wheel", e => {
    const el = e.target.closest(".calendar-hours-scroll");
    if (!el || state.view !== "calendar" || state.toolDragging || !e.shiftKey || e.ctrlKey || e.metaKey || e.altKey) return;
    const delta = (e.deltaY || e.deltaX) * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? el.clientHeight : 1);
    if (!delta) return;
    e.preventDefault();
    const offset = Math.max(0, Math.min(el.clientHeight, e.clientY - el.getBoundingClientRect().top));
    change(el, height(el) * Math.exp(-Math.max(-600, Math.min(600, delta)) / 400), offset);
  }, { passive: false });
  window.addEventListener("resize", () => {
    const el = scroll();
    if (el && state.view === "calendar") apply(el, scale);
  });
  function restore() {
    const previous = scroll(), hour = previous ? previous.scrollTop / height(previous) : 7;
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      const el = scroll();
      if (!el || state.view !== "calendar") return;
      apply(el, scale);
      el.scrollTop = hour * height(el);
    });
  }
  return { controls, restore };
}
