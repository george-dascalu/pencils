// The range picker Agenda and Timeline share (F0.21-70, F0.21-89): dates on one side and quick
// ranges on the other, like a dashboard's time picker. Styles in calendar.css.
const caret = '<svg class="icon menu-caret" viewBox="0 0 24 24" aria-hidden="true"><path d="m8 10 4 4 4-4"/></svg>';
export const rangeLabelHTML = (name, { esc, icon }) => `<span class="control-label">Range</span>${icon("calendar")}<span>${esc(name)}</span>${caret}`;
export function rangeChoicesHTML({ name, from, to, quick, ranges, esc }) {
  return `<form class="range-dates" data-range-form="${name}" novalidate><strong>Dates</strong><label class="field">From<input type="date" name="from" value="${esc(from)}" required></label><label class="field">To<input type="date" name="to" value="${esc(to)}" required></label><p class="field-hint" data-range-error role="alert" hidden></p><button type="submit" class="button primary small">Show dates</button></form><div class="range-quick" role="group" aria-label="Quick ranges">${ranges.map(([key, label]) => `<button type="button" data-range-quick="${key}" aria-pressed="${key === quick}">${label}</button>`).join("")}</div>`;
}
