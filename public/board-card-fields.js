import { fieldOn } from './card-fields.js';

// A board's display choices never alter the card or the project's field schema.
export const BOARD_CARD_FIELDS = [
  ['type', 'Card type'], ['id', 'ID'], ['title', 'Title'], ['assignee', 'Assignee'],
  ['status', 'Status'], ['priority', 'Priority'], ['start', 'Start date'], ['due', 'Due date'],
  ['description', 'Description'], ['estimate', 'Estimate'], ['tags', 'Tags'],
];
export const DEFAULT_CARD_FIELDS_HIDDEN = ['estimate', 'tags'];
export const boardCardVisible = (board, config, key) => fieldOn(config, key) && !(board?.settings?.card_fields?.hidden || DEFAULT_CARD_FIELDS_HIDDEN).includes(key);
export const boardCardCustomFields = (board, config) => (config?.fields || []).filter(field => board?.settings?.card_fields?.custom?.includes(field.id));
export function validBoardCardFields(value) {
  const keys = BOARD_CARD_FIELDS.map(([key]) => key);
  return !!value && typeof value === 'object' && !Array.isArray(value) &&
    Array.isArray(value.hidden) && value.hidden.length <= keys.length && new Set(value.hidden).size === value.hidden.length && value.hidden.every(key => keys.includes(key)) &&
    Array.isArray(value.custom) && value.custom.length <= 200 && new Set(value.custom).size === value.custom.length && value.custom.every(id => typeof id === 'string' && /^[\w-]{1,100}$/.test(id));
}
export function boardCardFieldsHTML(board, config, esc) {
  const hidden = board?.settings?.card_fields?.hidden || DEFAULT_CARD_FIELDS_HIDDEN;
  const row = (key, label, custom = false) => `<label class="board-setting-toggle"><input type="checkbox" data-board-card-${custom ? 'custom' : 'field'}="${esc(key)}" name="card-${custom ? 'custom-' : ''}${esc(key)}" ${custom ? board?.settings?.card_fields?.custom?.includes(key) ? 'checked' : '' : !hidden.includes(key) ? 'checked' : ''}><span>${esc(label)}</span></label>`;
  return `<section class="board-settings-section board-card-display" aria-labelledby="board-card-details-heading"><h3 id="board-card-details-heading">Card details</h3>${BOARD_CARD_FIELDS.filter(([key]) => fieldOn(config, key)).map(([key, label]) => row(key, label)).join('')}${config?.fields?.length ? `<div class="board-card-custom-options" role="group" aria-label="Custom fields">${config.fields.map(field => row(field.id, field.name, true)).join('')}</div>` : ''}</section>`;
}
export function readBoardCardFields(form, previous) {
  // Fields disabled for this project stay out of the panel and preserve their board choice.
  const hidden = new Set(previous?.hidden || DEFAULT_CARD_FIELDS_HIDDEN);
  for (const input of form.querySelectorAll('[data-board-card-field]')) {
    if (input.checked) hidden.delete(input.dataset.boardCardField); else hidden.add(input.dataset.boardCardField);
  }
  return { hidden: [...hidden], custom: [...form.querySelectorAll('[data-board-card-custom]:checked')].map(input => input.dataset.boardCardCustom) };
}
