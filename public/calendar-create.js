import { fieldOn } from './card-fields.js';
import { daypartChange } from './calendar-time.js';
import { focusOnOpen } from './open-focus.js';

// A title editor in the chosen cell. Keep its draft across live redraws and rejected saves;
// the server supplies the project's defaults for fields the cell doesn't name.
export function calendarCreate(ctx) {
  const { state, esc, icon, renderView } = ctx;
  let draft = null;
  const current = d => state.view === 'calendar' && state.project?.id === d?.project;
  const host = () => document.querySelector('[data-week-board-create]');
  function close() {
    const cell = host()?.closest('.week-board-cell');
    const day = cell?.dataset.calendarDate, row = cell?.dataset.weekBoardValue;
    draft = null;
    renderView(true);
    document.querySelector(`.week-board-cell[data-calendar-date="${CSS.escape(day || '')}"][data-week-board-value="${CSS.escape(row || '')}"] [data-week-board-add]`)?.focus({ preventScroll: true });
  }
  document.addEventListener('input', e => {
    if (draft && e.target.matches('[data-week-board-create] input')) draft.title = e.target.value;
  });
  document.addEventListener('click', e => {
    const button = e.target.closest('[data-week-board-add]');
    if (button && state.view === 'calendar') {
      if (draft?.busy) return;
      const cell = button.closest('.week-board-cell'), field = cell.closest('.week-board').dataset.rows;
      draft = { project: state.project.id, day: cell.dataset.calendarDate, field, value: cell.dataset.weekBoardValue, title: '', request: crypto.randomUUID() };
      renderView(true);
      focusOnOpen(host()?.querySelector('input'), host()?.querySelector('[data-week-board-create-cancel]'));
    } else if (e.target.closest('[data-week-board-create-cancel]') && !draft?.busy) close();
  });
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape' || !e.target.closest('[data-week-board-create]') || draft?.busy) return;
    e.preventDefault(); e.stopImmediatePropagation(); close();
  }, true);
  document.addEventListener('submit', async e => {
    const form = e.target.closest('[data-week-board-create]');
    if (!form) return;
    e.preventDefault(); e.stopImmediatePropagation();
    const d = draft;
    if (!current(d) || d.busy) return;
    const title = form.elements.title.value.trim();
    if (!title) { focusOnOpen(form.elements.title, form.querySelector('[type="submit"]')); return; }
    d.title = title; d.busy = true; d.error = '';
    const fields = { title, creation_request: d.request };
    for (const key of ['start', 'due']) if (fieldOn(state.config, key)) fields[key] = d.day;
    if (d.field === 'daypart') Object.assign(fields, daypartChange(fields, d.value));
    else if (d.field === 'tags') fields.tags = d.value ? [d.value] : [];
    else if (d.field !== 'none') fields[d.field] = d.value;
    const route = ctx.route('tasks');
    renderView(true);
    try {
      await ctx.api(route, { method: 'POST', body: fields });
      if (draft === d) draft = null;
      if (current(d)) {
        await ctx.refresh().catch(error => ctx.toast(error.message, true));
        document.querySelector(`.week-board-cell[data-calendar-date="${CSS.escape(d.day)}"][data-week-board-value="${CSS.escape(d.value)}"] [data-week-board-add]`)?.focus({ preventScroll: true });
      }
    } catch (error) {
      d.busy = false; d.error = error.message;
      if (draft === d && current(d)) {
        renderView(true);
        focusOnOpen(host()?.querySelector('input'), host()?.querySelector('[type="submit"]'));
      }
    }
  }, true);
  return {
    html(day, field, value, name) {
      if (!current(draft) || draft.day !== day || draft.field !== field || draft.value !== value)
        return `<button type="button" class="icon-button week-board-add" data-week-board-add aria-label="${esc(`Add card on ${day}${name ? `, ${name}` : ''}`)}" title="Add card">${icon('plus')}</button>`;
      return `<form class="week-board-create" data-week-board-create aria-label="New card" aria-busy="${!!draft.busy}"><input id="week-board-create-title" name="title" aria-label="Card title" placeholder="Card title…" value="${esc(draft.title)}" maxlength="300" required ${draft.busy ? 'readonly' : ''}><div class="week-board-create-actions"><button type="submit" class="icon-button" aria-label="Create card" title="Create card" ${draft.busy ? 'disabled' : ''}>${icon('check')}</button><button type="button" class="icon-button" data-week-board-create-cancel aria-label="Cancel new card" title="Cancel new card" ${draft.busy ? 'disabled' : ''}>${icon('close')}</button></div>${draft.error ? `<p class="field-hint" role="alert">${esc(draft.error)}</p>` : ''}</form>`;
    },
  };
}
