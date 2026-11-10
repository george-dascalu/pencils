import { fieldOn } from './card-fields.js';
import { priorityOptions } from './task-priority.js';
import { initialStatus } from './workflow-model.js';
import { validTimelineRange } from './timeline-dates.js';
import { daypartChange } from './calendar-time.js';

// Only choices that give a new card a concrete value. A search, a date range or a blocker
// doesn't identify a title, date or dependency; Include archived doesn't mean create archived.
// Return fresh arrays and maps so an editor (and its retries) keeps its own defaults.
const tagsForCard = tags => [...new Set(tags.filter(t => typeof t === 'string' && t.length <= 80).map(t => t.trim()).filter(Boolean))];
export function calendarFilterDefaults({ config, status, type, extraFilters: filters = {} }) {
  const values = {}, on = field => fieldOn(config, field);
  if (on('status')) {
    if (status !== 'all' && config.statuses.includes(status)) values.status = status;
    else if (['open', 'done'].includes(filters.completion)) {
      const matches = config.statuses.filter(value => config.done.includes(value) === (filters.completion === 'done'));
      const preferred = initialStatus(config), chosen = matches.includes(preferred) ? preferred : matches[0];
      if (chosen) values.status = chosen;
    }
  }
  if (on('type') && type !== 'all' && config.types.includes(type)) values.type = type;
  if (on('priority') && priorityOptions.includes(filters.priority)) values.priority = filters.priority;
  if (on('assignee')) {
    if (filters.assignee === '@unassigned') values.assignee = '';
    else if (typeof filters.assignee === 'string' && filters.assignee.startsWith('@person:') && filters.assignee.length > 8) values.assignee = filters.assignee.slice(8);
  }
  if (on('tags') && Array.isArray(filters.tags)) {
    const tags = tagsForCard(filters.tags).slice(0, 30);
    if (tags.length) values.tags = tags;
  }
  if (on('due') && filters.due === 'none') values.due = null;
  const fields = {};
  for (const field of config.fields || []) {
    const choice = filters.fields?.[field.id];
    if (choice == null || choice === '') continue;
    if (field.type === 'number' && Number.isFinite(Number(choice))) fields[field.id] = Number(choice);
    else if (field.type === 'checkbox' && ['true', 'false'].includes(String(choice))) fields[field.id] = String(choice) === 'true';
    else if (field.type === 'text' && typeof choice === 'string' && choice.length <= 10000) fields[field.id] = choice;
    else if (field.type === 'select' && field.options.includes(choice)) fields[field.id] = choice;
    else if (field.type === 'date' && validTimelineRange({ start: choice, end: choice })) fields[field.id] = choice;
  }
  if (Object.keys(fields).length) values.fields = fields;
  return values;
}

// The clicked cell is more specific than the filters. A tag row adds its tag to the selected
// tags (within the card's 30-tag limit); No tag explicitly clears them, like an unassigned row.
export function weekBoardCellDefaults(state, day, field, value) {
  const values = calendarFilterDefaults(state), on = field => fieldOn(state.config, field);
  for (const key of ['start', 'due']) if (on(key)) values[key] = day;
  if (field === 'daypart' && on('start') && on('due')) Object.assign(values, daypartChange(values, value));
  else if (field === 'tags' && on(field)) values.tags = value ? tagsForCard([...(values.tags || []), value]).slice(-30) : [];
  else if (['status', 'type', 'assignee', 'priority'].includes(field) && on(field)) values[field] = value;
  return values;
}
